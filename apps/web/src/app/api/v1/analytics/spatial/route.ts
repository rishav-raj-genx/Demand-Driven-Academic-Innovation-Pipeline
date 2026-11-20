import { NextResponse } from "next/server";
import { getSpatialDistrictAnalytics, InstitutionTier, ProjectPhase } from "@sih/db";

// ============================================================================
// GET /api/v1/analytics/spatial
// Jharkhand District Innovation Density GeoJSON FeatureCollection (PostGIS)
// Supports filters: domain, phase, tier
// ============================================================================

const VALID_PHASES = new Set(Object.values(ProjectPhase));
const VALID_TIERS = new Set(Object.values(InstitutionTier));

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);

    const domainParam = searchParams.get("domain")?.trim() || null;
    const phaseParam = searchParams.get("phase")?.trim() || null;
    const tierParam = searchParams.get("tier")?.trim() || null;

    if (phaseParam && !VALID_PHASES.has(phaseParam as ProjectPhase)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_FILTER",
            message: `Invalid phase filter: '${phaseParam}'. Must be one of: ${Array.from(VALID_PHASES).join(", ")}`,
          },
        },
        { status: 400 }
      );
    }

    if (tierParam && !VALID_TIERS.has(tierParam as InstitutionTier)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_FILTER",
            message: `Invalid tier filter: '${tierParam}'. Must be one of: ${Array.from(VALID_TIERS).join(", ")}`,
          },
        },
        { status: 400 }
      );
    }

    const featureCollection = await getSpatialDistrictAnalytics({
      domain: domainParam,
      phase: phaseParam,
      tier: tierParam,
    });

    return NextResponse.json(featureCollection, {
      status: 200,
      headers: {
        "Content-Type": "application/geo+json; charset=utf-8",
        "Cache-Control": "public, s-maxage=10, stale-while-revalidate=59",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load spatial analytics";
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message,
        },
      },
      { status: 500 }
    );
  }
}
