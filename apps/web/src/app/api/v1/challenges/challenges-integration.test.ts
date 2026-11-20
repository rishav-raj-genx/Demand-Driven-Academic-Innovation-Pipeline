import { describe, it, expect, beforeAll } from "vitest";
import { POST as challengeIntakeHandler, GET as challengesListHandler } from "./route";
import { GET as challengeDetailHandler } from "./[id]/route";
import { POST as endorseHandler } from "./[id]/endorse/route";
import { prisma, getChallengeLocation } from "@sih/db";
import { signAccessToken } from "@/lib/auth/jwt";
import { challengeQueue } from "@/lib/queues";
import { randomUUID } from "node:crypto";

describe("Challenge Intake, Listing, Detail & Citizen Endorsement Integration Suite", () => {
  let citizenUserId = "";
  let citizenToken = "";
  let investorUserId = "";
  let investorToken = "";
  let seededChallengeId = "";

  const testIdempotencyKey = randomUUID();

  beforeAll(async () => {
    // 1. Get seeded student (acting as citizen)
    const citizen = await prisma.user.findFirstOrThrow({
      where: { role: "STUDENT" },
    });
    citizenUserId = citizen.id;
    citizenToken = await signAccessToken({
      sub: citizen.id,
      email: citizen.email,
      role: citizen.role,
      institutionId: citizen.institutionId,
      verificationStatus: citizen.verificationStatus,
    });

    // 2. Get investor (unauthorized role for citizen challenge intake)
    const investor = await prisma.user.findFirstOrThrow({
      where: { role: "INVESTOR" },
    });
    investorUserId = investor.id;
    investorToken = await signAccessToken({
      sub: investor.id,
      email: investor.email,
      role: investor.role,
      verificationStatus: investor.verificationStatus,
    });

    // 3. Get any seeded challenge for detail & listing tests
    const challenge = await prisma.challenge.findFirstOrThrow({
      include: { district: true },
    });
    seededChallengeId = challenge.id;

    // Clean up any previous test record with this idempotency key
    await prisma.challenge.deleteMany({
      where: { clientIdempotencyKey: testIdempotencyKey },
    });
  });

  // ==========================================================================
  // A. Validation, Security & PostGIS Gates on POST /api/v1/challenges
  // ==========================================================================

  it("1. should reject unauthenticated requests to POST /api/v1/challenges with 401", async () => {
    const req = new Request("http://localhost:3000/api/v1/challenges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Community Arsenic Contamination in Borewell",
        description:
          "High arsenic levels detected across 30 hand pumps in village hamlets requiring immediate water filtration intervention.",
        domain: "Water Filtration",
        urgency: "HIGH",
        latitude: 23.3441,
        longitude: 85.3096,
        clientIdempotencyKey: randomUUID(),
      }),
    });

    const res = await challengeIntakeHandler(req);
    expect(res.status).toBe(401);
  });

  it("2. should reject unauthorized roles with HTTP 403 FORBIDDEN", async () => {
    const req = new Request("http://localhost:3000/api/v1/challenges", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${investorToken}`,
      },
      body: JSON.stringify({
        title: "Community Arsenic Contamination in Borewell",
        description:
          "High arsenic levels detected across 30 hand pumps in village hamlets requiring immediate water filtration intervention.",
        domain: "Water Filtration",
        urgency: "HIGH",
        latitude: 23.3441,
        longitude: 85.3096,
        clientIdempotencyKey: randomUUID(),
      }),
    });

    const res = await challengeIntakeHandler(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("3. should reject invalid coordinates (out-of-range lat/lng) with HTTP 400", async () => {
    // Latitude out of range (> 90)
    const badLatReq = new Request("http://localhost:3000/api/v1/challenges", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${citizenToken}`,
      },
      body: JSON.stringify({
        title: "Invalid Latitude Test Challenge Submission",
        description:
          "High fluoride levels in rural borewells causing health complications among villagers in southern districts.",
        domain: "Water Filtration",
        urgency: "HIGH",
        latitude: 99.5, // Invalid!
        longitude: 85.3096,
        clientIdempotencyKey: randomUUID(),
      }),
    });

    const badLatRes = await challengeIntakeHandler(badLatReq);
    expect(badLatRes.status).toBe(400);
    const badLatBody = await badLatRes.json();
    expect(badLatBody.error.code).toBe("VALIDATION_ERROR");
    expect(badLatBody.error.details.latitude).toBeDefined();

    // Longitude out of range (< -180)
    const badLngReq = new Request("http://localhost:3000/api/v1/challenges", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${citizenToken}`,
      },
      body: JSON.stringify({
        title: "Invalid Longitude Test Challenge Submission",
        description:
          "High fluoride levels in rural borewells causing health complications among villagers in southern districts.",
        domain: "Water Filtration",
        urgency: "HIGH",
        latitude: 23.3441,
        longitude: -195.0, // Invalid!
        clientIdempotencyKey: randomUUID(),
      }),
    });

    const badLngRes = await challengeIntakeHandler(badLngReq);
    expect(badLngRes.status).toBe(400);
    const badLngBody = await badLngRes.json();
    expect(badLngBody.error.code).toBe("VALIDATION_ERROR");
    expect(badLngBody.error.details.longitude).toBeDefined();
  });

  it("4. should reject short title or short description with HTTP 400", async () => {
    const shortReq = new Request("http://localhost:3000/api/v1/challenges", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${citizenToken}`,
      },
      body: JSON.stringify({
        title: "Short", // < 10 chars
        description: "Too short", // < 30 chars
        domain: "Water",
        urgency: "LOW",
        latitude: 23.3441,
        longitude: 85.3096,
        clientIdempotencyKey: randomUUID(),
      }),
    });

    const res = await challengeIntakeHandler(shortReq);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.title).toBeDefined();
    expect(body.error.details.description).toBeDefined();
  });

  it("5. should reject mediaKeys that violate prefix whitelist or exceed max 4", async () => {
    const badMediaReq = new Request("http://localhost:3000/api/v1/challenges", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${citizenToken}`,
      },
      body: JSON.stringify({
        title: "Community Arsenic Contamination in Borewell",
        description:
          "High arsenic levels detected across 30 hand pumps in village hamlets requiring immediate water filtration intervention.",
        domain: "Water Filtration",
        urgency: "HIGH",
        latitude: 23.3441,
        longitude: 85.3096,
        mediaKeys: ["malicious_folder/shell.sh"], // Disallowed prefix
        clientIdempotencyKey: randomUUID(),
      }),
    });

    const res = await challengeIntakeHandler(badMediaReq);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.mediaKeys).toBeDefined();
  });

  // ==========================================================================
  // B. End-to-End Submission, PostGIS Binding & BullMQ Job Enqueueing
  // ==========================================================================

  let createdChallengeId = "";

  it("6. should create challenge, bind PostGIS point, resolve district, and enqueue BullMQ job", async () => {
    // Coordinates inside Ranchi district boundary: (23.3441, 85.3096)
    const req = new Request("http://localhost:3000/api/v1/challenges", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${citizenToken}`,
      },
      body: JSON.stringify({
        title: "Decentralized Arsenic Water Filtration in Ratu Block",
        description:
          "Severe arsenic contamination across 15 rural hamlets in Ratu block requires a solar-powered adsorption filtration system.",
        domain: "Water Filtration",
        urgency: "HIGH",
        latitude: 23.3441,
        longitude: 85.3096,
        mediaKeys: ["challenge_media/user/field_photo.png"],
        clientIdempotencyKey: testIdempotencyKey,
      }),
    });

    const res = await challengeIntakeHandler(req);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
    createdChallengeId = body.data.id;

    // Verify fields
    expect(body.data.title).toBe("Decentralized Arsenic Water Filtration in Ratu Block");
    expect(body.data.status).toBe("SUBMITTED");
    expect(body.data.domain).toBe("Water Filtration");
    expect(body.data.urgency).toBe("HIGH");
    expect(body.data.clientIdempotencyKey).toBe(testIdempotencyKey);
    expect(body.data.districtId).toBeDefined();
    expect(body.data.district.code).toBe("JH_RAN"); // Resolved to Ranchi!

    // Verify PostGIS location point in PostgreSQL
    const coords = await getChallengeLocation(createdChallengeId);
    expect(coords).not.toBeNull();
    expect(coords?.lat).toBeCloseTo(23.3441, 4);
    expect(coords?.lng).toBeCloseTo(85.3096, 4);

    // Verify BullMQ Job Enqueued in Redis
    const jobs = await challengeQueue.getJobs(["waiting", "delayed", "active", "completed"]);
    const enqueuedJob = jobs.find((j) => j.data?.challengeId === createdChallengeId);
    expect(enqueuedJob).toBeDefined();
    expect(enqueuedJob?.name).toBe("challenge.process");
    expect(enqueuedJob?.data.challengeId).toBe(createdChallengeId);
  });

  // ==========================================================================
  // C. Idempotency Protection (Offline Replay Resilience)
  // ==========================================================================

  it("7. should return HTTP 200 with existing challenge upon replay of clientIdempotencyKey without creating second DB row", async () => {
    // Replay with identical clientIdempotencyKey
    const replayReq = new Request("http://localhost:3000/api/v1/challenges", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${citizenToken}`,
      },
      body: JSON.stringify({
        title: "Modified Title That Should NOT Overwrite Existing Challenge",
        description:
          "Severe arsenic contamination across 15 rural hamlets in Ratu block requires a solar-powered adsorption filtration system.",
        domain: "Water Filtration",
        urgency: "CRITICAL",
        latitude: 23.3441,
        longitude: 85.3096,
        clientIdempotencyKey: testIdempotencyKey,
      }),
    });

    const res = await challengeIntakeHandler(replayReq);
    expect(res.status).toBe(200); // 200 OK for idempotent return!

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain("idempotent");
    expect(body.data.id).toBe(createdChallengeId);
    // Title must remain original
    expect(body.data.title).toBe("Decentralized Arsenic Water Filtration in Ratu Block");

    // Verify exactly ONE database record exists with this idempotency key
    const count = await prisma.challenge.count({
      where: { clientIdempotencyKey: testIdempotencyKey },
    });
    expect(count).toBe(1);
  });

  // ==========================================================================
  // D. GET /api/v1/challenges (Listing, Filters & Pagination)
  // ==========================================================================

  it("8. GET /api/v1/challenges should return paginated challenges with metadata", async () => {
    const req = new Request("http://localhost:3000/api/v1/challenges?page=1&limit=5", {
      method: "GET",
    });

    const res = await challengesListHandler(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeLessThanOrEqual(5);
    expect(body.meta).toBeDefined();
    expect(body.meta.page).toBe(1);
    expect(body.meta.limit).toBe(5);
    expect(body.meta.total).toBeGreaterThanOrEqual(1);
    expect(body.meta.totalPages).toBeGreaterThanOrEqual(1);
  });

  it("9. GET /api/v1/challenges should filter by districtId and domain", async () => {
    // Filter by domain
    const domainReq = new Request(
      "http://localhost:3000/api/v1/challenges?domain=Water%20Filtration",
      { method: "GET" }
    );
    const domainRes = await challengesListHandler(domainReq);
    expect(domainRes.status).toBe(200);
    const domainBody = await domainRes.json();
    expect(domainBody.success).toBe(true);
    for (const c of domainBody.data) {
      const match =
        c.domain === "Water Filtration" || c.category === "Water Filtration";
      expect(match).toBe(true);
    }
  });

  it("10. GET /api/v1/challenges should filter by search keyword", async () => {
    const searchReq = new Request(
      "http://localhost:3000/api/v1/challenges?search=Arsenic",
      { method: "GET" }
    );
    const searchRes = await challengesListHandler(searchReq);
    expect(searchRes.status).toBe(200);
    const searchBody = await searchRes.json();
    expect(searchBody.success).toBe(true);
    expect(searchBody.data.length).toBeGreaterThanOrEqual(1);
  });

  // ==========================================================================
  // E. GET /api/v1/challenges/[id] (Detail & Capability Matches)
  // ==========================================================================

  it("11. GET /api/v1/challenges/[id] should return challenge details, district, and location", async () => {
    const req = new Request(`http://localhost:3000/api/v1/challenges/${createdChallengeId}`, {
      method: "GET",
    });

    const res = await challengeDetailHandler(req, {
      params: Promise.resolve({ id: createdChallengeId }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(createdChallengeId);
    expect(body.data.district).toBeDefined();
    expect(body.data.district.code).toBe("JH_RAN");
    expect(body.data.location).toBeDefined();
    expect(body.data.location.lat).toBeCloseTo(23.3441, 4);
    expect(body.data.endorsementCount).toBe(0);
    expect(Array.isArray(body.data.capabilityMatches)).toBe(true);
  });

  it("12. GET /api/v1/challenges/[id] should return 404 for non-existent challenge ID", async () => {
    const fakeId = randomUUID();
    const req = new Request(`http://localhost:3000/api/v1/challenges/${fakeId}`, {
      method: "GET",
    });

    const res = await challengeDetailHandler(req, {
      params: Promise.resolve({ id: fakeId }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("CHALLENGE_NOT_FOUND");
  });

  // ==========================================================================
  // F. POST /api/v1/challenges/[id]/endorse (Citizen Endorsement & Rate Limiting)
  // ==========================================================================

  it("13. POST /api/v1/challenges/[id]/endorse should increment endorsementCount", async () => {
    const req = new Request(
      `http://localhost:3000/api/v1/challenges/${createdChallengeId}/endorse`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${citizenToken}` },
      }
    );

    const res = await endorseHandler(req, {
      params: Promise.resolve({ id: createdChallengeId }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.challengeId).toBe(createdChallengeId);
    expect(body.data.endorsementCount).toBe(1);

    // Verify DB count updated
    const updated = await prisma.challenge.findUnique({
      where: { id: createdChallengeId },
      select: { endorsementCount: true },
    });
    expect(updated?.endorsementCount).toBe(1);
  });

  it("14. POST /api/v1/challenges/[id]/endorse should reject repeat endorsement from same user with HTTP 429", async () => {
    // Attempt second endorsement immediately with same citizen user
    const req = new Request(
      `http://localhost:3000/api/v1/challenges/${createdChallengeId}/endorse`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${citizenToken}` },
      }
    );

    const res = await endorseHandler(req, {
      params: Promise.resolve({ id: createdChallengeId }),
    });

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("ALREADY_ENDORSED");
  });
});
