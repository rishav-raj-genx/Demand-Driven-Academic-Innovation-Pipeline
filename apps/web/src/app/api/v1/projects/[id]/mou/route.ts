import { NextRequest, NextResponse } from "next/server";
import { prisma, recordAuditLog, UserRole, Prisma } from "@sih/db";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const MANDATORY_MOU_COMPLIANCE_CLAUSE =
  "All CSR disbursements occur exclusively via external banking channels outside the platform. The platform does not process, hold, or escrow funds. Financial execution must be conducted directly between the Industry/CSR Partner and the Higher Education Institution through official banking channels (NEFT/RTGS/Cheque/Direct CSR Grant).";

const MilestoneScheduleItemSchema = z.object({
  phase: z.string().trim().min(2),
  deliverable: z.string().trim().min(3),
  trancheAmountInr: z.number().positive().optional(),
  targetMonth: z.number().int().positive().optional(),
});

const CreateMouSchema = z.object({
  pledgedAmountInr: z.number().positive("Pledged amount must be greater than zero"),
  ipOwnershipSplit: z
    .object({
      heiPercentage: z.number().min(0).max(100),
      industryPercentage: z.number().min(0).max(100),
    })
    .refine((val) => val.heiPercentage + val.industryPercentage === 100, {
      message: "IP ownership percentages must sum to exactly 100%",
    }),
  milestoneSchedule: z.array(MilestoneScheduleItemSchema).default([]),
  documentUrl: z.string().url().optional(),
  ipTerms: z.string().trim().max(5000).optional(),
  expiryDate: z.string().datetime().optional().nullable(),
});

function generateMouNumber(): string {
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `MOU-SIH26-${randomSuffix}`;
}

// ============================================================================
// POST /api/v1/projects/[id]/mou (Draft Structured Bilateral MoU)
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

  // 1. Fetch Project with Affiliations
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
        select: { userId: true, role: true },
      },
    },
  });

  if (!project) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: `Project with ID '${id}' not found` },
      { status: 404 }
    );
  }

  if (!project.industryPartnerId || !project.industryPartner) {
    return NextResponse.json(
      {
        error: "NO_PARTNER_ASSIGNED",
        message: "An Industry Partner must be assigned to the project before drafting an MoU",
      },
      { status: 400 }
    );
  }

  // 2. Authorization Gate: Authorized HEI personnel or linked Industry Partner
  const isHeiAffiliated =
    (user.role === UserRole.INSTITUTION_ADMIN || user.role === UserRole.FACULTY) &&
    (user.institutionId === project.institutionId ||
      project.projectMembers.some((m) => m.userId === user.id));

  const isPartnerAffiliated =
    (user.role === UserRole.INDUSTRY_PARTNER || user.role === UserRole.CSR_PARTNER) &&
    user.industryPartnerId === project.industryPartnerId;

  const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;

  if (!isHeiAffiliated && !isPartnerAffiliated && !isSuperAdmin) {
    return NextResponse.json(
      {
        error: "FORBIDDEN",
        message: "Only affiliated HEI personnel, the linked Industry Partner, or an administrator can draft an MoU",
      },
      { status: 403 }
    );
  }

  // 3. Organization Verification Check
  if (project.institution.verificationStatus !== "VERIFIED") {
    return NextResponse.json(
      {
        error: "ORG_NOT_VERIFIED",
        message: "Higher Education Institution must be officially verified",
      },
      { status: 403 }
    );
  }

  if (project.industryPartner.verificationStatus !== "VERIFIED") {
    return NextResponse.json(
      {
        error: "ORG_NOT_VERIFIED",
        message: "Industry Partner must be officially verified",
      },
      { status: 403 }
    );
  }

  // 4. Validate Payload
  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return NextResponse.json(
      { error: "INVALID_JSON", message: "Request body must be valid JSON" },
      { status: 400 }
    );
  }

  const parsed = CreateMouSchema.safeParse(bodyJson);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "VALIDATION_ERROR",
        message: "Invalid MoU drafting parameters",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const { pledgedAmountInr, ipOwnershipSplit, milestoneSchedule, documentUrl, ipTerms, expiryDate } =
    parsed.data;

  const ipAddress =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  const userAgent = req.headers.get("user-agent") || undefined;

  // 5. Generate collision-resistant MoU Number
  let mouNumber = generateMouNumber();
  let attempts = 0;
  while (attempts < 5) {
    const existing = await prisma.moU.findUnique({ where: { mouNumber } });
    if (!existing) break;
    mouNumber = generateMouNumber();
    attempts++;
  }

  const resolvedDocumentUrl =
    documentUrl ||
    `https://sih26043-media.s3.amazonaws.com/mous/${mouNumber.toLowerCase()}.pdf`;

  // 6. Create MoU Record in Database
  const mou = await prisma.moU.create({
    data: {
      projectId: project.id,
      mouNumber,
      documentUrl: resolvedDocumentUrl,
      status: "DRAFT",
      ipTerms: ipTerms || `HEI: ${ipOwnershipSplit.heiPercentage}%, Industry: ${ipOwnershipSplit.industryPercentage}% ownership split.`,
      pledgedAmountInr: new Prisma.Decimal(pledgedAmountInr),
      ipOwnershipSplit: ipOwnershipSplit as unknown as Prisma.InputJsonValue,
      milestoneSchedule: milestoneSchedule as unknown as Prisma.InputJsonValue,
      complianceClause: MANDATORY_MOU_COMPLIANCE_CLAUSE,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
    },
  });

  // 7. Record Platform AuditLog
  await recordAuditLog({
    actorId: user.id,
    action: "MOU_CREATED",
    entityType: "MoU",
    entityId: mou.id,
    metadata: {
      projectId: project.id,
      mouNumber,
      pledgedAmountInr,
      ipOwnershipSplit,
      milestonesCount: milestoneSchedule.length,
    },
    ipAddress,
    userAgent,
  });

  return NextResponse.json(
    {
      success: true,
      message: `Structured bilateral MoU ${mouNumber} drafted successfully`,
      data: mou,
    },
    { status: 201 }
  );
}

// ============================================================================
// GET /api/v1/projects/[id]/mou (List Project MoUs)
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

  const mous = await prisma.moU.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    data: mous,
  });
}
