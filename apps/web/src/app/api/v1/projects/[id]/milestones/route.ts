import { NextRequest, NextResponse } from "next/server";
import { prisma, recordAuditLog } from "@sih/db";
import { UserRole, ApprovalDecision } from "@sih/shared";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { computeMilestoneContentHash } from "@/lib/projects/hash";
import { getPhaseOrderIndex } from "@/lib/projects/nep";
import { enqueueNotifySms } from "@/lib/queues";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const SubmitMilestoneSchema = z.object({
  title: z
    .string({ required_error: "Milestone title is required" })
    .trim()
    .min(3, "Title must be at least 3 characters")
    .max(255, "Title cannot exceed 255 characters"),
  summary: z
    .string({ required_error: "Deliverable summary is required" })
    .trim()
    .min(10, "Summary must be at least 10 characters")
    .max(5000, "Summary cannot exceed 5000 characters"),
  artifactKeys: z
    .array(z.string().trim().min(1, "Artifact key cannot be empty"))
    .min(1, "At least one artifact key uploaded to S3 is required"),
  dueDate: z.string().datetime().optional().nullable(),
});

// ============================================================================
// POST /api/v1/projects/[id]/milestones (Submit Deliverables & Compute Hash)
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
        select: { id: true, name: true },
      },
      industryPartner: {
        select: { id: true, organizationName: true },
      },
      projectMembers: {
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phoneNumber: true,
              role: true,
              institutionId: true,
              industryPartnerId: true,
            },
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

  // 1. Authorization: Project Member or affiliated HEI Admin / Super Admin
  const isMember = project.projectMembers.some((m) => m.userId === user.id);
  const isAffiliatedAdmin =
    user.role === UserRole.INSTITUTION_ADMIN && user.institutionId === project.institutionId;
  const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;

  if (!isMember && !isAffiliatedAdmin && !isSuperAdmin) {
    return NextResponse.json(
      {
        error: "FORBIDDEN",
        message: "Only project team members or authorized HEI administrators can submit milestone deliverables",
      },
      { status: 403 }
    );
  }

  // 2. Validate payload
  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return NextResponse.json(
      { error: "INVALID_JSON", message: "Request body must be valid JSON" },
      { status: 400 }
    );
  }

  const parsed = SubmitMilestoneSchema.safeParse(bodyJson);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "VALIDATION_ERROR",
        message: "Invalid milestone submission payload",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const { title, summary, artifactKeys, dueDate } = parsed.data;

  // 3. Compute Deterministic SHA-256 Content Hash
  const contentHash = computeMilestoneContentHash({
    projectId: project.id,
    phase: project.currentPhase,
    title,
    summary,
    artifactKeys,
  });

  const ipAddress =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  const userAgent = req.headers.get("user-agent") || undefined;

  // 4. Upsert/Create Milestone in Transaction
  const milestone = await prisma.$transaction(async (tx) => {
    const existing = await tx.milestone.findFirst({
      where: {
        projectId: project.id,
        phase: project.currentPhase,
      },
    });

    let record;
    if (existing) {
      record = await tx.milestone.update({
        where: { id: existing.id },
        data: {
          title,
          summary,
          description: summary,
          artifactKeys,
          contentHash,
          status: ApprovalDecision.SUBMITTED_FOR_APPROVAL,
          isCompleted: false,
          dueDate: dueDate ? new Date(dueDate) : existing.dueDate,
        },
      });
    } else {
      record = await tx.milestone.create({
        data: {
          projectId: project.id,
          phase: project.currentPhase,
          title,
          summary,
          description: summary,
          artifactKeys,
          contentHash,
          status: ApprovalDecision.SUBMITTED_FOR_APPROVAL,
          isCompleted: false,
          orderIndex: getPhaseOrderIndex(project.currentPhase),
          dueDate: dueDate ? new Date(dueDate) : null,
        },
      });
    }

    await recordAuditLog({
      actorId: user.id,
      action: "MILESTONE_SUBMITTED",
      entityType: "Milestone",
      entityId: record.id,
      metadata: {
        projectId: project.id,
        phase: project.currentPhase,
        title: record.title,
        contentHash,
        artifactKeys,
        status: "SUBMITTED_FOR_APPROVAL",
      },
      ipAddress,
      userAgent,
    });

    return record;
  });

  // 5. Gather Required Approvers & Enqueue Mock SMS Notifications
  // Required Approvers include:
  // a) Industry Partner Lead/Users (if partner assigned)
  // b) Faculty Lead or HEI Admin
  const approverCandidates: Array<{ id: string; fullName: string; phoneNumber?: string | null }> = [];

  // 5a. Industry Partner approvers
  if (project.industryPartnerId) {
    const partnerUsers = await prisma.user.findMany({
      where: {
        industryPartnerId: project.industryPartnerId,
        verificationStatus: "VERIFIED",
      },
      select: { id: true, fullName: true, phoneNumber: true },
    });
    approverCandidates.push(...partnerUsers);
  }

  // 5b. Project members with INDUSTRY_PARTNER role
  const industryMembers = project.projectMembers
    .filter((m) => m.role === "INDUSTRY_PARTNER")
    .map((m) => m.user);
  approverCandidates.push(...industryMembers);

  // 5c. Faculty Lead or HEI Admin
  const facultyLeadMembers = project.projectMembers
    .filter((m) => m.role === "FACULTY_LEAD" || m.role === "PI")
    .map((m) => m.user);
  approverCandidates.push(...facultyLeadMembers);

  const heiAdmins = await prisma.user.findMany({
    where: {
      institutionId: project.institutionId,
      role: UserRole.INSTITUTION_ADMIN,
      verificationStatus: "VERIFIED",
    },
    select: { id: true, fullName: true, phoneNumber: true },
  });
  approverCandidates.push(...heiAdmins);

  // Deduplicate and filter out the submitter
  const approverMap = new Map<string, { id: string; fullName: string; phoneNumber?: string | null }>();
  for (const candidate of approverCandidates) {
    if (candidate.id !== user.id && !approverMap.has(candidate.id)) {
      approverMap.set(candidate.id, candidate);
    }
  }

  const notifiedApprovers = Array.from(approverMap.values());

  // Enqueue mock SMS for each approver
  for (const approver of notifiedApprovers) {
    try {
      await enqueueNotifySms({
        recipientId: approver.id,
        phoneNumber: approver.phoneNumber ?? undefined,
        title: "Milestone Deliverable Submitted for Approval",
        message: `Deliverable '${title}' for phase ${project.currentPhase} of project '${project.title}' has been submitted for approval. Content Hash: ${contentHash.substring(0, 12)}...`,
        type: "MILESTONE_SUBMITTED",
        metadata: {
          projectId: project.id,
          milestoneId: milestone.id,
          phase: project.currentPhase,
          contentHash,
          artifactKeysCount: artifactKeys.length,
        },
      });
    } catch {
      // Non-blocking notification dispatch
    }
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        milestone,
        contentHash,
        notifiedApproversCount: notifiedApprovers.length,
      },
    },
    { status: 201 }
  );
}
