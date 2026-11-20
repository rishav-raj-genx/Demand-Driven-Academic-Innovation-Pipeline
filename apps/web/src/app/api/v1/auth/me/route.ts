import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";

export async function GET(req: Request): Promise<NextResponse> {
  const authResult = await requireAuth(req);
  if (!authResult.success) {
    return authResult.response;
  }

  const { user } = authResult;

  let orgVerificationStatus = user.verificationStatus;
  if (user.role === "INSTITUTION_ADMIN" || user.role === "HEI_ADMIN") {
    orgVerificationStatus = user.institution?.verificationStatus ?? user.verificationStatus;
  } else if (user.role === "INDUSTRY_PARTNER") {
    orgVerificationStatus = user.industryPartner?.verificationStatus ?? user.verificationStatus;
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
          verificationStatus: user.verificationStatus,
          institutionId: user.institutionId,
          industryPartnerId: user.industryPartnerId,
          institution: user.institution,
          industryPartner: user.industryPartner,
          orgVerificationStatus,
        },
      },
    },
    { status: 200 }
  );
}
