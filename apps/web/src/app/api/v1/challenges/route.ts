import { NextResponse } from "next/server";
import { z } from "zod";
import {
  prisma,
  recordAuditLog,
  findDistrictByCoordinates,
  setChallengeLocation,
  ChallengeStatus,
  type Prisma,
} from "@sih/db";
import { requireAuth, requireRoles } from "@/lib/auth/guards";
import { parseJsonBody } from "@/lib/validation";
import { enqueueChallengeProcess } from "@/lib/queues";

// ============================================================================
// Zod Intake Request Schema
// ============================================================================

const ChallengeIntakeSchema = z.object({
  title: z
    .string()
    .trim()
    .min(10, "Title must be between 10 and 140 characters")
    .max(140, "Title must be between 10 and 140 characters"),
  description: z
    .string()
    .trim()
    .min(30, "Description must be between 30 and 3000 characters")
    .max(3000, "Description must be between 30 and 3000 characters"),
  domain: z
    .string()
    .trim()
    .min(2, "Domain must be at least 2 characters long")
    .max(100, "Domain cannot exceed 100 characters"),
  urgency: z
    .enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"])
    .default("MEDIUM"),
  latitude: z
    .number()
    .min(-90, "Latitude must be between -90 and 90")
    .max(90, "Latitude must be between -90 and 90"),
  longitude: z
    .number()
    .min(-180, "Longitude must be between -180 and 180")
    .max(180, "Longitude must be between -180 and 180"),
  mediaKeys: z
    .array(z.string().trim())
    .max(4, "Maximum 4 mediaKeys allowed")
    .default([])
    .refine(
      (keys) =>
        keys.every(
          (k) =>
            k.startsWith("challenge_media/") ||
            k.startsWith("milestone_artifact/") ||
            k.startsWith("csr_receipt/")
        ),
      {
        message:
          "Media keys must start with an allowed prefix (e.g. challenge_media/)",
      }
    ),
  clientIdempotencyKey: z
    .string()
    .uuid("clientIdempotencyKey must be a valid UUID"),
});

export type ChallengeIntakeInput = z.infer<typeof ChallengeIntakeSchema>;

// ============================================================================
// POST /api/v1/challenges - Challenge Intake
// ============================================================================

export async function POST(req: Request): Promise<NextResponse> {
  const ipAddress = req.headers.get("x-forwarded-for") ?? "127.0.0.1";
  const userAgent = req.headers.get("user-agent") ?? null;

  // 1. Authenticate user
  const authResult = await requireAuth(req);
  if (!authResult.success) {
    return authResult.response;
  }
  const { user } = authResult;

  // 2. Authorize roles: CITIZEN (or STUDENT), GOVT_OFFICIAL, SUPER_ADMIN
  const roleCheck = requireRoles(user, [
    "CITIZEN",
    "STUDENT",
    "GOVT_OFFICIAL",
    "SUPER_ADMIN",
  ]);
  if (!roleCheck.success) {
    return roleCheck.response;
  }

  // 3. Validate JSON payload
  const parseResult = await parseJsonBody(req, ChallengeIntakeSchema);
  if (!parseResult.success) {
    return parseResult.response;
  }

  const {
    title,
    description,
    domain,
    urgency,
    latitude,
    longitude,
    mediaKeys,
    clientIdempotencyKey,
  } = parseResult.data;

  // 4. Idempotency Check (Offline replay protection)
  const existingChallenge = await prisma.challenge.findUnique({
    where: { clientIdempotencyKey },
    include: {
      district: true,
      createdBy: {
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
        },
      },
    },
  });

  if (existingChallenge) {
    return NextResponse.json(
      {
        success: true,
        message: "Challenge already exists (idempotent replay)",
        data: existingChallenge,
      },
      { status: 200 }
    );
  }

  // 5. Spatial District Resolution via PostGIS
  const districtResult = await findDistrictByCoordinates(latitude, longitude);

  // 6. Create Challenge in Database
  const createdChallenge = await prisma.challenge.create({
    data: {
      title,
      problemStatement: description,
      domain,
      category: domain,
      urgency,
      districtId: districtResult?.id ?? null,
      createdById: user.id,
      status: ChallengeStatus.SUBMITTED,
      mediaKeys,
      clientIdempotencyKey,
    },
    include: {
      district: true,
      createdBy: {
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
        },
      },
    },
  });

  // 7. Set PostGIS Geometry Point
  await setChallengeLocation(createdChallenge.id, latitude, longitude);

  // 8. Record Platform Audit Log
  await recordAuditLog({
    actorId: user.id,
    action: "CHALLENGE_SUBMITTED",
    entityType: "Challenge",
    entityId: createdChallenge.id,
    metadata: {
      title,
      domain,
      urgency,
      districtId: districtResult?.id ?? null,
      districtName: districtResult?.name ?? null,
      matchedBy: districtResult?.matchedBy ?? null,
      clientIdempotencyKey,
      mediaKeysCount: mediaKeys ? mediaKeys.length : 0,
    },
    ipAddress,
    userAgent,
  });

  // 9. Enqueue Asynchronous BullMQ Processing Job
  try {
    await enqueueChallengeProcess(createdChallenge.id);
  } catch (err) {
    // Non-blocking log if BullMQ connection issue in local environment
    console.warn("[BullMQ] Failed to enqueue challenge.process:", err);
  }

  return NextResponse.json(
    {
      success: true,
      message: "Challenge submitted successfully",
      data: {
        ...createdChallenge,
        location: { lat: latitude, lng: longitude },
      },
    },
    { status: 201 }
  );
}

// ============================================================================
// GET /api/v1/challenges - Listing with Pagination & Filters
// ============================================================================

export async function GET(req: Request): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20)
  );

  const districtId = searchParams.get("districtId");
  const domain = searchParams.get("domain");
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const includeDuplicates = searchParams.get("includeDuplicates") === "true";

  const where: Prisma.ChallengeWhereInput = {};

  if (districtId) {
    where.districtId = districtId;
  }

  if (domain) {
    where.OR = [
      { domain: { equals: domain, mode: "insensitive" } },
      { category: { equals: domain, mode: "insensitive" } },
    ];
  }

  if (
    status &&
    Object.values(ChallengeStatus).includes(status as ChallengeStatus)
  ) {
    where.status = status as ChallengeStatus;
  }

  if (search && search.trim() !== "") {
    const searchCondition: Prisma.ChallengeWhereInput = {
      OR: [
        { title: { contains: search.trim(), mode: "insensitive" } },
        { problemStatement: { contains: search.trim(), mode: "insensitive" } },
      ],
    };

    if (where.OR) {
      where.AND = [searchCondition];
    } else {
      where.OR = searchCondition.OR;
    }
  }

  // Filter out merged duplicates unless explicitly requested
  if (!includeDuplicates) {
    where.canonicalId = null;
  }

  const [total, challenges] = await Promise.all([
    prisma.challenge.count({ where }),
    prisma.challenge.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        district: {
          select: {
            id: true,
            name: true,
            code: true,
            state: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        _count: {
          select: {
            capabilityMatches: true,
          },
        },
      },
    }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return NextResponse.json(
    {
      success: true,
      data: challenges,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    },
    { status: 200 }
  );
}
