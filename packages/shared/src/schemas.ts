import { z } from "zod";
import {
  UserRole,
  InstitutionTier,
  VerificationStatus,
  ChallengeStatus,
  ProjectPhase,
  ApprovalDecision,
  CsrEntryStatus,
} from "./enums.js";

// ============================================================================
// Enum Zod Schemas
// ============================================================================
export const userRoleSchema = z.nativeEnum(UserRole);
export const institutionTierSchema = z.nativeEnum(InstitutionTier);
export const verificationStatusSchema = z.nativeEnum(VerificationStatus);
export const challengeStatusSchema = z.nativeEnum(ChallengeStatus);
export const projectPhaseSchema = z.nativeEnum(ProjectPhase);
export const approvalDecisionSchema = z.nativeEnum(ApprovalDecision);
export const csrEntryStatusSchema = z.nativeEnum(CsrEntryStatus);

// ============================================================================
// Pagination Schemas & Types
// ============================================================================
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const paginationMetaSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
  hasNextPage: z.boolean(),
  hasPrevPage: z.boolean(),
});
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

// ============================================================================
// Coordinate Validation (lat [-90, 90], lng [-180, 180])
// ============================================================================
export const coordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type Coordinates = z.infer<typeof coordinatesSchema>;

// ============================================================================
// API Response Envelope Contracts & Schemas
// ============================================================================
export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta | Record<string, unknown>;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export const apiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export const createApiSuccessSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: z.union([paginationMetaSchema, z.record(z.string(), z.unknown())]).optional(),
  });

export function createApiSuccess<T>(
  data: T,
  meta?: PaginationMeta | Record<string, unknown>
): ApiSuccess<T> {
  return {
    success: true,
    data,
    ...(meta ? { meta } : {}),
  };
}

export function createApiError(
  code: string,
  message: string,
  details?: unknown
): ApiError {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
}
