import { NextResponse } from "next/server";
import { prisma, recordAuditLog } from "@sih/db";
import {
  getAuthTokensFromRequest,
  clearAuthCookies,
} from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { hashToken } from "@/lib/auth/hash";

export async function POST(req: Request): Promise<NextResponse> {
  const ipAddress = req.headers.get("x-forwarded-for") ?? "127.0.0.1";
  const userAgent = req.headers.get("user-agent") ?? null;

  let { accessToken, refreshToken } = getAuthTokensFromRequest(req);

  if (!refreshToken) {
    try {
      const body = (await req.json()) as { refreshToken?: string };
      if (body?.refreshToken) {
        refreshToken = body.refreshToken;
      }
    } catch {
      // Body is not JSON
    }
  }

  let actorId: string | null = null;
  if (accessToken) {
    const payload = await verifyAccessToken(accessToken);
    if (payload?.sub) {
      actorId = payload.sub;
    }
  }

  if (refreshToken) {
    const hashed = hashToken(refreshToken);
    const updated = await prisma.refreshToken.updateMany({
      where: { token: hashed, revoked: false },
      data: { revoked: true },
    });

    if (updated.count > 0 && !actorId) {
      const record = await prisma.refreshToken.findUnique({
        where: { token: hashed },
        select: { userId: true },
      });
      if (record?.userId) {
        actorId = record.userId;
      }
    }
  }

  if (actorId) {
    await recordAuditLog({
      actorId,
      action: "USER_LOGOUT",
      entityType: "User",
      entityId: actorId,
      metadata: { reason: "User requested logout" },
      ipAddress,
      userAgent,
    });
  }

  const response = NextResponse.json(
    {
      success: true,
      message: "Logged out successfully",
    },
    { status: 200 }
  );

  clearAuthCookies(response.headers);
  return response;
}
