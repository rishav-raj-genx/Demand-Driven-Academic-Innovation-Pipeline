import { NextResponse } from "next/server";
import { prisma, recordAuditLog, UserRole, VerificationStatus } from "@sih/db";
import { z } from "zod";
import { hashPassword } from "@/lib/auth/password";
import { parseJsonBody } from "@/lib/validation";

const RegisterSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters long"),
  fullName: z.string().min(2, "Full name must be at least 2 characters long"),
  role: z.enum([
    "CITIZEN",
    "HEI_ADMIN",
    "FACULTY",
    "STUDENT",
    "INDUSTRY_PARTNER",
    "RESEARCHER",
    "INVESTOR",
    "CSR_PARTNER",
    "INSTITUTION_ADMIN",
  ]),
  phoneNumber: z.string().optional(),
  institutionId: z.string().uuid("Invalid institution ID").optional(),
  industryPartnerId: z.string().uuid("Invalid industry partner ID").optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  const parseResult = await parseJsonBody(req, RegisterSchema);
  if (!parseResult.success) {
    return parseResult.response;
  }

  const { data } = parseResult;
  const normalizedEmail = data.email.toLowerCase().trim();

  // Check for duplicate account
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingUser) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "EMAIL_ALREADY_EXISTS",
          message: "An account with this email address already exists",
        },
      },
      { status: 409 }
    );
  }

  // Determine role & verification status
  let mappedRole: UserRole;
  let verificationStatus: VerificationStatus;

  switch (data.role) {
    case "CITIZEN":
    case "STUDENT":
      mappedRole = UserRole.STUDENT;
      verificationStatus = VerificationStatus.VERIFIED;
      break;
    case "HEI_ADMIN":
    case "INSTITUTION_ADMIN":
      mappedRole = UserRole.INSTITUTION_ADMIN;
      verificationStatus = VerificationStatus.PENDING;
      break;
    case "INDUSTRY_PARTNER":
      mappedRole = UserRole.INDUSTRY_PARTNER;
      verificationStatus = VerificationStatus.PENDING;
      break;
    case "FACULTY":
      mappedRole = UserRole.FACULTY;
      verificationStatus = VerificationStatus.PENDING;
      break;
    case "RESEARCHER":
      mappedRole = UserRole.RESEARCHER;
      verificationStatus = VerificationStatus.PENDING;
      break;
    case "INVESTOR":
      mappedRole = UserRole.INVESTOR;
      verificationStatus = VerificationStatus.VERIFIED;
      break;
    case "CSR_PARTNER":
      mappedRole = UserRole.CSR_PARTNER;
      verificationStatus = VerificationStatus.PENDING;
      break;
    default:
      mappedRole = UserRole.STUDENT;
      verificationStatus = VerificationStatus.VERIFIED;
  }

  const passwordHash = await hashPassword(data.password);

  const newUser = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      fullName: data.fullName.trim(),
      role: mappedRole,
      phoneNumber: data.phoneNumber ?? null,
      isEmailVerified: true,
      verificationStatus,
      institutionId: data.institutionId ?? null,
      industryPartnerId: data.industryPartnerId ?? null,
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      phoneNumber: true,
      avatarUrl: true,
      isEmailVerified: true,
      verificationStatus: true,
      institutionId: true,
      industryPartnerId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Record audit log entry
  await recordAuditLog({
    actorId: newUser.id,
    action: "USER_REGISTERED",
    entityType: "User",
    entityId: newUser.id,
    metadata: {
      requestedRole: data.role,
      assignedRole: mappedRole,
      verificationStatus,
    },
    ipAddress: req.headers.get("x-forwarded-for") ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });

  return NextResponse.json(
    {
      success: true,
      data: {
        user: {
          ...newUser,
          requestedRole: data.role,
          isActive: true,
          orgVerificationStatus: verificationStatus,
        },
      },
    },
    { status: 201 }
  );
}
