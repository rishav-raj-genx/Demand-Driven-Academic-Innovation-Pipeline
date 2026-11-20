import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  enqueueOfflineChallenge,
  listPendingChallenges,
  getPendingCount,
  removeSyncedChallenge,
  syncOfflineOutbox,
  resetOutboxDbInstance,
  getOutboxDb,
  OUTBOX_STORE_NAME,
  type ChallengePayload,
} from "./outbox";

describe("IndexedDB PWA Outbox Queue & Offline Synchronization Suite", () => {
  const samplePayload: ChallengePayload = {
    title: "Solar Defluoridation Unit for Palamu District",
    description:
      "Deep borewells exhibit elevated fluoride levels across 20 hamlets requiring solar adsorption units.",
    domain: "Water Filtration",
    urgency: "HIGH",
    latitude: 24.0416,
    longitude: 84.0722,
  };

  beforeEach(async () => {
    resetOutboxDbInstance();
    const db = await getOutboxDb();
    await db.clear(OUTBOX_STORE_NAME);
  });

  // ==========================================================================
  // A. Outbox Queue Operations
  // ==========================================================================

  it("1. should enqueue challenge draft with status QUEUED and normalized mediaFiles", async () => {
    const sampleBlob = new Blob(["sample png image content"], {
      type: "image/png",
    });

    const item = await enqueueOfflineChallenge({
      payload: samplePayload,
      mediaFiles: [sampleBlob],
      clientIdempotencyKey: "test-offline-uuid-1",
    });

    expect(item.clientIdempotencyKey).toBe("test-offline-uuid-1");
    expect(item.status).toBe("QUEUED");
    expect(item.retryCount).toBe(0);
    expect(item.lastError).toBeNull();
    expect(item.createdAt).toBeDefined();
    expect(item.mediaFiles.length).toBe(1);
    expect(item.mediaFiles[0].type).toBe("image/png");
    expect(item.mediaFiles[0].name).toBe("attachment_1.png");

    const pending = await listPendingChallenges();
    expect(pending.length).toBe(1);
    expect(pending[0].clientIdempotencyKey).toBe("test-offline-uuid-1");
  });

  it("2. should track pending count correctly and remove synced challenge by key", async () => {
    await enqueueOfflineChallenge({
      payload: samplePayload,
      clientIdempotencyKey: "item-to-delete-1",
    });
    await enqueueOfflineChallenge({
      payload: samplePayload,
      clientIdempotencyKey: "item-to-keep-2",
    });

    let count = await getPendingCount();
    expect(count).toBe(2);

    await removeSyncedChallenge("item-to-delete-1");

    count = await getPendingCount();
    expect(count).toBe(1);

    const pending = await listPendingChallenges();
    expect(pending[0].clientIdempotencyKey).toBe("item-to-keep-2");
  });

  // ==========================================================================
  // B. Offline Guard & Online Synchronization
  // ==========================================================================

  it("3. should skip sync when offline (isOnlineFn returns false)", async () => {
    await enqueueOfflineChallenge({
      payload: samplePayload,
      clientIdempotencyKey: "offline-item-1",
    });

    let fetchCalled = false;
    const mockFetch = (async () => {
      fetchCalled = true;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await syncOfflineOutbox({
      isOnlineFn: () => false, // Browser is offline!
      fetchFn: mockFetch,
    });

    expect(fetchCalled).toBe(false);
    expect(result.syncedCount).toBe(0);
    expect(result.failedCount).toBe(0);

    const count = await getPendingCount();
    expect(count).toBe(1);
  });

  it("4. should perform full sync flow: upload media blob via presigned URL, submit challenge, and delete from outbox", async () => {
    const sampleBlob = new Blob(["sample image bytes"], { type: "image/png" });
    const idempotencyKey = "e2e-sync-uuid-123";

    await enqueueOfflineChallenge({
      payload: samplePayload,
      mediaFiles: [sampleBlob],
      clientIdempotencyKey: idempotencyKey,
    });

    const requests: Array<{ url: string; method: string; body?: unknown }> = [];

    const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method || "GET";
      requests.push({ url, method, body: init?.body });

      // Step 1: Presign upload request
      if (url.includes("/api/v1/uploads/presign")) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              uploadUrl: "http://localhost:9000/sih26043-media/challenge_media/user/field.png",
              key: "challenge_media/user/field.png",
              expiresIn: 300,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // Step 2: S3 MinIO PUT upload
      if (url.includes("/sih26043-media/")) {
        return new Response("", { status: 200 });
      }

      // Step 3: Challenge submission
      if (url.includes("/api/v1/challenges")) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              id: "chal-created-123",
              title: samplePayload.title,
              status: "SUBMITTED",
            },
          }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response("Not found", { status: 404 });
    }) as unknown as typeof fetch;

    const result = await syncOfflineOutbox({
      isOnlineFn: () => true,
      fetchFn: mockFetch,
    });

    expect(result.syncedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].challengeId).toBe("chal-created-123");

    // Verify correct request sequence
    expect(requests.length).toBe(3);
    expect(requests[0].url).toContain("/api/v1/uploads/presign");
    expect(requests[1].url).toContain("/sih26043-media/");
    expect(requests[1].method).toBe("PUT");
    expect(requests[2].url).toContain("/api/v1/challenges");

    // Item must be removed from outbox store after successful sync
    const remaining = await listPendingChallenges();
    expect(remaining.length).toBe(0);
  });

  it("5. should handle network/server errors defensively: mark FAILED and increment retryCount without deleting draft", async () => {
    const idempotencyKey = "failing-sync-uuid-456";

    await enqueueOfflineChallenge({
      payload: samplePayload,
      clientIdempotencyKey: idempotencyKey,
    });

    const mockFetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/v1/challenges")) {
        return new Response(
          JSON.stringify({
            success: false,
            error: { code: "INTERNAL_ERROR", message: "Database temporarily busy" },
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    }) as unknown as typeof fetch;

    const result = await syncOfflineOutbox({
      isOnlineFn: () => true,
      fetchFn: mockFetch,
    });

    expect(result.syncedCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain("Database temporarily busy");

    // Draft must be preserved in IndexedDB with FAILED status and incremented retryCount
    const pending = await listPendingChallenges();
    expect(pending.length).toBe(1);
    expect(pending[0].status).toBe("FAILED");
    expect(pending[0].retryCount).toBe(1);
    expect(pending[0].lastError).toContain("Database temporarily busy");
  });

  it("6. should cleanly delete item on idempotent replay (HTTP 200)", async () => {
    const idempotencyKey = "idempotent-replay-uuid-789";

    await enqueueOfflineChallenge({
      payload: samplePayload,
      clientIdempotencyKey: idempotencyKey,
    });

    const mockFetch = (async () => {
      // Server returns 200 indicating challenge already ingested
      return new Response(
        JSON.stringify({
          success: true,
          message: "Challenge already exists (idempotent replay)",
          data: { id: "existing-chal-789", title: samplePayload.title },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    const result = await syncOfflineOutbox({
      isOnlineFn: () => true,
      fetchFn: mockFetch,
    });

    expect(result.syncedCount).toBe(1);
    expect(result.failedCount).toBe(0);

    const pending = await listPendingChallenges();
    expect(pending.length).toBe(0);
  });
});
