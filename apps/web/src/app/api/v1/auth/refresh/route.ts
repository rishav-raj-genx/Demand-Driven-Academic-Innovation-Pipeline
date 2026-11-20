import { NextResponse } from "next/server";
import { prisma, recordAuditLog } from "@sih/db";
import {
  verifyRefreshToken,
  signAccessToken,
  signRefreshToken,
} from "@/lib/auth/jwt";
import { hashToken } from "@/lib/auth/hash";
import {
  getAuthTokensFromRequest,
  setAuthCookies,
  clearAuthCookies,
  REFRESH_TOKEN_MAX_AGE,
} from "@/lib/auth/cookies";

export async function POST(req: Request): Promise<NextResponse> {
  const ipAddress = req.headers.get("x-forwarded-for") ?? "127.0.0.1";
  const userAgent = req.headers.get("user-agent") ?? null;

  // Extract refresh token from cookie or JSON body fallback
  let { refreshToken } = getAuthTokensFromRequest(req);

  if (!refreshToken) {
    try {
      const body = (await req.json()) as { refreshToken?: string };
      if (body?.refreshToken) {
        refreshToken = body.refreshToken;
      }
    } catch {
      // Body is not JSON or empty
    }
  }

  if (!refreshToken) {
    const response = NextResponse.json(
      {
        success: false,
        error: {
          code: "MISSING_REFRESH_TOKEN",
          message: "Refresh token is required",
        },
      },
      { status: 401 }
    );
    clearAuthCookies(response.headers);
    return response;
  }

  const payload = await verifyRefreshToken(refreshToken);
  if (!payload || !payload.sub) {
    const response = NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_REFRESH_TOKEN",
          message: "Invalid or expired refresh token",
        },
      },
      { status: 401 }
    );
    clearAuthCookies(response.headers);
    return response;
  }

  const hashedToken = hashToken(refreshToken);
  const tokenRecord = await prisma.refreshToken.findUnique({
    where: { token: hashedToken },
    include: {
      user: {
        include: {
          institution: {
            select: { id: true, name: true, code: true, verificationStatus: true },
          },
          industryPartner: {
            select: { id: true, organizationName: true, cin: true, verificationStatus: true },
          },
        },
      },
    },
  });

  // Reuse Detection: If token is not in DB or already marked as revoked
  if (!tokenRecord || tokenRecord.revoked) {
    // Revoke family / all tokens for this user on reuse detection
    await prisma.refreshToken.updateMany({
      where: { userId: payload.sub },
      data: { revoked: true },
    });

    await recordAuditLog({
      actorId: payload.sub,
      action: "REFRESH_TOKEN_REUSE_DETECTED",
      entityType: "RefreshToken",
      entityId: payload.jti || hashedToken,
      metadata: {
        alert: "Reused refresh token detected. All sessions revoked.",
        tokenId: tokenRecord?.id ?? null,
      },
      ipAddress,
      userAgent,
    });

    const response = NextResponse.json(
      {
        success: false,
        error: {
          code: "TOKEN_REUSED",
          message: "Token reuse detected. All sessions terminated for security.",
        },
      },
      { status: 401 }
    );
    clearAuthCookies(response.headers);
    return response;
  }

  // Check expiration
  if (tokenRecord.expiresAt < new Date()) {
    const response = NextResponse.json(
      {
        success: false,
        error: {
          code: "REFRESH_TOKEN_EXPIRED",
          message: "Refresh token has expired",
        },
      },
      { status: 401 }
    );
    clearAuthCookies(response.headers);
    return response;
  }

  const user = tokenRecord.user;
  const newJti = crypto.randomUUID();
  const familyId = payload.familyId ?? crypto.randomUUID();

  // Generate new tokens
  const newAccessToken = await signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    institutionId: user.institutionId,
    industryPartnerId: user.industryPartnerId,
    verificationStatus: user.verificationStatus,
  });

  const newRefreshToken = await signRefreshToken({
    sub: user.id,
    jti: newJti,
    familyId,
  });

  const newHashedToken = hashToken(newRefreshToken);
  const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_MAX_AGE * 1000);

  // Rotate in a transaction: revoke old token, insert new token
  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { revoked: true },
    }),
    prisma.refreshToken.create({
      data: {
        token: newHashedToken,
        userId: user.id,
        expiresAt: newExpiresAt,
        revoked: false,
      },
    }),
  ]);

  const response = NextResponse.json(
    {
      success: true,
      message: "Token refreshed successfully",
    },
    { status: 200 }
  );

  setAuthCookies(response.headers, newAccessToken, newRefreshToken);

  return response;
}
