import { NextResponse } from "next/server";
import { prisma, getChallengeLocation } from "@sih/db";

// ============================================================================
// GET /api/v1/challenges/[id] - Challenge Detail
// ============================================================================

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;

  if (!id || id.trim() === "") {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_CHALLENGE_ID",
          message: "Challenge ID is required",
        },
      },
      { status: 400 }
    );
  }

  const challenge = await prisma.challenge.findUnique({
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
      canonicalChallenge: {
        select: {
          id: true,
          title: true,
          status: true,
          domain: true,
        },
      },
      duplicateChallenges: {
        select: {
          id: true,
          title: true,
          status: true,
          domain: true,
          endorsementCount: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
        },
      },
      industryPartner: {
        select: {
          id: true,
          organizationName: true,
          cin: true,
          industrySector: true,
        },
      },
      capabilityMatches: {
        include: {
          institution: {
            select: {
              id: true,
              name: true,
              code: true,
              tier: true,
              verificationStatus: true,
            },
          },
        },
        orderBy: {
          similarityScore: "desc",
        },
      },
    },
  });

  if (!challenge) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "CHALLENGE_NOT_FOUND",
          message: `Challenge with ID '${id}' not found`,
        },
      },
      { status: 404 }
    );
  }

  // Fetch coordinates from PostGIS
  const location = await getChallengeLocation(challenge.id);

  return NextResponse.json(
    {
      success: true,
      data: {
        ...challenge,
        location,
      },
    },
    { status: 200 }
  );
}
