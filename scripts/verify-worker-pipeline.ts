import { randomUUID } from "node:crypto";
import { prisma } from "@sih/db";
import { bootstrap } from "../apps/worker/src/index.js";
import { POST as challengeIntakeHandler } from "../apps/web/src/app/api/v1/challenges/route.js";
import { signAccessToken } from "../apps/web/src/lib/auth/jwt.js";
import { challengePipelineQueue, notifySmsQueue } from "../apps/worker/src/queues.js";

async function runVerification() {
  console.log("==================================================================");
  console.log("SIH26043: Multi-Queue BullMQ Worker & End-to-End Pipeline Verification");
  console.log("==================================================================");

  // 1. Verify FastAPI AI Engine is running and healthy
  console.log("\n[1/5] Checking FastAPI AI Engine reachability...");
  const healthRes = await fetch("http://127.0.0.1:8000/health");
  if (!healthRes.ok) {
    throw new Error(`FastAPI AI Engine is unhealthy: HTTP ${healthRes.status}`);
  }
  const healthJson = await healthRes.json();
  console.log("✓ FastAPI AI Engine is OK:", healthJson);

  // 2. Start the BullMQ Worker
  console.log("\n[2/5] Starting BullMQ Worker instance...");
  const { workers, shutdown } = await bootstrap();
  console.log(`✓ ${workers.length} BullMQ worker queues active and listening.`);

  try {
    // 3. Prepare authenticated Citizen user
    console.log("\n[3/5] Setting up test citizen user...");
    let citizen = await prisma.user.findFirst({
      where: { role: "CITIZEN" },
    });

    if (!citizen) {
      citizen = await prisma.user.create({
        data: {
          email: `citizen_e2e_${Date.now()}@sih.gov.in`,
          passwordHash: "argon2_test_hash",
          fullName: "Birsa Munda (Citizen Demo)",
          role: "CITIZEN",
          phoneNumber: "+919876500002",
        },
      });
    }

    const token = await signAccessToken({
      sub: citizen.id,
      email: citizen.email,
      role: citizen.role,
      institutionId: citizen.institutionId,
      verificationStatus: citizen.verificationStatus,
    });
    console.log(`✓ Authenticated citizen token generated for: ${citizen.fullName} (${citizen.id})`);

    // 4. Submit challenge via POST /api/v1/challenges
    console.log("\n[4/5] Enqueuing challenge via POST /api/v1/challenges intake handler...");
    const idempotencyKey = randomUUID();
    const testTitle = `Decentralized Biomass Gasifier in Khunti #${Date.now().toString().slice(-4)}`;
    const intakePayload = {
      title: testTitle,
      description:
        "Rural micro-enterprises in Khunti lack reliable electricity for lac and tamarind processing machinery, leading to production bottlenecks. Need efficient 10kWe biomass gasifiers running on local agricultural residue.",
      domain: "Clean Energy",
      urgency: "HIGH",
      latitude: 23.0722,
      longitude: 85.2796,
      clientIdempotencyKey: idempotencyKey,
    };

    const req = new Request("http://localhost:3000/api/v1/challenges", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(intakePayload),
    });

    const intakeRes = await challengeIntakeHandler(req);
    const intakeData = await intakeRes.json();

    if (intakeRes.status !== 201 || !intakeData.success) {
      throw new Error(`Challenge intake failed: HTTP ${intakeRes.status}: ${JSON.stringify(intakeData)}`);
    }

    const challengeId = intakeData.data.id;
    console.log(`✓ Challenge created with status: ${intakeData.data.status} (ID: ${challengeId})`);

    // 5. Poll for BullMQ processing completion within 5 seconds
    console.log("\n[5/5] Awaiting async BullMQ processing and status transition (< 5 seconds)...");
    const startTime = Date.now();
    let finalStatus = intakeData.data.status;
    let notificationLogsFound: Array<{
      id: string;
      title: string;
      message: string;
      data: unknown;
    }> = [];

    const timeoutLimitMs = 5000;
    while (Date.now() - startTime < timeoutLimitMs) {
      const currentChal = await prisma.challenge.findUnique({
        where: { id: challengeId },
        select: { status: true, canonicalId: true },
      });

      if (currentChal && currentChal.status !== "SUBMITTED") {
        finalStatus = currentChal.status;

        // Check for mock SMS notification logs
        const logs = await prisma.notificationLog.findMany({
          where: {
            OR: [
              { recipientId: citizen.id },
              { message: { contains: challengeId } },
              { message: { contains: testTitle } },
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        });

        if (logs.length > 0) {
          notificationLogsFound = logs;
          break;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    const durationMs = Date.now() - startTime;
    console.log(`✓ Processing completed in ${durationMs}ms`);
    console.log(`✓ Challenge transitioned to status: '${finalStatus}'`);

    if (finalStatus !== "MATCHED" && finalStatus !== "DUPLICATE_MERGED") {
      throw new Error(`Challenge did not transition to MATCHED or DUPLICATE_MERGED; status is '${finalStatus}'`);
    }

    if (notificationLogsFound.length === 0) {
      throw new Error("No notification_logs records were generated during processing!");
    }

    console.log(`✓ Found ${notificationLogsFound.length} mock SMS notification log entries:`);
    for (const log of notificationLogsFound) {
      console.log(`  - Log ID: ${log.id}`);
      console.log(`    Title:  ${log.title}`);
      console.log(`    SMS:    ${log.message}`);
      const dataObj = log.data as Record<string, unknown> | null;
      console.log(`    Status: ${dataObj?.status}`);
      if (dataObj?.status !== "DELIVERED_MOCK") {
        throw new Error(`Expected log data status to be DELIVERED_MOCK, got: ${dataObj?.status}`);
      }
      if (!log.message.includes("[MOCK SMS - SIH26043]")) {
        throw new Error(`Expected message to be tagged with [MOCK SMS - SIH26043]`);
      }
    }

    console.log("\n==================================================================");
    console.log("🎉 ALL ACCEPTANCE CRITERIA VERIFIED SUCCESSFULLY WITHIN 5 SECONDS!");
    console.log("==================================================================");
  } finally {
    console.log("\nShutting down workers and closing connections...");
    await shutdown("SCRIPT_COMPLETE");
  }
}

runVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ Verification Failed:", err);
    process.exit(1);
  });
