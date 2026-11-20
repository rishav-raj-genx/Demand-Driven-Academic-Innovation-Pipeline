#!/usr/bin/env tsx

import { execSync } from "node:child_process";
import { prisma } from "../packages/db/src/index.js";

const AI_ENGINE_URL = process.env.AI_ENGINE_URL || "http://127.0.0.1:8000";
const SERVICE_KEY = process.env.INTERNAL_AI_SERVICE_KEY || "dev_internal_ai_service_secret_key";

async function main() {
  const overallStart = Date.now();

  console.log("\n================================================================================");
  console.log("  SIH26043: DEMO PREPARATION & DETERMINISTIC SYSTEM RESET SCRIPT");
  console.log("  Team: The Unknowns | Demand-Driven Academic Innovation Pipeline");
  console.log("================================================================================\n");

  // Step 1: Pre-flight reachability checks
  console.log("[1/5] Verifying local containerized infrastructure & AI Engine...");

  // AI Engine health
  try {
    const aiRes = await fetch(`${AI_ENGINE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (!aiRes.ok) {
      throw new Error(`AI Engine returned HTTP ${aiRes.status}`);
    }
    const aiData = await aiRes.json();
    console.log(`  ✓ FastAPI AI Engine reachable (${AI_ENGINE_URL}) [pgvector: ${aiData.pgvector}]`);
  } catch (err) {
    console.error(`\n  ✖ ERROR: FastAPI AI Engine is not reachable at ${AI_ENGINE_URL}`);
    console.error("    Please start the AI Engine in a separate terminal via:");
    console.error("    cd services/ai-engine && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000\n");
    process.exit(1);
  }

  // Database reachability
  try {
    await prisma.$queryRaw`SELECT 1 as connected;`;
    console.log("  ✓ PostgreSQL 16 + PostGIS + pgvector database reachable");
  } catch (err) {
    console.error("\n  ✖ ERROR: Unable to connect to PostgreSQL database.");
    console.error("    Please ensure Docker containers are running: pnpm infra:up\n");
    process.exit(1);
  }

  // Step 2: Database Reset & Idempotent Migration/Seed
  console.log("\n[2/5] Resetting database via Prisma migrate reset & baseline seed...");
  const resetStart = Date.now();
  try {
    execSync("pnpm --filter @sih/db prisma migrate reset --force", {
      stdio: "inherit",
      env: { ...process.env },
    });
    console.log(`  ✓ Database reset and initial seed completed in ${((Date.now() - resetStart) / 1000).toFixed(2)}s`);

    // Reset AI Engine connection pool to refresh PostGIS extension type OIDs
    await fetch(`${AI_ENGINE_URL}/internal/v1/reset-pool`, {
      method: "POST",
      headers: { "X-Internal-Service-Key": SERVICE_KEY },
    }).catch(() => {});
  } catch (err) {
    console.error("\n  ✖ ERROR: Prisma migrate reset failed.");
    console.error(err);
    process.exit(1);
  }

  // Step 3: Embed All 10 Jharkhand Institutions (pgvector 384-dim)
  console.log("\n[3/5] Computing capability embeddings for all 10 Jharkhand HEIs...");
  const embedStart = Date.now();
  const embedInstRes = await fetch(`${AI_ENGINE_URL}/internal/v1/embed/institutions/all`, {
    method: "POST",
    headers: {
      "X-Internal-Service-Key": SERVICE_KEY,
    },
  });

  if (!embedInstRes.ok) {
    const errorText = await embedInstRes.text();
    console.error(`\n  ✖ ERROR: Failed to embed institutions: HTTP ${embedInstRes.status} - ${errorText}`);
    process.exit(1);
  }

  const embedInstData = await embedInstRes.json();
  console.log(`  ✓ Embedded ${embedInstData.count} institutions in ${((Date.now() - embedStart) / 1000).toFixed(2)}s`);

  // Step 4: Batch Analyze 30 Challenges (Embedding, Deduplication & Capacity-Aware Matching)
  console.log("\n[4/5] Batch analyzing all 30 challenges (Embedding + Deduplication + Capacity Routing)...");
  const analyzeStart = Date.now();
  const analyzeRes = await fetch(`${AI_ENGINE_URL}/internal/v1/challenges/analyze-pending`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Service-Key": SERVICE_KEY,
    },
    body: JSON.stringify({
      force_reembed_all: true,
      threshold: 0.68,
    }),
  });

  if (!analyzeRes.ok) {
    const errorText = await analyzeRes.text();
    console.error(`\n  ✖ ERROR: Failed to analyze challenges: HTTP ${analyzeRes.status} - ${errorText}`);
    process.exit(1);
  }

  const analyzeData = await analyzeRes.json();
  console.log(
    `  ✓ Analyzed ${analyzeData.total_processed} challenges in ${((Date.now() - analyzeStart) / 1000).toFixed(2)}s ` +
      `[Canonical: ${analyzeData.canonical_count}, Merged Duplicates: ${analyzeData.deduplicated_count}]`
  );

  // Step 5: Verification & Demo State Inspection
  console.log("\n[5/5] Performing deterministic state verification...");

  const [
    totalChallenges,
    embeddedChallengesRow,
    duplicatesCount,
    totalInstitutions,
    embeddedInstitutionsRow,
    totalPartners,
    totalProjects,
    totalMatches,
    pocProject,
  ] = await Promise.all([
    prisma.challenge.count(),
    prisma.$queryRaw<Array<{ count: bigint | number }>>`SELECT COUNT(*)::int as count FROM challenges WHERE embedding IS NOT NULL;`,
    prisma.challenge.count({ where: { canonicalId: { not: null } } }),
    prisma.institution.count(),
    prisma.$queryRaw<Array<{ count: bigint | number }>>`SELECT COUNT(*)::int as count FROM institutions WHERE capability_embedding IS NOT NULL;`,
    prisma.industryPartner.count(),
    prisma.project.count(),
    prisma.capabilityMatch.count(),
    prisma.project.findFirst({
      where: { currentPhase: "POC" },
      include: {
        milestones: {
          include: {
            phaseApprovals: {
              include: { signer: true },
            },
          },
        },
        institution: true,
        industryPartner: true,
        challenge: true,
      },
    }),
  ]);

  const embeddedChallenges = Number(embeddedChallengesRow[0]?.count ?? 0);
  const embeddedInstitutions = Number(embeddedInstitutionsRow[0]?.count ?? 0);
  const activeMilestone = pocProject?.milestones[0];
  const academicApproval = activeMilestone?.phaseApprovals.find(
    (a) => a.signerRole === "ACADEMIC_APPROVER" && a.decision === "APPROVED"
  );
  const externalApproval = activeMilestone?.phaseApprovals.find(
    (a) => a.signerRole === "EXTERNAL_APPROVER"
  );

  console.log("\n--------------------------------------------------------------------------------");
  console.log("  VERIFICATION AUDIT TABLE");
  console.log("--------------------------------------------------------------------------------");
  console.log(`  • Total Challenges:         ${totalChallenges} (Target: 30)`);
  console.log(`  • Vector Embedded:          ${embeddedChallenges} (Target: 30)`);
  console.log(`  • Semantic Duplicate Links: ${duplicatesCount} (Target: 3)`);
  console.log(`  • Higher Education Insts:   ${totalInstitutions} (Target: 10, Embedded: ${embeddedInstitutions})`);
  console.log(`  • MSME / CSR Partners:      ${totalPartners} (Target: 5)`);
  console.log(`  • Active PLM Projects:      ${totalProjects} (Target: 3)`);
  console.log(`  • Capability Matches:       ${totalMatches}`);

  console.log("\n--------------------------------------------------------------------------------");
  console.log("  LIVE DUAL-SIGNATURE POC DEMO STAGE GATE");
  console.log("--------------------------------------------------------------------------------");
  if (pocProject && activeMilestone && academicApproval && !externalApproval) {
    console.log(`  ✓ PoC Project:              ${pocProject.title}`);
    console.log(`  ✓ Project ID:               ${pocProject.id}`);
    console.log(`  ✓ Milestone:                ${activeMilestone.title}`);
    console.log(`  ✓ Status:                   ${activeMilestone.status}`);
    console.log(`  ✓ Content Hash (SHA-256):   ${activeMilestone.contentHash}`);
    console.log(`  ✓ Academic Approver:        ${academicApproval.signer.fullName} [APPROVED ✓]`);
    console.log(`  ✓ External Approver:        ${pocProject.industryPartner?.organizationName} [PENDING SIGNATURE ⏳]`);
    console.log(`  ✓ Direct Showcase URL:      http://localhost:3000/projects/${pocProject.id}`);
  } else {
    console.error("  ✖ WARNING: PoC stage gate dual-signature project was not in the expected state.");
  }

  const elapsedSec = ((Date.now() - overallStart) / 1000).toFixed(2);
  console.log("\n================================================================================");
  console.log(`  DEMO STATE PREPARATION COMPLETE IN ${elapsedSec}s!`);
  console.log("================================================================================\n");
  console.log("  5 SIH LIVE-DEMO CHECKPOINTS READY FOR PRESENTATION:");
  console.log("  1. Citizen PWA Offline Submission:        http://localhost:3000/challenges/new");
  console.log("  2. Semantic Deduplication Proof:          http://localhost:3000/challenges");
  console.log("  3. Capacity-Aware Routing Comparison:     http://localhost:3000/dashboard");
  console.log(`  4. Live PoC -> Prototyping Dual-Sig:     http://localhost:3000/projects/${pocProject?.id ?? ""}`);
  console.log("  5. Jharkhand PostGIS Map & Mock SMS:      http://localhost:3000/dashboard + /admin/mock-sms");
  console.log("  6. Admin Demo Inspector & Control Deck:   http://localhost:3000/admin/demo\n");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Fatal error during demo preparation:", e);
  await prisma.$disconnect();
  process.exit(1);
});
