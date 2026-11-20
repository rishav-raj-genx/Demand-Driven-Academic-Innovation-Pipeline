import { NextResponse } from "next/server";
import { requireAuth, requireRoles, requireVerifiedOrg } from "@/lib/auth/guards";
import { parseJsonBody } from "@/lib/validation";
import { z } from "zod";

const ClaimChallengeSchema = z.object({
  challengeId: z.string().uuid("Invalid challenge ID"),
  proposedBudget: z.number().positive().optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  const authResult = await requireAuth(req);
  if (!authResult.success) {
    return authResult.response;
  }

  const { user } = authResult;

  // Enforce role authorization
  const roleCheck = requireRoles(user, ["INSTITUTION_ADMIN", "FACULTY", "RESEARCHER"]);
  if (!roleCheck.success) {
    return roleCheck.response;
  }

  // Enforce organization verification gate
  const orgCheck = requireVerifiedOrg(user);
  if (!orgCheck.success) {
    return orgCheck.response;
  }

  const parseResult = await parseJsonBody(req, ClaimChallengeSchema);
  if (!parseResult.success) {
    return parseResult.response;
  }

  return NextResponse.json(
    {
      success: true,
      message: "Challenge claimed successfully by verified institution",
      data: {
        challengeId: parseResult.data.challengeId,
        institutionId: user.institutionId,
        claimedByUserId: user.id,
      },
    },
    { status: 200 }
  );
}
