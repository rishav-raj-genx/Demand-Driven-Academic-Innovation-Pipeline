import { Prisma } from "@prisma/client";
import { prisma } from "./index.js";

export type PrismaDbClient = typeof prisma | Prisma.TransactionClient;

export interface PointCoordinates {
  lat: number;
  lng: number;
}

export interface DistrictLocationResult {
  id: string;
  name: string;
  state: string;
  code: string;
  centroid: Record<string, unknown> | null;
  boundary: Record<string, unknown> | null;
  matchedBy: "contains" | "nearest_centroid";
}

export interface DistrictInnovationDensity {
  code: string;
  name: string;
  centroid: Record<string, unknown> | null;
  boundary: Record<string, unknown> | null;
  activeChallengesCount: number;
  matchedProjectsCount: number;
  fundedPrototypesCount: number;
  patentsCount: number;
}

function validateCoordinates(lat: number, lng: number): void {
  if (typeof lat !== "number" || typeof lng !== "number" || isNaN(lat) || isNaN(lng)) {
    throw new Error(`Coordinates must be valid numbers: lat=${lat}, lng=${lng}`);
  }
  if (lat < -90 || lat > 90) {
    throw new Error(`Latitude out of range [-90, 90]: ${lat}`);
  }
  if (lng < -180 || lng > 180) {
    throw new Error(`Longitude out of range [-180, 180]: ${lng}`);
  }
}

export async function setChallengeLocation(
  challengeId: string,
  lat: number,
  lng: number,
  db: PrismaDbClient = prisma
): Promise<void> {
  validateCoordinates(lat, lng);

  const affectedRows = await db.$executeRaw(
    Prisma.sql`
      UPDATE challenges
      SET location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
          updated_at = NOW()
      WHERE id = ${challengeId}::uuid;
    `
  );

  if (affectedRows === 0) {
    throw new Error(`Challenge not found with id: ${challengeId}`);
  }
}

export async function setInstitutionLocation(
  institutionId: string,
  lat: number,
  lng: number,
  db: PrismaDbClient = prisma
): Promise<void> {
  validateCoordinates(lat, lng);

  const affectedRows = await db.$executeRaw(
    Prisma.sql`
      UPDATE institutions
      SET location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
          updated_at = NOW()
      WHERE id = ${institutionId}::uuid;
    `
  );

  if (affectedRows === 0) {
    throw new Error(`Institution not found with id: ${institutionId}`);
  }
}

export async function getChallengeLocation(
  challengeId: string,
  db: PrismaDbClient = prisma
): Promise<PointCoordinates | null> {
  const rows = await db.$queryRaw<Array<{ lat: number; lng: number }>>(
    Prisma.sql`
      SELECT 
        ST_Y(location)::float8 AS lat,
        ST_X(location)::float8 AS lng
      FROM challenges
      WHERE id = ${challengeId}::uuid AND location IS NOT NULL;
    `
  );

  const record = rows[0];
  if (!record) {
    return null;
  }

  return { lat: record.lat, lng: record.lng };
}

export async function getInstitutionLocation(
  institutionId: string,
  db: PrismaDbClient = prisma
): Promise<PointCoordinates | null> {
  const rows = await db.$queryRaw<Array<{ lat: number; lng: number }>>(
    Prisma.sql`
      SELECT 
        ST_Y(location)::float8 AS lat,
        ST_X(location)::float8 AS lng
      FROM institutions
      WHERE id = ${institutionId}::uuid AND location IS NOT NULL;
    `
  );

  const record = rows[0];
  if (!record) {
    return null;
  }

  return { lat: record.lat, lng: record.lng };
}

export async function findDistrictByCoordinates(
  lat: number,
  lng: number,
  db: PrismaDbClient = prisma
): Promise<DistrictLocationResult | null> {
  validateCoordinates(lat, lng);

  // 1. Primary spatial lookup: Polygon boundary containment
  const containingDistricts = await db.$queryRaw<
    Array<{
      id: string;
      name: string;
      state: string;
      code: string;
      centroid: Record<string, unknown> | null;
      boundary: Record<string, unknown> | null;
    }>
  >(
    Prisma.sql`
      SELECT 
        id, 
        name, 
        state, 
        code,
        ST_AsGeoJSON(centroid)::json AS centroid,
        ST_AsGeoJSON(boundary)::json AS boundary
      FROM districts
      WHERE boundary IS NOT NULL
        AND ST_Contains(boundary, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
      LIMIT 1;
    `
  );

  const matchedDistrict = containingDistricts[0];
  if (matchedDistrict) {
    return {
      ...matchedDistrict,
      matchedBy: "contains",
    };
  }

  // 2. Fallback: Nearest centroid using PostGIS <-> geometry distance operator
  const fallbackDistricts = await db.$queryRaw<
    Array<{
      id: string;
      name: string;
      state: string;
      code: string;
      centroid: Record<string, unknown> | null;
      boundary: Record<string, unknown> | null;
    }>
  >(
    Prisma.sql`
      SELECT 
        id, 
        name, 
        state, 
        code,
        ST_AsGeoJSON(centroid)::json AS centroid,
        ST_AsGeoJSON(boundary)::json AS boundary
      FROM districts
      WHERE centroid IS NOT NULL
      ORDER BY centroid <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326) ASC
      LIMIT 1;
    `
  );

  const nearestDistrict = fallbackDistricts[0];
  if (nearestDistrict) {
    return {
      ...nearestDistrict,
      matchedBy: "nearest_centroid",
    };
  }

  return null;
}

export async function getDistrictInnovationDensity(
  db: PrismaDbClient = prisma
): Promise<DistrictInnovationDensity[]> {
  const rows = await db.$queryRaw<DistrictInnovationDensity[]>(
    Prisma.sql`
      WITH district_challenges AS (
        SELECT 
          d.id AS district_id,
          COUNT(c.id)::int AS active_challenges_count
        FROM districts d
        LEFT JOIN challenges c ON (
          (c.location IS NOT NULL AND ST_Contains(d.boundary, c.location))
          OR (c.location IS NULL AND c.industry_partner_id IN (
            SELECT ip.id FROM industry_partners ip WHERE ip.district_id = d.id
          ))
        ) AND c.status IN ('OPEN', 'MATCHED', 'IN_PROGRESS')
        GROUP BY d.id
      ),
      district_projects AS (
        SELECT
          inst.district_id,
          COUNT(p.id)::int AS matched_projects_count,
          COUNT(p.id) FILTER (
            WHERE p.current_phase IN ('PROTOTYPING', 'FIELD_TEST', 'IP_TECH_TRANSFER')
              AND (
                p.budget > 0 
                OR EXISTS (
                  SELECT 1 FROM csr_ledger_entries cle 
                  WHERE cle.project_id = p.id AND cle.status IN ('ALLOCATED', 'DISBURSED')
                )
              )
          )::int AS funded_prototypes_count,
          COUNT(p.id) FILTER (
            WHERE p.current_phase = 'IP_TECH_TRANSFER'
              OR EXISTS (
                SELECT 1 FROM mous m 
                WHERE m.project_id = p.id AND m.ip_terms IS NOT NULL AND m.ip_terms != ''
              )
          )::int AS patents_count
        FROM institutions inst
        JOIN projects p ON p.institution_id = inst.id
        WHERE inst.district_id IS NOT NULL
        GROUP BY inst.district_id
      )
      SELECT
        d.code,
        d.name,
        ST_AsGeoJSON(d.centroid)::json AS centroid,
        ST_AsGeoJSON(d.boundary)::json AS boundary,
        COALESCE(dc.active_challenges_count, 0)::int AS "activeChallengesCount",
        COALESCE(dp.matched_projects_count, 0)::int AS "matchedProjectsCount",
        COALESCE(dp.funded_prototypes_count, 0)::int AS "fundedPrototypesCount",
        COALESCE(dp.patents_count, 0)::int AS "patentsCount"
      FROM districts d
      LEFT JOIN district_challenges dc ON dc.district_id = d.id
      LEFT JOIN district_projects dp ON dp.district_id = d.id
      ORDER BY d.name ASC;
    `
  );

  return rows;
}
