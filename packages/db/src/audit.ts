import { Prisma, type AuditLog } from "@prisma/client";
import { prisma } from "./index.js";
import type { PrismaDbClient } from "./spatial.js";

export interface RecordAuditLogParams {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function recordAuditLog(
  params: RecordAuditLogParams,
  db: PrismaDbClient = prisma
): Promise<AuditLog> {
  const { actorId, action, entityType, entityId, metadata, ipAddress, userAgent } = params;

  if (!action || typeof action !== "string") {
    throw new Error("Audit log action must be a non-empty string");
  }
  if (!entityType || typeof entityType !== "string") {
    throw new Error("Audit log entityType must be a non-empty string");
  }
  if (!entityId || typeof entityId !== "string") {
    throw new Error("Audit log entityId must be a non-empty string");
  }

  // Uses parameterized Prisma query to guarantee SQL-injection safety
  return db.auditLog.create({
    data: {
      userId: actorId ?? null,
      action: action.trim(),
      entityType: entityType.trim(),
      entityId: entityId.trim(),
      metadata: metadata !== undefined && metadata !== null 
        ? (metadata as Prisma.InputJsonValue) 
        : Prisma.JsonNull,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    },
  });
}
