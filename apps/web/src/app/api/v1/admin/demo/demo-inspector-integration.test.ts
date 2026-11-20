import { describe, it, expect, beforeAll } from "vitest";
import { GET as getDemoHealthHandler } from "./health/route";
import { POST as resetDemoHandler } from "./reset/route";
import { prisma, UserRole } from "@sih/db";
import { signAccessToken } from "@/lib/auth/jwt";

describe("Admin Demo Inspector & Health Diagnostic Integration Suite", () => {
  let superAdminToken = "";
  let studentToken = "";

  beforeAll(async () => {
    // 1. Fetch or create super admin
    let superAdmin = await prisma.user.findFirst({
      where: { role: UserRole.SUPER_ADMIN },
    });
    if (!superAdmin) {
      superAdmin = await prisma.user.create({
        data: {
          email: "admin@sih.gov.in",
          passwordHash: "hash",
          fullName: "Super Admin",
          role: UserRole.SUPER_ADMIN,
          verificationStatus: "VERIFIED",
        },
      });
    }

    superAdminToken = await signAccessToken({
      sub: superAdmin.id,
      email: superAdmin.email,
      role: superAdmin.role,
      verificationStatus: superAdmin.verificationStatus,
    });

    // 2. Fetch or create student
    let student = await prisma.user.findFirst({
      where: { role: UserRole.STUDENT },
    });
    if (!student) {
      student = await prisma.user.create({
        data: {
          email: "student_test_demo@sih.gov.in",
          passwordHash: "hash",
          fullName: "Student Tester",
          role: UserRole.STUDENT,
          verificationStatus: "VERIFIED",
        },
      });
    }

    studentToken = await signAccessToken({
      sub: student.id,
      email: student.email,
      role: student.role,
      verificationStatus: student.verificationStatus,
    });

    // 3. Ensure PoC project milestone is in the expected demo showcase state
    const pocProject = await prisma.project.findFirst({
      where: {
        OR: [
          { currentPhase: "POC" },
          { title: { contains: "Groundwater Defluoridation" } },
        ],
      },
      include: { milestones: true },
    });
    if (pocProject && pocProject.milestones[0]) {
      const milestone = pocProject.milestones[0];
      await prisma.project.update({
        where: { id: pocProject.id },
        data: { currentPhase: "POC" },
      });
      await prisma.milestone.update({
        where: { id: milestone.id },
        data: { status: "SUBMITTED_FOR_APPROVAL", isCompleted: false },
      });
      await prisma.phaseApproval.deleteMany({
        where: { milestoneId: milestone.id },
      });
      await prisma.phaseApproval.create({
        data: {
          milestoneId: milestone.id,
          signerId: superAdmin.id,
          signerRole: "ACADEMIC_APPROVER",
          decision: "APPROVED",
          snapshotHash: milestone.contentHash,
          signedAt: new Date(),
        },
      });
    }
  });

  it("should reject unauthenticated requests with 401", async () => {
    const req = new Request("http://localhost:3000/api/v1/admin/demo/health", {
      method: "GET",
    });
    const res = await getDemoHealthHandler(req as any);
    expect(res.status).toBe(401);
  });

  it("should reject non-admin users with 403 FORBIDDEN", async () => {
    const req = new Request("http://localhost:3000/api/v1/admin/demo/health", {
      method: "GET",
      headers: {
        Cookie: `sih_access_token=${studentToken}`,
      },
    });
    const res = await getDemoHealthHandler(req as any);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("FORBIDDEN");
  });

  it("should return 404 when NEXT_PUBLIC_ENABLE_DEMO_HELPER is 'false'", async () => {
    const originalVal = process.env.NEXT_PUBLIC_ENABLE_DEMO_HELPER;
    process.env.NEXT_PUBLIC_ENABLE_DEMO_HELPER = "false";

    try {
      const req = new Request("http://localhost:3000/api/v1/admin/demo/health", {
        method: "GET",
        headers: {
          Cookie: `sih_access_token=${superAdminToken}`,
        },
      });
      const res = await getDemoHealthHandler(req as any);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("NOT_FOUND");
    } finally {
      process.env.NEXT_PUBLIC_ENABLE_DEMO_HELPER = originalVal;
    }
  });

  it("should return comprehensive live diagnostics for Super Admin", async () => {
    const req = new Request("http://localhost:3000/api/v1/admin/demo/health", {
      method: "GET",
      headers: {
        Cookie: `sih_access_token=${superAdminToken}`,
      },
    });
    const res = await getDemoHealthHandler(req as any);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();

    const { infrastructure, liveCheckpoints } = json.data;

    // Infrastructure checks
    expect(infrastructure.database.status).toBe("ok");
    expect(infrastructure.database.counts.totalChallenges).toBeGreaterThanOrEqual(30);
    expect(infrastructure.database.counts.totalInstitutions).toBeGreaterThanOrEqual(10);
    expect(infrastructure.database.counts.industryPartners).toBeGreaterThanOrEqual(5);
    expect(infrastructure.database.counts.activeProjects).toBeGreaterThanOrEqual(3);
    expect(infrastructure.database.counts.districts).toBeGreaterThanOrEqual(8);

    // Redis checks
    expect(["ok", "degraded", "offline"]).toContain(infrastructure.redis.status);

    // AI Engine checks
    expect(["ok", "offline"]).toContain(infrastructure.aiEngine.status);

    // Storage checks
    expect(["ok", "offline"]).toContain(infrastructure.storage.status);
    expect(infrastructure.storage.bucket).toBe("sih26043-media");

    // 5 Checkpoints verification
    expect(liveCheckpoints.checkpoint1_citizenOffline.ready).toBe(true);
    expect(liveCheckpoints.checkpoint1_citizenOffline.route).toBe("/challenges/new");

    expect(liveCheckpoints.checkpoint2_semanticDedup.ready).toBe(true);
    expect(liveCheckpoints.checkpoint2_semanticDedup.duplicatesCount).toBeGreaterThanOrEqual(2);

    expect(liveCheckpoints.checkpoint3_capacityRouting.ready).toBe(true);
    expect(liveCheckpoints.checkpoint3_capacityRouting.matchesCount).toBeGreaterThan(0);

    // Checkpoint 4: Live PoC dual signature
    expect(liveCheckpoints.checkpoint4_dualSignature.ready).toBe(true);
    expect(liveCheckpoints.checkpoint4_dualSignature.projectId).toBeTruthy();
    expect(liveCheckpoints.checkpoint4_dualSignature.milestoneStatus).toBe("SUBMITTED_FOR_APPROVAL");
    expect(liveCheckpoints.checkpoint4_dualSignature.contentHash).toHaveLength(64);
    expect(liveCheckpoints.checkpoint4_dualSignature.academicRole).toBe("ACADEMIC_APPROVER");
    expect(liveCheckpoints.checkpoint4_dualSignature.externalSignerPending).toBe(true);

    // Checkpoint 5: Spatial map & SMS
    expect(liveCheckpoints.checkpoint5_spatialMapSms.ready).toBe(true);
    expect(liveCheckpoints.checkpoint5_spatialMapSms.districtsCount).toBe(8);
  });

  it("should reject reset endpoint for unauthorized users", async () => {
    const unauthReq = new Request("http://localhost:3000/api/v1/admin/demo/reset", {
      method: "POST",
    });
    const unauthRes = await resetDemoHandler(unauthReq as any);
    expect(unauthRes.status).toBe(401);

    const studentReq = new Request("http://localhost:3000/api/v1/admin/demo/reset", {
      method: "POST",
      headers: {
        Cookie: `sih_access_token=${studentToken}`,
      },
    });
    const studentRes = await resetDemoHandler(studentReq as any);
    expect(studentRes.status).toBe(403);
  });
});
