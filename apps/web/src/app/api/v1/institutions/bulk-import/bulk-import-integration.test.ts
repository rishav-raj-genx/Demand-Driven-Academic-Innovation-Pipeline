import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { POST as bulkImportHandler } from "./route";
import { prisma, getInstitutionLocation } from "@sih/db";
import { signAccessToken } from "@/lib/auth/jwt";
import { heiEmbeddingQueue } from "@/lib/queues";
import { heiEmbedProcessor } from "@sih/worker";
import fs from "fs";
import path from "path";

describe("Bulk Institutional Profile Importer Integration Test Suite", () => {
  let govtOfficialToken = "";
  let superAdminToken = "";
  let citizenToken = "";
  let heiAdminToken = "";

  const sampleCsvPath = path.resolve(
    process.cwd(),
    "../../packages/db/prisma/seeds/data/sample_hei_bulk_import.csv"
  );

  beforeAll(async () => {
    // 1. Clean up any existing records for the 3 sample colleges
    await prisma.institution.deleteMany({
      where: {
        code: { in: ["C-44150", "C-44210", "C-44320", "U-FAKE-999", "C-INVALID-001"] },
      },
    });

    // 2. Fetch or create GOVT_OFFICIAL user
    let govtUser = await prisma.user.findFirst({
      where: { role: "GOVT_OFFICIAL" },
    });
    if (!govtUser) {
      govtUser = await prisma.user.create({
        data: {
          email: `govt_official_test_${Date.now()}@jharkhand.gov.in`,
          passwordHash: "hash",
          fullName: "Jharkhand Higher Education Directorate",
          role: "GOVT_OFFICIAL",
          verificationStatus: "VERIFIED",
        },
      });
    }
    govtOfficialToken = await signAccessToken({
      sub: govtUser.id,
      email: govtUser.email,
      role: govtUser.role,
      institutionId: null,
      verificationStatus: govtUser.verificationStatus,
    });

    // 3. Fetch or create SUPER_ADMIN user
    let superAdminUser = await prisma.user.findFirst({
      where: { role: "SUPER_ADMIN" },
    });
    if (!superAdminUser) {
      superAdminUser = await prisma.user.create({
        data: {
          email: `super_admin_test_${Date.now()}@sih.gov.in`,
          passwordHash: "hash",
          fullName: "Platform Super Admin",
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

    // 4. Fetch or create CITIZEN user (unauthorized)
    const citizen = await prisma.user.findFirstOrThrow({
      where: { role: "CITIZEN" },
    });
    citizenToken = await signAccessToken({
      sub: citizen.id,
      email: citizen.email,
      role: citizen.role,
      institutionId: null,
      verificationStatus: citizen.verificationStatus,
    });

    // 5. Fetch or create INSTITUTION_ADMIN user (unauthorized for global bulk import)
    const heiAdmin = await prisma.user.findFirstOrThrow({
      where: { role: "INSTITUTION_ADMIN" },
    });
    heiAdminToken = await signAccessToken({
      sub: heiAdmin.id,
      email: heiAdmin.email,
      role: heiAdmin.role,
      institutionId: heiAdmin.institutionId,
      verificationStatus: heiAdmin.verificationStatus,
    });
  });

  // ============================================================================
  // 1. RBAC & Authentication Checks
  // ============================================================================

  describe("Authentication & RBAC Guards", () => {
    it("should reject unauthenticated requests with 401 Unauthorized", async () => {
      const req = new Request("http://localhost:3000/api/v1/institutions/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: "name,aisheCode,tier,districtCode,latitude,longitude,maxCapacity,domains\nTest,C-44150,TIER_2,JH_BOK,23.6690,86.1510,15,Mining",
      });

      const res = await bulkImportHandler(req);
      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("should reject CITIZEN role with 403 Forbidden", async () => {
      const req = new Request("http://localhost:3000/api/v1/institutions/bulk-import", {
        method: "POST",
        headers: {
          "Content-Type": "text/csv",
          Authorization: `Bearer ${citizenToken}`,
        },
        body: "name,aisheCode,tier,districtCode,latitude,longitude,maxCapacity,domains\nTest,C-44150,TIER_2,JH_BOK,23.6690,86.1510,15,Mining",
      });

      const res = await bulkImportHandler(req);
      expect(res.status).toBe(403);

      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("FORBIDDEN");
    });

    it("should reject INSTITUTION_ADMIN role with 403 Forbidden", async () => {
      const req = new Request("http://localhost:3000/api/v1/institutions/bulk-import", {
        method: "POST",
        headers: {
          "Content-Type": "text/csv",
          Authorization: `Bearer ${heiAdminToken}`,
        },
        body: "name,aisheCode,tier,districtCode,latitude,longitude,maxCapacity,domains\nTest,C-44150,TIER_2,JH_BOK,23.6690,86.1510,15,Mining",
      });

      const res = await bulkImportHandler(req);
      expect(res.status).toBe(403);

      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("FORBIDDEN");
    });
  });

  // ============================================================================
  // 2. Payload Validation & Limits
  // ============================================================================

  describe("Payload Limits & Validation", () => {
    it("should reject empty import batches with 400 Bad Request", async () => {
      const req = new Request("http://localhost:3000/api/v1/institutions/bulk-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${govtOfficialToken}`,
        },
        body: JSON.stringify([]),
      });

      const res = await bulkImportHandler(req);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("EMPTY_IMPORT_BATCH");
    });

    it("should reject batches exceeding 200 institutions with 400 Bad Request", async () => {
      const oversizedBatch = Array.from({ length: 205 }, (_, i) => ({
        name: `College ${i}`,
        aisheCode: `C-${10000 + i}`,
        tier: "TIER_2",
        districtCode: "JH_RAN",
        latitude: 23.3441,
        longitude: 85.3096,
        maxCapacity: 10,
        domains: ["IT"],
      }));

      const req = new Request("http://localhost:3000/api/v1/institutions/bulk-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${govtOfficialToken}`,
        },
        body: JSON.stringify(oversizedBatch),
      });

      const res = await bulkImportHandler(req);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("BATCH_SIZE_EXCEEDED");
    });
  });

  // ============================================================================
  // 3. Core Acceptance Test: CSV Import with Partial-Success Isolation
  // ============================================================================

  describe("Core Acceptance: sample_hei_bulk_import.csv + 1 Invalid Row", () => {
    let importResponseData: any = null;

    it("should import sample_hei_bulk_import.csv plus 1 invalid row, reporting partial success", async () => {
      expect(fs.existsSync(sampleCsvPath)).toBe(true);
      const validCsvContent = fs.readFileSync(sampleCsvPath, "utf-8").trim();

      // Append 1 intentionally invalid row (U-FAKE-999 is flagged REJECTED in mock AISHE registry)
      const invalidRow =
        '\nFraudulent Academic Entity,U-FAKE-999,TIER_2,JH_RAN,23.3441,85.3096,10,"Water Purification","Hydrology","Water Lab","Fake unregistered institution"';
      const combinedCsv = validCsvContent + invalidRow;

      const req = new Request("http://localhost:3000/api/v1/institutions/bulk-import", {
        method: "POST",
        headers: {
          "Content-Type": "text/csv",
          Authorization: `Bearer ${govtOfficialToken}`,
        },
        body: combinedCsv,
      });

      const res = await bulkImportHandler(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      importResponseData = body.data;

      // Partial-success verification
      expect(importResponseData.total).toBe(4);
      expect(importResponseData.imported).toBe(3);
      expect(importResponseData.updated).toBe(0);
      expect(importResponseData.rejectedCount).toBe(1);
      expect(importResponseData.rejected).toHaveLength(1);

      const rejectedEntry = importResponseData.rejected[0];
      expect(rejectedEntry.row).toBe(4);
      expect(rejectedEntry.aisheCode).toBe("U-FAKE-999");
      expect(rejectedEntry.reason).toContain("AISHE verification rejected");

      // Verify the 3 imported results
      expect(importResponseData.results).toHaveLength(3);
      const codes = importResponseData.results.map((r: any) => r.code);
      expect(codes).toContain("C-44150");
      expect(codes).toContain("C-44210");
      expect(codes).toContain("C-44320");
    });

    it("should have created PostGIS geometry points for all 3 imported HEIs", async () => {
      for (const res of importResponseData.results) {
        const location = await getInstitutionLocation(res.id);
        expect(location).not.toBeNull();
        expect(location?.lat).toBeDefined();
        expect(location?.lng).toBeDefined();

        if (res.code === "C-44150") {
          expect(location!.lat).toBeCloseTo(23.6690, 3);
          expect(location!.lng).toBeCloseTo(86.1510, 3);
        } else if (res.code === "C-44210") {
          expect(location!.lat).toBeCloseTo(23.9980, 3);
          expect(location!.lng).toBeCloseTo(85.3620, 3);
        } else if (res.code === "C-44320") {
          expect(location!.lat).toBeCloseTo(24.4780, 3);
          expect(location!.lng).toBeCloseTo(86.6920, 3);
        }
      }
    });

    it("should have enqueued BullMQ hei.embed jobs and generated 384-dim embeddings", async () => {
      // 1. Verify BullMQ jobs enqueued in Redis
      const enqueuedJobs = await heiEmbeddingQueue.getJobs([
        "waiting",
        "delayed",
        "active",
        "completed",
      ]);

      const importedIds = importResponseData.results.map((r: any) => r.id);

      for (const instId of importedIds) {
        const job = enqueuedJobs.find((j) => j.data?.institutionId === instId);
        expect(job).toBeDefined();
        expect(job?.name).toBe("hei.embed");

        // 2. Process the BullMQ embedding job against live FastAPI AI Engine
        const processorResult = await heiEmbedProcessor(job as any);
        expect(processorResult.success).toBe(true);
        expect(processorResult.embeddingDimensions).toBe(384);
      }

      // 3. Verify PostgreSQL capability_embedding columns have 384 dimensions
      const rows = await prisma.$queryRaw<
        Array<{ code: string; has_embedding: boolean; dims: number }>
      >`
        SELECT 
          code, 
          (capability_embedding IS NOT NULL) AS has_embedding,
          vector_dims(capability_embedding) AS dims
        FROM institutions
        WHERE code IN ('C-44150', 'C-44210', 'C-44320');
      `;

      expect(rows).toHaveLength(3);
      for (const r of rows) {
        expect(r.has_embedding).toBe(true);
        expect(r.dims).toBe(384);
      }
    });

    it("should update existing records and report action 'UPDATED' upon re-import", async () => {
      const validCsvContent = fs.readFileSync(sampleCsvPath, "utf-8");

      const req = new Request("http://localhost:3000/api/v1/institutions/bulk-import", {
        method: "POST",
        headers: {
          "Content-Type": "text/csv",
          Authorization: `Bearer ${superAdminToken}`,
        },
        body: validCsvContent,
      });

      const res = await bulkImportHandler(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.imported).toBe(0);
      expect(body.data.updated).toBe(3);
      expect(body.data.rejectedCount).toBe(0);

      for (const result of body.data.results) {
        expect(result.action).toBe("UPDATED");
      }
    });

    it("should have recorded immutable AuditLog entries for bulk imports", async () => {
      const logs = await prisma.auditLog.findMany({
        where: { action: "INSTITUTIONS_BULK_IMPORTED" },
        orderBy: { createdAt: "desc" },
        take: 2,
      });

      expect(logs.length).toBeGreaterThan(0);
      const latestLog = logs[0];
      expect(latestLog.entityType).toBe("Institution");
      expect(latestLog.entityId).toBe("bulk-import-batch");
      expect((latestLog.metadata as any).total).toBeDefined();
    });
  });
});
