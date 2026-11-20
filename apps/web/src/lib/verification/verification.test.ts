import { describe, it, expect, beforeAll } from "vitest";
import { verificationProvider, MOCK_AISHE_REGISTRY, MOCK_MCA_REGISTRY, MOCK_UDYAM_REGISTRY } from "./index";
import { POST as verifyAisheHandler } from "@/app/api/v1/verify/aishe/route";
import { POST as verifyIndustryHandler } from "@/app/api/v1/verify/industry/route";
import { POST as claimChallengeHandler } from "@/app/api/v1/challenges/claim/route";
import { POST as signTransitionHandler } from "@/app/api/v1/transitions/sign/route";
import { signAccessToken } from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { prisma, UserRole, VerificationStatus } from "@sih/db";

describe("Verification Trust Layer & Controlled Mock Registry Suite", () => {
  it("1. should verify all 10 seeded Jharkhand HEIs with Controlled Mock MVP metadata", async () => {
    const seededCodes = [
      "U-0205",
      "U-0202",
      "U-0210",
      "C-44102",
      "U-0203",
      "U-0207",
      "U-0204",
      "U-0208",
      "U-0206",
      "S-12055",
    ];

    for (const code of seededCodes) {
      const res = await verificationProvider.verifyAisheCode(code);
      expect(res.verified).toBe(true);
      expect(res.status).toBe("VERIFIED");
      expect(res.source).toBe("CONTROLLED_MOCK_MVP");
      expect(res.isOfficialLiveApi).toBe(false);
      expect(res.badge).toBe("Controlled Mock (MVP)");
      expect(res.details).toBeDefined();
      expect(res.details?.aisheCode).toBe(code);
    }
  });

  it("2. should reject negative AISHE test codes with REJECTED and NOT_FOUND statuses", async () => {
    const fakeRes = await verificationProvider.verifyAisheCode("U-FAKE-999");
    expect(fakeRes.verified).toBe(false);
    expect(fakeRes.status).toBe("REJECTED");
    expect(fakeRes.source).toBe("CONTROLLED_MOCK_MVP");
    expect(fakeRes.isOfficialLiveApi).toBe(false);

    const fraudRes = await verificationProvider.verifyAisheCode("U-FRAUD-123");
    expect(fraudRes.verified).toBe(false);
    expect(fraudRes.status).toBe("REJECTED");

    const unknownRes = await verificationProvider.verifyAisheCode("U-99999");
    expect(unknownRes.verified).toBe(false);
    expect(unknownRes.status).toBe("NOT_FOUND");
  });

  it("3. should verify valid MCA CINs and Udyam numbers, and reject fraudulent ones", async () => {
    // Valid seeded CIN
    const cinRes = await verificationProvider.verifyMcaCin("U85100JH2016NPL008638");
    expect(cinRes.verified).toBe(true);
    expect(cinRes.status).toBe("VERIFIED");
    expect(cinRes.badge).toBe("Controlled Mock (MVP)");
    expect(cinRes.details?.companyName).toBe("Tata Steel Foundation");

    // Invalid / Struck off CIN
    const badCinRes = await verificationProvider.verifyMcaCin("U99999XX9999PTC999999");
    expect(badCinRes.verified).toBe(false);
    expect(badCinRes.status).toBe("REJECTED");

    // Valid Udyam number
    const udyamRes = await verificationProvider.verifyUdyamNumber("UDYAM-JH-01-0012345");
    expect(udyamRes.verified).toBe(true);
    expect(udyamRes.status).toBe("VERIFIED");
    expect(udyamRes.details?.enterpriseType).toBe("SMALL");

    // Negative Udyam numbers
    const notFoundUdyam = await verificationProvider.verifyUdyamNumber("UDYAM-JH-00-0000000");
    expect(notFoundUdyam.verified).toBe(false);
    expect(notFoundUdyam.status).toBe("NOT_FOUND");

    const rejectedUdyam = await verificationProvider.verifyUdyamNumber("UDYAM-XX-99-9999999");
    expect(rejectedUdyam.verified).toBe(false);
    expect(rejectedUdyam.status).toBe("REJECTED");
  });
});

describe("Verification API Endpoints & Route Gate Integration Suite", () => {
  let testInstitutionId: string;
  let testPartnerId: string;
  let unverifiedHeiUserId: string;
  let unverifiedPartnerUserId: string;

  beforeAll(async () => {
    const timestamp = Date.now();

    // Create test institution in PENDING state
    const inst = await prisma.institution.create({
      data: {
        code: `U-TEST-${timestamp}`,
        name: "Test Polytechnic Dhanbad",
        tier: "TIER_3",
        verificationStatus: VerificationStatus.PENDING,
      },
    });
    testInstitutionId = inst.id;

    // Create test industry partner in PENDING state
    const partner = await prisma.industryPartner.create({
      data: {
        cin: `U12345JH${timestamp.toString().slice(-4)}PTC001122`,
        organizationName: "Test Automation Works",
        industrySector: "Engineering",
        verificationStatus: VerificationStatus.PENDING,
      },
    });
    testPartnerId = partner.id;

    // Create HEI Admin user linked to unverified institution
    const heiUser = await prisma.user.create({
      data: {
        email: `hei_admin_${timestamp}@sih.gov.in`,
        passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$fake",
        fullName: "Test HEI Administrator",
        role: UserRole.INSTITUTION_ADMIN,
        verificationStatus: VerificationStatus.PENDING,
        institutionId: testInstitutionId,
      },
    });
    unverifiedHeiUserId = heiUser.id;

    // Create Industry Partner user linked to unverified partner
    const indUser = await prisma.user.create({
      data: {
        email: `ind_partner_${timestamp}@sih.gov.in`,
        passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$fake",
        fullName: "Test Industry Representative",
        role: UserRole.INDUSTRY_PARTNER,
        verificationStatus: VerificationStatus.PENDING,
        industryPartnerId: testPartnerId,
      },
    });
    unverifiedPartnerUserId = indUser.id;
  });

  it("4. POST /api/v1/verify/aishe should validate format, query provider, update DB, and log audit", async () => {
    // Malformed AISHE code format rejection (Zod format gate)
    const badFormatReq = new Request("http://localhost:3000/api/v1/verify/aishe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aisheCode: "INVALID_FORMAT_999" }),
    });
    const badFormatRes = await verifyAisheHandler(badFormatReq);
    expect(badFormatRes.status).toBe(400);

    // Explicit negative AISHE code (U-FAKE-999) rejection
    const fakeReq = new Request("http://localhost:3000/api/v1/verify/aishe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aisheCode: "U-FAKE-999" }),
    });
    const fakeRes = await verifyAisheHandler(fakeReq);
    expect(fakeRes.status).toBe(400);
    const fakeBody = await fakeRes.json();
    expect(fakeBody.success).toBe(false);
    expect(fakeBody.error.code).toBe("REJECTED");
    expect(fakeBody.error.source).toBe("CONTROLLED_MOCK_MVP");
    expect(fakeBody.error.badge).toBe("Controlled Mock (MVP)");

    // Valid AISHE code verification activating institution
    const validReq = new Request("http://localhost:3000/api/v1/verify/aishe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aisheCode: "U-0205",
        institutionId: testInstitutionId,
      }),
    });
    const validRes = await verifyAisheHandler(validReq);
    expect(validRes.status).toBe(200);
    const validBody = await validRes.json();
    expect(validBody.success).toBe(true);
    expect(validBody.data.verified).toBe(true);
    expect(validBody.data.badge).toBe("Controlled Mock (MVP)");

    // Verify DB update
    const updatedInst = await prisma.institution.findUnique({
      where: { id: testInstitutionId },
    });
    expect(updatedInst?.verificationStatus).toBe(VerificationStatus.VERIFIED);
  });

  it("5. POST /api/v1/verify/industry should verify MCA CIN or Udyam number and activate partner", async () => {
    // Negative Udyam code rejection
    const rejectUdyamReq = new Request("http://localhost:3000/api/v1/verify/industry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        udyamNumber: "UDYAM-XX-99-9999999",
        industryPartnerId: testPartnerId,
      }),
    });
    const rejectRes = await verifyIndustryHandler(rejectUdyamReq);
    expect(rejectRes.status).toBe(400);
    const rejectBody = await rejectRes.json();
    expect(rejectBody.error.code).toBe("REJECTED");

    // Valid Udyam number verification
    const validUdyamReq = new Request("http://localhost:3000/api/v1/verify/industry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        udyamNumber: "UDYAM-JH-01-0012345",
        industryPartnerId: testPartnerId,
      }),
    });
    const validRes = await verifyIndustryHandler(validUdyamReq);
    expect(validRes.status).toBe(200);
    const validBody = await validRes.json();
    expect(validBody.success).toBe(true);
    expect(validBody.data.verified).toBe(true);
    expect(validBody.data.badge).toBe("Controlled Mock (MVP)");

    // Verify DB update
    const updatedPartner = await prisma.industryPartner.findUnique({
      where: { id: testPartnerId },
    });
    expect(updatedPartner?.verificationStatus).toBe(VerificationStatus.VERIFIED);
  });

  it("6. Protected Route Gate: unverified org accounts must receive 403 ORG_NOT_VERIFIED", async () => {
    // Create new unverified institution & user
    const pendingInst = await prisma.institution.create({
      data: {
        code: `U-UNVERIFIED-${Date.now()}`,
        name: "Unverified Engineering College",
        tier: "TIER_3",
        verificationStatus: VerificationStatus.PENDING,
      },
    });

    const pendingUser = await prisma.user.create({
      data: {
        email: `unverified_${Date.now()}@sih.gov.in`,
        passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$fake",
        fullName: "Unverified Admin",
        role: UserRole.INSTITUTION_ADMIN,
        verificationStatus: VerificationStatus.PENDING,
        institutionId: pendingInst.id,
      },
    });

    const unverifiedToken = await signAccessToken({
      sub: pendingUser.id,
      email: pendingUser.email,
      role: pendingUser.role,
      institutionId: pendingInst.id,
    });

    // Attempting protected action: Claim Challenge
    const claimReq = new Request("http://localhost:3000/api/v1/challenges/claim", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${ACCESS_TOKEN_COOKIE}=${unverifiedToken}`,
      },
      body: JSON.stringify({
        challengeId: "11111111-1111-1111-1111-111111111111",
      }),
    });

    const claimRes = await claimChallengeHandler(claimReq);
    expect(claimRes.status).toBe(403);
    const claimBody = await claimRes.json();
    expect(claimBody.success).toBe(false);
    expect(claimBody.error.code).toBe("ORG_NOT_VERIFIED");

    // Attempting protected action: Sign Transition
    const signReq = new Request("http://localhost:3000/api/v1/transitions/sign", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${ACCESS_TOKEN_COOKIE}=${unverifiedToken}`,
      },
      body: JSON.stringify({
        milestoneId: "22222222-2222-2222-2222-222222222222",
        decision: "APPROVED",
      }),
    });

    const signRes = await signTransitionHandler(signReq);
    expect(signRes.status).toBe(403);
    const signBody = await signRes.json();
    expect(signBody.success).toBe(false);
    expect(signBody.error.code).toBe("ORG_NOT_VERIFIED");

    // Now verify the institution via AISHE
    await verifyAisheHandler(
      new Request("http://localhost:3000/api/v1/verify/aishe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aisheCode: "U-0202",
          institutionId: pendingInst.id,
        }),
      })
    );

    // Re-attempt protected action with newly verified institution
    const verifiedClaimReq = new Request("http://localhost:3000/api/v1/challenges/claim", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${ACCESS_TOKEN_COOKIE}=${unverifiedToken}`,
      },
      body: JSON.stringify({
        challengeId: "11111111-1111-1111-1111-111111111111",
      }),
    });
    const verifiedClaimRes = await claimChallengeHandler(verifiedClaimReq);
    expect(verifiedClaimRes.status).toBe(200);
    const verifiedClaimBody = await verifiedClaimRes.json();
    expect(verifiedClaimBody.success).toBe(true);
    expect(verifiedClaimBody.message).toContain("Challenge claimed successfully");
  });
});
