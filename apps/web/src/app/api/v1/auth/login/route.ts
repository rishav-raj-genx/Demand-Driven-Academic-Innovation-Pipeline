import { NextResponse } from "next/server";
import { prisma, recordAuditLog } from "@sih/db";
import { z } from "zod";
import { verifyPassword } from "@/lib/auth/password";
import {
  signAccessToken,
  signRefreshToken,
} from "@/lib/auth/jwt";
import { hashToken } from "@/lib/auth/hash";
import {
  setAuthCookies,
  REFRESH_TOKEN_MAX_AGE,
} from "@/lib/auth/cookies";
import { parseJsonBody } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";

const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(req: Request): Promise<NextResponse> {
  const ipAddress = req.headers.get("x-forwarded-for") ?? "127.0.0.1";
  const userAgent = req.headers.get("user-agent") ?? null;

  // Rate limiting sliding window: 10 attempts per minute per IP
  const rateLimitResult = await rateLimit(ipAddress, 10, 60000, "login");
  if (!rateLimitResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many login attempts. Please try again later.",
        },
      },
      {
        status: 429,
        headers: {
          "Retry-After": rateLimitResult.reset.toString(),
        },
      }
    );
  }

  const parseResult = await parseJsonBody(req, LoginSchema);
  if (!parseResult.success) {
    return parseResult.response;
  }

  const { email, password } = parseResult.data;
  const normalizedEmail = email.toLowerCase().trim();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: {
      institution: {
        select: {
          id: true,
          name: true,
          code: true,
          verificationStatus: true,
        },
      },
      industryPartner: {
        select: {
          id: true,
          organizationName: true,
          cin: true,
          verificationStatus: true,
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password",
        },
      },
      { status: 401 }
    );
  }

  const isPasswordValid = await verifyPassword(user.passwordHash, password);
  if (!isPasswordValid) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password",
        },
      },
      { status: 401 }
    );
  }

  const jti = crypto.randomUUID();
  const familyId = crypto.randomUUID();

  // Sign JWT Access (15m) & Refresh (7d)
  const accessToken = await signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    institutionId: user.institutionId,
    industryPartnerId: user.industryPartnerId,
    verificationStatus: user.verificationStatus,
  });

  const refreshToken = await signRefreshToken({
    sub: user.id,
    jti,
    familyId,
  });

  // Persist hashed refresh token in database
  const hashedToken = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_MAX_AGE * 1000);

  await prisma.refreshToken.create({
    data: {
      token: hashedToken,
      userId: user.id,
      expiresAt,
      revoked: false,
    },
  });

  // Write audit log
  await recordAuditLog({
    actorId: user.id,
    action: "USER_LOGIN",
    entityType: "User",
    entityId: user.id,
    metadata: {
      email: user.email,
      role: user.role,
      jti,
    },
    ipAddress,
    userAgent,
  });

  const response = NextResponse.json(
    {
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          phoneNumber: user.phoneNumber,
          avatarUrl: user.avatarUrl,
          isEmailVerified: user.isEmailVerified,
          verificationStatus: user.verificationStatus,
          institutionId: user.institutionId,
          industryPartnerId: user.industryPartnerId,
          institution: user.institution,
          industryPartner: user.industryPartner,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
    },
    { status: 200 }
  );

  // Set HttpOnly, SameSite=Lax cookies
  setAuthCookies(response.headers, accessToken, refreshToken);

  return response;
}
