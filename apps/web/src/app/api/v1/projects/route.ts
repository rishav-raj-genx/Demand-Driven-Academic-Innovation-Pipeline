import { NextRequest, NextResponse } from "next/server";
import { prisma, Prisma, recordAuditLog } from "@sih/db";
import { UserRole, ProjectPhase, ChallengeStatus } from "@sih/shared";
import { z } from "zod";
import { requireAuth, requireRoles } from "@/lib/auth/guards";
import { calculateNepCreditSummary } from "@/lib/projects/nep";

// ============================================================================
// Schemas
// ============================================================================

const CreateProjectSchema = z.object({
  challengeId: z.string().uuid("Invalid challenge ID"),
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(255).optional(),
  description: z.string().trim().max(5000).optional(),
  budget: z.number().positive("Budget must be positive").optional(),
  targetCompletionDate: z.string().datetime().optional().nullable(),
  industryPartnerId: z.string().uuid("Invalid industry partner ID").optional().nullable(),
});

interface CapacityExceededError extends Error {
  code: "CAPACITY_EXCEEDED";
  statusCode: 409;
  activeProjects: number;
  maxCapacity: number;
}

interface ConflictError extends Error {
  code: "CHALLENGE_ALREADY_CLAIMED";
  statusCode: 409;
}

// ============================================================================
// POST /api/v1/projects (Claim Challenge -> Start PoC)
// ============================================================================

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (!authResult.success) {
    return authResult.response;
  }
  const { user } = authResult;

  // 1. Roles gate: verified HEI_ADMIN (INSTITUTION_ADMIN) or FACULTY
  const roleCheck = requireRoles(user, [
    UserRole.INSTITUTION_ADMIN,
    UserRole.FACULTY,
    UserRole.SUPER_ADMIN,
  ]);
  if (!roleCheck.success) {
    return roleCheck.response;
  }

  if (!user.institutionId) {
    return NextResponse.json(
      {
        error: "FORBIDDEN",
        message: "User must be affiliated with an educational institution to claim challenges",
      },
      { status: 403 }
    );
  }

  // 2. Verified Institution Gate
  const institution = await prisma.institution.findUnique({
    where: { id: user.institutionId },
    select: {
      id: true,
      name: true,
      verificationStatus: true,
      activeProjects: true,
      maxCapacity: true,
    },
  });

  if (!institution) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Institution not found" },
      { status: 404 }
    );
  }

  if (institution.verificationStatus !== "VERIFIED") {
    return NextResponse.json(
      {
        error: "ORG_NOT_VERIFIED",
        message: "Institution must be officially verified before claiming societal challenges",
      },
      { status: 403 }
    );
  }

  // 3. Payload validation
  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return NextResponse.json(
      { error: "INVALID_JSON", message: "Request body must be valid JSON" },
      { status: 400 }
    );
  }

  const parsed = CreateProjectSchema.safeParse(bodyJson);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "VALIDATION_ERROR",
        message: "Invalid project creation parameters",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const { challengeId, title, description, budget, targetCompletionDate, industryPartnerId } =
    parsed.data;

  // 4. Capability Match Check: Institution must have an AI match for this challenge
  const capabilityMatch = await prisma.capabilityMatch.findUnique({
    where: {
      challengeId_institutionId: {
        challengeId,
        institutionId: institution.id,
      },
    },
  });

  if (!capabilityMatch) {
    return NextResponse.json(
      {
        error: "NO_CAPABILITY_MATCH",
        message: "Institution has not been matched with this challenge by the AI capability engine",
      },
      { status: 403 }
    );
  }

  const ipAddress =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  const userAgent = req.headers.get("user-agent") || undefined;

  // 5. Atomic Transaction: Capacity Check, Creation, Match Status Update, Project Member & Audit
  try {
    const result = await prisma.$transaction(async (tx) => {
      // 5a. Verify capacity within transaction
      const currentInst = await tx.institution.findUnique({
        where: { id: institution.id },
        select: { id: true, activeProjects: true, maxCapacity: true },
      });

      if (!currentInst) {
        throw new Error("Institution not found in transaction");
      }

      if (currentInst.activeProjects >= currentInst.maxCapacity) {
        const err = new Error(
          `Institution has reached maximum project capacity (${currentInst.activeProjects}/${currentInst.maxCapacity})`
        ) as CapacityExceededError;
        err.code = "CAPACITY_EXCEEDED";
        err.statusCode = 409;
        err.activeProjects = currentInst.activeProjects;
        err.maxCapacity = currentInst.maxCapacity;
        throw err;
      }

      // 5b. Verify challenge status and prevent double-claim
      const challenge = await tx.challenge.findUnique({
        where: { id: challengeId },
        select: {
          id: true,
          title: true,
          problemStatement: true,
          status: true,
          budgetRange: true,
          industryPartnerId: true,
        },
      });

      if (!challenge) {
        throw new Error("Challenge not found");
      }

      const existingProject = await tx.project.findFirst({
        where: { challengeId },
        select: { id: true },
      });

      if (
        challenge.status === ("IN_PROJECT" as ChallengeStatus) ||
        challenge.status === ChallengeStatus.COMPLETED ||
        existingProject
      ) {
        const err = new Error(
          "Challenge has already been claimed and has an active project"
        ) as ConflictError;
        err.code = "CHALLENGE_ALREADY_CLAIMED";
        err.statusCode = 409;
        throw err;
      }

      // 5c. Create Project (currentPhase: POC)
      const project = await tx.project.create({
        data: {
          title: title || challenge.title,
          description: description || challenge.problemStatement,
          challengeId: challenge.id,
          institutionId: currentInst.id,
          industryPartnerId: industryPartnerId || challenge.industryPartnerId || null,
          currentPhase: ProjectPhase.POC,
          startDate: new Date(),
          targetCompletionDate: targetCompletionDate ? new Date(targetCompletionDate) : null,
          budget: budget ? new Prisma.Decimal(budget) : challenge.budgetRange,
        },
      });

      // 5d. Mark CapabilityMatch.status = ACCEPTED
      await tx.capabilityMatch.update({
        where: {
          challengeId_institutionId: {
            challengeId: challenge.id,
            institutionId: currentInst.id,
          },
        },
        data: { status: "ACCEPTED" },
      });

      // 5e. Update Challenge.status = IN_PROJECT
      await tx.challenge.update({
        where: { id: challenge.id },
        data: { status: "IN_PROJECT" as ChallengeStatus },
      });

      // 5f. Increment Institution.activeProjects atomically
      const updatedInst = await tx.institution.update({
        where: { id: currentInst.id },
        data: { activeProjects: { increment: 1 } },
        select: { activeProjects: true, maxCapacity: true },
      });

      // 5g. Add creator as FACULTY_LEAD in project_members
      const member = await tx.projectMember.create({
        data: {
          projectId: project.id,
          userId: user.id,
          role: "FACULTY_LEAD",
        },
        include: {
          user: {
            select: { id: true, fullName: true, email: true, role: true },
          },
        },
      });

      // 5h. Record Platform AuditLog
      await recordAuditLog({
        actorId: user.id,
        action: "PROJECT_CREATED",
        entityType: "Project",
        entityId: project.id,
        metadata: {
          challengeId: challenge.id,
          institutionId: currentInst.id,
          currentPhase: "POC",
          title: project.title,
          activeProjectsAfter: updatedInst.activeProjects,
          maxCapacity: updatedInst.maxCapacity,
        },
        ipAddress,
        userAgent,
      });

      return {
        project,
        member,
        activeProjects: updatedInst.activeProjects,
        maxCapacity: updatedInst.maxCapacity,
      };
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          ...result.project,
          members: [result.member],
          institutionCapacity: {
            activeProjects: result.activeProjects,
            maxCapacity: result.maxCapacity,
          },
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    if (err && typeof err === "object" && "statusCode" in err && "code" in err) {
      const typedErr = err as { statusCode: number; code: string; message: string };
      return NextResponse.json(
        {
          error: typedErr.code,
          message: typedErr.message,
        },
        { status: typedErr.statusCode }
      );
    }

    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : "Failed to create project",
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET /api/v1/projects (Project Directory Listing)
// ============================================================================

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (!authResult.success) {
    return authResult.response;
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
  const skip = (page - 1) * limit;

  const phase = searchParams.get("phase");
  const institutionId = searchParams.get("institutionId");
  const partnerId = searchParams.get("partnerId");
  const search = searchParams.get("search")?.trim();

  const where: Prisma.ProjectWhereInput = {};

  if (phase && Object.values(ProjectPhase).includes(phase as ProjectPhase)) {
    where.currentPhase = phase as ProjectPhase;
  }

  if (institutionId) {
    where.institutionId = institutionId;
  }

  if (partnerId) {
    where.industryPartnerId = partnerId;
  }

  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  const [total, projects] = await Promise.all([
    prisma.project.count({ where }),
    prisma.project.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        institution: {
          select: {
            id: true,
            name: true,
            code: true,
            tier: true,
            verificationStatus: true,
          },
        },
        industryPartner: {
          select: {
            id: true,
            organizationName: true,
            cin: true,
            industrySector: true,
            verificationStatus: true,
          },
        },
        challenge: {
          select: {
            id: true,
            title: true,
            domain: true,
            urgency: true,
            status: true,
          },
        },
        projectMembers: {
          select: {
            id: true,
            role: true,
            joinedAt: true,
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                role: true,
              },
            },
          },
        },
        milestones: {
          select: {
            id: true,
            title: true,
            phase: true,
            status: true,
            isCompleted: true,
            orderIndex: true,
            contentHash: true,
            completedAt: true,
          },
          orderBy: { orderIndex: "asc" },
        },
        _count: {
          select: {
            projectMembers: true,
            milestones: true,
            mous: true,
            csrLedgerEntries: true,
          },
        },
      },
    }),
  ]);

  const items = projects.map((p) => {
    const nepCreditSummary = calculateNepCreditSummary(
      p.currentPhase,
      p.milestones,
      p.projectMembers
    );

    const activeMilestone = p.milestones.find((m) => m.phase === p.currentPhase) || null;

    return {
      id: p.id,
      title: p.title,
      description: p.description,
      currentPhase: p.currentPhase,
      startDate: p.startDate,
      targetCompletionDate: p.targetCompletionDate,
      budget: p.budget,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      institution: p.institution,
      industryPartner: p.industryPartner,
      challenge: p.challenge,
      activeMilestone,
      membersCount: p._count.projectMembers,
      milestonesCount: p._count.milestones,
      mousCount: p._count.mous,
      csrLedgerCount: p._count.csrLedgerEntries,
      nepCreditSummary,
    };
  });

  return NextResponse.json({
    data: items,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
}
