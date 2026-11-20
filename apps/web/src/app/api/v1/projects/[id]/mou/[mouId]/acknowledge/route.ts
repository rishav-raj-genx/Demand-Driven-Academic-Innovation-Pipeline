import { NextRequest, NextResponse } from "next/server";
import { prisma, recordAuditLog, UserRole, Prisma } from "@sih/db";
import { requireAuth } from "@/lib/auth/guards";
import { enqueueNotifySms } from "@/lib/queues";

interface RouteParams {
  params: Promise<{ id: string; mouId: string }>;
}

// ============================================================================
// POST /api/v1/projects/[id]/mou/[mouId]/acknowledge (Bilateral MoU Acknowledgment)
// ============================================================================

export async function POST(req: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth(req);
  if (!authResult.success) {
    return authResult.response;
  }
  const { user } = authResult;

  const { id, mouId } = await params;

  if (
    !id ||
    !mouId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mouId)
  ) {
    return NextResponse.json(
      { error: "INVALID_ID", message: "Project ID and MoU ID must be valid UUIDs" },
      { status: 400 }
    );
  }

  // 1. Role Gate: Reject Students and Citizens
  if (user.role === UserRole.STUDENT || user.role === UserRole.CITIZEN) {
    return NextResponse.json(
      {
        error: "FORBIDDEN",
        message: "Students and Citizens are not authorized to execute bilateral MoUs",
      },
      { status: 403 }
    );
  }

  // 2. Fetch Project & MoU
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      institution: {
        select: { id: true, name: true, verificationStatus: true },
      },
      industryPartner: {
        select: { id: true, organizationName: true, verificationStatus: true },
      },
      projectMembers: {
        include: {
          user: {
            select: { id: true, fullName: true, phoneNumber: true, role: true },
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

  const mou = await prisma.moU.findUnique({
    where: { id: mouId },
  });

  if (!mou || mou.projectId !== project.id) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: `MoU with ID '${mouId}' not found for this project` },
      { status: 404 }
    );
  }

  // 3. Determine Signatory Track
  const isAcademic =
    (user.role === UserRole.INSTITUTION_ADMIN || user.role === UserRole.FACULTY) &&
    user.institutionId === project.institutionId;

  const isIndustry =
    (user.role === UserRole.INDUSTRY_PARTNER || user.role === UserRole.CSR_PARTNER) &&
    user.industryPartnerId === project.industryPartnerId;

  const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;

  if (!isAcademic && !isIndustry && !isSuperAdmin) {
    return NextResponse.json(
      {
        error: "FORBIDDEN",
        message: "Only authorized HEI leadership or the assigned Industry Partner can acknowledge this MoU",
      },
      { status: 403 }
    );
  }

  // 4. Verification Check
  if (isAcademic && project.institution.verificationStatus !== "VERIFIED") {
    return NextResponse.json(
      { error: "ORG_NOT_VERIFIED", message: "Higher Education Institution must be verified" },
      { status: 403 }
    );
  }

  if (isIndustry && project.industryPartner?.verificationStatus !== "VERIFIED") {
    return NextResponse.json(
      { error: "ORG_NOT_VERIFIED", message: "Industry Partner must be verified" },
      { status: 403 }
    );
  }

  const now = new Date();
  const ipAddress =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  const userAgent = req.headers.get("user-agent") || undefined;

  // 5. Atomic Update
  const updateData: Prisma.MoUUpdateInput = {};
  let trackName = "";

  if (isAcademic || (isSuperAdmin && !mou.heiAcknowledgedAt)) {
    updateData.heiAcknowledgedAt = now;
    updateData.heiAcknowledgedBy = user.id;
    trackName = "Academic HEI";
  } else if (isIndustry || (isSuperAdmin && !mou.industryAcknowledgedAt)) {
    updateData.industryAcknowledgedAt = now;
    updateData.industryAcknowledgedBy = user.id;
    trackName = "Industry Partner";
  }

  const willBeMutuallyAcknowledged =
    (updateData.heiAcknowledgedAt || mou.heiAcknowledgedAt) &&
    (updateData.industryAcknowledgedAt || mou.industryAcknowledgedAt);

  if (willBeMutuallyAcknowledged) {
    updateData.status = "MUTUALLY_ACKNOWLEDGED";
    updateData.signedDate = now;
  } else if (isAcademic) {
    updateData.status = "HEI_ACKNOWLEDGED";
  } else {
    updateData.status = "INDUSTRY_ACKNOWLEDGED";
  }

  const updatedMou = await prisma.$transaction(async (tx) => {
    const updated = await tx.moU.update({
      where: { id: mou.id },
      data: updateData,
    });

    if (willBeMutuallyAcknowledged) {
      // Update Project funding status to CSR_PLEDGED if UNFUNDED
      if (!project.budget && updated.pledgedAmountInr) {
        await tx.project.update({
          where: { id: project.id },
          data: {
            budget: updated.pledgedAmountInr,
            fundingStatus: "CSR_PLEDGED",
          },
        });
      } else {
        await tx.project.update({
          where: { id: project.id },
          data: { fundingStatus: "CSR_PLEDGED" },
        });
      }
    }

    await recordAuditLog(
      {
        actorId: user.id,
        action: "MOU_ACKNOWLEDGED",
        entityType: "MoU",
        entityId: mou.id,
        metadata: {
          projectId: project.id,
          mouNumber: mou.mouNumber,
          track: trackName,
          status: updateData.status,
          isMutuallyAcknowledged: Boolean(willBeMutuallyAcknowledged),
        },
        ipAddress,
        userAgent,
      },
      tx
    );

    return updated;
  });

  // 6. Enqueue Mock SMS Notifications
  if (willBeMutuallyAcknowledged) {
    // Notify both parties of mutual MoU execution
    const facultyLead = project.projectMembers.find(
      (m) => m.role === "FACULTY_LEAD" || m.user.role === UserRole.FACULTY
    );
    const partnerRep = project.projectMembers.find(
      (m) => m.role === "INDUSTRY_PARTNER" || m.user.role === UserRole.INDUSTRY_PARTNER
    );

    if (facultyLead) {
      try {
        await enqueueNotifySms({
          recipientId: facultyLead.user.id,
          phoneNumber: facultyLead.user.phoneNumber ?? undefined,
          title: "Bilateral MoU Executed",
          message: `Bilateral MoU ${mou.mouNumber} for project '${project.title}' is now MUTUALLY ACKNOWLEDGED by ${project.institution.name} and ${project.industryPartner?.organizationName}.`,
          type: "MOU_MUTUALLY_ACKNOWLEDGED",
          metadata: { projectId: project.id, mouId: mou.id, mouNumber: mou.mouNumber },
        });
      } catch {
        // Non-blocking
      }
    }

    if (partnerRep) {
      try {
        await enqueueNotifySms({
          recipientId: partnerRep.user.id,
          phoneNumber: partnerRep.user.phoneNumber ?? undefined,
          title: "Bilateral MoU Executed",
          message: `Bilateral MoU ${mou.mouNumber} for project '${project.title}' is now MUTUALLY ACKNOWLEDGED. CSR funds pledged for milestone-gated release outside the platform.`,
          type: "MOU_MUTUALLY_ACKNOWLEDGED",
          metadata: { projectId: project.id, mouId: mou.id, mouNumber: mou.mouNumber },
        });
      } catch {
        // Non-blocking
      }
    }
  } else {
    // Notify awaiting party
    const awaitingRole = isAcademic ? "INDUSTRY_PARTNER" : "FACULTY_LEAD";
    const recipient = project.projectMembers.find((m) => m.role === awaitingRole);

    if (recipient) {
      try {
        await enqueueNotifySms({
          recipientId: recipient.user.id,
          phoneNumber: recipient.user.phoneNumber ?? undefined,
          title: "MoU Acknowledgment Pending",
          message: `${trackName} has formally acknowledged MoU ${mou.mouNumber} for project '${project.title}'. Your reciprocal acknowledgment is awaited.`,
          type: "MOU_COUNTER_ACKNOWLEDGE_REQUIRED",
          metadata: { projectId: project.id, mouId: mou.id, mouNumber: mou.mouNumber },
        });
      } catch {
        // Non-blocking
      }
    }
  }

  return NextResponse.json({
    success: true,
    message: willBeMutuallyAcknowledged
      ? `Bilateral MoU ${mou.mouNumber} is now mutually acknowledged by both Academic HEI and Industry Partner`
      : `${trackName} acknowledgment recorded for MoU ${mou.mouNumber}. Reciprocal acknowledgment awaited.`,
    data: {
      mou: updatedMou,
      mutuallyAcknowledged: Boolean(willBeMutuallyAcknowledged),
    },
  });
}
