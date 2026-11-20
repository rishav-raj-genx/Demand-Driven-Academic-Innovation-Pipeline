import { NextResponse } from "next/server";
import { getDashboardAnalytics } from "@sih/db";

// ============================================================================
// GET /api/v1/analytics/dashboard
// Department of Higher Education Analytics Dashboard Live DB Aggregates
// ============================================================================

export async function GET(): Promise<NextResponse> {
  try {
    const data = await getDashboardAnalytics();

    return NextResponse.json(
      {
        success: true,
        data,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=10, stale-while-revalidate=59",
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load dashboard analytics";
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
