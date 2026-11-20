import { NextRequest, NextResponse } from "next/server";
import { prisma, recordAuditLog, UserRole } from "@sih/db";
import { CsrEntryStatus } from "@sih/shared";
import { requireAuth } from "@/lib/auth/guards";
import { enqueueNotifySms } from "@/lib/queues";

interface RouteParams {
  params: Promise<{ id: string; entryId: string }>;
}

// ============================================================================
// PATCH /api/v1/projects/[id]/csr-ledger/[entryId]/verify
// ============================================================================

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth(req);
  if (!authResult.success) {
    return authResult.response;
  }
  const { user } = authResult;

  const { id, entryId } = await params;

  if (
    !id ||
    !entryId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entryId)
  ) {
    return NextResponse.json(
      { error: "INVALID_ID", message: "Project ID and Entry ID must be valid UUIDs" },
      { status: 400 }
    );
  }

  // 1. Role Gate: Reject unauthorized roles (Industry partners cannot self-verify their disbursements)
  if (
    user.role === UserRole.STUDENT ||
    user.role === UserRole.CITIZEN ||
    user.role === UserRole.INDUSTRY_PARTNER ||
    user.role === UserRole.CSR_PARTNER
  ) {
    return NextResponse.json(
      {
        error: "FORBIDDEN",
        message:
          "Only recipient HEI administrative authorities, Government Officials, or system administrators can verify off-platform CSR banking tranches",
      },
      { status: 403 }
    );
  }

  // 2. Fetch Project & Affiliations
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      institution: {
        select: { id: true, name: true, verificationStatus: true },
      },
      industryPartner: {
        select: { id: true, organizationName: true },
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

  // 3. Authorization Check: HEI affiliated or Govt Official or Super Admin
  const isAffiliatedHei =
    (user.role === UserRole.INSTITUTION_ADMIN || user.role === UserRole.FACULTY) &&
    user.institutionId === project.institutionId;

  const isGovtOfficial = user.role === UserRole.GOVT_OFFICIAL;
  const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;

  if (!isAffiliatedHei && !isGovtOfficial && !isSuperAdmin) {
    return NextResponse.json(
      {
        error: "FORBIDDEN",
        message:
          "Only administrators of the recipient institution or Government Officials can verify CSR banking tranches for this project",
      },
      { status: 403 }
    );
  }

  // 4. Fetch Ledger Entry
  const entry = await prisma.csrLedgerEntry.findUnique({
    where: { id: entryId },
  });

  if (!entry || entry.projectId !== project.id) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: `CSR ledger entry '${entryId}' not found for this project` },
      { status: 404 }
    );
  }

  if (entry.status === CsrEntryStatus.VERIFIED || (entry.status as string) === "VERIFIED") {
    return NextResponse.json(
      {
        error: "ALREADY_VERIFIED",
        message: "This CSR milestone disbursement tranche has already been verified",
      },
      { status: 409 }
    );
  }

  const now = new Date();
  const ipAddress =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  const userAgent = req.headers.get("user-agent") || undefined;

  // 5. Atomic Update in Transaction
  const updatedEntry = await prisma.$transaction(async (tx) => {
    const updated = await tx.csrLedgerEntry.update({
      where: { id: entry.id },
      data: {
        status: CsrEntryStatus.VERIFIED,
        verifiedAt: now,
        verifiedBy: user.id,
      },
    });

    await tx.project.update({
      where: { id: project.id },
      data: {
        fundingStatus: "CSR_FUNDED",
      },
    });

    await recordAuditLog(
      {
        actorId: user.id,
        action: "CSR_DISBURSEMENT_VERIFIED",
        entityType: "CsrLedgerEntry",
        entityId: entry.id,
        metadata: {
          projectId: project.id,
          entryId: entry.id,
          amountInr: Number(entry.amount),
          paymentMode: entry.paymentMode,
          externalReferenceNo: entry.externalReferenceNo,
          verifiedBy: user.id,
        },
        ipAddress,
        userAgent,
      },
      tx
    );

    return updated;
  });

  // 6. Enqueue Mock SMS to Industry Partner Representative
  const partnerMember = project.projectMembers.find(
    (m) => m.role === "INDUSTRY_PARTNER" || m.user.role === UserRole.INDUSTRY_PARTNER
  );

  if (partnerMember) {
    try {
      await enqueueNotifySms({
        recipientId: partnerMember.user.id,
        phoneNumber: partnerMember.user.phoneNumber ?? undefined,
        title: "CSR Disbursement Tranche Verified",
        message: `Your off-platform CSR deposit of ₹${Number(entry.amount).toLocaleString("en-IN")} (Ref: ${entry.externalReferenceNo}) has been VERIFIED by ${project.institution.name}.`,
        type: "CSR_DISBURSEMENT_VERIFIED",
        metadata: {
          projectId: project.id,
          entryId: entry.id,
          amountInr: Number(entry.amount),
          externalReferenceNo: entry.externalReferenceNo,
        },
      });
    } catch {
      // Non-blocking
    }
  }

  return NextResponse.json({
    success: true,
    message: `Off-platform CSR disbursement tranche of ₹${Number(entry.amount).toLocaleString("en-IN")} marked as VERIFIED`,
    data: {
      entry: updatedEntry,
      project: {
        id: project.id,
        fundingStatus: "CSR_FUNDED",
      },
    },
  });
}
