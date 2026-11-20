import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import {
  prisma,
  setChallengeLocation,
  setInstitutionLocation,
  getChallengeLocation,
  getInstitutionLocation,
  findDistrictByCoordinates,
  getDistrictInnovationDensity,
  recordAuditLog,
} from "../src/index.js";

describe("PostGIS Spatial Helpers & Audit Logging Integration Suite", () => {
  const TEST_PREFIX = `test_${Date.now()}`;
  let testUserId: string;
  let testPartnerId: string;
  let testInstitutionId: string;
  let testChallengeId: string;
  let testDistrictDelhiId: string;
  let testDistrictBlrId: string;

  beforeAll(async () => {
    // 1. Create Test District 1: Delhi (bounding box [77.20, 28.60] to [77.24, 28.64])
    const delhiDistrict = await prisma.district.create({
      data: {
        name: `${TEST_PREFIX} Central Delhi`,
        state: "Delhi",
        code: `${TEST_PREFIX}_DEL`,
      },
    });
    testDistrictDelhiId = delhiDistrict.id;

    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE districts
        SET 
          centroid = ST_SetSRID(ST_MakePoint(77.22, 28.62), 4326),
          boundary = ST_Multi(ST_GeomFromText('POLYGON((77.20 28.60, 77.24 28.60, 77.24 28.64, 77.20 28.64, 77.20 28.60))', 4326))
        WHERE id = ${testDistrictDelhiId}::uuid;
      `
    );

    // 2. Create Test District 2: Bengaluru (bounding box [77.55, 12.94] to [77.65, 13.00])
    const blrDistrict = await prisma.district.create({
      data: {
        name: `${TEST_PREFIX} Bengaluru Urban`,
        state: "Karnataka",
        code: `${TEST_PREFIX}_BLR`,
      },
    });
    testDistrictBlrId = blrDistrict.id;

    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE districts
        SET 
          centroid = ST_SetSRID(ST_MakePoint(77.60, 12.97), 4326),
          boundary = ST_Multi(ST_GeomFromText('POLYGON((77.55 12.94, 77.65 12.94, 77.65 13.00, 77.55 13.00, 77.55 12.94))', 4326))
        WHERE id = ${testDistrictBlrId}::uuid;
      `
    );

    // 3. Create Test User
    const user = await prisma.user.create({
      data: {
        email: `${TEST_PREFIX}_user@example.com`,
        passwordHash: "test_password_hash",
        fullName: "Test Innovation Officer",
        role: "INDUSTRY_PARTNER",
      },
    });
    testUserId = user.id;

    // 4. Create Test Industry Partner
    const partner = await prisma.industryPartner.create({
      data: {
        organizationName: `${TEST_PREFIX} Aerospace Industries`,
        industrySector: "Aerospace",
        districtId: testDistrictDelhiId,
      },
    });
    testPartnerId = partner.id;

    // 5. Create Test Institution
    const institution = await prisma.institution.create({
      data: {
        name: `${TEST_PREFIX} Institute of Advanced Tech`,
        code: `${TEST_PREFIX}_INST_01`,
        districtId: testDistrictDelhiId,
        tier: "TIER_1",
      },
    });
    testInstitutionId = institution.id;

    // 6. Create Test Challenge
    const challenge = await prisma.challenge.create({
      data: {
        title: `${TEST_PREFIX} Autonomous UAV Propulsion`,
        problemStatement: "High-efficiency hybrid propulsion system required.",
        industryPartnerId: testPartnerId,
        createdById: testUserId,
        status: "OPEN",
      },
    });
    testChallengeId = challenge.id;
  });

  afterAll(async () => {
    // Cascading cleanup of all test fixtures
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { userId: testUserId },
          { entityId: testChallengeId },
          { entityId: testInstitutionId },
        ],
      },
    });

    await prisma.challenge.deleteMany({
      where: { id: testChallengeId },
    });

    await prisma.institution.deleteMany({
      where: { id: testInstitutionId },
    });

    await prisma.industryPartner.deleteMany({
      where: { id: testPartnerId },
    });

    await prisma.user.deleteMany({
      where: { id: testUserId },
    });

    await prisma.district.deleteMany({
      where: {
        id: { in: [testDistrictDelhiId, testDistrictBlrId] },
      },
    });

    await prisma.$disconnect();
  });

  describe("Spatial Point Writing & Reading", () => {
    it("should set and retrieve a challenge location using ST_SetSRID(ST_MakePoint)", async () => {
      const lat = 28.6139;
      const lng = 77.2167;

      await setChallengeLocation(testChallengeId, lat, lng);

      const location = await getChallengeLocation(testChallengeId);
      expect(location).not.toBeNull();
      expect(location?.lat).toBeCloseTo(lat, 4);
      expect(location?.lng).toBeCloseTo(lng, 4);
    });

    it("should set and retrieve an institution location using ST_SetSRID(ST_MakePoint)", async () => {
      const lat = 28.6200;
      const lng = 77.2100;

      await setInstitutionLocation(testInstitutionId, lat, lng);

      const location = await getInstitutionLocation(testInstitutionId);
      expect(location).not.toBeNull();
      expect(location?.lat).toBeCloseTo(lat, 4);
      expect(location?.lng).toBeCloseTo(lng, 4);
    });

    it("should reject out-of-range latitude or longitude", async () => {
      await expect(setChallengeLocation(testChallengeId, 95.0, 77.0)).rejects.toThrow(
        "Latitude out of range [-90, 90]"
      );
      await expect(setChallengeLocation(testChallengeId, 28.0, 190.0)).rejects.toThrow(
        "Longitude out of range [-180, 180]"
      );
    });

    it("should reject non-existent entity IDs", async () => {
      const nonExistentUuid = "00000000-0000-0000-0000-000000000000";
      await expect(setChallengeLocation(nonExistentUuid, 28.0, 77.0)).rejects.toThrow(
        "Challenge not found"
      );
    });
  });

  describe("Spatial District Containment & Nearest-Centroid Fallback", () => {
    it("should find district by coordinates using ST_Contains when point is inside boundary", async () => {
      // Point inside Delhi district boundary [77.20, 28.60] to [77.24, 28.64]
      const insideDelhi = await findDistrictByCoordinates(28.62, 77.22);
      expect(insideDelhi).not.toBeNull();
      expect(insideDelhi?.id).toBe(testDistrictDelhiId);
      expect(insideDelhi?.matchedBy).toBe("contains");

      // Point inside Bengaluru district boundary [77.55, 12.94] to [77.65, 13.00]
      const insideBlr = await findDistrictByCoordinates(12.97, 77.60);
      expect(insideBlr).not.toBeNull();
      expect(insideBlr?.id).toBe(testDistrictBlrId);
      expect(insideBlr?.matchedBy).toBe("contains");
    });

    it("should fallback to nearest centroid (<->) when point is outside all district boundaries", async () => {
      // Coordinates outside all boundaries but geographically closer to Delhi (77.22, 28.62) than Bengaluru
      // Point: (lat: 29.5, lng: 77.5) in northern India
      const nearestDelhi = await findDistrictByCoordinates(29.5, 77.5);
      expect(nearestDelhi).not.toBeNull();
      expect(nearestDelhi?.id).toBe(testDistrictDelhiId);
      expect(nearestDelhi?.matchedBy).toBe("nearest_centroid");

      // Point closer to Bengaluru (77.60, 12.97) than Delhi
      // Point: (lat: 12.0, lng: 77.0) in southern India
      const nearestBlr = await findDistrictByCoordinates(12.0, 77.0);
      expect(nearestBlr).not.toBeNull();
      expect(nearestBlr?.id).toBe(testDistrictBlrId);
      expect(nearestBlr?.matchedBy).toBe("nearest_centroid");
    });
  });

  describe("Audit Log Helper", () => {
    it("should record parameterized audit log without SQL injection risk", async () => {
      const auditEntry = await recordAuditLog({
        actorId: testUserId,
        action: "UPDATE_CHALLENGE_COORDINATES",
        entityType: "CHALLENGE",
        entityId: testChallengeId,
        metadata: {
          lat: 28.6139,
          lng: 77.2167,
          updatedBy: "vitest_suite",
        },
        ipAddress: "192.168.1.100",
        userAgent: "vitest-agent/1.0",
      });

      expect(auditEntry).toBeDefined();
      expect(auditEntry.id).toBeDefined();
      expect(auditEntry.action).toBe("UPDATE_CHALLENGE_COORDINATES");
      expect(auditEntry.entityType).toBe("CHALLENGE");
      expect(auditEntry.entityId).toBe(testChallengeId);
      expect(auditEntry.userId).toBe(testUserId);
      expect(auditEntry.ipAddress).toBe("192.168.1.100");

      // Verify persistence in database
      const persisted = await prisma.auditLog.findUnique({
        where: { id: auditEntry.id },
      });
      expect(persisted).not.toBeNull();
      expect(persisted?.action).toBe("UPDATE_CHALLENGE_COORDINATES");
    });

    it("should reject empty action or entityType", async () => {
      await expect(
        recordAuditLog({
          actorId: testUserId,
          action: "",
          entityType: "CHALLENGE",
          entityId: testChallengeId,
        })
      ).rejects.toThrow("Audit log action must be a non-empty string");

      await expect(
        recordAuditLog({
          actorId: testUserId,
          action: "TEST_ACTION",
          entityType: "",
          entityId: testChallengeId,
        })
      ).rejects.toThrow("Audit log entityType must be a non-empty string");
    });
  });

  describe("District Innovation Density Aggregation", () => {
    it("should return district innovation density aggregation including spatial counts", async () => {
      const densities = await getDistrictInnovationDensity();

      expect(Array.isArray(densities)).toBe(true);
      expect(densities.length).toBeGreaterThanOrEqual(2);

      const delhiDensity = densities.find((d) => d.code === `${TEST_PREFIX}_DEL`);
      expect(delhiDensity).toBeDefined();
      expect(delhiDensity?.name).toContain("Central Delhi");
      expect(typeof delhiDensity?.activeChallengesCount).toBe("number");
      expect(typeof delhiDensity?.matchedProjectsCount).toBe("number");
      expect(typeof delhiDensity?.fundedPrototypesCount).toBe("number");
      expect(typeof delhiDensity?.patentsCount).toBe("number");
      expect(delhiDensity?.activeChallengesCount).toBeGreaterThanOrEqual(1);
    });
  });
});
