import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "./jwt";
import { hashToken } from "./hash";
import {
  formatCookieString,
  setAuthCookies,
  clearAuthCookies,
  getAuthTokensFromRequest,
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from "./cookies";
import { parseJsonBody } from "../validation";
import { z } from "zod";

describe("Password Hashing & Verification (Argon2id)", () => {
  it("should hash a password into a valid argon2id formatted string", async () => {
    const raw = "SecureP@ssword123!";
    const hashed = await hashPassword(raw);

    expect(hashed).toBeDefined();
    expect(hashed.startsWith("$argon2id$")).toBe(true);
    expect(hashed).toContain("m=19456");
    expect(hashed).toContain("t=2");
    expect(hashed).toContain("p=1");
  });

  it("should verify correct password and reject incorrect password", async () => {
    const raw = "SuperSecret_2026";
    const hashed = await hashPassword(raw);

    const isMatch = await verifyPassword(hashed, raw);
    expect(isMatch).toBe(true);

    const isWrong = await verifyPassword(hashed, "WrongPassword_999");
    expect(isWrong).toBe(false);
  });

  it("should defensively handle invalid inputs without throwing", async () => {
    expect(await verifyPassword("", "password")).toBe(false);
    expect(await verifyPassword("invalid-hash", "password")).toBe(false);
    await expect(hashPassword("")).rejects.toThrow();
  });
});

describe("JWT Signing, Expiry & Tamper Rejection (jose)", () => {
  it("should sign and verify access token with 15m expiration", async () => {
    const payload = {
      sub: "11111111-1111-1111-1111-111111111111",
      email: "test@sih.gov.in",
      role: "STUDENT",
      institutionId: "22222222-2222-2222-2222-222222222222",
    };

    const token = await signAccessToken(payload);
    expect(typeof token).toBe("string");

    const verified = await verifyAccessToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.sub).toBe(payload.sub);
    expect(verified?.email).toBe(payload.email);
    expect(verified?.role).toBe("STUDENT");
    expect(verified?.exp).toBeDefined();
  });

  it("should sign and verify refresh token with 7d expiration", async () => {
    const payload = {
      sub: "11111111-1111-1111-1111-111111111111",
      jti: "token-unique-jti-uuid",
      familyId: "session-family-uuid",
    };

    const token = await signRefreshToken(payload);
    const verified = await verifyRefreshToken(token);

    expect(verified).not.toBeNull();
    expect(verified?.sub).toBe(payload.sub);
    expect(verified?.jti).toBe(payload.jti);
  });

  it("should reject tampered or corrupted JWT tokens", async () => {
    const payload = {
      sub: "test-user-id",
      email: "test@sih.gov.in",
      role: "STUDENT",
    };

    const token = await signAccessToken(payload);
    const parts = token.split(".");
    // Tamper payload component
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: "test-user-id", role: "SUPER_ADMIN" })
    ).toString("base64url");
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    const verified = await verifyAccessToken(tamperedToken);
    expect(verified).toBeNull();
  });

  it("should reject expired JWT tokens", async () => {
    const payload = {
      sub: "test-user-id",
      email: "expired@sih.gov.in",
      role: "STUDENT",
    };

    // Sign with 0s / negative expiration
    const token = await signAccessToken(payload, "-1s");
    const verified = await verifyAccessToken(token);
    expect(verified).toBeNull();
  });

  it("should compute deterministic SHA-256 hash for refresh token DB storage", () => {
    const token = "sample-refresh-token-string";
    const h1 = hashToken(token);
    const h2 = hashToken(token);
    expect(h1).toHaveLength(64);
    expect(h1).toBe(h2);
  });
});

describe("HttpOnly & Lax Cookie Configurations", () => {
  it("should format cookie string with HttpOnly, SameSite=Lax, and Path=/", () => {
    const cookie = formatCookieString("test_cookie", "abc123xyz", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: false,
      maxAge: 900,
    });

    expect(cookie).toContain("test_cookie=abc123xyz");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=900");
  });

  it("should append access and refresh token cookies to headers", () => {
    const headers = new Headers();
    setAuthCookies(headers, "access-token-jwt", "refresh-token-jwt");

    const setCookieHeaders = headers.getSetCookie();
    expect(setCookieHeaders.length).toBe(2);

    const accessCookie = setCookieHeaders.find((c) => c.startsWith(`${ACCESS_TOKEN_COOKIE}=`));
    const refreshCookie = setCookieHeaders.find((c) => c.startsWith(`${REFRESH_TOKEN_COOKIE}=`));

    expect(accessCookie).toBeDefined();
    expect(accessCookie).toContain("HttpOnly");
    expect(accessCookie).toContain("SameSite=Lax");
    expect(accessCookie).toContain("Max-Age=900");

    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain("HttpOnly");
    expect(refreshCookie).toContain("SameSite=Lax");
    expect(refreshCookie).toContain("Max-Age=604800");
  });

  it("should clear auth cookies with Max-Age=0", () => {
    const headers = new Headers();
    clearAuthCookies(headers);

    const setCookieHeaders = headers.getSetCookie();
    expect(setCookieHeaders.length).toBe(2);
    for (const c of setCookieHeaders) {
      expect(c).toContain("Max-Age=0");
    }
  });

  it("should extract tokens from cookie or authorization header", () => {
    const reqWithCookies = new Request("http://localhost:3000/api/v1/auth/me", {
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=cookie-access; ${REFRESH_TOKEN_COOKIE}=cookie-refresh`,
      },
    });

    const tokens1 = getAuthTokensFromRequest(reqWithCookies);
    expect(tokens1.accessToken).toBe("cookie-access");
    expect(tokens1.refreshToken).toBe("cookie-refresh");

    const reqWithAuthHeader = new Request("http://localhost:3000/api/v1/auth/me", {
      headers: {
        authorization: "Bearer bearer-access-token",
      },
    });

    const tokens2 = getAuthTokensFromRequest(reqWithAuthHeader);
    expect(tokens2.accessToken).toBe("bearer-access-token");
    expect(tokens2.refreshToken).toBeNull();
  });
});

describe("Zod 3-Layer Request Validation Helper (parseJsonBody)", () => {
  const TestSchema = z.object({
    email: z.string().email(),
    age: z.number().min(18),
  });

  it("should reject empty or malformed JSON payload with 400 INVALID_JSON", async () => {
    const emptyReq = new Request("http://localhost:3000/api/test", {
      method: "POST",
      body: "",
    });
    const res1 = await parseJsonBody(emptyReq, TestSchema);
    expect(res1.success).toBe(false);
    if (!res1.success) {
      expect(res1.response.status).toBe(400);
      const data = await res1.response.json();
      expect(data.error.code).toBe("INVALID_JSON");
    }

    const malformedReq = new Request("http://localhost:3000/api/test", {
      method: "POST",
      body: "not a valid json {",
    });
    const res2 = await parseJsonBody(malformedReq, TestSchema);
    expect(res2.success).toBe(false);
    if (!res2.success) {
      expect(res2.response.status).toBe(400);
      const data = await res2.response.json();
      expect(data.error.code).toBe("INVALID_JSON");
    }
  });

  it("should reject schema validation failure with 400 VALIDATION_ERROR and field details", async () => {
    const invalidDataReq = new Request("http://localhost:3000/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "invalid-email", age: 12 }),
    });

    const res = await parseJsonBody(invalidDataReq, TestSchema);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.response.status).toBe(400);
      const data = await res.response.json();
      expect(data.error.code).toBe("VALIDATION_ERROR");
      expect(data.error.details).toBeDefined();
      expect(data.error.details.email).toBeDefined();
      expect(data.error.details.age).toBeDefined();
    }
  });

  it("should return parsed strongly-typed data when input is valid", async () => {
    const validReq = new Request("http://localhost:3000/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "valid@sih.gov.in", age: 25 }),
    });

    const res = await parseJsonBody(validReq, TestSchema);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.email).toBe("valid@sih.gov.in");
      expect(res.data.age).toBe(25);
    }
  });
});
