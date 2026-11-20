import { NextResponse } from "next/server";
import { requireAuth, requireRoles, requireVerifiedOrg } from "@/lib/auth/guards";
import { parseJsonBody } from "@/lib/validation";
import { z } from "zod";

const SignTransitionSchema = z.object({
  milestoneId: z.string().uuid("Invalid milestone ID"),
  decision: z.enum(["APPROVED", "REJECTED", "REQUESTED_CHANGES"]),
  remarks: z.string().optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  const authResult = await requireAuth(req);
  if (!authResult.success) {
    return authResult.response;
  }

  const { user } = authResult;

  // Enforce role authorization
  const roleCheck = requireRoles(user, [
    "INSTITUTION_ADMIN",
    "INDUSTRY_PARTNER",
    "CSR_PARTNER",
  ]);
  if (!roleCheck.success) {
    return roleCheck.response;
  }

  // Enforce organization verification gate
  const orgCheck = requireVerifiedOrg(user);
  if (!orgCheck.success) {
    return orgCheck.response;
  }

  const parseResult = await parseJsonBody(req, SignTransitionSchema);
  if (!parseResult.success) {
    return parseResult.response;
  }

  return NextResponse.json(
    {
      success: true,
      message: "Stage transition decision signed successfully by verified organization",
      data: {
        milestoneId: parseResult.data.milestoneId,
        signerId: user.id,
        signerRole: user.role,
        decision: parseResult.data.decision,
      },
    },
    { status: 200 }
  );
}
