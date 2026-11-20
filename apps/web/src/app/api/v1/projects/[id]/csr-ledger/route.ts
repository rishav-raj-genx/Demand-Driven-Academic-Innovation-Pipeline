import { NextRequest, NextResponse } from "next/server";
import { prisma, recordAuditLog, UserRole, Prisma } from "@sih/db";
import { CsrEntryStatus } from "@sih/shared";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { enqueueNotifySms } from "@/lib/queues";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const FORBIDDEN_PAYMENT_KEYWORDS = [
  "razorpay",
  "stripe",
  "upi",
  "vpa",
  "cardnumber",
  "card_number",
  "cvv",
  "cardexpiry",
  "paymentintent",
  "payment_intent",
  "escrow",
  "wallet",
  "netbanking",
  "otp",
  "pin",
  "accountnumber",
  "account_number",
];

const CreateCsrLedgerSchema = z.object({
  amountInr: z.number().positive("Amount must be greater than zero"),
  paymentMode: z.enum(["EXTERNAL_NEFT", "RTGS", "CHEQUE", "CSR_GRANT"], {
    errorMap: () => ({
      message: "Payment mode must be one of: EXTERNAL_NEFT, RTGS, CHEQUE, CSR_GRANT",
    }),
  }),
  externalReferenceNo: z
    .string({ required_error: "External reference number (UTR/Cheque/Sanction Order) is required" })
    .trim()
    .min(3, "External reference number must be at least 3 characters")
    .max(100),
  milestoneId: z.string().uuid("Invalid milestone ID").optional().nullable(),
  receiptKey: z.string().trim().optional().nullable(),
  disbursementDate: z.string().datetime().optional().nullable(),
  remarks: z.string().trim().max(2000).optional().nullable(),
});

function hasForbiddenPaymentFields(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase().replace(/[^a-z]/g, "");
    if (FORBIDDEN_PAYMENT_KEYWORDS.some((kw) => lowerKey.includes(kw))) {
      return true;
    }
    if (typeof value === "string") {
      const lowerVal = value.toLowerCase();
      if (
        lowerVal.startsWith("pay_") ||
        lowerVal.startsWith("pi_") ||
        lowerVal.startsWith("tok_") ||
        lowerVal.includes("@upi") ||
        lowerVal.includes("@okhdfcbank") ||
        lowerVal.includes("@okaxis")
      ) {
        return true;
      }
    }
  }
  return false;
}

// ============================================================================
// POST /api/v1/projects/[id]/csr-ledger (Record Off-Platform CSR Disbursement)
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

  // 1. Role Gate: Reject Students and Citizens
  if (user.role === UserRole.STUDENT || user.role === UserRole.CITIZEN) {
    return NextResponse.json(
      {
        error: "FORBIDDEN",
        message: "Students and Citizens are not authorized to log CSR financial ledger disbursements",
      },
      { status: 403 }
    );
  }

  // 2. Parse Raw JSON & Strictly Reject In-Platform Payment Execution Fields
  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return NextResponse.json(
      { error: "INVALID_JSON", message: "Request body must be valid JSON" },
      { status: 400 }
    );
  }

  if (hasForbiddenPaymentFields(bodyJson)) {
    return NextResponse.json(
      {
        error: "IN_PLATFORM_PAYMENT_PROHIBITED",
        message:
          "In-platform payment execution is strictly prohibited by platform legal and regulatory compliance mandates. All CSR fund transfers occur exclusively via external banking channels (NEFT/RTGS/Cheque/Direct CSR Grant). Do not submit card, UPI, escrow, or payment gateway tokens.",
      },
      { status: 400 }
    );
  }

  // 3. Schema Validation
  const parsed = CreateCsrLedgerSchema.safeParse(bodyJson);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "VALIDATION_ERROR",
        message: "Invalid CSR ledger entry parameters",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const {
    amountInr,
    paymentMode,
    externalReferenceNo,
    milestoneId,
    receiptKey,
    disbursementDate,
    remarks,
  } = parsed.data;

  // 4. Load Project & Stakeholders
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

  if (!project.industryPartnerId) {
    return NextResponse.json(
      {
        error: "NO_PARTNER_ASSIGNED",
        message: "Project must have an assigned Industry Partner to log CSR milestone disbursements",
      },
      { status: 400 }
    );
  }

  // 5. Authorization: Verified Partner OR affiliated HEI Admin / Faculty / Super Admin
  const isLinkedPartner =
    (user.role === UserRole.INDUSTRY_PARTNER || user.role === UserRole.CSR_PARTNER) &&
    user.industryPartnerId === project.industryPartnerId;

  const isAffiliatedHei =
    (user.role === UserRole.INSTITUTION_ADMIN || user.role === UserRole.FACULTY) &&
    user.institutionId === project.institutionId;

  const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;

  if (!isLinkedPartner && !isAffiliatedHei && !isSuperAdmin) {
    return NextResponse.json(
      {
        error: "FORBIDDEN",
        message: "Only the assigned Industry Partner, affiliated HEI personnel, or an administrator can record CSR ledger entries",
      },
      { status: 403 }
    );
  }

  // 6. Organization Verification Check
  if (isLinkedPartner && project.industryPartner?.verificationStatus !== "VERIFIED") {
    return NextResponse.json(
      {
        error: "ORG_NOT_VERIFIED",
        message: "Industry Partner organization must be verified to record CSR disbursements",
      },
      { status: 403 }
    );
  }

  // 7. Validate Milestone if provided
  if (milestoneId) {
    const milestone = await prisma.milestone.findUnique({
      where: { id: milestoneId },
    });
    if (!milestone || milestone.projectId !== project.id) {
      return NextResponse.json(
        {
          error: "INVALID_MILESTONE",
          message: "Specified milestoneId does not belong to this project",
        },
        { status: 400 }
      );
    }
  }

  const ipAddress =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  const userAgent = req.headers.get("user-agent") || undefined;

  // 8. Record Entry in Database
  const entry = await prisma.csrLedgerEntry.create({
    data: {
      projectId: project.id,
      partnerId: project.industryPartnerId,
      amount: new Prisma.Decimal(amountInr),
      paymentMode,
      externalReferenceNo,
      transactionRef: externalReferenceNo,
      milestoneId: milestoneId || null,
      receiptKey: receiptKey || null,
      disbursementDate: disbursementDate ? new Date(disbursementDate) : new Date(),
      remarks: remarks || null,
      status: CsrEntryStatus.SUBMITTED,
    },
  });

  // 9. Record Platform AuditLog
  await recordAuditLog({
    actorId: user.id,
    action: "CSR_DISBURSEMENT_RECORDED",
    entityType: "CsrLedgerEntry",
    entityId: entry.id,
    metadata: {
      projectId: project.id,
      amountInr,
      paymentMode,
      externalReferenceNo,
      partnerId: project.industryPartnerId,
      milestoneId,
    },
    ipAddress,
    userAgent,
  });

  // 10. Enqueue Mock SMS to HEI Admin
  const facultyLead = project.projectMembers.find(
    (m) => m.role === "FACULTY_LEAD" || m.user.role === UserRole.FACULTY
  );

  if (facultyLead) {
    try {
      await enqueueNotifySms({
        recipientId: facultyLead.user.id,
        phoneNumber: facultyLead.user.phoneNumber ?? undefined,
        title: "Off-Platform CSR Tranche Recorded",
        message: `Off-platform CSR disbursement of ₹${amountInr.toLocaleString("en-IN")} via ${paymentMode} (Ref: ${externalReferenceNo}) was recorded by ${project.industryPartner?.organizationName}. Pending HEI verification.`,
        type: "CSR_DISBURSEMENT_RECORDED",
        metadata: {
          projectId: project.id,
          entryId: entry.id,
          amountInr,
          externalReferenceNo,
        },
      });
    } catch {
      // Non-blocking
    }
  }

  return NextResponse.json(
    {
      success: true,
      message: `Off-platform CSR disbursement of ₹${amountInr.toLocaleString("en-IN")} logged successfully`,
      data: entry,
    },
    { status: 201 }
  );
}

// ============================================================================
// GET /api/v1/projects/[id]/csr-ledger (List & Financial Summary)
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

  const entries = await prisma.csrLedgerEntry.findMany({
    where: { projectId: id },
    include: {
      partner: {
        select: { id: true, organizationName: true, cin: true },
      },
      milestone: {
        select: { id: true, title: true, phase: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  let totalDisbursedInr = 0;
  let totalVerifiedInr = 0;
  let pendingVerificationInr = 0;

  for (const entry of entries) {
    const num = Number(entry.amount);
    totalDisbursedInr += num;
    if (entry.status === CsrEntryStatus.VERIFIED || (entry.status as string) === "VERIFIED") {
      totalVerifiedInr += num;
    } else {
      pendingVerificationInr += num;
    }
  }

  return NextResponse.json({
    data: entries,
    summary: {
      totalDisbursedInr,
      totalVerifiedInr,
      pendingVerificationInr,
      entriesCount: entries.length,
    },
  });
}
