import { describe, it, expect, beforeAll } from "vitest";
import { POST as registerHandler } from "./register/route";
import { POST as loginHandler } from "./login/route";
import { POST as refreshHandler } from "./refresh/route";
import { POST as logoutHandler } from "./logout/route";
import { GET as meHandler } from "./me/route";
import { requireRoles, requireVerifiedOrg, type AuthenticatedUser } from "@/lib/auth/guards";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, parseCookies } from "@/lib/auth/cookies";
import { prisma } from "@sih/db";

describe("Authentication API Endpoints & Security Integration Suite", () => {
  const timestamp = Date.now();
  const testStudentEmail = `student_${timestamp}@sih.gov.in`;
  const testPassword = "StrongSecurePassword2026!";
  let currentAccessToken = "";
  let currentRefreshToken = "";
  let rotatedRefreshToken = "";

  beforeAll(async () => {
    // Ensure clean state for test email
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [testStudentEmail, `hei_${timestamp}@sih.gov.in`],
        },
      },
    });
  });

  it("1. POST /api/v1/auth/register should register a new student user and return sanitized data", async () => {
    const req = new Request("http://localhost:3000/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testStudentEmail,
        password: testPassword,
        fullName: "Test Student Researcher",
        role: "STUDENT",
      }),
    });

    const res = await registerHandler(req);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe(testStudentEmail);
    expect(body.data.user.role).toBe("STUDENT");
    expect(body.data.user.orgVerificationStatus).toBe("VERIFIED");
    expect(body.data.user.passwordHash).toBeUndefined();
  });

  it("2. POST /api/v1/auth/login should authenticate, return HttpOnly Lax cookies, and omit passwordHash", async () => {
    const req = new Request("http://localhost:3000/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testStudentEmail,
        password: testPassword,
      }),
    });

    const res = await loginHandler(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe(testStudentEmail);
    expect(body.data.user.passwordHash).toBeUndefined();

    // Confirm Set-Cookie headers
    const setCookies = res.headers.getSetCookie();
    expect(setCookies.length).toBeGreaterThanOrEqual(2);

    const accessCookie = setCookies.find((c) => c.startsWith(`${ACCESS_TOKEN_COOKIE}=`));
    const refreshCookie = setCookies.find((c) => c.startsWith(`${REFRESH_TOKEN_COOKIE}=`));

    expect(accessCookie).toBeDefined();
    expect(accessCookie).toContain("HttpOnly");
    expect(accessCookie).toContain("SameSite=Lax");

    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain("HttpOnly");
    expect(refreshCookie).toContain("SameSite=Lax");

    // Extract raw tokens
    if (accessCookie && refreshCookie) {
      currentAccessToken = accessCookie.split(";")[0].split("=")[1];
      currentRefreshToken = refreshCookie.split(";")[0].split("=")[1];
    }

    expect(currentAccessToken).toBeTruthy();
    expect(currentRefreshToken).toBeTruthy();
  });

  it("3. GET /api/v1/auth/me should return current user profile via access token cookie", async () => {
    const req = new Request("http://localhost:3000/api/v1/auth/me", {
      method: "GET",
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${currentAccessToken}`,
      },
    });

    const res = await meHandler(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe(testStudentEmail);
    expect(body.data.user.role).toBe("STUDENT");
    expect(body.data.user.passwordHash).toBeUndefined();
  });

  it("4. POST /api/v1/auth/refresh should rotate refresh token and issue new token pair", async () => {
    const req = new Request("http://localhost:3000/api/v1/auth/refresh", {
      method: "POST",
      headers: {
        cookie: `${REFRESH_TOKEN_COOKIE}=${currentRefreshToken}`,
      },
    });

    const res = await refreshHandler(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);

    const setCookies = res.headers.getSetCookie();
    const newRefreshCookie = setCookies.find((c) => c.startsWith(`${REFRESH_TOKEN_COOKIE}=`));
    const newAccessCookie = setCookies.find((c) => c.startsWith(`${ACCESS_TOKEN_COOKIE}=`));

    expect(newRefreshCookie).toBeDefined();
    expect(newAccessCookie).toBeDefined();

    if (newRefreshCookie && newAccessCookie) {
      rotatedRefreshToken = newRefreshCookie.split(";")[0].split("=")[1];
      currentAccessToken = newAccessCookie.split(";")[0].split("=")[1];
    }

    expect(rotatedRefreshToken).not.toBe(currentRefreshToken);
  });

  it("5. POST /api/v1/auth/refresh should detect token reuse attack and revoke entire session family", async () => {
    // Attack: Re-present the OLD (now rotated & revoked) refresh token
    const reuseAttackReq = new Request("http://localhost:3000/api/v1/auth/refresh", {
      method: "POST",
      headers: {
        cookie: `${REFRESH_TOKEN_COOKIE}=${currentRefreshToken}`,
      },
    });

    const reuseRes = await refreshHandler(reuseAttackReq);
    expect(reuseRes.status).toBe(401);

    const reuseBody = await reuseRes.json();
    expect(reuseBody.success).toBe(false);
    expect(reuseBody.error.code).toBe("TOKEN_REUSED");

    // Verify family revocation: the newly rotated token must also be revoked now
    const subsequentReq = new Request("http://localhost:3000/api/v1/auth/refresh", {
      method: "POST",
      headers: {
        cookie: `${REFRESH_TOKEN_COOKIE}=${rotatedRefreshToken}`,
      },
    });

    const subsequentRes = await refreshHandler(subsequentReq);
    expect(subsequentRes.status).toBe(401);
  });

  it("6. POST /api/v1/auth/logout should revoke token and clear cookies with Max-Age=0", async () => {
    // Fresh login to obtain valid tokens
    const loginReq = new Request("http://localhost:3000/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testStudentEmail,
        password: testPassword,
      }),
    });
    const loginRes = await loginHandler(loginReq);
    const cookies = parseCookies(loginRes.headers.get("set-cookie"));
    const tokenToRevoke = cookies[REFRESH_TOKEN_COOKIE];

    const logoutReq = new Request("http://localhost:3000/api/v1/auth/logout", {
      method: "POST",
      headers: {
        cookie: `${REFRESH_TOKEN_COOKIE}=${tokenToRevoke}`,
      },
    });

    const logoutRes = await logoutHandler(logoutReq);
    expect(logoutRes.status).toBe(200);

    const clearedCookies = logoutRes.headers.getSetCookie();
    expect(clearedCookies.length).toBeGreaterThanOrEqual(2);
    for (const c of clearedCookies) {
      expect(c).toContain("Max-Age=0");
    }
  });

  it("7. GET /api/v1/auth/me should return 401 UNAUTHORIZED when no token is provided", async () => {
    const unauthReq = new Request("http://localhost:3000/api/v1/auth/me", {
      method: "GET",
    });

    const res = await meHandler(unauthReq);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("8. requireRoles should reject unauthorized role with 403 FORBIDDEN", () => {
    const studentUser = { role: "STUDENT" };
    const guardResult = requireRoles(studentUser, ["INSTITUTION_ADMIN", "SUPER_ADMIN"]);

    expect(guardResult.success).toBe(false);
    if (!guardResult.success) {
      expect(guardResult.response.status).toBe(403);
    }

    const authorizedResult = requireRoles(studentUser, ["STUDENT", "RESEARCHER"]);
    expect(authorizedResult.success).toBe(true);
  });

  it("9. requireVerifiedOrg should reject unverified organization with 403 ORG_NOT_VERIFIED", () => {
    const unverifiedHeiAdmin: AuthenticatedUser = {
      id: "test-hei-id",
      email: "hei@test.gov.in",
      fullName: "HEI Admin",
      role: "INSTITUTION_ADMIN",
      isEmailVerified: true,
      verificationStatus: "PENDING",
      institutionId: "inst-id",
      industryPartnerId: null,
      institution: {
        id: "inst-id",
        name: "Test University",
        code: "U-TEST",
        verificationStatus: "PENDING",
      },
    };

    const orgCheck = requireVerifiedOrg(unverifiedHeiAdmin);
    expect(orgCheck.success).toBe(false);
    if (!orgCheck.success) {
      expect(orgCheck.response.status).toBe(403);
    }

    const verifiedHeiAdmin: AuthenticatedUser = {
      ...unverifiedHeiAdmin,
      institution: {
        ...unverifiedHeiAdmin.institution!,
        verificationStatus: "VERIFIED",
      },
    };

    const verifiedCheck = requireVerifiedOrg(verifiedHeiAdmin);
    expect(verifiedCheck.success).toBe(true);
  });
});
