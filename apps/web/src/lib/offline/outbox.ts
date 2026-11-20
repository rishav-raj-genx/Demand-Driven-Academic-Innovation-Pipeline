import { openDB, type IDBPDatabase } from "idb";

// ============================================================================
// Types & Contracts
// ============================================================================

export interface OutboxMediaItem {
  blob: Blob;
  name: string;
  type: string;
}

export type OutboxMediaInput = Blob | OutboxMediaItem;

export interface ChallengePayload {
  title: string;
  description: string;
  domain: string;
  urgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  latitude: number;
  longitude: number;
  mediaKeys?: string[];
  [key: string]: unknown;
}

export type OutboxItemStatus = "QUEUED" | "SYNCING" | "FAILED";

export interface OutboxChallengeItem {
  clientIdempotencyKey: string;
  payload: ChallengePayload;
  mediaFiles: OutboxMediaItem[];
  status: OutboxItemStatus;
  retryCount: number;
  lastError: string | null;
  createdAt: string;
}

export interface SyncResultItem {
  clientIdempotencyKey: string;
  success: boolean;
  challengeId?: string;
  error?: string;
}

export interface SyncOutboxResult {
  syncedCount: number;
  failedCount: number;
  results: SyncResultItem[];
}

// ============================================================================
// IndexedDB Database Configuration
// ============================================================================

export const OUTBOX_DB_NAME = "sih_outbox_db";
export const OUTBOX_STORE_NAME = "challenges";
export const OUTBOX_DB_VERSION = 1;

let _dbPromise: Promise<IDBPDatabase> | null = null;

export function getOutboxDb(): Promise<IDBPDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not supported in this environment"));
  }

  if (!_dbPromise) {
    _dbPromise = openDB(OUTBOX_DB_NAME, OUTBOX_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(OUTBOX_STORE_NAME)) {
          const store = db.createObjectStore(OUTBOX_STORE_NAME, {
            keyPath: "clientIdempotencyKey",
          });
          store.createIndex("status", "status", { unique: false });
          store.createIndex("createdAt", "createdAt", { unique: false });
        }
      },
    });
  }

  return _dbPromise;
}

export function resetOutboxDbInstance(): void {
  _dbPromise = null;
}

// ============================================================================
// Outbox Queue Operations
// ============================================================================

export function normalizeMediaInput(input: OutboxMediaInput, index: number): OutboxMediaItem {
  if (input instanceof Blob) {
    const ext = input.type === "image/jpeg" ? "jpg" : input.type === "image/png" ? "png" : "blob";
    return {
      blob: input,
      name: `attachment_${index + 1}.${ext}`,
      type: input.type || "image/png",
    };
  }
  return {
    blob: input.blob,
    name: input.name || `attachment_${index + 1}.png`,
    type: input.type || input.blob.type || "image/png",
  };
}

export async function enqueueOfflineChallenge(options: {
  payload: ChallengePayload;
  mediaFiles?: OutboxMediaInput[];
  clientIdempotencyKey?: string;
}): Promise<OutboxChallengeItem> {
  const db = await getOutboxDb();

  const key =
    options.clientIdempotencyKey ||
    (typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `offline-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);

  const normalizedMedia: OutboxMediaItem[] = (options.mediaFiles || []).map(
    (file, idx) => normalizeMediaInput(file, idx)
  );

  const item: OutboxChallengeItem = {
    clientIdempotencyKey: key,
    payload: {
      ...options.payload,
      mediaKeys: options.payload.mediaKeys || [],
    },
    mediaFiles: normalizedMedia,
    status: "QUEUED",
    retryCount: 0,
    lastError: null,
    createdAt: new Date().toISOString(),
  };

  await db.put(OUTBOX_STORE_NAME, item);
  return item;
}

export async function listPendingChallenges(): Promise<OutboxChallengeItem[]> {
  try {
    const db = await getOutboxDb();
    return await db.getAll(OUTBOX_STORE_NAME);
  } catch (err) {
    console.warn("[Outbox] Failed to list pending challenges:", err);
    return [];
  }
}

export async function getPendingCount(): Promise<number> {
  try {
    const db = await getOutboxDb();
    return await db.count(OUTBOX_STORE_NAME);
  } catch {
    return 0;
  }
}

export async function removeSyncedChallenge(clientIdempotencyKey: string): Promise<void> {
  const db = await getOutboxDb();
  await db.delete(OUTBOX_STORE_NAME, clientIdempotencyKey);
}

// ============================================================================
// Automatic & Idempotent Outbox Synchronization
// ============================================================================

export interface SyncOptions {
  fetchFn?: typeof fetch;
  isOnlineFn?: () => boolean;
  authToken?: string;
}

export async function syncOfflineOutbox(options?: SyncOptions): Promise<SyncOutboxResult> {
  const isOnline = options?.isOnlineFn
    ? options.isOnlineFn()
    : typeof navigator !== "undefined"
    ? navigator.onLine
    : true;

  if (!isOnline) {
    return { syncedCount: 0, failedCount: 0, results: [] };
  }

  const customFetch = options?.fetchFn || fetch;
  const db = await getOutboxDb();
  const allItems: OutboxChallengeItem[] = await db.getAll(OUTBOX_STORE_NAME);

  const itemsToSync = allItems.filter(
    (item) => item.status === "QUEUED" || item.status === "FAILED"
  );

  const syncResult: SyncOutboxResult = {
    syncedCount: 0,
    failedCount: 0,
    results: [],
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options?.authToken) {
    headers["Authorization"] = `Bearer ${options.authToken}`;
  }

  for (const item of itemsToSync) {
    // 1. Mark status as SYNCING
    item.status = "SYNCING";
    await db.put(OUTBOX_STORE_NAME, item);

    try {
      const uploadedMediaKeys: string[] = [];

      // 2. Upload photo blobs directly to S3/MinIO via presigned URLs
      for (const media of item.mediaFiles) {
        // Request 5-minute presigned PUT URL
        const presignRes = await customFetch("/api/v1/uploads/presign", {
          method: "POST",
          headers,
          body: JSON.stringify({
            fileName: media.name,
            contentType: media.type,
            fileSizeBytes: media.blob.size,
            purpose: "challenge_media",
          }),
        });

        if (!presignRes.ok) {
          const errBody = await presignRes.json().catch(() => ({}));
          throw new Error(
            errBody?.error?.message ||
              `Presign upload request failed with status ${presignRes.status}`
          );
        }

        const presignData = await presignRes.json();
        const { uploadUrl, key } = presignData.data;

        // Perform direct HTTP PUT of Blob to S3/MinIO
        const s3UploadRes = await customFetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": media.type,
          },
          body: media.blob,
        });

        if (!s3UploadRes.ok) {
          throw new Error(`Direct S3 blob upload failed with status ${s3UploadRes.status}`);
        }

        uploadedMediaKeys.push(key);
      }

      // 3. Post Challenge with clientIdempotencyKey to /api/v1/challenges
      const combinedMediaKeys = Array.from(
        new Set([...(item.payload.mediaKeys || []), ...uploadedMediaKeys])
      );

      const challengeRes = await customFetch("/api/v1/challenges", {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...item.payload,
          mediaKeys: combinedMediaKeys,
          clientIdempotencyKey: item.clientIdempotencyKey,
        }),
      });

      if (!challengeRes.ok) {
        const errBody = await challengeRes.json().catch(() => ({}));
        throw new Error(
          errBody?.error?.message ||
            `Challenge submission failed with status ${challengeRes.status}`
        );
      }

      const challengeData = await challengeRes.json();
      const challengeId = challengeData?.data?.id;

      // 4. On successful ingestion or idempotent return, remove synced item from outbox
      await db.delete(OUTBOX_STORE_NAME, item.clientIdempotencyKey);

      syncResult.syncedCount += 1;
      syncResult.results.push({
        clientIdempotencyKey: item.clientIdempotencyKey,
        success: true,
        challengeId,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      item.status = "FAILED";
      item.retryCount += 1;
      item.lastError = errorMessage;
      await db.put(OUTBOX_STORE_NAME, item);

      syncResult.failedCount += 1;
      syncResult.results.push({
        clientIdempotencyKey: item.clientIdempotencyKey,
        success: false,
        error: errorMessage,
      });
    }
  }

  return syncResult;
}
