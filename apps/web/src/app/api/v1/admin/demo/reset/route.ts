import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@sih/db";
import { requireAuth } from "@/lib/auth/guards";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Strict Gating Check
  if (process.env.NEXT_PUBLIC_ENABLE_DEMO_HELPER === "false") {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Demo helper is disabled in this environment" },
      { status: 404 }
    );
  }

  // 2. Super Admin Authorization
  const auth = await requireAuth(req);
  if (!auth.success) {
    return auth.response;
  }

  if (auth.user.role !== UserRole.SUPER_ADMIN) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: "Super Admin privileges required to reset demo state" },
      { status: 403 }
    );
  }

  const startTime = Date.now();

  try {
    // Step A: Seed Database with 30 challenges, 10 HEIs, 5 Partners, 3 Projects (including POC ready to sign)
    await execAsync("pnpm --filter @sih/db db:seed");

    // Step B: Call FastAPI /internal/v1/embed/institutions/all
    const apiKey = process.env.INTERNAL_AI_SERVICE_KEY || "dev_internal_ai_service_secret_key";
    const instEmbedRes = await fetch("http://127.0.0.1:8000/internal/v1/embed/institutions/all", {
      method: "POST",
      headers: {
        "X-Internal-Service-Key": apiKey,
      },
    });

    if (!instEmbedRes.ok) {
      throw new Error(`Failed to embed institutions via FastAPI: HTTP ${instEmbedRes.status}`);
    }
    const instEmbedData = await instEmbedRes.json();

    // Step C: Call FastAPI /internal/v1/challenges/analyze-pending
    const chalAnalyzeRes = await fetch("http://127.0.0.1:8000/internal/v1/challenges/analyze-pending", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Service-Key": apiKey,
      },
      body: JSON.stringify({
        force_reembed_all: true,
        threshold: 0.68,
      }),
    });

    if (!chalAnalyzeRes.ok) {
      throw new Error(`Failed to analyze challenges via FastAPI: HTTP ${chalAnalyzeRes.status}`);
    }
    const chalAnalyzeData = await chalAnalyzeRes.json();

    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      message: "Deterministic SIH demo state successfully prepared and verified.",
      durationMs,
      data: {
        institutionsEmbedded: instEmbedData.count,
        challengesAnalyzed: chalAnalyzeData.total_processed,
        canonicalChallenges: chalAnalyzeData.canonical_count,
        deduplicatedChallenges: chalAnalyzeData.deduplicated_count,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Demo reset failed";
    return NextResponse.json(
      {
        success: false,
        error: { code: "DEMO_RESET_FAILURE", message },
      },
      { status: 500 }
    );
  }
}
