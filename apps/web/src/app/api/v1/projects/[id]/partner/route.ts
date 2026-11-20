import { NextRequest, NextResponse } from "next/server";
import { prisma, recordAuditLog } from "@sih/db";
import { UserRole } from "@sih/shared";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { enqueueNotifySms } from "@/lib/queues";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const AssignPartnerSchema = z.object({
  partnerId: z.string().uuid("Invalid partner ID").optional(),
  partnerUserId: z.string().uuid("Invalid partner user ID").optional(),
});

// ============================================================================
// POST /api/v1/projects/[id]/partner (Join or Assign Industry/CSR Partner)
// ============================================================================

export async function POST(req: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth(req);
  if (!authResult.success) {
    return authResult.response;
  }
  const { user } = authResult;

  const { id } = await params;

  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json(
      { error: "INVALID_ID", message: "Project ID must be a valid UUID" },
      { status: 400 }
    );
  }

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      institution: {
        select: { id: true, name: true, contactEmail: true },
      },
      industryPartner: {
        select: { id: true, organizationName: true, verificationStatus: true },
      },
      projectMembers: {
        include: {
          user: {
            select: { id: true, fullName: true, email: true, phoneNumber: true, role: true },
          },
        },
      },
    },
  });

  if (!project) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: `Project with ID '${id}' not found` },
      { status: 404 }
    );
  }

  const ipAddress =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  const userAgent = req.headers.get("user-agent") || undefined;

  let bodyJson: unknown = {};
  try {
    const text = await req.text();
    if (text) {
      bodyJson = JSON.parse(text);
    }
  } catch {
    return NextResponse.json(
      { error: "INVALID_JSON", message: "Request body must be valid JSON" },
      { status: 400 }
    );
  }

  const parsed = AssignPartnerSchema.safeParse(bodyJson);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "VALIDATION_ERROR",
        message: "Invalid partner parameters",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  // --------------------------------------------------------------------------
  // Scenario A: Verified Industry Partner User joins the project directly
  // --------------------------------------------------------------------------
  if (user.role === UserRole.INDUSTRY_PARTNER || user.role === UserRole.CSR_PARTNER) {
    if (!user.industryPartnerId) {
      return NextResponse.json(
        {
          error: "FORBIDDEN",
          message: "User is not linked to an industry partner organization",
        },
        { status: 403 }
      );
    }

    const partner = await prisma.industryPartner.findUnique({
      where: { id: user.industryPartnerId },
      select: { id: true, organizationName: true, verificationStatus: true },
    });

    if (!partner || partner.verificationStatus !== "VERIFIED") {
      return NextResponse.json(
        {
          error: "ORG_NOT_VERIFIED",
          message: "Industry partner organization must be verified to join active projects",
        },
        { status: 403 }
      );
    }

    if (project.industryPartnerId && project.industryPartnerId !== partner.id) {
      return NextResponse.json(
        {
          error: "PARTNER_ALREADY_ASSIGNED",
          message: `Project already has an assigned industry partner (${project.industryPartner?.organizationName})`,
        },
        { status: 409 }
      );
    }

    // Link partner & add member
    const updatedProject = await prisma.$transaction(async (tx) => {
      const p = await tx.project.update({
        where: { id: project.id },
        data: { industryPartnerId: partner.id },
        include: { industryPartner: true },
      });

      await tx.projectMember.upsert({
        where: {
          projectId_userId: {
            projectId: project.id,
            userId: user.id,
          },
        },
        update: { role: "INDUSTRY_PARTNER" },
        create: {
          projectId: project.id,
          userId: user.id,
          role: "INDUSTRY_PARTNER",
        },
      });

      await recordAuditLog({
        actorId: user.id,
        action: "PROJECT_PARTNER_JOINED",
        entityType: "Project",
        entityId: project.id,
        metadata: {
          partnerId: partner.id,
          partnerName: partner.organizationName,
          userId: user.id,
        },
        ipAddress,
        userAgent,
      });

      return p;
    });

    // Enqueue mock SMS notification to Faculty Lead
    const facultyLead = project.projectMembers.find(
      (m) => m.role === "FACULTY_LEAD" || m.user.role === UserRole.FACULTY
    );

    if (facultyLead) {
      try {
        await enqueueNotifySms({
          recipientId: facultyLead.user.id,
          phoneNumber: facultyLead.user.phoneNumber ?? undefined,
          title: "Industry Partner Joined Project",
          message: `${partner.organizationName} has officially joined project '${project.title}' as the Industry Partner.`,
          type: "PARTNER_JOINED",
          metadata: {
            projectId: project.id,
            partnerId: partner.id,
            partnerName: partner.organizationName,
          },
        });
      } catch {
        // Non-blocking notification dispatch
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully joined project as industry partner (${partner.organizationName})`,
      data: updatedProject,
    });
  }

  // --------------------------------------------------------------------------
  // Scenario B: HEI Admin or Faculty Lead assigns an Industry Partner
  // --------------------------------------------------------------------------
  const isHeiAdminOrFaculty =
    (user.role === UserRole.INSTITUTION_ADMIN || user.role === UserRole.FACULTY) &&
    user.institutionId === project.institutionId;

  const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;

  if (!isHeiAdminOrFaculty && !isSuperAdmin) {
    return NextResponse.json(
      {
        error: "FORBIDDEN",
        message: "Only authorized HEI personnel or verified industry partners can perform this action",
      },
      { status: 403 }
    );
  }

  const targetPartnerId = parsed.data.partnerId;
  if (!targetPartnerId) {
    return NextResponse.json(
      {
        error: "VALIDATION_ERROR",
        message: "partnerId is required when assigning a partner to the project",
      },
      { status: 400 }
    );
  }

  const targetPartner = await prisma.industryPartner.findUnique({
    where: { id: targetPartnerId },
    select: {
      id: true,
      organizationName: true,
      verificationStatus: true,
      contactEmail: true,
      users: {
        where: { role: UserRole.INDUSTRY_PARTNER },
        select: { id: true, fullName: true, phoneNumber: true, email: true },
        take: 1,
      },
    },
  });

  if (!targetPartner) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: `Industry partner '${targetPartnerId}' not found` },
      { status: 404 }
    );
  }

  if (targetPartner.verificationStatus !== "VERIFIED") {
    return NextResponse.json(
      {
        error: "ORG_NOT_VERIFIED",
        message: "Target industry partner must be officially verified",
      },
      { status: 403 }
    );
  }

  const updatedProject = await prisma.$transaction(async (tx) => {
    const p = await tx.project.update({
      where: { id: project.id },
      data: { industryPartnerId: targetPartner.id },
      include: { industryPartner: true },
    });

    // If a specific partner user or first representative is found, add to project members
    const memberUserId = parsed.data.partnerUserId || targetPartner.users[0]?.id;
    if (memberUserId) {
      await tx.projectMember.upsert({
        where: {
          projectId_userId: {
            projectId: project.id,
            userId: memberUserId,
          },
        },
        update: { role: "INDUSTRY_PARTNER" },
        create: {
          projectId: project.id,
          userId: memberUserId,
          role: "INDUSTRY_PARTNER",
        },
      });
    }

    await recordAuditLog({
      actorId: user.id,
      action: "PROJECT_PARTNER_ASSIGNED",
      entityType: "Project",
      entityId: project.id,
      metadata: {
        partnerId: targetPartner.id,
        partnerName: targetPartner.organizationName,
        assignedBy: user.id,
      },
      ipAddress,
      userAgent,
    });

    return p;
  });

  // Notify partner representative if available
  const partnerRep = targetPartner.users[0];
  if (partnerRep) {
    try {
      await enqueueNotifySms({
        recipientId: partnerRep.id,
        phoneNumber: partnerRep.phoneNumber ?? undefined,
        title: "Project Partnership Invitation",
        message: `Your organization ${targetPartner.organizationName} has been assigned as Industry Partner for project '${project.title}' by ${project.institution.name}.`,
        type: "PARTNER_ASSIGNED",
        metadata: {
          projectId: project.id,
          institutionId: project.institution.id,
        },
      });
    } catch {
      // Non-blocking notification
    }
  }

  return NextResponse.json({
    success: true,
    message: `Assigned ${targetPartner.organizationName} as project industry partner`,
    data: updatedProject,
  });
}
