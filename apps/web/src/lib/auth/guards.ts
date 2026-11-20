import { NextResponse } from "next/server";
import { prisma } from "@sih/db";
import { getAuthTokensFromRequest } from "./cookies";
import { verifyAccessToken } from "./jwt";

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isEmailVerified: boolean;
  verificationStatus: string;
  institutionId: string | null;
  industryPartnerId: string | null;
  institution?: {
    id: string;
    name: string;
    code: string;
    verificationStatus: string;
  } | null;
  industryPartner?: {
    id: string;
    organizationName: string;
    cin: string | null;
    verificationStatus: string;
  } | null;
}

export type RequireAuthResult =
  | { success: true; user: AuthenticatedUser }
  | { success: false; response: NextResponse };

export async function requireAuth(req: Request): Promise<RequireAuthResult> {
  const { accessToken } = getAuthTokensFromRequest(req);

  if (!accessToken) {
    return {
      success: false,
      response: NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Missing authentication token",
          },
        },
        { status: 401 }
      ),
    };
  }

  const payload = await verifyAccessToken(accessToken);
  if (!payload || !payload.sub) {
    return {
      success: false,
      response: NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid or expired authentication token",
          },
        },
        { status: 401 }
      ),
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
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
    return {
      success: false,
      response: NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "User account not found or deactivated",
          },
        },
        { status: 401 }
      ),
    };
  }

  const authenticatedUser: AuthenticatedUser = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    isEmailVerified: user.isEmailVerified,
    verificationStatus: user.verificationStatus,
    institutionId: user.institutionId,
    industryPartnerId: user.industryPartnerId,
    institution: user.institution,
    industryPartner: user.industryPartner,
  };

  return { success: true, user: authenticatedUser };
}

export function requireRoles(
  user: { role: string },
  allowedRoles: string[]
): { success: true } | { success: false; response: NextResponse } {
  const normalizedUserRole = user.role === "HEI_ADMIN" ? "INSTITUTION_ADMIN" : user.role;
  const isAllowed = allowedRoles.some(
    (role) =>
      role === user.role ||
      role === normalizedUserRole ||
      (role === "HEI_ADMIN" && normalizedUserRole === "INSTITUTION_ADMIN") ||
      (role === "CITIZEN" && (user.role === "STUDENT" || user.role === "CITIZEN")) ||
      (role === "STUDENT" && (user.role === "CITIZEN" || user.role === "STUDENT"))
  );

  if (!isAllowed) {
    return {
      success: false,
      response: NextResponse.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: `User role '${user.role}' is not authorized to access this resource`,
          },
        },
        { status: 403 }
      ),
    };
  }

  return { success: true };
}

export function requireVerifiedOrg(
  user: AuthenticatedUser
): { success: true } | { success: false; response: NextResponse } {
  const isOrgRole = ["INSTITUTION_ADMIN", "HEI_ADMIN", "INDUSTRY_PARTNER"].includes(user.role);

  if (!isOrgRole) {
    return { success: true };
  }

  let orgVerified = false;
  if (user.role === "INSTITUTION_ADMIN" || user.role === "HEI_ADMIN") {
    orgVerified = user.institution?.verificationStatus === "VERIFIED";
  } else if (user.role === "INDUSTRY_PARTNER") {
    orgVerified = user.industryPartner?.verificationStatus === "VERIFIED";
  }

  if (!orgVerified) {
    return {
      success: false,
      response: NextResponse.json(
        {
          success: false,
          error: {
            code: "ORG_NOT_VERIFIED",
            message:
              "Organization registration is pending verification (AISHE/MCA/Udyam check required)",
          },
        },
        { status: 403 }
      ),
    };
  }

  return { success: true };
}
