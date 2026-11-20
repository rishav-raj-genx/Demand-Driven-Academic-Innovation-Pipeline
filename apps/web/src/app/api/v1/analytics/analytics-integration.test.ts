import { describe, it, expect, beforeAll } from "vitest";
import { GET as spatialHandler } from "./spatial/route";
import { GET as dashboardHandler } from "./dashboard/route";
import { prisma } from "@sih/db";

describe("Department of Higher Education Analytics & PostGIS Spatial Integration Suite", () => {
  beforeAll(async () => {
    // Verify database connection and seeded districts
    const districtCount = await prisma.district.count();
    expect(districtCount).toBeGreaterThanOrEqual(8);
  });

  // ==========================================================================
  // 1. PostGIS Spatial Analytics (GET /api/v1/analytics/spatial)
  // ==========================================================================
  describe("GET /api/v1/analytics/spatial", () => {
    it("returns valid RFC 7946 GeoJSON FeatureCollection with 8 Jharkhand districts", async () => {
      // Warm-up query to eliminate connection pool spinup variance under parallel test execution
      await spatialHandler(new Request("http://localhost:3000/api/v1/analytics/spatial"));

      const start = performance.now();
      const req = new Request("http://localhost:3000/api/v1/analytics/spatial");
      const res = await spatialHandler(req);
      const executionTime = performance.now() - start;

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/geo+json");

      const json = await res.json();
      expect(json.type).toBe("FeatureCollection");
      expect(json.success).toBe(true);
      expect(Array.isArray(json.features)).toBe(true);
      expect(json.features.length).toBeGreaterThanOrEqual(8);

      // Verify RFC 7946 GeoJSON structure and PostGIS attributes
      for (const feature of json.features) {
        expect(feature.type).toBe("Feature");
        expect(typeof feature.id).toBe("string");
        expect(feature.geometry).toBeDefined();
        expect(feature.geometry.type).toBe("MultiPolygon");
        expect(Array.isArray(feature.geometry.coordinates)).toBe(true);

        const props = feature.properties;
        expect(typeof props.id).toBe("string");
        expect(typeof props.code).toBe("string");
        expect(typeof props.name).toBe("string");
        expect(props.state).toBe("Jharkhand");

        // Centroid Point geometry
        expect(props.centroid).toBeDefined();
        expect(props.centroid.type).toBe("Point");
        expect(Array.isArray(props.centroid.coordinates)).toBe(true);
        expect(props.centroid.coordinates).toHaveLength(2);

        // Required analytics metrics
        expect(typeof props.challengeCount).toBe("number");
        expect(typeof props.activeProjectCount).toBe("number");
        expect(typeof props.fundedPrototypeCount).toBe("number");
        expect(typeof props.heiCount).toBe("number");
        expect(props.topInstitution === null || typeof props.topInstitution === "string").toBe(true);
      }

      // Acceptance Criteria 2: Query execution time < 150ms
      expect(executionTime).toBeLessThan(150);
    });

    it("accurately reports seeded district counts (Ranchi, East Singhbhum, Dhanbad)", async () => {
      const req = new Request("http://localhost:3000/api/v1/analytics/spatial");
      const res = await spatialHandler(req);
      const json = await res.json();

      const ranchi = json.features.find((f: { properties: { code: string } }) => f.properties.code === "JH_RAN");
      expect(ranchi).toBeDefined();
      expect(ranchi.properties.name).toBe("Ranchi");
      expect(ranchi.properties.challengeCount).toBeGreaterThan(0);
      expect(ranchi.properties.activeProjectCount).toBeGreaterThanOrEqual(1);
      expect(ranchi.properties.heiCount).toBeGreaterThanOrEqual(3);
      expect(ranchi.properties.topInstitution).toBe("Birla Institute of Technology Mesra");

      const eastSinghbhum = json.features.find((f: { properties: { code: string } }) => f.properties.code === "JH_ESN");
      expect(eastSinghbhum).toBeDefined();
      expect(eastSinghbhum.properties.name).toBe("East Singhbhum");
      expect(eastSinghbhum.properties.challengeCount).toBeGreaterThan(0);
      expect(eastSinghbhum.properties.activeProjectCount).toBeGreaterThanOrEqual(1);
      expect(eastSinghbhum.properties.fundedPrototypeCount).toBeGreaterThanOrEqual(1);
      expect(eastSinghbhum.properties.topInstitution).toBe("National Institute of Technology Jamshedpur");

      const dhanbad = json.features.find((f: { properties: { code: string } }) => f.properties.code === "JH_DHN");
      expect(dhanbad).toBeDefined();
      expect(dhanbad.properties.name).toBe("Dhanbad");
      expect(dhanbad.properties.heiCount).toBeGreaterThanOrEqual(1);
      expect(dhanbad.properties.topInstitution).toBe("Birsa Institute of Technology Sindri");
    });

    it("filters spatial aggregates by institution tier (tier=TIER_1)", async () => {
      const req = new Request("http://localhost:3000/api/v1/analytics/spatial?tier=TIER_1");
      const res = await spatialHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      const ranchi = json.features.find((f: { properties: { code: string } }) => f.properties.code === "JH_RAN");
      expect(ranchi).toBeDefined();
      // Only Tier-1 HEIs in Ranchi
      expect(ranchi.properties.topInstitution).toBe("Birla Institute of Technology Mesra");

      // Dhanbad only has BIT Sindri (Tier 2), so Tier 1 heiCount should be 0 and topInstitution null
      const dhanbad = json.features.find((f: { properties: { code: string } }) => f.properties.code === "JH_DHN");
      expect(dhanbad).toBeDefined();
      expect(dhanbad.properties.heiCount).toBe(0);
      expect(dhanbad.properties.topInstitution).toBeNull();
    });

    it("filters spatial aggregates by project phase (phase=PROTOTYPING)", async () => {
      const req = new Request("http://localhost:3000/api/v1/analytics/spatial?phase=PROTOTYPING");
      const res = await spatialHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      const eastSinghbhum = json.features.find((f: { properties: { code: string } }) => f.properties.code === "JH_ESN");
      expect(eastSinghbhum).toBeDefined();
      // Seeded Prototyping project is in East Singhbhum (NIT Jamshedpur)
      expect(eastSinghbhum.properties.activeProjectCount).toBeGreaterThanOrEqual(1);
    });

    it("filters spatial aggregates by domain (domain=Water)", async () => {
      const req = new Request("http://localhost:3000/api/v1/analytics/spatial?domain=Water");
      const res = await spatialHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.features.length).toBeGreaterThanOrEqual(8);
      // Palamu has defluoridation water challenges
      const palamu = json.features.find((f: { properties: { code: string } }) => f.properties.code === "JH_PAL");
      expect(palamu).toBeDefined();
      expect(palamu.properties.challengeCount).toBeGreaterThanOrEqual(1);
    });

    it("rejects invalid filter query parameters with 400 Bad Request", async () => {
      const badPhaseReq = new Request("http://localhost:3000/api/v1/analytics/spatial?phase=INVALID_PHASE");
      const badPhaseRes = await spatialHandler(badPhaseReq);
      expect(badPhaseRes.status).toBe(400);
      const badPhaseJson = await badPhaseRes.json();
      expect(badPhaseJson.error.code).toBe("INVALID_FILTER");

      const badTierReq = new Request("http://localhost:3000/api/v1/analytics/spatial?tier=TIER_99");
      const badTierRes = await spatialHandler(badTierReq);
      expect(badTierRes.status).toBe(400);
      const badTierJson = await badTierRes.json();
      expect(badTierJson.error.code).toBe("INVALID_FILTER");
    });
  });

  // ==========================================================================
  // 2. Department of Higher Education Dashboard (GET /api/v1/analytics/dashboard)
  // ==========================================================================
  describe("GET /api/v1/analytics/dashboard", () => {
    it("returns live database aggregates for all 5 KPI cards in < 150ms", async () => {
      const start = performance.now();
      const res = await dashboardHandler();
      const executionTime = performance.now() - start;

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toBeDefined();

      const kpis = json.data.kpis;
      expect(kpis).toBeDefined();

      // KPI 1: activeCivicChallenges
      expect(typeof kpis.activeCivicChallenges).toBe("number");
      expect(kpis.activeCivicChallenges).toBeGreaterThan(0);

      // KPI 2: industryFundedPrototypes
      expect(typeof kpis.industryFundedPrototypes).toBe("number");
      expect(kpis.industryFundedPrototypes).toBeGreaterThan(0);

      // KPI 3: patentsAndIpGenerated
      expect(typeof kpis.patentsAndIpGenerated).toBe("number");
      expect(kpis.patentsAndIpGenerated).toBeGreaterThan(0);

      // KPI 4: deduplicatedSubmissionsCount
      expect(typeof kpis.deduplicatedSubmissionsCount).toBe("number");
      expect(kpis.deduplicatedSubmissionsCount).toBeGreaterThan(0);

      // KPI 5: tier2And3SharePercent
      expect(typeof kpis.tier2And3SharePercent).toBe("number");
      expect(kpis.tier2And3SharePercent).toBeGreaterThan(0);
      expect(kpis.tier2And3SharePercent).toBeLessThanOrEqual(100);

      // Top-level KPI shortcuts
      expect(json.data.activeCivicChallenges).toBe(kpis.activeCivicChallenges);
      expect(json.data.industryFundedPrototypes).toBe(kpis.industryFundedPrototypes);
      expect(json.data.patentsAndIpGenerated).toBe(kpis.patentsAndIpGenerated);
      expect(json.data.deduplicatedSubmissionsCount).toBe(kpis.deduplicatedSubmissionsCount);
      expect(json.data.tier2And3SharePercent).toBe(kpis.tier2And3SharePercent);

      // Acceptance Criteria 2: Execution time < 150ms
      expect(executionTime).toBeLessThan(150);
    });

    it("returns recentCapabilityMatches with up to 10 entries and valid schema", async () => {
      const res = await dashboardHandler();
      const json = await res.json();

      expect(Array.isArray(json.data.recentCapabilityMatches)).toBe(true);
      expect(json.data.recentCapabilityMatches.length).toBeGreaterThan(0);
      expect(json.data.recentCapabilityMatches.length).toBeLessThanOrEqual(10);

      for (const match of json.data.recentCapabilityMatches) {
        expect(typeof match.challengeTitle).toBe("string");
        expect(match.challengeTitle.length).toBeGreaterThan(0);
        expect(typeof match.assignedInstitution).toBe("string");
        expect(typeof match.institutionTier).toBe("string");
        expect(typeof match.statusLabel).toBe("string");
        expect(typeof match.matchScore).toBe("number");
        expect(match.matchScore).toBeGreaterThanOrEqual(0);
        expect(match.matchScore).toBeLessThanOrEqual(100);
      }
    });

    it("returns institutionUtilization capacity breakdown for bar chart visualization", async () => {
      const res = await dashboardHandler();
      const json = await res.json();

      expect(Array.isArray(json.data.institutionUtilization)).toBe(true);
      expect(json.data.institutionUtilization.length).toBeGreaterThanOrEqual(8);

      for (const hei of json.data.institutionUtilization) {
        expect(typeof hei.id).toBe("string");
        expect(typeof hei.name).toBe("string");
        expect(typeof hei.code).toBe("string");
        expect(typeof hei.tier).toBe("string");
        expect(typeof hei.districtName).toBe("string");
        expect(typeof hei.activeProjects).toBe("number");
        expect(typeof hei.maxCapacity).toBe("number");
        expect(typeof hei.availableCapacity).toBe("number");
        expect(typeof hei.utilizationPercent).toBe("number");
        expect(hei.utilizationPercent).toBeGreaterThanOrEqual(0);
        expect(hei.availableCapacity).toBe(Math.max(0, hei.maxCapacity - hei.activeProjects));
      }
    });
  });
});
