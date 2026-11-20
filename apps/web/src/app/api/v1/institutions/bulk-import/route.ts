import { NextResponse } from "next/server";
import { prisma, InstitutionTier, VerificationStatus, setInstitutionLocation, recordAuditLog } from "@sih/db";
import { z } from "zod";
import { requireAuth, requireRoles } from "@/lib/auth/guards";
import { verificationProvider } from "@/lib/verification";
import { enqueueHeiEmbed } from "@/lib/queues";

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface RejectedRow {
  row: number;
  aisheCode: string | null;
  reason: string;
}

export interface ImportedRowResult {
  row: number;
  id: string;
  code: string;
  name: string;
  action: "IMPORTED" | "UPDATED";
}

export interface BulkImportResponseData {
  total: number;
  imported: number;
  updated: number;
  rejectedCount: number;
  rejected: RejectedRow[];
  results: ImportedRowResult[];
}

// ============================================================================
// Zod Schema for Individual Row Validation
// ============================================================================

const TierEnum = z.enum(["TIER_1", "TIER_2", "TIER_3", "UNACCREDITED"]);

const RowSchema = z.object({
  name: z
    .string({ required_error: "Name is required" })
    .trim()
    .min(3, "Name must be at least 3 characters")
    .max(255, "Name cannot exceed 255 characters"),
  aisheCode: z
    .string({ required_error: "AISHE code is required" })
    .trim()
    .regex(
      /^(?:[UCS]-[0-9]{4,6}|[UCS]-[A-Za-z0-9-]+)$/,
      "Invalid AISHE code format. Expected e.g. U-0205, C-44102, or S-12055"
    ),
  tier: TierEnum,
  districtCode: z
    .string({ required_error: "District code is required" })
    .trim()
    .min(1, "District code cannot be empty"),
  latitude: z.coerce
    .number({ required_error: "Latitude is required" })
    .min(-90, "Latitude must be between -90 and 90")
    .max(90, "Latitude must be between -90 and 90"),
  longitude: z.coerce
    .number({ required_error: "Longitude is required" })
    .min(-180, "Longitude must be between -180 and 180")
    .max(180, "Longitude must be between -180 and 180"),
  maxCapacity: z.coerce
    .number()
    .int("Max capacity must be an integer")
    .min(1, "Max capacity must be at least 1")
    .max(50, "Max capacity cannot exceed 50")
    .default(10),
  domains: z
    .array(z.string().trim().min(1, "Domain name cannot be empty"))
    .min(1, "At least one capability domain is required"),
  facultySpecializations: z
    .array(z.string().trim().min(1, "Specialization cannot be empty"))
    .default([]),
  labFacilities: z
    .array(z.string().trim().min(1, "Lab facility cannot be empty"))
    .default([]),
  profileSummary: z
    .string()
    .trim()
    .max(2000, "Profile summary cannot exceed 2000 characters")
    .optional()
    .nullable(),
});

// ============================================================================
// Helper: Parse Array Fields (supports semicolon, pipe, comma, JSON array)
// ============================================================================

function parseArrayField(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0);
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .map((item) => String(item).trim())
            .filter((item) => item.length > 0);
        }
      } catch {
        // Delimiter fallback
      }
    }

    if (trimmed.includes(";")) {
      return trimmed
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
    if (trimmed.includes("|")) {
      return trimmed
        .split("|")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
    return trimmed
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

// ============================================================================
// Helper: Parse CSV Text to Object Records
// ============================================================================

function parseCsvToRecords(csvText: string): Record<string, unknown>[] {
  const lines: string[] = [];
  let currentLine = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentLine += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i++; // skip \r\n
      }
      if (currentLine.trim().length > 0) {
        lines.push(currentLine);
      }
      currentLine = "";
    } else {
      currentLine += char;
    }
  }

  if (currentLine.trim().length > 0) {
    lines.push(currentLine);
  }

  if (lines.length < 2) {
    return [];
  }

  // Parse header line
  const rawHeaders = parseCsvLine(lines[0]);
  const headerMap: Record<number, string> = {};

  rawHeaders.forEach((h, idx) => {
    const normalized = h.trim().toLowerCase().replace(/[\s_-]/g, "");
    if (normalized === "name" || normalized === "institutionname") headerMap[idx] = "name";
    else if (normalized === "aishecode" || normalized === "code") headerMap[idx] = "aisheCode";
    else if (normalized === "tier") headerMap[idx] = "tier";
    else if (normalized === "districtcode" || normalized === "district") headerMap[idx] = "districtCode";
    else if (normalized === "latitude" || normalized === "lat") headerMap[idx] = "latitude";
    else if (normalized === "longitude" || normalized === "lng" || normalized === "long") headerMap[idx] = "longitude";
    else if (normalized === "maxcapacity" || normalized === "capacity") headerMap[idx] = "maxCapacity";
    else if (normalized === "domains" || normalized === "domain") headerMap[idx] = "domains";
    else if (
      normalized === "facultyspecializations" ||
      normalized === "facultyspecialization" ||
      normalized === "specializations"
    ) {
      headerMap[idx] = "facultySpecializations";
    } else if (
      normalized === "labfacilities" ||
      normalized === "labfacility" ||
      normalized === "labs"
    ) {
      headerMap[idx] = "labFacilities";
    } else if (
      normalized === "profilesummary" ||
      normalized === "summary" ||
      normalized === "description"
    ) {
      headerMap[idx] = "profileSummary";
    }
  });

  const records: Record<string, unknown>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const lineValues = parseCsvLine(lines[i]);
    const record: Record<string, unknown> = {};

    lineValues.forEach((val, idx) => {
      const fieldKey = headerMap[idx];
      if (fieldKey) {
        record[fieldKey] = val.trim();
      }
    });

    if (Object.keys(record).length > 0) {
      records.push(record);
    }
  }

  return records;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      fields.push(currentField);
      currentField = "";
    } else {
      currentField += char;
    }
  }

  fields.push(currentField);
  return fields;
}

// ============================================================================
// Helper: Extract Rows from Incoming Request (JSON, Multipart, CSV)
// ============================================================================

async function extractPayloadRows(req: Request): Promise<Record<string, unknown>[]> {
  const contentType = (req.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file") || formData.get("csv");
    if (!file || typeof file === "string") {
      throw new Error("No CSV file uploaded under 'file' form field");
    }
    const text = await (file as File).text();
    return parseCsvToRecords(text);
  }

  if (contentType.includes("application/json")) {
    const body = await req.json();
    if (Array.isArray(body)) {
      return body as Record<string, unknown>[];
    }
    if (body && typeof body === "object") {
      const candidate = body.institutions || body.data || body.rows;
      if (Array.isArray(candidate)) {
        return candidate as Record<string, unknown>[];
      }
    }
    throw new Error("Expected a JSON array or object containing { institutions: [...] }");
  }

  // Fallback: raw body text
  const rawText = await req.text();
  const trimmed = rawText.trim();

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
      if (parsed && typeof parsed === "object") {
        const candidate = parsed.institutions || parsed.data || parsed.rows;
        if (Array.isArray(candidate)) return candidate as Record<string, unknown>[];
      }
    } catch {
      // not json, attempt CSV
    }
  }

  return parseCsvToRecords(rawText);
}

// ============================================================================
// POST /api/v1/institutions/bulk-import
// ============================================================================

export async function POST(req: Request): Promise<NextResponse> {
  const ipAddress = req.headers.get("x-forwarded-for") ?? "127.0.0.1";
  const userAgent = req.headers.get("user-agent") ?? null;

  // 1. Authentication & Role-Based Access Control
  const authResult = await requireAuth(req);
  if (!authResult.success) {
    return authResult.response;
  }

  const roleCheck = requireRoles(authResult.user, ["GOVT_OFFICIAL", "SUPER_ADMIN"]);
  if (!roleCheck.success) {
    return roleCheck.response;
  }

  // 2. Extract & Parse Rows
  let rawRows: Record<string, unknown>[];
  try {
    rawRows = await extractPayloadRows(req);
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_IMPORT_PAYLOAD",
          message: err instanceof Error ? err.message : "Failed to parse import payload",
        },
      },
      { status: 400 }
    );
  }

  if (rawRows.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "EMPTY_IMPORT_BATCH",
          message: "No institution records found in payload",
        },
      },
      { status: 400 }
    );
  }

  if (rawRows.length > 200) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "BATCH_SIZE_EXCEEDED",
          message: `Batch size (${rawRows.length}) exceeds maximum limit of 200 institutions per import`,
        },
      },
      { status: 400 }
    );
  }

  // 3. Pre-fetch Registered Districts
  const districts = await prisma.district.findMany({
    select: { id: true, code: true, name: true },
  });
  const districtMap = new Map<string, { id: string; code: string; name: string }>();
  for (const d of districts) {
    districtMap.set(d.code.trim().toUpperCase(), d);
  }

  let importedCount = 0;
  let updatedCount = 0;
  const rejected: RejectedRow[] = [];
  const results: ImportedRowResult[] = [];

  // 4. Process Each Row with Error Isolation
  for (let i = 0; i < rawRows.length; i++) {
    const rowNumber = i + 1;
    const raw = rawRows[i];

    // Normalize raw fields for Zod
    const normalizedRow: Record<string, unknown> = {
      name: raw.name,
      aisheCode: typeof raw.aisheCode === "string" ? raw.aisheCode.trim().toUpperCase() : raw.aisheCode,
      tier:
        typeof raw.tier === "string"
          ? raw.tier.trim().toUpperCase().replace(/[\s-]/g, "_")
          : raw.tier,
      districtCode:
        typeof raw.districtCode === "string" ? raw.districtCode.trim().toUpperCase() : raw.districtCode,
      latitude: raw.latitude,
      longitude: raw.longitude,
      maxCapacity: raw.maxCapacity !== undefined && raw.maxCapacity !== "" ? raw.maxCapacity : 10,
      domains: parseArrayField(raw.domains),
      facultySpecializations: parseArrayField(raw.facultySpecializations),
      labFacilities: parseArrayField(raw.labFacilities),
      profileSummary: raw.profileSummary ? String(raw.profileSummary).trim() : null,
    };

    const aisheCodeCandidate =
      typeof normalizedRow.aisheCode === "string" ? normalizedRow.aisheCode : null;

    // Step A: Zod Schema Validation
    const validation = RowSchema.safeParse(normalizedRow);
    if (!validation.success) {
      const errorMsg = validation.error.errors
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join("; ");
      rejected.push({
        row: rowNumber,
        aisheCode: aisheCodeCandidate,
        reason: errorMsg,
      });
      continue;
    }

    const validData = validation.data;

    // Step B: Controlled Mock AISHE Check
    const aisheResult = await verificationProvider.verifyAisheCode(validData.aisheCode);
    if (!aisheResult.verified) {
      rejected.push({
        row: rowNumber,
        aisheCode: validData.aisheCode,
        reason: `AISHE verification rejected: ${aisheResult.message}`,
      });
      continue;
    }

    // Step C: District Resolution
    const district = districtMap.get(validData.districtCode);
    if (!district) {
      rejected.push({
        row: rowNumber,
        aisheCode: validData.aisheCode,
        reason: `District code '${validData.districtCode}' not found in registered districts`,
      });
      continue;
    }

    // Step D: Postgres Upsert & PostGIS Coordinates
    try {
      const existing = await prisma.institution.findUnique({
        where: { code: validData.aisheCode },
      });

      let institutionId: string;
      let action: "IMPORTED" | "UPDATED";

      if (existing) {
        const updated = await prisma.institution.update({
          where: { id: existing.id },
          data: {
            name: validData.name,
            tier: validData.tier as InstitutionTier,
            districtId: district.id,
            maxCapacity: validData.maxCapacity,
            domains: validData.domains,
            facultySpecializations: validData.facultySpecializations,
            labFacilities: validData.labFacilities,
            profileSummary: validData.profileSummary ?? null,
            verificationStatus: VerificationStatus.VERIFIED,
          },
        });
        institutionId = updated.id;
        action = "UPDATED";
        updatedCount++;
      } else {
        const created = await prisma.institution.create({
          data: {
            name: validData.name,
            code: validData.aisheCode,
            tier: validData.tier as InstitutionTier,
            districtId: district.id,
            maxCapacity: validData.maxCapacity,
            domains: validData.domains,
            facultySpecializations: validData.facultySpecializations,
            labFacilities: validData.labFacilities,
            profileSummary: validData.profileSummary ?? null,
            verificationStatus: VerificationStatus.VERIFIED,
          },
        });
        institutionId = created.id;
        action = "IMPORTED";
        importedCount++;
      }

      // Update PostGIS location coordinates
      await setInstitutionLocation(institutionId, validData.latitude, validData.longitude);

      // Step E: Enqueue BullMQ hei.embed Re-Embedding Job
      await enqueueHeiEmbed({
        institutionId,
        domains: validData.domains,
        facultySpecializations: validData.facultySpecializations,
        labFacilities: validData.labFacilities,
        profileSummary: validData.profileSummary ?? undefined,
      });

      results.push({
        row: rowNumber,
        id: institutionId,
        code: validData.aisheCode,
        name: validData.name,
        action,
      });
    } catch (dbErr) {
      rejected.push({
        row: rowNumber,
        aisheCode: validData.aisheCode,
        reason: `Database error during persistence: ${
          dbErr instanceof Error ? dbErr.message : "Unknown error"
        }`,
      });
    }
  }

  // 5. Audit Logging
  await recordAuditLog({
    actorId: authResult.user.id,
    action: "INSTITUTIONS_BULK_IMPORTED",
    entityType: "Institution",
    entityId: "bulk-import-batch",
    metadata: {
      total: rawRows.length,
      imported: importedCount,
      updated: updatedCount,
      rejectedCount: rejected.length,
    },
    ipAddress,
    userAgent,
  });

  const responseData: BulkImportResponseData = {
    total: rawRows.length,
    imported: importedCount,
    updated: updatedCount,
    rejectedCount: rejected.length,
    rejected,
    results,
  };

  return NextResponse.json({
    success: true,
    data: responseData,
    imported: importedCount,
    updated: updatedCount,
    rejected,
  });
}
