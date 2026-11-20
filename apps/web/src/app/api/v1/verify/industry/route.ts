import { NextResponse } from "next/server";
import { prisma, recordAuditLog, VerificationStatus } from "@sih/db";
import { z } from "zod";
import { parseJsonBody } from "@/lib/validation";
import { verificationProvider } from "@/lib/verification";

const IndustryVerificationSchema = z
  .object({
    industryPartnerId: z.string().uuid("Invalid industry partner ID").optional(),
    cin: z
      .string()
      .regex(
        /^[LUu][0-9]{5}[A-Za-z]{2}[0-9]{4}[A-Za-z]{3}[0-9]{6}$/,
        "Invalid Corporate Identification Number (CIN) format"
      )
      .optional(),
    udyamNumber: z
      .string()
      .regex(
        /^(?:UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}|UDYAM-[A-Za-z0-9-]+)$/,
        "Invalid Udyam registration number format. Expected format: UDYAM-JH-01-0012345"
      )
      .optional(),
  })
  .refine((data) => Boolean(data.cin || data.udyamNumber), {
    message: "Either cin or udyamNumber must be provided for industry verification",
    path: ["cin"],
  });

export async function POST(req: Request): Promise<NextResponse> {
  const ipAddress = req.headers.get("x-forwarded-for") ?? "127.0.0.1";
  const userAgent = req.headers.get("user-agent") ?? null;

  const parseResult = await parseJsonBody(req, IndustryVerificationSchema);
  if (!parseResult.success) {
    return parseResult.response;
  }

  const { cin, udyamNumber, industryPartnerId } = parseResult.data;

  // Query provider based on provided identifier
  const result = cin
    ? await verificationProvider.verifyMcaCin(cin)
    : await verificationProvider.verifyUdyamNumber(udyamNumber!);

  // Look up industry partner by ID or CIN in database
  let partner = null;
  if (industryPartnerId) {
    partner = await prisma.industryPartner.findUnique({
      where: { id: industryPartnerId },
    });
  } else if (cin) {
    partner = await prisma.industryPartner.findUnique({
      where: { cin: cin.trim().toUpperCase() },
    });
  }

  // Update partner status if found
  if (partner) {
    const newStatus = result.verified
      ? VerificationStatus.VERIFIED
      : result.status === "REJECTED"
      ? VerificationStatus.REJECTED
      : partner.verificationStatus;

    if (newStatus !== partner.verificationStatus) {
      await prisma.industryPartner.update({
        where: { id: partner.id },
        data: { verificationStatus: newStatus },
      });

      // Synchronize linked users belonging to this industry partner
      await prisma.user.updateMany({
        where: { industryPartnerId: partner.id },
        data: { verificationStatus: newStatus },
      });
    }
  }

  // Record audit trail
  await recordAuditLog({
    actorId: null,
    action: "INDUSTRY_VERIFICATION_EVALUATED",
    entityType: "IndustryPartner",
    entityId: partner?.id ?? cin ?? udyamNumber ?? "UNKNOWN",
    metadata: {
      cin: cin ?? null,
      udyamNumber: udyamNumber ?? null,
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
        industryPartnerId: partner?.id ?? null,
      },
    },
    { status: 200 }
  );
}
