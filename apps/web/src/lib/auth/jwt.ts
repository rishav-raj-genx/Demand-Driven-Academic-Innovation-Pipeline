import { SignJWT, jwtVerify } from "jose";

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
  institutionId?: string | null;
  industryPartnerId?: string | null;
  verificationStatus?: string;
  [key: string]: unknown;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  familyId?: string;
  [key: string]: unknown;
}

const DEFAULT_JWT_SECRET = "dev_jwt_secret_change_in_production_min_32_chars";
const DEFAULT_REFRESH_SECRET = "dev_jwt_refresh_secret_change_in_production_min_32_chars";

function getAccessSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
  return new TextEncoder().encode(secret);
}

function getRefreshSecret(): Uint8Array {
  const secret = process.env.JWT_REFRESH_SECRET || DEFAULT_REFRESH_SECRET;
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(
  payload: AccessTokenPayload,
  expiresIn = "15m"
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getAccessSecret());
}

export async function signRefreshToken(
  payload: RefreshTokenPayload,
  expiresIn = "7d"
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getRefreshSecret());
}

export async function verifyAccessToken(
  token: string
): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getAccessSecret(), {
      algorithms: ["HS256"],
    });
    return payload as unknown as AccessTokenPayload;
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(
  token: string
): Promise<RefreshTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getRefreshSecret(), {
      algorithms: ["HS256"],
    });
    return payload as unknown as RefreshTokenPayload;
  } catch {
    return null;
  }
}
