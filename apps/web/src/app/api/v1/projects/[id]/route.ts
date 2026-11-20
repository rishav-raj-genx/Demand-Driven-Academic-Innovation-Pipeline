import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@sih/db";
import { requireAuth } from "@/lib/auth/guards";
import { calculateNepCreditSummary } from "@/lib/projects/nep";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ============================================================================
// GET /api/v1/projects/[id] (Full Project State & Lifecycle Inspector)
// ============================================================================

export async function GET(req: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth(req);
  if (!authResult.success) {
    return authResult.response;
  }

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
        include: {
          district: {
            select: { id: true, name: true, code: true, state: true },
          },
        },
      },
      industryPartner: {
        include: {
          district: {
            select: { id: true, name: true, code: true, state: true },
          },
        },
      },
      challenge: {
        include: {
          district: {
            select: { id: true, name: true, code: true, state: true },
          },
          createdBy: {
            select: { id: true, fullName: true, role: true },
          },
        },
      },
      projectMembers: {
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
              phoneNumber: true,
              institutionId: true,
              industryPartnerId: true,
            },
          },
        },
        orderBy: { joinedAt: "asc" },
      },
      milestones: {
        include: {
          phaseApprovals: {
            include: {
              signer: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                  role: true,
                },
              },
            },
            orderBy: { signedAt: "asc" },
          },
        },
        orderBy: { orderIndex: "asc" },
      },
      mous: {
        orderBy: { createdAt: "desc" },
      },
      csrLedgerEntries: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!project) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: `Project with ID '${id}' not found` },
      { status: 404 }
    );
  }

  const nepCreditSummary = calculateNepCreditSummary(
    project.currentPhase,
    project.milestones,
    project.projectMembers
  );

  return NextResponse.json({
    data: {
      id: project.id,
      title: project.title,
      description: project.description,
      currentPhase: project.currentPhase,
      startDate: project.startDate,
      targetCompletionDate: project.targetCompletionDate,
      budget: project.budget,
      fundingStatus: project.fundingStatus,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      institution: project.institution,
      industryPartner: project.industryPartner,
      challenge: project.challenge,
      projectMembers: project.projectMembers.map((pm) => ({
        id: pm.id,
        role: pm.role,
        joinedAt: pm.joinedAt,
        user: pm.user,
      })),
      milestones: project.milestones.map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        summary: m.summary,
        phase: m.phase,
        orderIndex: m.orderIndex,
        dueDate: m.dueDate,
        status: m.status,
        isCompleted: m.isCompleted,
        completedAt: m.completedAt,
        contentHash: m.contentHash,
        artifactKeys: m.artifactKeys,
        phaseApprovals: m.phaseApprovals,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      })),
      mous: project.mous,
      csrLedgerEntries: project.csrLedgerEntries,
      nepCreditSummary,
    },
  });
}

// ============================================================================
// Direct PATCH Prohibited Gate (Enforcing Phase Transitions via Dual-Signature)
// ============================================================================

export async function PATCH() {
  return NextResponse.json(
    {
      error: "METHOD_NOT_ALLOWED",
      message:
        "Direct phase updates are strictly prohibited. Project phase transitions must only be executed via the Dual-Signature verification engine.",
    },
    { status: 405 }
  );
}
