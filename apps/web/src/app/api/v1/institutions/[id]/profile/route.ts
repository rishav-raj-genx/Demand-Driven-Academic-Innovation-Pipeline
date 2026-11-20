import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, recordAuditLog } from "@sih/db";
import { requireAuth, requireRoles } from "@/lib/auth/guards";
import { parseJsonBody } from "@/lib/validation";
import { enqueueHeiEmbed } from "@/lib/queues";

// ============================================================================
// Zod Update Capability Profile Schema
// ============================================================================

const UpdateCapabilityProfileSchema = z.object({
  facultySpecializations: z
    .array(z.string().trim().min(2, "Specialization must be at least 2 characters"))
    .default([]),
  labFacilities: z
    .array(z.string().trim().min(2, "Lab facility must be at least 2 characters"))
    .default([]),
  domains: z
    .array(z.string().trim().min(2, "Domain must be at least 2 characters"))
    .min(1, "At least one domain tag is required"),
  profileSummary: z
    .string()
    .trim()
    .max(3000, "Profile summary cannot exceed 3000 characters")
    .optional()
    .nullable(),
  maxCapacity: z
    .number()
    .int("maxCapacity must be an integer")
    .min(1, "maxCapacity must be between 1 and 50")
    .max(50, "maxCapacity must be between 1 and 50")
    .optional(),
});

export type UpdateCapabilityProfileInput = z.infer<
  typeof UpdateCapabilityProfileSchema
>;

// ============================================================================
// PUT /api/v1/institutions/[id]/profile - Update HEI Capability Profile
// ============================================================================

export async function PUT(
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
          code: "INVALID_INSTITUTION_ID",
          message: "Institution ID is required",
        },
      },
      { status: 400 }
    );
  }

  // 1. Authenticate caller
  const authResult = await requireAuth(req);
  if (!authResult.success) {
    return authResult.response;
  }
  const { user } = authResult;

  // 2. Authorize roles: HEI_ADMIN / INSTITUTION_ADMIN or SUPER_ADMIN
  const roleCheck = requireRoles(user, [
    "INSTITUTION_ADMIN",
    "HEI_ADMIN",
    "SUPER_ADMIN",
  ]);
  if (!roleCheck.success) {
    return roleCheck.response;
  }

  // 3. Enforce Institutional Ownership (own institution only for HEI admins)
  if (user.role !== "SUPER_ADMIN") {
    if (!user.institutionId || user.institutionId !== id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message:
              "You can only manage the capability profile of your own institution",
          },
        },
        { status: 403 }
      );
    }
  }

  // 4. Validate request JSON payload
  const parseResult = await parseJsonBody(req, UpdateCapabilityProfileSchema);
  if (!parseResult.success) {
    return parseResult.response;
  }
  const facultySpecializations = parseResult.data.facultySpecializations ?? [];
  const labFacilities = parseResult.data.labFacilities ?? [];
  const domains = parseResult.data.domains;
  const profileSummary = parseResult.data.profileSummary;
  const maxCapacity = parseResult.data.maxCapacity;

  // 5. Verify target institution exists
  const existingInstitution = await prisma.institution.findUnique({
    where: { id },
  });

  if (!existingInstitution) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: `Institution with ID '${id}' not found`,
        },
      },
      { status: 404 }
    );
  }

  // 6. Update institutional capability profile in PostgreSQL
  const updatedInstitution = await prisma.institution.update({
    where: { id },
    data: {
      facultySpecializations,
      labFacilities,
      domains,
      ...(profileSummary !== undefined
        ? { profileSummary: profileSummary ?? null }
        : {}),
      ...(maxCapacity !== undefined ? { maxCapacity } : {}),
    },
    include: {
      district: {
        select: {
          id: true,
          name: true,
          code: true,
          state: true,
        },
      },
    },
  });

  // 7. Record Audit Log
  await recordAuditLog({
    actorId: user.id,
    action: "INSTITUTION_PROFILE_UPDATED",
    entityType: "Institution",
    entityId: id,
    metadata: {
      domains,
      facultySpecializationsCount: facultySpecializations.length,
      labFacilitiesCount: labFacilities.length,
      maxCapacity: updatedInstitution.maxCapacity,
      previousMaxCapacity: existingInstitution.maxCapacity,
    },
    ipAddress,
    userAgent,
  });

  // 8. Enqueue BullMQ hei.embed job to trigger vector re-embedding
  let enqueuedEmbeddingJob = false;
  try {
    await enqueueHeiEmbed({
      institutionId: id,
      domains,
      facultySpecializations,
      labFacilities,
      profileSummary: profileSummary ?? undefined,
    });
    enqueuedEmbeddingJob = true;
  } catch (err) {
    console.warn("[BullMQ] Failed to enqueue hei.embed job:", err);
  }

  const capacity = Math.max(updatedInstitution.maxCapacity, 1);
  const utilizationRatio = Number(
    (updatedInstitution.activeProjects / capacity).toFixed(2)
  );

  return NextResponse.json({
    success: true,
    message: "Institution capability profile updated and vector re-embedding queued",
    data: {
      id: updatedInstitution.id,
      name: updatedInstitution.name,
      code: updatedInstitution.code,
      tier: updatedInstitution.tier,
      district: updatedInstitution.district,
      activeProjects: updatedInstitution.activeProjects,
      maxCapacity: updatedInstitution.maxCapacity,
      utilizationRatio,
      domains: updatedInstitution.domains,
      facultySpecializations: updatedInstitution.facultySpecializations,
      labFacilities: updatedInstitution.labFacilities,
      profileSummary: updatedInstitution.profileSummary,
      verificationStatus: updatedInstitution.verificationStatus,
      enqueuedEmbeddingJob,
      updatedAt: updatedInstitution.updatedAt,
    },
  });
}
