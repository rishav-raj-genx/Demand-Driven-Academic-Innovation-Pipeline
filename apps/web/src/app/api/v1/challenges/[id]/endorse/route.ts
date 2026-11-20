import { NextResponse } from "next/server";
import { prisma, recordAuditLog } from "@sih/db";
import { getAuthTokensFromRequest } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getRedisClient } from "@/lib/rate-limit";

// ============================================================================
// POST /api/v1/challenges/[id]/endorse - Citizen Endorsement
// ============================================================================

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const ipAddress = req.headers.get("x-forwarded-for") ?? "127.0.0.1";
  const userAgent = req.headers.get("user-agent") ?? null;

  if (!id || id.trim() === "") {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_CHALLENGE_ID",
          message: "Challenge ID is required",
        },
      },
      { status: 400 }
    );
  }

  // 1. Verify challenge exists
  const challenge = await prisma.challenge.findUnique({
    where: { id },
    select: { id: true, title: true, endorsementCount: true },
  });

  if (!challenge) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "CHALLENGE_NOT_FOUND",
          message: `Challenge with ID '${id}' not found`,
        },
      },
      { status: 404 }
    );
  }

  // 2. Identify endorser (user token if present, otherwise IP address)
  let endorserId = ipAddress;
  let actorId: string | null = null;

  const { accessToken } = getAuthTokensFromRequest(req);
  if (accessToken) {
    const payload = await verifyAccessToken(accessToken);
    if (payload?.sub) {
      endorserId = payload.sub;
      actorId = payload.sub;
    }
  }

  // 3. Repeat abuse prevention via Redis rate check + AuditLog fallback
  let alreadyEndorsed = false;
  try {
    const redis = getRedisClient();
    const rateLimitKey = `endorse:${challenge.id}:${endorserId}`;
    const cached = await redis.get(rateLimitKey);

    if (cached) {
      alreadyEndorsed = true;
    } else {
      // Set 24-hour cooldown for this user/IP on this challenge
      await redis.set(rateLimitKey, "1", "EX", 86400);
    }
  } catch (err) {
    console.warn("[RateLimit] Redis endorsement check warning:", err);
    // Fallback: check database audit log for recent endorsement in last 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existingLog = await prisma.auditLog.findFirst({
      where: {
        action: "CHALLENGE_ENDORSED",
        entityId: challenge.id,
        createdAt: { gte: oneDayAgo },
        OR: [
          ...(actorId ? [{ userId: actorId }] : []),
          { ipAddress },
        ],
      },
    });
    if (existingLog) {
      alreadyEndorsed = true;
    }
  }

  if (alreadyEndorsed) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "ALREADY_ENDORSED",
          message: "You have already endorsed this challenge recently",
        },
      },
      { status: 429 }
    );
  }

  // 4. Atomically increment endorsement count in database
  const updatedChallenge = await prisma.challenge.update({
    where: { id: challenge.id },
    data: {
      endorsementCount: { increment: 1 },
    },
    select: {
      id: true,
      title: true,
      endorsementCount: true,
    },
  });

  // 5. Record platform audit log
  await recordAuditLog({
    actorId,
    action: "CHALLENGE_ENDORSED",
    entityType: "Challenge",
    entityId: updatedChallenge.id,
    metadata: {
      newEndorsementCount: updatedChallenge.endorsementCount,
      endorserIdentifier: endorserId,
    },
    ipAddress,
    userAgent,
  });

  return NextResponse.json(
    {
      success: true,
      message: "Challenge endorsed successfully",
      data: {
        challengeId: updatedChallenge.id,
        endorsementCount: updatedChallenge.endorsementCount,
      },
    },
    { status: 200 }
  );
}
