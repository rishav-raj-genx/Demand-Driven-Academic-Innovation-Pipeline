import { NextResponse } from "next/server";
import { prisma, getInstitutionLocation } from "@sih/db";

// ============================================================================
// GET /api/v1/institutions/[id] - Institution Capability Profile & Matches Queue
// ============================================================================

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;

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

  const institution = await prisma.institution.findUnique({
    where: { id },
    include: {
      district: {
        select: {
          id: true,
          name: true,
          code: true,
          state: true,
        },
      },
      capabilityMatches: {
        include: {
          challenge: {
            select: {
              id: true,
              title: true,
              problemStatement: true,
              domain: true,
              urgency: true,
              status: true,
              endorsementCount: true,
              createdAt: true,
            },
          },
        },
        orderBy: [{ matchRank: "asc" }, { similarityScore: "desc" }],
        take: 50,
      },
    },
  });

  if (!institution) {
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

  const coords = await getInstitutionLocation(id).catch(() => null);

  const capacity = Math.max(institution.maxCapacity, 1);
  const utilizationRatio = Number(
    (institution.activeProjects / capacity).toFixed(2)
  );

  const matchedChallenges = institution.capabilityMatches.map((m) => ({
    matchId: m.id,
    challengeId: m.challengeId,
    title: m.challenge.title,
    problemStatement: m.challenge.problemStatement,
    domain: m.challenge.domain,
    urgency: m.challenge.urgency,
    status: m.challenge.status,
    endorsementCount: m.challenge.endorsementCount,
    similarityScore: m.similarityScore,
    matchRank: m.matchRank,
    explanation: m.feedback,
    matchedAt: m.createdAt,
  }));

  return NextResponse.json({
    success: true,
    data: {
      id: institution.id,
      name: institution.name,
      code: institution.code,
      tier: institution.tier,
      district: institution.district,
      address: institution.address,
      website: institution.website,
      contactEmail: institution.contactEmail,
      contactPhone: institution.contactPhone,
      verificationStatus: institution.verificationStatus,
      activeProjects: institution.activeProjects,
      maxCapacity: institution.maxCapacity,
      utilizationRatio,
      domains: institution.domains,
      facultySpecializations: institution.facultySpecializations,
      labFacilities: institution.labFacilities,
      profileSummary: institution.profileSummary,
      location: coords,
      matchedChallenges,
      createdAt: institution.createdAt,
      updatedAt: institution.updatedAt,
    },
  });
}
