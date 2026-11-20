import { Prisma } from "@prisma/client";
import { prisma } from "./index.js";
import type { PrismaDbClient } from "./spatial.js";

// ============================================================================
// Types & Contracts for Analytics
// ============================================================================

export interface SpatialAnalyticsFilters {
  domain?: string | null;
  phase?: string | null;
  tier?: string | null;
}

export interface DistrictSpatialAggregate {
  id: string;
  code: string;
  name: string;
  state: string;
  boundary: Record<string, unknown> | null;
  centroid: Record<string, unknown> | null;
  challengeCount: number;
  activeProjectCount: number;
  fundedPrototypeCount: number;
  heiCount: number;
  topInstitution: string | null;
}

export interface GeoJsonDistrictFeature {
  type: "Feature";
  id: string;
  geometry: Record<string, unknown> | null;
  properties: {
    id: string;
    code: string;
    name: string;
    state: string;
    centroid: Record<string, unknown> | null;
    challengeCount: number;
    activeProjectCount: number;
    fundedPrototypeCount: number;
    heiCount: number;
    topInstitution: string | null;
  };
}

export interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  success: boolean;
  features: GeoJsonDistrictFeature[];
  metadata?: {
    totalDistricts: number;
    filters: SpatialAnalyticsFilters;
    generatedAt: string;
  };
}

export interface DashboardKpis {
  activeCivicChallenges: number;
  industryFundedPrototypes: number;
  patentsAndIpGenerated: number;
  deduplicatedSubmissionsCount: number;
  tier2And3SharePercent: number;
}

export interface RecentCapabilityMatch {
  challengeId?: string;
  projectId?: string | null;
  challengeTitle: string;
  assignedInstitution: string;
  institutionTier: string;
  statusLabel: string;
  matchScore: number;
}

export interface InstitutionUtilization {
  id: string;
  name: string;
  code: string;
  tier: string;
  districtName: string;
  activeProjects: number;
  maxCapacity: number;
  availableCapacity: number;
  utilizationPercent: number;
}

export interface DashboardAnalyticsResult {
  kpis: DashboardKpis;
  recentCapabilityMatches: RecentCapabilityMatch[];
  institutionUtilization: InstitutionUtilization[];
  activeCivicChallenges: number;
  industryFundedPrototypes: number;
  patentsAndIpGenerated: number;
  deduplicatedSubmissionsCount: number;
  tier2And3SharePercent: number;
}

// ============================================================================
// Spatial District Innovation Density Aggregation (PostGIS)
// ============================================================================

export async function getSpatialDistrictAnalytics(
  filters: SpatialAnalyticsFilters = {},
  db: PrismaDbClient = prisma
): Promise<GeoJsonFeatureCollection> {
  const { domain, phase, tier } = filters;

  const challengeDomainFilter = domain
    ? Prisma.sql`AND (c.domain ILIKE ${'%' + domain + '%'} OR c.category ILIKE ${'%' + domain + '%'})`
    : Prisma.empty;

  const heiTierFilter = tier
    ? Prisma.sql`AND inst.tier = ${tier}::institution_tiers`
    : Prisma.empty;

  const projectPhaseFilter = phase
    ? Prisma.sql`AND p.current_phase = ${phase}::project_phases`
    : Prisma.empty;

  const projectTierFilter = tier
    ? Prisma.sql`AND inst.tier = ${tier}::institution_tiers`
    : Prisma.empty;

  const projectDomainFilter = domain
    ? Prisma.sql`AND (c.domain ILIKE ${'%' + domain + '%'} OR c.category ILIKE ${'%' + domain + '%'} OR ${domain} = ANY(inst.domains) OR EXISTS (SELECT 1 FROM unnest(inst.domains) dmn WHERE dmn ILIKE ${'%' + domain + '%'}))`
    : Prisma.empty;

  const rows = await db.$queryRaw<DistrictSpatialAggregate[]>(
    Prisma.sql`
      WITH district_challenges AS (
        SELECT 
          d.id AS district_id,
          COUNT(c.id)::int AS challenge_count
        FROM districts d
        LEFT JOIN challenges c ON (
          c.district_id = d.id 
          OR (c.location IS NOT NULL AND ST_Contains(d.boundary, c.location))
        ) AND c.status IN ('OPEN', 'UNDER_REVIEW', 'MATCHED', 'IN_PROGRESS', 'IN_PROJECT')
          AND c.canonical_id IS NULL
          ${challengeDomainFilter}
        GROUP BY d.id
      ),
      district_heis AS (
        SELECT
          d.id AS district_id,
          COUNT(DISTINCT inst.id)::int AS hei_count
        FROM districts d
        LEFT JOIN institutions inst ON (
          inst.district_id = d.id
          OR (inst.location IS NOT NULL AND ST_Contains(d.boundary, inst.location))
        ) AND inst.verification_status != 'REJECTED'
          ${heiTierFilter}
        GROUP BY d.id
      ),
      district_top_hei AS (
        SELECT DISTINCT ON (d.id)
          d.id AS district_id,
          inst.name AS top_institution
        FROM districts d
        JOIN institutions inst ON (
          inst.district_id = d.id
          OR (inst.location IS NOT NULL AND ST_Contains(d.boundary, inst.location))
        ) AND inst.verification_status != 'REJECTED'
          ${heiTierFilter}
        ORDER BY d.id, inst.active_projects DESC, inst.max_capacity DESC, inst.name ASC
      ),
      district_projects AS (
        SELECT
          d.id AS district_id,
          COUNT(DISTINCT p.id)::int AS active_project_count,
          COUNT(DISTINCT p.id) FILTER (
            WHERE p.current_phase IN ('PROTOTYPING', 'FIELD_TEST', 'IP_TECH_TRANSFER')
              AND (
                p.budget > 0
                OR p.funding_status IN ('CSR_FUNDED', 'CSR_PLEDGED', 'INDUSTRY_FUNDED')
                OR EXISTS (
                  SELECT 1 FROM csr_ledger_entries cle
                  WHERE cle.project_id = p.id AND cle.status IN ('ALLOCATED', 'DISBURSED', 'VERIFIED')
                )
              )
          )::int AS funded_prototype_count
        FROM districts d
        LEFT JOIN institutions inst ON (
          inst.district_id = d.id
          OR (inst.location IS NOT NULL AND ST_Contains(d.boundary, inst.location))
        ) ${projectTierFilter}
        LEFT JOIN projects p ON p.institution_id = inst.id ${projectPhaseFilter}
        LEFT JOIN challenges c ON c.id = p.challenge_id
        WHERE 1=1 ${projectDomainFilter}
        GROUP BY d.id
      )
      SELECT
        d.id,
        d.code,
        d.name,
        d.state,
        ST_AsGeoJSON(d.boundary)::json AS boundary,
        ST_AsGeoJSON(d.centroid)::json AS centroid,
        COALESCE(dc.challenge_count, 0)::int AS "challengeCount",
        COALESCE(dp.active_project_count, 0)::int AS "activeProjectCount",
        COALESCE(dp.funded_prototype_count, 0)::int AS "fundedPrototypeCount",
        COALESCE(dh.hei_count, 0)::int AS "heiCount",
        dth.top_institution AS "topInstitution"
      FROM districts d
      LEFT JOIN district_challenges dc ON dc.district_id = d.id
      LEFT JOIN district_heis dh ON dh.district_id = d.id
      LEFT JOIN district_top_hei dth ON dth.district_id = d.id
      LEFT JOIN district_projects dp ON dp.district_id = d.id
      WHERE d.boundary IS NOT NULL
      ORDER BY d.name ASC;
    `
  );

  const features: GeoJsonDistrictFeature[] = rows.map((row) => ({
    type: "Feature",
    id: row.id,
    geometry: row.boundary,
    properties: {
      id: row.id,
      code: row.code,
      name: row.name,
      state: row.state,
      centroid: row.centroid,
      challengeCount: Number(row.challengeCount),
      activeProjectCount: Number(row.activeProjectCount),
      fundedPrototypeCount: Number(row.fundedPrototypeCount),
      heiCount: Number(row.heiCount),
      topInstitution: row.topInstitution ?? null,
    },
  }));

  return {
    type: "FeatureCollection",
    success: true,
    features,
    metadata: {
      totalDistricts: features.length,
      filters: {
        domain: domain ?? null,
        phase: phase ?? null,
        tier: tier ?? null,
      },
      generatedAt: new Date().toISOString(),
    },
  };
}

// ============================================================================
// Department of Higher Education Dashboard Analytics Aggregation
// ============================================================================

export async function getDashboardAnalytics(
  db: PrismaDbClient = prisma
): Promise<DashboardAnalyticsResult> {
  const [
    activeCivicChallenges,
    industryFundedPrototypes,
    patentsAndIpGenerated,
    deduplicatedSubmissionsCount,
    projectsWithTier,
    institutionActiveTiers,
    recentChallenges,
    institutions,
  ] = await Promise.all([
    // 1. activeCivicChallenges
    db.challenge.count({
      where: {
        status: { in: ["OPEN", "UNDER_REVIEW", "MATCHED", "IN_PROGRESS", "IN_PROJECT"] },
        canonicalId: null,
      },
    }),

    // 2. industryFundedPrototypes
    db.project.count({
      where: {
        currentPhase: { in: ["PROTOTYPING", "FIELD_TEST", "IP_TECH_TRANSFER"] },
        OR: [
          { budget: { gt: 0 } },
          { fundingStatus: { in: ["CSR_FUNDED", "CSR_PLEDGED", "INDUSTRY_FUNDED"] } },
          {
            csrLedgerEntries: {
              some: { status: { in: ["ALLOCATED", "DISBURSED", "VERIFIED"] } },
            },
          },
        ],
      },
    }),

    // 3. patentsAndIpGenerated
    db.project.count({
      where: {
        OR: [
          { currentPhase: "IP_TECH_TRANSFER" },
          {
            mous: {
              some: {
                ipTerms: { not: null },
              },
            },
          },
        ],
      },
    }),

    // 4. deduplicatedSubmissionsCount
    db.challenge.count({
      where: {
        OR: [
          { status: "DUPLICATE_MERGED" },
          { canonicalId: { not: null } },
        ],
      },
    }),

    // 5. Tier project breakdown for load-balancing calculation
    db.project.findMany({
      select: {
        id: true,
        institution: { select: { tier: true } },
      },
    }),

    // Fallback institution active project sums
    db.institution.findMany({
      where: { verificationStatus: { not: "REJECTED" }, activeProjects: { gt: 0 } },
      select: { tier: true, activeProjects: true },
    }),

    // 6. Recent capability matches (10 distinct matched/active challenges)
    db.challenge.findMany({
      where: {
        status: { in: ["MATCHED", "IN_PROJECT", "IN_PROGRESS", "UNDER_REVIEW", "OPEN", "COMPLETED"] },
        canonicalId: null,
      },
      include: {
        projects: {
          include: {
            institution: true,
            csrLedgerEntries: true,
          },
          take: 1,
        },
        capabilityMatches: {
          include: {
            institution: true,
          },
          orderBy: [{ matchRank: "asc" }, { similarityScore: "desc" }],
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),

    // 7. Institution utilization for bar chart visualization
    db.institution.findMany({
      where: { verificationStatus: { not: "REJECTED" } },
      select: {
        id: true,
        name: true,
        code: true,
        tier: true,
        activeProjects: true,
        maxCapacity: true,
        district: {
          select: { name: true, code: true },
        },
      },
      orderBy: [
        { tier: "asc" },
        { activeProjects: "desc" },
        { name: "asc" },
      ],
    }),
  ]);

  // Compute tier 2 & 3 share percentage
  let tier2And3SharePercent = 0;
  if (projectsWithTier.length > 0) {
    const tier23Count = projectsWithTier.filter(
      (p) => p.institution.tier === "TIER_2" || p.institution.tier === "TIER_3"
    ).length;
    tier2And3SharePercent = Math.round((tier23Count / projectsWithTier.length) * 1000) / 10;
  } else if (institutionActiveTiers.length > 0) {
    const totalActive = institutionActiveTiers.reduce((sum, i) => sum + i.activeProjects, 0);
    const tier23Active = institutionActiveTiers
      .filter((i) => i.tier === "TIER_2" || i.tier === "TIER_3")
      .reduce((sum, i) => sum + i.activeProjects, 0);
    tier2And3SharePercent = totalActive > 0 ? Math.round((tier23Active / totalActive) * 1000) / 10 : 0;
  }

  // Format recent capability matches
  const recentCapabilityMatches: RecentCapabilityMatch[] = recentChallenges.map((c) => {
    const proj = c.projects[0];
    const match = c.capabilityMatches[0];

    let assignedInstitution = "Open for Matching";
    let institutionTier = "ALL_TIERS";
    let statusLabel = "Active";
    let matchScore = 0;

    if (proj) {
      assignedInstitution = proj.institution.name;
      institutionTier = proj.institution.tier;
      if (proj.currentPhase === "PROTOTYPING") {
        statusLabel =
          proj.fundingStatus === "CSR_FUNDED" ||
          proj.csrLedgerEntries.some((e) => e.status === "VERIFIED")
            ? "Prototyping — CSR Funded"
            : "Active — Govt. Grant";
      } else if (proj.currentPhase === "POC") {
        statusLabel = "Active — Govt. Grant";
      } else if (proj.currentPhase === "FIELD_TEST") {
        statusLabel = "Field Testing";
      } else if (proj.currentPhase === "IP_TECH_TRANSFER") {
        statusLabel = "Completed";
      }

      matchScore = match
        ? Math.round(match.similarityScore <= 1 ? match.similarityScore * 100 : match.similarityScore)
        : 90;
    } else if (match) {
      assignedInstitution = match.institution.name;
      institutionTier = match.institution.tier;
      matchScore = Math.round(
        match.similarityScore <= 1 ? match.similarityScore * 100 : match.similarityScore
      );

      if (c.status === "UNDER_REVIEW") {
        statusLabel = "Under Review";
      } else if (c.status === "COMPLETED") {
        statusLabel = "Completed";
      } else if (c.status === "MATCHED") {
        statusLabel = "Active — Govt. Grant";
      } else {
        statusLabel = "Under Review";
      }
    } else {
      statusLabel = c.status === "UNDER_REVIEW" ? "Under Review" : "Open";
    }

    return {
      challengeId: c.id,
      projectId: proj?.id ?? null,
      challengeTitle: c.title,
      assignedInstitution,
      institutionTier,
      statusLabel,
      matchScore,
    };
  });

  // Format institution utilization
  const institutionUtilization: InstitutionUtilization[] = institutions.map((inst) => {
    const active = inst.activeProjects;
    const max = Math.max(1, inst.maxCapacity);
    const available = Math.max(0, max - active);
    const utilizationPercent = Math.min(100, Math.round((active / max) * 100));

    return {
      id: inst.id,
      name: inst.name,
      code: inst.code,
      tier: inst.tier,
      districtName: inst.district?.name ?? "Jharkhand",
      activeProjects: active,
      maxCapacity: inst.maxCapacity,
      availableCapacity: available,
      utilizationPercent,
    };
  });

  const kpis: DashboardKpis = {
    activeCivicChallenges,
    industryFundedPrototypes,
    patentsAndIpGenerated,
    deduplicatedSubmissionsCount,
    tier2And3SharePercent,
  };

  return {
    kpis,
    recentCapabilityMatches,
    institutionUtilization,
    activeCivicChallenges,
    industryFundedPrototypes,
    patentsAndIpGenerated,
    deduplicatedSubmissionsCount,
    tier2And3SharePercent,
  };
}
