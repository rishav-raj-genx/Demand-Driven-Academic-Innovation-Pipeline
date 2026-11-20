import { describe, it, expect, vi, beforeEach } from "vitest";
import { type Job } from "bullmq";
import { prisma } from "@sih/db";
import { AiClient, AiClientError } from "../src/clients/ai-client.js";
import {
  formatMockSmsMessage,
  notificationProcessor,
} from "../src/processors/notification-processor.js";
import { challengeProcessor } from "../src/processors/challenge-processor.js";
import { heiEmbedProcessor } from "../src/processors/hei-embed-processor.js";
import { DEFAULT_JOB_OPTIONS, QUEUE_NAMES } from "../src/types.js";
import * as queuesModule from "../src/queues.js";

describe("BullMQ Worker Configuration & Constants", () => {
  it("should enforce BullMQ job options with attempts: 3 and exponential backoff of 2000ms", () => {
    expect(DEFAULT_JOB_OPTIONS.attempts).toBe(3);
    expect(DEFAULT_JOB_OPTIONS.backoff.type).toBe("exponential");
    expect(DEFAULT_JOB_OPTIONS.backoff.delay).toBe(2000);
  });

  it("should define all canonical and legacy queue names", () => {
    expect(QUEUE_NAMES.CHALLENGE_PROCESS).toBe("challenge.process");
    expect(QUEUE_NAMES.CHALLENGE_PIPELINE).toBe("challenge-pipeline");
    expect(QUEUE_NAMES.HEI_EMBED).toBe("hei.embed");
    expect(QUEUE_NAMES.HEI_EMBEDDING).toBe("hei-embedding");
    expect(QUEUE_NAMES.NOTIFY_SMS).toBe("notify.sms");
    expect(QUEUE_NAMES.NOTIFICATION_DISPATCH).toBe("notification-dispatch");
    expect(QUEUE_NAMES.DEAD_LETTER).toBe("dead-letter.queue");
  });
});

describe("AiClient", () => {
  let client: AiClient;

  beforeEach(() => {
    client = new AiClient({
      baseUrl: "http://127.0.0.1:8000",
      internalServiceKey: "test_secret_key",
      timeoutMs: 1000,
    });
  });

  it("should successfully parse JSON response from AI engine", async () => {
    const mockResponse = { status: "ok", pgvector: true };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(mockResponse),
    } as unknown as Response);

    const res = await client.checkHealth();
    expect(res).toEqual(mockResponse);
  });

  it("should throw AiClientError with statusCode and endpoint on HTTP 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ detail: "Challenge not found" }),
    } as unknown as Response);

    await expect(client.analyzeChallenge("invalid-id")).rejects.toThrow(AiClientError);
  });

  it("should handle timeout gracefully and mark isTimeout: true", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementationOnce((_url, init) => {
      return new Promise((_, reject) => {
        if (init?.signal) {
          init.signal.addEventListener("abort", () => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        }
      });
    });

    const shortClient = new AiClient({
      baseUrl: "http://127.0.0.1:8000",
      timeoutMs: 50,
    });

    await expect(shortClient.analyzeChallenge("some-id")).rejects.toMatchObject({
      isTimeout: true,
      statusCode: 504,
    });
  });
});

describe("Notification Processor (Mock SMS Gateway)", () => {
  it("should prefix raw message with [MOCK SMS - SIH26043] tag without duplicating it", () => {
    const raw = "Your challenge has been matched";
    const formatted = formatMockSmsMessage(raw);
    expect(formatted).toBe("[MOCK SMS - SIH26043] Your challenge has been matched");

    const alreadyTagged = "[MOCK SMS - SIH26043] Already formatted message";
    expect(formatMockSmsMessage(alreadyTagged)).toBe(alreadyTagged);
  });

  it("should insert notification_logs row with status DELIVERED_MOCK and formatted SMS text", async () => {
    // 1. Fetch or create a test recipient in PostgreSQL
    let user = await prisma.user.findFirst({
      where: { role: "CITIZEN" },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: `test_citizen_${Date.now()}@sih.gov.in`,
          passwordHash: "argon2_test_hash",
          fullName: "Test Citizen Mock",
          role: "CITIZEN",
          phoneNumber: "+919876500001",
        },
      });
    }

    const mockJob = {
      id: "mock-job-123",
      attemptsMade: 0,
      data: {
        recipientId: user.id,
        phoneNumber: user.phoneNumber ?? "+919876543210",
        title: "Test Challenge Match",
        message: "Your submission has been reviewed by the academic council.",
        type: "SMS",
        metadata: { challengeId: "c-123", test: true },
      },
    } as unknown as Job;

    const result = await notificationProcessor(mockJob);

    expect(result.delivered).toBe(true);
    expect(result.status).toBe("DELIVERED_MOCK");
    expect(result.notificationId).toBeDefined();

    // Verify row in PostgreSQL notification_logs
    const log = await prisma.notificationLog.findUnique({
      where: { id: result.notificationId },
    });

    expect(log).not.toBeNull();
    expect(log?.recipientId).toBe(user.id);
    expect(log?.message).toContain("[MOCK SMS - SIH26043]");
    expect((log?.data as Record<string, unknown>)?.status).toBe("DELIVERED_MOCK");
  });

  it("should throw defensive error if recipient does not exist in database", async () => {
    const fakeJob = {
      id: "fake-job-404",
      attemptsMade: 0,
      data: {
        recipientId: "00000000-0000-0000-0000-000000000000",
        title: "Fake Title",
        message: "Hello",
      },
    } as unknown as Job;

    await expect(notificationProcessor(fakeJob)).rejects.toThrow("not found in database");
  });
});

describe("Challenge Processor Integration", () => {
  it("should process MATCHED outcome and enqueue notify.sms jobs for citizen and top HEI admin", async () => {
    // Create test user and challenge
    const user = await prisma.user.create({
      data: {
        email: `citizen_worker_${Date.now()}@sih.gov.in`,
        passwordHash: "hash",
        fullName: "Worker Test Citizen",
        role: "CITIZEN",
        phoneNumber: "+919876511111",
      },
    });

    const challenge = await prisma.challenge.create({
      data: {
        title: "Worker Test Water Contamination",
        problemStatement: "High fluoride levels in rural wells requiring membrane filtration",
        createdById: user.id,
        status: "SUBMITTED",
      },
    });

    // Mock enqueueNotifySms
    const enqueueSpy = vi.spyOn(queuesModule, "enqueueNotifySms").mockResolvedValue({} as never);

    // Mock fetch for AI Engine /analyze endpoint
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          status: "ok",
          action: "MATCHED",
          challenge_id: challenge.id,
          is_duplicate: false,
          matches_count: 1,
          matches: [
            {
              institution_id: "8ca18d46-8853-41ae-8b1b-664019d4909f",
              institution_code: "BIT_MESRA",
              institution_name: "Birla Institute of Technology Mesra",
              tier: "TIER_1",
              final_score: 0.88,
              raw_similarity: 0.85,
              distance_km: 12.5,
              geo_boost: 0.07,
              utilization: 0.3,
              capacity_penalty: 0.02,
              explanation: "Strong domain match, local proximity",
            },
          ],
        }),
    } as unknown as Response);

    const job = {
      id: "chal-proc-job-1",
      attemptsMade: 0,
      data: { challengeId: challenge.id },
    } as unknown as Job;

    const res = await challengeProcessor(job);

    expect(res.success).toBe(true);
    expect(res.action).toBe("MATCHED");
    expect(res.citizenNotified).toBe(true);
    expect(res.heiAdminNotified).toBe(true);
    expect(res.topMatchInstitutionName).toBe("Birla Institute of Technology Mesra");

    // Verify enqueueNotifySms was called for citizen and HEI admin
    expect(enqueueSpy).toHaveBeenCalledTimes(2);

    // Check citizen notification payload
    const citizenCall = enqueueSpy.mock.calls[0]?.[0];
    expect(citizenCall?.recipientId).toBe(user.id);
    expect(citizenCall?.message).toContain("[MOCK SMS - SIH26043]");
    expect(citizenCall?.message).toContain("Birla Institute of Technology Mesra");

    // Check HEI admin notification payload
    const adminCall = enqueueSpy.mock.calls[1]?.[0];
    expect(adminCall?.title).toContain("High-Alignment Challenge Match Assigned");
    expect(adminCall?.message).toContain("[MOCK SMS - SIH26043]");

    enqueueSpy.mockRestore();
  });

  it("should process DUPLICATE_MERGED outcome and notify citizen about merge", async () => {
    const user = await prisma.user.create({
      data: {
        email: `citizen_worker_dup_${Date.now()}@sih.gov.in`,
        passwordHash: "hash",
        fullName: "Duplicate Submitter Citizen",
        role: "CITIZEN",
      },
    });

    const challenge = await prisma.challenge.create({
      data: {
        title: "Duplicate Drinking Water Issue",
        problemStatement: "Arsenic water problem",
        createdById: user.id,
        status: "SUBMITTED",
      },
    });

    const enqueueSpy = vi.spyOn(queuesModule, "enqueueNotifySms").mockResolvedValue({} as never);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          status: "ok",
          action: "DUPLICATE_MERGED",
          challenge_id: challenge.id,
          is_duplicate: true,
          canonical_id: "00000000-0000-0000-0000-000000000001",
          duplicate_similarity: 0.92,
          canonical_title: "Decentralized Arsenic Water Filtration in Ratu Block",
          message: "Duplicate merged",
        }),
    } as unknown as Response);

    const job = {
      id: "chal-proc-dup-1",
      attemptsMade: 0,
      data: { challengeId: challenge.id },
    } as unknown as Job;

    const res = await challengeProcessor(job);

    expect(res.success).toBe(true);
    expect(res.action).toBe("DUPLICATE_MERGED");
    expect(res.isDuplicate).toBe(true);
    expect(res.citizenNotified).toBe(true);
    expect(res.heiAdminNotified).toBe(false);

    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    const citizenCall = enqueueSpy.mock.calls[0]?.[0];
    expect(citizenCall?.recipientId).toBe(user.id);
    expect(citizenCall?.message).toContain("Decentralized Arsenic Water Filtration in Ratu Block");
    expect(citizenCall?.type).toBe("DUPLICATE_MERGED");

    enqueueSpy.mockRestore();
  });
});

describe("HEI Capability Embed Processor", () => {
  it("should call AI client and return embedding dimensions and metadata", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          status: "ok",
          institution_id: "inst-123",
          code: "BIT_MESRA",
          name: "Birla Institute of Technology Mesra",
          tier: "TIER_1",
          embedding_dimensions: 384,
          canonical_text: "Profile text",
        }),
    } as unknown as Response);

    const job = {
      id: "hei-embed-job-1",
      attemptsMade: 0,
      data: { institutionId: "inst-123" },
    } as unknown as Job;

    const res = await heiEmbedProcessor(job);

    expect(res.success).toBe(true);
    expect(res.embeddingDimensions).toBe(384);
    expect(res.code).toBe("BIT_MESRA");
    expect(res.tier).toBe("TIER_1");
  });
});
