import { NextResponse } from "next/server";
import { prisma, recordAuditLog, VerificationStatus } from "@sih/db";
import { z } from "zod";
import { parseJsonBody } from "@/lib/validation";
import { verificationProvider } from "@/lib/verification";

const AisheVerificationSchema = z.object({
  aisheCode: z
    .string()
    .min(1, "AISHE code is required")
    .regex(
      /^(?:[UCS]-[0-9]{4,6}|[UCS]-[A-Za-z0-9-]+)$/,
      "Invalid AISHE code format. Expected format: U-0205, C-44102, or S-12055"
    ),
  institutionId: z.string().uuid("Invalid institution ID").optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  const ipAddress = req.headers.get("x-forwarded-for") ?? "127.0.0.1";
  const userAgent = req.headers.get("user-agent") ?? null;

  const parseResult = await parseJsonBody(req, AisheVerificationSchema);
  if (!parseResult.success) {
    return parseResult.response;
  }

  const { aisheCode, institutionId } = parseResult.data;
  const result = await verificationProvider.verifyAisheCode(aisheCode);

  // Look up institution by ID or AISHE code in database
  let institution = null;
  if (institutionId) {
    institution = await prisma.institution.findUnique({
      where: { id: institutionId },
    });
  } else {
    institution = await prisma.institution.findUnique({
      where: { code: aisheCode.trim().toUpperCase() },
    });
  }

  // Update institution verification status if found in database
  if (institution) {
    const newStatus = result.verified
      ? VerificationStatus.VERIFIED
      : result.status === "REJECTED"
      ? VerificationStatus.REJECTED
      : institution.verificationStatus;

    if (newStatus !== institution.verificationStatus) {
      await prisma.institution.update({
        where: { id: institution.id },
        data: { verificationStatus: newStatus },
      });

      // Synchronize linked users belonging to this institution
      await prisma.user.updateMany({
        where: { institutionId: institution.id },
        data: { verificationStatus: newStatus },
      });
    }
  }

  // Record immutable audit log
  await recordAuditLog({
    actorId: null,
    action: "AISHE_VERIFICATION_EVALUATED",
    entityType: "Institution",
    entityId: institution?.id ?? aisheCode,
    metadata: {
      aisheCode,
      status: result.status,
      verified: result.verified,
      source: result.source,
      badge: result.badge,
      isOfficialLiveApi: result.isOfficialLiveApi,
    },
    ipAddress,
    userAgent,
  });

  if (!result.verified) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: result.status,
          message: result.message,
          source: result.source,
          badge: result.badge,
          isOfficialLiveApi: result.isOfficialLiveApi,
          details: result,
        },
      },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        ...result,
        institutionId: institution?.id ?? null,
      },
    },
    { status: 200 }
  );
}
