import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuthenticatedUser } from "./auth/guards";

// ============================================================================
// Constants & MIME Types Whitelist
// ============================================================================

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const ALLOWED_PURPOSES = [
  "challenge_media",
  "milestone_artifact",
  "csr_receipt",
] as const;

export type UploadPurpose = (typeof ALLOWED_PURPOSES)[number];

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB limit
export const PRESIGNED_UPLOAD_EXPIRY_SECONDS = 300; // 5 minutes
export const PRESIGNED_VIEW_EXPIRY_SECONDS = 900; // 15 minutes

export const MIME_TO_EXTENSION: Record<AllowedMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

// ============================================================================
// Zod Request Validation Schema
// ============================================================================

export const PresignUploadRequestSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1, "fileName is required")
    .max(255, "fileName cannot exceed 255 characters"),
  contentType: z.enum(ALLOWED_MIME_TYPES, {
    errorMap: () => ({
      message: `Invalid contentType. Whitelist: ${ALLOWED_MIME_TYPES.join(", ")}`,
    }),
  }),
  fileSizeBytes: z
    .number()
    .int("fileSizeBytes must be an integer")
    .positive("fileSizeBytes must be greater than 0")
    .max(
      MAX_FILE_SIZE_BYTES,
      "fileSizeBytes exceeds maximum allowed limit of 10 MB (10485760 bytes)"
    ),
  purpose: z.enum(ALLOWED_PURPOSES, {
    errorMap: () => ({
      message: `Invalid purpose. Allowed purposes: ${ALLOWED_PURPOSES.join(", ")}`,
    }),
  }),
});

export type PresignUploadRequest = z.infer<typeof PresignUploadRequestSchema>;

// ============================================================================
// S3 Client Configuration & Singleton
// ============================================================================

export interface S3Config {
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle: boolean;
}

export function getS3Config(): S3Config {
  return {
    region: process.env.S3_REGION || "us-east-1",
    endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
    accessKeyId:
      process.env.S3_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY || "minioadmin",
    secretAccessKey:
      process.env.S3_SECRET_ACCESS_KEY ||
      process.env.S3_SECRET_KEY ||
      "minioadmin",
    bucket: process.env.S3_BUCKET || "sih26043-media",
    forcePathStyle:
      process.env.S3_FORCE_PATH_STYLE === "true" ||
      process.env.S3_FORCE_PATH_STYLE === undefined ||
      process.env.S3_FORCE_PATH_STYLE !== "false",
  };
}

let _s3Client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!_s3Client) {
    const config = getS3Config();
    _s3Client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle,
    });
  }
  return _s3Client;
}

export const s3Client = getS3Client();

// ============================================================================
// Key Sanitization & URL Generation Helpers
// ============================================================================

export function sanitizeExtension(
  fileName: string,
  contentType: AllowedMimeType
): string {
  const parts = fileName.split(".");
  if (parts.length > 1) {
    const rawExt = parts.pop()?.trim().toLowerCase() ?? "";
    const cleanExt = rawExt.replace(/[^a-z0-9]/g, "");
    if (
      contentType === "image/jpeg" &&
      (cleanExt === "jpeg" || cleanExt === "jpg")
    ) {
      return cleanExt;
    }
    if (cleanExt === MIME_TO_EXTENSION[contentType]) {
      return cleanExt;
    }
  }
  return MIME_TO_EXTENSION[contentType];
}

export function generateObjectKey(
  purpose: UploadPurpose,
  userId: string,
  fileName: string,
  contentType: AllowedMimeType
): string {
  const uuid = randomUUID();
  const ext = sanitizeExtension(fileName, contentType);
  return `${purpose}/${userId}/${uuid}.${ext}`;
}

export interface PresignedUploadOptions {
  key: string;
  contentType: AllowedMimeType;
  fileSizeBytes?: number;
  expiresInSeconds?: number;
}

export async function createPresignedUploadUrl(
  options: PresignedUploadOptions
): Promise<string> {
  const config = getS3Config();
  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: options.key,
    ContentType: options.contentType,
    ...(options.fileSizeBytes ? { ContentLength: options.fileSizeBytes } : {}),
  });

  return getSignedUrl(client, command, {
    expiresIn: options.expiresInSeconds ?? PRESIGNED_UPLOAD_EXPIRY_SECONDS,
  });
}

export interface PresignedViewOptions {
  key: string;
  expiresInSeconds?: number;
}

export async function createPresignedViewUrl(
  options: PresignedViewOptions
): Promise<string> {
  const config = getS3Config();
  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: options.key,
  });

  return getSignedUrl(client, command, {
    expiresIn: options.expiresInSeconds ?? PRESIGNED_VIEW_EXPIRY_SECONDS,
  });
}

// ============================================================================
// Key Validation & User Authorization
// ============================================================================

export type KeyValidationResult =
  | {
      valid: true;
      purpose: UploadPurpose;
      userId: string;
      fileName: string;
    }
  | {
      valid: false;
      reason: string;
    };

export function parseAndValidateKey(key: string): KeyValidationResult {
  if (!key || typeof key !== "string" || key.trim() === "") {
    return { valid: false, reason: "Key is required" };
  }

  // Reject path traversal attempts or leading/trailing slashes
  if (
    key.includes("..") ||
    key.startsWith("/") ||
    key.includes("\\") ||
    key.includes("//")
  ) {
    return {
      valid: false,
      reason: "Invalid key format: path traversal sequences are not allowed",
    };
  }

  const parts = key.split("/");
  if (parts.length !== 3) {
    return {
      valid: false,
      reason:
        "Invalid key structure. Expected format: ${purpose}/${userId}/${filename}",
    };
  }

  const [purpose, userId, fileName] = parts;

  if (!ALLOWED_PURPOSES.includes(purpose as UploadPurpose)) {
    return {
      valid: false,
      reason: `Invalid key prefix '${purpose}'. Allowed prefixes: ${ALLOWED_PURPOSES.join(", ")}`,
    };
  }

  if (!userId || userId.trim() === "") {
    return { valid: false, reason: "Key contains missing or empty userId" };
  }

  if (!fileName || fileName.trim() === "") {
    return { valid: false, reason: "Key contains missing or empty filename" };
  }

  return {
    valid: true,
    purpose: purpose as UploadPurpose,
    userId,
    fileName,
  };
}

export function canUserAccessKey(
  user: AuthenticatedUser,
  parsedKey: { purpose: UploadPurpose; userId: string }
): boolean {
  // Super admins have platform-wide access
  if (user.role === "SUPER_ADMIN") {
    return true;
  }

  // Uploader always has access to their own files
  if (user.id === parsedKey.userId) {
    return true;
  }

  switch (parsedKey.purpose) {
    case "challenge_media":
      // Challenge media is visible to all authenticated users
      return true;

    case "milestone_artifact":
      // Milestone deliverables accessible to institutional researchers/admins and industry partners
      return [
        "INSTITUTION_ADMIN",
        "HEI_ADMIN",
        "FACULTY",
        "RESEARCHER",
        "INDUSTRY_PARTNER",
        "CSR_PARTNER",
      ].includes(user.role);

    case "csr_receipt":
      // Financial receipts restricted to uploader, super admin, and CSR/industry partners
      return ["CSR_PARTNER", "INDUSTRY_PARTNER"].includes(user.role);

    default:
      return false;
  }
}
