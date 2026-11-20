export const ACCESS_TOKEN_COOKIE = "sih_access_token";
export const REFRESH_TOKEN_COOKIE = "sih_refresh_token";

export const ACCESS_TOKEN_MAX_AGE = 15 * 60; // 15 minutes
export const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

export interface CookieOptions {
  httpOnly: boolean;
  sameSite: "lax" | "strict" | "none";
  path: string;
  secure: boolean;
  maxAge?: number;
}

export function getCookieOptions(maxAge?: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    ...(maxAge !== undefined ? { maxAge } : {}),
  };
}

export function formatCookieString(
  name: string,
  value: string,
  options: CookieOptions
): string {
  const parts: string[] = [`${name}=${encodeURIComponent(value)}`];

  if (options.path) parts.push(`Path=${options.path}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) {
    const capitalized = options.sameSite.charAt(0).toUpperCase() + options.sameSite.slice(1);
    parts.push(`SameSite=${capitalized}`);
  }

  return parts.join("; ");
}

export function setAuthCookies(
  headers: Headers,
  accessToken: string,
  refreshToken: string
): void {
  const accessCookie = formatCookieString(
    ACCESS_TOKEN_COOKIE,
    accessToken,
    getCookieOptions(ACCESS_TOKEN_MAX_AGE)
  );
  const refreshCookie = formatCookieString(
    REFRESH_TOKEN_COOKIE,
    refreshToken,
    getCookieOptions(REFRESH_TOKEN_MAX_AGE)
  );

  headers.append("Set-Cookie", accessCookie);
  headers.append("Set-Cookie", refreshCookie);
}

export function clearAuthCookies(headers: Headers): void {
  const accessCookie = formatCookieString(
    ACCESS_TOKEN_COOKIE,
    "",
    getCookieOptions(0)
  );
  const refreshCookie = formatCookieString(
    REFRESH_TOKEN_COOKIE,
    "",
    getCookieOptions(0)
  );

  headers.append("Set-Cookie", accessCookie);
  headers.append("Set-Cookie", refreshCookie);
}

export function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};

  const items = cookieHeader.split(";");
  for (const item of items) {
    const [rawKey, ...valParts] = item.trim().split("=");
    if (rawKey) {
      cookies[rawKey] = decodeURIComponent(valParts.join("="));
    }
  }

  return cookies;
}

export function getAuthTokensFromRequest(req: Request): {
  accessToken: string | null;
  refreshToken: string | null;
} {
  const cookieHeader = req.headers.get("cookie");
  const cookies = parseCookies(cookieHeader);

  let accessToken = cookies[ACCESS_TOKEN_COOKIE] || null;
  const refreshToken = cookies[REFRESH_TOKEN_COOKIE] || null;

  if (!accessToken) {
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      accessToken = authHeader.substring(7).trim();
    }
  }

  return { accessToken, refreshToken };
}
