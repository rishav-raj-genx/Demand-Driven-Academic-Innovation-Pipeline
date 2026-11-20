import { describe, it, expect, beforeAll } from "vitest";
import { GET as listInstitutionsHandler } from "./route";
import { GET as getInstitutionDetailHandler } from "./[id]/route";
import { PUT as updateInstitutionProfileHandler } from "./[id]/profile/route";
import { GET as getMockSmsLogsHandler } from "../notifications/mock-sms/route";
import { prisma } from "@sih/db";
import { signAccessToken } from "@/lib/auth/jwt";
import { heiEmbeddingQueue } from "@/lib/queues";

describe("HEI Capability Profile & Mock SMS Integration Test Suite", () => {
  let bitMesraId = "";
  let nitJsrId = "";
  let bitMesraAdminToken = "";
  let nitJsrAdminToken = "";
  let citizenToken = "";
  let superAdminToken = "";

  beforeAll(async () => {
    // 1. Fetch BIT Mesra (U-0202) and NIT Jamshedpur (U-0205)
    const bitMesra = await prisma.institution.findFirstOrThrow({
      where: { code: "U-0202" },
    });
    bitMesraId = bitMesra.id;

    const nitJsr = await prisma.institution.findFirstOrThrow({
      where: { code: "U-0205" },
    });
    nitJsrId = nitJsr.id;

    // 2. Fetch or create BIT Mesra HEI Admin user
    let bitAdmin = await prisma.user.findFirst({
      where: { institutionId: bitMesraId, role: "INSTITUTION_ADMIN" },
    });
    if (!bitAdmin) {
      bitAdmin = await prisma.user.create({
        data: {
          email: `bit_admin_test_${Date.now()}@sih.gov.in`,
          passwordHash: "hash",
          fullName: "BIT Mesra Test Admin",
          role: "INSTITUTION_ADMIN",
          institutionId: bitMesraId,
          verificationStatus: "VERIFIED",
        },
      });
    }

    bitMesraAdminToken = await signAccessToken({
      sub: bitAdmin.id,
      email: bitAdmin.email,
      role: bitAdmin.role,
      institutionId: bitMesraId,
      verificationStatus: bitAdmin.verificationStatus,
    });

    // 3. Fetch or create NIT Jamshedpur HEI Admin user
    let nitAdmin = await prisma.user.findFirst({
      where: { institutionId: nitJsrId, role: "INSTITUTION_ADMIN" },
    });
    if (!nitAdmin) {
      nitAdmin = await prisma.user.create({
        data: {
          email: `nit_admin_test_${Date.now()}@sih.gov.in`,
          passwordHash: "hash",
          fullName: "NIT Jamshedpur Test Admin",
          role: "INSTITUTION_ADMIN",
          institutionId: nitJsrId,
          verificationStatus: "VERIFIED",
        },
      });
    }

    nitJsrAdminToken = await signAccessToken({
      sub: nitAdmin.id,
      email: nitAdmin.email,
      role: nitAdmin.role,
      institutionId: nitJsrId,
      verificationStatus: nitAdmin.verificationStatus,
    });

    // 4. Create Citizen Token (Unauthorized for institutional profile updates)
    let citizen = await prisma.user.findFirst({
      where: { role: "CITIZEN" },
    });
    if (!citizen) {
      citizen = await prisma.user.create({
        data: {
          email: `citizen_test_${Date.now()}@sih.gov.in`,
          passwordHash: "hash",
          fullName: "Birsa Soren",
          role: "CITIZEN",
          verificationStatus: "VERIFIED",
        },
      });
    }
    citizenToken = await signAccessToken({
      sub: citizen.id,
      email: citizen.email,
      role: citizen.role,
      institutionId: null,
      verificationStatus: citizen.verificationStatus,
    });

    // 5. Create Super Admin Token (Authorized for any institution)
    const superAdmin = await prisma.user.findFirst({
      where: { role: "SUPER_ADMIN" },
    });
    let superAdminUser = superAdmin;
    if (!superAdminUser) {
      superAdminUser = await prisma.user.create({
        data: {
          email: `super_admin_test_${Date.now()}@sih.gov.in`,
          passwordHash: "hash",
          fullName: "Super Admin Demo",
          role: "SUPER_ADMIN",
          verificationStatus: "VERIFIED",
        },
      });
    }

    superAdminToken = await signAccessToken({
      sub: superAdminUser.id,
      email: superAdminUser.email,
      role: superAdminUser.role,
      institutionId: null,
      verificationStatus: superAdminUser.verificationStatus,
    });
  });

  // ============================================================================
  // 1. GET /api/v1/institutions - Directory & Utilization Ratios
  // ============================================================================

  describe("GET /api/v1/institutions", () => {
    it("should list verified HEIs with utilization ratios and domain tags", async () => {
      const req = new Request("http://localhost:3000/api/v1/institutions");
      const res = await listInstitutionsHandler(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);

      const first = body.data[0];
      expect(first).toHaveProperty("id");
      expect(first).toHaveProperty("name");
      expect(first).toHaveProperty("code");
      expect(first).toHaveProperty("tier");
      expect(first).toHaveProperty("utilizationRatio");
      expect(typeof first.utilizationRatio).toBe("number");
      expect(Array.isArray(first.domains)).toBe(true);
      expect(first.verificationStatus).toBe("VERIFIED");
    });

    it("should filter institutions by tier", async () => {
      const req = new Request("http://localhost:3000/api/v1/institutions?tier=TIER_1");
      const res = await listInstitutionsHandler(req);
      const body = await res.json();

      expect(body.success).toBe(true);
      expect(body.data.every((inst: { tier: string }) => inst.tier === "TIER_1")).toBe(true);
    });

    it("should filter institutions by domain tag", async () => {
      const req = new Request(
        "http://localhost:3000/api/v1/institutions?domain=Water+Filtration"
      );
      const res = await listInstitutionsHandler(req);
      const body = await res.json();

      expect(body.success).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
      expect(
        body.data.some((inst: { code: string; domains: string[] }) =>
          inst.code === "U-0202" && inst.domains.includes("Water Filtration")
        )
      ).toBe(true);
    });
  });

  // ============================================================================
  // 2. GET /api/v1/institutions/[id] - Capability Profile & Matched Challenges
  // ============================================================================

  describe("GET /api/v1/institutions/[id]", () => {
    it("should return full institutional profile and matched challenges queue for valid ID", async () => {
      const req = new Request(`http://localhost:3000/api/v1/institutions/${bitMesraId}`);
      const res = await getInstitutionDetailHandler(req, {
        params: Promise.resolve({ id: bitMesraId }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(bitMesraId);
      expect(body.data.code).toBe("U-0202");
      expect(body.data.name).toBe("Birla Institute of Technology Mesra");
      expect(body.data.tier).toBe("TIER_1");
      expect(Array.isArray(body.data.facultySpecializations)).toBe(true);
      expect(Array.isArray(body.data.labFacilities)).toBe(true);
      expect(Array.isArray(body.data.domains)).toBe(true);
      expect(Array.isArray(body.data.matchedChallenges)).toBe(true);
      expect(body.data.matchedChallenges.length).toBeGreaterThan(0);

      const topMatch = body.data.matchedChallenges[0];
      expect(topMatch).toHaveProperty("challengeId");
      expect(topMatch).toHaveProperty("title");
      expect(topMatch).toHaveProperty("similarityScore");
    });

    it("should return HTTP 404 for unknown institution ID", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const req = new Request(`http://localhost:3000/api/v1/institutions/${fakeId}`);
      const res = await getInstitutionDetailHandler(req, {
        params: Promise.resolve({ id: fakeId }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });

  // ============================================================================
  // 3. PUT /api/v1/institutions/[id]/profile - RBAC & Vector Re-embedding Gate
  // ============================================================================

  describe("PUT /api/v1/institutions/[id]/profile", () => {
    it("should reject unauthenticated request with HTTP 401", async () => {
      const req = new Request(
        `http://localhost:3000/api/v1/institutions/${bitMesraId}/profile`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            domains: ["Water Filtration"],
          }),
        }
      );

      const res = await updateInstitutionProfileHandler(req, {
        params: Promise.resolve({ id: bitMesraId }),
      });
      expect(res.status).toBe(401);
    });

    it("should reject non-admin roles (e.g. CITIZEN) with HTTP 403", async () => {
      const req = new Request(
        `http://localhost:3000/api/v1/institutions/${bitMesraId}/profile`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${citizenToken}`,
          },
          body: JSON.stringify({
            domains: ["Water Filtration"],
          }),
        }
      );

      const res = await updateInstitutionProfileHandler(req, {
        params: Promise.resolve({ id: bitMesraId }),
      });
      expect(res.status).toBe(403);
    });

    it("should reject an HEI admin attempting to update ANOTHER institution with HTTP 403 (ownership enforcement)", async () => {
      // NIT Jamshedpur Admin tries to modify BIT Mesra's profile!
      const req = new Request(
        `http://localhost:3000/api/v1/institutions/${bitMesraId}/profile`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${nitJsrAdminToken}`,
          },
          body: JSON.stringify({
            domains: ["Hijacked Domain"],
            maxCapacity: 20,
          }),
        }
      );

      const res = await updateInstitutionProfileHandler(req, {
        params: Promise.resolve({ id: bitMesraId }),
      });
      expect(res.status).toBe(403);

      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toContain("only manage the capability profile of your own institution");
    });

    it("should reject invalid maxCapacity (< 1 or > 50) with HTTP 400 validation error", async () => {
      const req = new Request(
        `http://localhost:3000/api/v1/institutions/${bitMesraId}/profile`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${bitMesraAdminToken}`,
          },
          body: JSON.stringify({
            domains: ["Water Filtration"],
            maxCapacity: 100, // Invalid! Max allowed is 50
          }),
        }
      );

      const res = await updateInstitutionProfileHandler(req, {
        params: Promise.resolve({ id: bitMesraId }),
      });
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should update institutional labs, specializations, domains, maxCapacity in Postgres and enqueue hei.embed BullMQ job", async () => {
      const updatedDomains = [
        "Water Filtration",
        "Sensors",
        "Membrane Technology",
        "Environmental Remediation",
        "Graphene Nanocomposites",
      ];
      const updatedSpecs = [
        "Advanced graphene oxide functionalized ceramic membranes",
        "Electrochemical arsenic trace sensors (sub-5ppb detection)",
        "Industrial textile wastewater closed-loop recovery",
      ];
      const updatedLabs = [
        "Advanced Water Purification & Membrane Research Laboratory",
        "Nanomaterials Characterization & Cleanroom Hub",
        "Environmental Analytical Chemistry Instrumentation Center",
      ];
      const updatedSummary =
        "Tier-1 premier technical university in Jharkhand with expanded focus on graphene oxide nanocomposite water filtration membranes.";
      const updatedCapacity = 8;

      const req = new Request(
        `http://localhost:3000/api/v1/institutions/${bitMesraId}/profile`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${bitMesraAdminToken}`,
          },
          body: JSON.stringify({
            domains: updatedDomains,
            facultySpecializations: updatedSpecs,
            labFacilities: updatedLabs,
            profileSummary: updatedSummary,
            maxCapacity: updatedCapacity,
          }),
        }
      );

      const res = await updateInstitutionProfileHandler(req, {
        params: Promise.resolve({ id: bitMesraId }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.enqueuedEmbeddingJob).toBe(true);
      expect(body.data.maxCapacity).toBe(updatedCapacity);
      expect(body.data.domains).toEqual(updatedDomains);
      expect(body.data.facultySpecializations).toEqual(updatedSpecs);
      expect(body.data.labFacilities).toEqual(updatedLabs);
      expect(body.data.profileSummary).toBe(updatedSummary);

      // Verify in PostgreSQL directly
      const dbInst = await prisma.institution.findUniqueOrThrow({
        where: { id: bitMesraId },
      });
      expect(dbInst.maxCapacity).toBe(updatedCapacity);
      expect(dbInst.domains).toEqual(updatedDomains);
      expect(dbInst.facultySpecializations).toEqual(updatedSpecs);
      expect(dbInst.labFacilities).toEqual(updatedLabs);
      expect(dbInst.profileSummary).toBe(updatedSummary);

      // Verify AuditLog recorded
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          action: "INSTITUTION_PROFILE_UPDATED",
          entityId: bitMesraId,
        },
        orderBy: { createdAt: "desc" },
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog?.entityType).toBe("Institution");

      // Verify BullMQ job enqueued in Redis
      const heiJobs = await heiEmbeddingQueue.getJobs([
        "waiting",
        "delayed",
        "active",
        "completed",
      ]);
      const enqueuedJob = heiJobs.find((j) => j.data?.institutionId === bitMesraId);
      expect(enqueuedJob).toBeDefined();
      expect(enqueuedJob?.name).toBe("hei.embed");
      expect(enqueuedJob?.data.institutionId).toBe(bitMesraId);
    });

    it("should allow SUPER_ADMIN to update any institution profile", async () => {
      const req = new Request(
        `http://localhost:3000/api/v1/institutions/${nitJsrId}/profile`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${superAdminToken}`,
          },
          body: JSON.stringify({
            domains: ["Solar Micro-Grids", "Smart Grids"],
            maxCapacity: 7,
          }),
        }
      );

      const res = await updateInstitutionProfileHandler(req, {
        params: Promise.resolve({ id: nitJsrId }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.maxCapacity).toBe(7);
    });
  });

  // ============================================================================
  // 4. GET /api/v1/notifications/mock-sms - Live Demonstration Inspection
  // ============================================================================

  describe("GET /api/v1/notifications/mock-sms", () => {
    it("should return recent mock SMS notification logs tagged [MOCK SMS - SIH26043]", async () => {
      // Ensure at least one mock SMS notification log exists for deterministic test isolation
      const citizenUser = await prisma.user.findFirstOrThrow({
        where: { role: "CITIZEN" },
      });
      await prisma.notificationLog.create({
        data: {
          recipientId: citizenUser.id,
          title: "Challenge Status Update",
          message: "[MOCK SMS - SIH26043] Challenge jh-chal-001 matched with BIT Mesra.",
          type: "SMS",
          data: {
            phoneNumber: citizenUser.phoneNumber ?? "+91-9876543210",
            status: "DELIVERED_MOCK",
            gateway: "MOCK_SMS_GATEWAY_SIH26043",
          },
        },
      });

      const req = new Request("http://localhost:3000/api/v1/notifications/mock-sms?limit=10");
      const res = await getMockSmsLogsHandler(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("count");
      expect(Array.isArray(body.data.logs)).toBe(true);
      expect(body.data.logs.length).toBeGreaterThan(0);

      const log = body.data.logs[0];
      expect(log).toHaveProperty("id");
      expect(log).toHaveProperty("recipientId");
      expect(log).toHaveProperty("recipientName");
      expect(log).toHaveProperty("message");
      expect(log.message).toContain("[MOCK SMS - SIH26043]");
      expect(log.status).toBe("DELIVERED_MOCK");
    });
  });
});
