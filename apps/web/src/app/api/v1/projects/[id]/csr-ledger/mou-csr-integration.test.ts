import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { POST as createProjectHandler } from "@/app/api/v1/projects/route";
import { POST as assignPartnerHandler } from "@/app/api/v1/projects/[id]/partner/route";
import { POST as submitMilestoneHandler } from "@/app/api/v1/projects/[id]/milestones/route";
import { GET as getProjectHandler } from "@/app/api/v1/projects/[id]/route";
import { POST as createMouHandler, GET as listMousHandler } from "@/app/api/v1/projects/[id]/mou/route";
import { POST as acknowledgeMouHandler } from "@/app/api/v1/projects/[id]/mou/[mouId]/acknowledge/route";
import { POST as recordCsrLedgerHandler, GET as getCsrLedgerHandler } from "@/app/api/v1/projects/[id]/csr-ledger/route";
import { PATCH as verifyCsrLedgerHandler } from "@/app/api/v1/projects/[id]/csr-ledger/[entryId]/verify/route";
import { prisma, UserRole, ProjectPhase } from "@sih/db";
import { CsrEntryStatus } from "@sih/shared";
import { signAccessToken } from "@/lib/auth/jwt";

describe("MoU & Off-Platform CSR Milestone Ledger Integration Suite (Milestone 6.3)", () => {
  let facultyUser: { id: string; role: UserRole; institutionId: string };
  let facultyToken: string;

  let heiAdminUser: { id: string; role: UserRole; institutionId: string };
  let heiAdminToken: string;

  let studentUser: { id: string; role: UserRole; institutionId: string };
  let studentToken: string;

  let industryPartnerUser: { id: string; role: UserRole; industryPartnerId: string };
  let industryToken: string;

  let govtOfficialUser: { id: string; role: UserRole };
  let govtToken: string;

  let testInstitution: { id: string; code: string; name: string };
  let testIndustryPartner: { id: string; organizationName: string; cin: string | null };
  let testChallenge: { id: string };

  let projectId: string;
  let milestoneId: string;
  let mouId: string;
  let mouNumber: string;
  let csrEntryId: string;

  beforeAll(async () => {
    // 1. Setup Dedicated Institution
    let inst = await prisma.institution.findFirst({
      where: { code: "U-MOU-0603" },
    });
    if (!inst) {
      inst = await prisma.institution.create({
        data: {
          name: "Birla Institute of Technology Mesra (CSR Lab)",
          code: "U-MOU-0603",
          tier: "TIER_1",
          verificationStatus: "VERIFIED",
          activeProjects: 0,
          maxCapacity: 10,
        },
      });
    } else {
      inst = await prisma.institution.update({
        where: { id: inst.id },
        data: { verificationStatus: "VERIFIED", activeProjects: 0, maxCapacity: 10 },
      });
    }
    testInstitution = { id: inst.id, code: inst.code, name: inst.name };

    // 2. Setup Industry Partner
    let partner = await prisma.industryPartner.findFirst({
      where: { cin: "L28920MH1945PLC004599" },
    });
    if (!partner) {
      partner = await prisma.industryPartner.create({
        data: {
          organizationName: "Tata Motors Limited",
          cin: "L28920MH1945PLC004599",
          industrySector: "AUTOMOTIVE",
          verificationStatus: "VERIFIED",
        },
      });
    } else {
      partner = await prisma.industryPartner.update({
        where: { id: partner.id },
        data: { verificationStatus: "VERIFIED" },
      });
    }
    testIndustryPartner = {
      id: partner.id,
      organizationName: partner.organizationName,
      cin: partner.cin,
    };

    // 3. Setup Users
    const facultyDb = await prisma.user.upsert({
      where: { email: "faculty.lead.csr@nitjsr.ac.in" },
      update: { institutionId: testInstitution.id, role: UserRole.FACULTY, verificationStatus: "VERIFIED" },
      create: {
        email: "faculty.lead.csr@nitjsr.ac.in",
        fullName: "Dr. A. K. Choudhary",
        passwordHash: "$2b$10$abcdefghijklmnopqrstuv",
        role: UserRole.FACULTY,
        institutionId: testInstitution.id,
        verificationStatus: "VERIFIED",
      },
    });
    facultyUser = { id: facultyDb.id, role: facultyDb.role as UserRole, institutionId: testInstitution.id };
    facultyToken = await signAccessToken({
      sub: facultyDb.id,
      email: facultyDb.email,
      role: facultyDb.role,
      institutionId: testInstitution.id,
      verificationStatus: "VERIFIED",
    });

    const heiAdminDb = await prisma.user.upsert({
      where: { email: "dean.rnd.csr@nitjsr.ac.in" },
      update: { institutionId: testInstitution.id, role: UserRole.INSTITUTION_ADMIN, verificationStatus: "VERIFIED" },
      create: {
        email: "dean.rnd.csr@nitjsr.ac.in",
        fullName: "Dean R&D NITJSR",
        passwordHash: "$2b$10$abcdefghijklmnopqrstuv",
        role: UserRole.INSTITUTION_ADMIN,
        institutionId: testInstitution.id,
        verificationStatus: "VERIFIED",
      },
    });
    heiAdminUser = { id: heiAdminDb.id, role: heiAdminDb.role as UserRole, institutionId: testInstitution.id };
    heiAdminToken = await signAccessToken({
      sub: heiAdminDb.id,
      email: heiAdminDb.email,
      role: heiAdminDb.role,
      institutionId: testInstitution.id,
      verificationStatus: "VERIFIED",
    });

    const studentDb = await prisma.user.upsert({
      where: { email: "student.csr@nitjsr.ac.in" },
      update: { institutionId: testInstitution.id, role: UserRole.STUDENT, verificationStatus: "VERIFIED" },
      create: {
        email: "student.csr@nitjsr.ac.in",
        fullName: "Rahul Verma",
        passwordHash: "$2b$10$abcdefghijklmnopqrstuv",
        role: UserRole.STUDENT,
        institutionId: testInstitution.id,
        verificationStatus: "VERIFIED",
      },
    });
    studentUser = { id: studentDb.id, role: studentDb.role as UserRole, institutionId: testInstitution.id };
    studentToken = await signAccessToken({
      sub: studentDb.id,
      email: studentDb.email,
      role: studentDb.role,
      institutionId: testInstitution.id,
      verificationStatus: "VERIFIED",
    });

    const industryDb = await prisma.user.upsert({
      where: { email: "csr.head@tatamotors.com" },
      update: { industryPartnerId: testIndustryPartner.id, role: UserRole.INDUSTRY_PARTNER, verificationStatus: "VERIFIED" },
      create: {
        email: "csr.head@tatamotors.com",
        fullName: "Rajiv Sharma (CSR Head)",
        passwordHash: "$2b$10$abcdefghijklmnopqrstuv",
        role: UserRole.INDUSTRY_PARTNER,
        industryPartnerId: testIndustryPartner.id,
        verificationStatus: "VERIFIED",
      },
    });
    industryPartnerUser = { id: industryDb.id, role: industryDb.role as UserRole, industryPartnerId: testIndustryPartner.id };
    industryToken = await signAccessToken({
      sub: industryDb.id,
      email: industryDb.email,
      role: industryDb.role,
      industryPartnerId: testIndustryPartner.id,
      verificationStatus: "VERIFIED",
    });

    const govtDb = await prisma.user.upsert({
      where: { email: "director.rnd@education.gov.in" },
      update: { role: UserRole.GOVT_OFFICIAL, verificationStatus: "VERIFIED" },
      create: {
        email: "director.rnd@education.gov.in",
        fullName: "Director R&D MoE",
        passwordHash: "$2b$10$abcdefghijklmnopqrstuv",
        role: UserRole.GOVT_OFFICIAL,
        verificationStatus: "VERIFIED",
      },
    });
    govtOfficialUser = { id: govtDb.id, role: govtDb.role as UserRole };
    govtToken = await signAccessToken({
      sub: govtDb.id,
      email: govtDb.email,
      role: govtDb.role,
      verificationStatus: "VERIFIED",
    });

    // 4. Setup Challenge & CapabilityMatch
    const challenge = await prisma.challenge.create({
      data: {
        title: "Smart Micro-Grid for Rural Electrification",
        problemStatement: "Deploying renewable microgrids across Jharkhand villages",
        createdById: facultyDb.id,
        status: "OPEN",
      },
    });
    testChallenge = { id: challenge.id };

    await prisma.capabilityMatch.create({
      data: {
        challengeId: challenge.id,
        institutionId: testInstitution.id,
        similarityScore: 0.92,
        status: "SUGGESTED",
      },
    });

    // 5. Create Project via API
    const projectReq = new Request("http://localhost:3000/api/v1/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${facultyToken}`,
      },
      body: JSON.stringify({
        challengeId: testChallenge.id,
        title: "Tribal Village Micro-Grid Initiative",
        description: "Autonomous solar micro-grid with predictive battery management",
      }),
    });
    const projRes = await createProjectHandler(projectReq as any);
    const projJson = await projRes.json();
    projectId = projJson.data.id;

    // 6. Assign Industry Partner via API
    const partnerReq = new Request(`http://localhost:3000/api/v1/projects/${projectId}/partner`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${facultyToken}`,
      },
      body: JSON.stringify({
        partnerId: testIndustryPartner.id,
      }),
    });
    const partnerRes = await assignPartnerHandler(partnerReq as any, { params: Promise.resolve({ id: projectId }) });
    expect(partnerRes.status).toBe(200);

    // 7. Submit Initial Milestone
    const milestoneReq = new Request(`http://localhost:3000/api/v1/projects/${projectId}/milestones`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${facultyToken}`,
      },
      body: JSON.stringify({
        phase: ProjectPhase.POC,
        title: "Solar Controller Micro-Inverter Schematics",
        summary: "Detailed engineering circuit diagrams and SPICE simulation benchmarks",
        artifactKeys: ["s3://artifacts/microgrid-spice-v1.pdf"],
      }),
    });
    const milestoneRes = await submitMilestoneHandler(milestoneReq as any, {
      params: Promise.resolve({ id: projectId }),
    });
    const milestoneJson = await milestoneRes.json();
    milestoneId = milestoneJson.data.id;
  });

  afterAll(async () => {
    if (projectId) {
      await prisma.project.delete({ where: { id: projectId } }).catch(() => {});
    }
    if (testChallenge?.id) {
      await prisma.challenge.delete({ where: { id: testChallenge.id } }).catch(() => {});
    }
  });

  // ==========================================================================
  // Section 1: Bilateral MoU Generation API
  // ==========================================================================

  it("fails to draft MoU if IP ownership percentages do not total 100%", async () => {
    const req = new Request(`http://localhost:3000/api/v1/projects/${projectId}/mou`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${heiAdminToken}`,
      },
      body: JSON.stringify({
        pledgedAmountInr: 500000,
        ipOwnershipSplit: { heiPercentage: 60, industryPercentage: 30 }, // 90% != 100%
        milestoneSchedule: [
          { phase: "POC", deliverable: "Hardware prototype", trancheAmountInr: 250000 },
        ],
      }),
    });

    const res = await createMouHandler(req as any, { params: Promise.resolve({ id: projectId }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("VALIDATION_ERROR");
  });

  it("rejects unauthorized students from drafting an MoU (403)", async () => {
    const req = new Request(`http://localhost:3000/api/v1/projects/${projectId}/mou`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        pledgedAmountInr: 500000,
        ipOwnershipSplit: { heiPercentage: 50, industryPercentage: 50 },
      }),
    });

    const res = await createMouHandler(req as any, { params: Promise.resolve({ id: projectId }) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("FORBIDDEN");
  });

  it("drafts structured bilateral MoU with auto-generated mouNumber and mandatory compliance clause", async () => {
    const req = new Request(`http://localhost:3000/api/v1/projects/${projectId}/mou`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${heiAdminToken}`,
      },
      body: JSON.stringify({
        pledgedAmountInr: 500000,
        ipOwnershipSplit: { heiPercentage: 70, industryPercentage: 30 },
        milestoneSchedule: [
          { phase: "POC", deliverable: "Proof of Concept Schematics", trancheAmountInr: 200000, targetMonth: 1 },
          { phase: "PROTOTYPING", deliverable: "Working Microgrid Inverter", trancheAmountInr: 300000, targetMonth: 3 },
        ],
      }),
    });

    const res = await createMouHandler(req as any, { params: Promise.resolve({ id: projectId }) });
    expect(res.status).toBe(201);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.mouNumber).toMatch(/^MOU-SIH26-\d{4}$/);
    expect(json.data.status).toBe("DRAFT");
    expect(Number(json.data.pledgedAmountInr)).toBe(500000);
    expect(json.data.complianceClause).toContain(
      "All CSR disbursements occur exclusively via external banking channels outside the platform"
    );

    mouId = json.data.id;
    mouNumber = json.data.mouNumber;
  });

  it("lists project MoUs via GET /api/v1/projects/[id]/mou", async () => {
    const req = new Request(`http://localhost:3000/api/v1/projects/${projectId}/mou`, {
      headers: { authorization: `Bearer ${facultyToken}` },
    });

    const res = await listMousHandler(req as any, { params: Promise.resolve({ id: projectId }) });
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBeGreaterThanOrEqual(1);
    expect(json.data.some((m: { id: string }) => m.id === mouId)).toBe(true);
  });

  // ==========================================================================
  // Section 2: Bilateral MoU Acknowledgment Workflow
  // ==========================================================================

  it("records HEI acknowledgment as the first signatory track", async () => {
    const req = new Request(`http://localhost:3000/api/v1/projects/${projectId}/mou/${mouId}/acknowledge`, {
      method: "POST",
      headers: { authorization: `Bearer ${heiAdminToken}` },
    });

    const res = await acknowledgeMouHandler(req as any, {
      params: Promise.resolve({ id: projectId, mouId }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.mutuallyAcknowledged).toBe(false);
    expect(json.data.mou.status).toBe("HEI_ACKNOWLEDGED");
    expect(json.data.mou.heiAcknowledgedAt).toBeDefined();
    expect(json.data.mou.industryAcknowledgedAt).toBeNull();
  });

  it("records Industry Partner acknowledgment as the second track and updates project fundingStatus to CSR_PLEDGED", async () => {
    const req = new Request(`http://localhost:3000/api/v1/projects/${projectId}/mou/${mouId}/acknowledge`, {
      method: "POST",
      headers: { authorization: `Bearer ${industryToken}` },
    });

    const res = await acknowledgeMouHandler(req as any, {
      params: Promise.resolve({ id: projectId, mouId }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.mutuallyAcknowledged).toBe(true);
    expect(json.data.mou.status).toBe("MUTUALLY_ACKNOWLEDGED");
    expect(json.data.mou.signedDate).toBeDefined();

    // Verify project level fundingStatus is updated
    const projInDb = await prisma.project.findUnique({ where: { id: projectId } });
    expect(projInDb?.fundingStatus).toBe("CSR_PLEDGED");
  });

  // ==========================================================================
  // Section 3: In-Platform Payment Gate Prohibitions
  // ==========================================================================

  it("strictly prohibits and rejects in-platform payment gateway execution fields (Razorpay/Stripe/UPI)", async () => {
    const payloadWithRazorpay = {
      amountInr: 100000,
      paymentMode: "EXTERNAL_NEFT",
      externalReferenceNo: "NEFT-123456",
      razorpay_payment_id: "pay_Lk23h98df12",
    };

    const req = new Request(`http://localhost:3000/api/v1/projects/${projectId}/csr-ledger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${industryToken}`,
      },
      body: JSON.stringify(payloadWithRazorpay),
    });

    const res = await recordCsrLedgerHandler(req as any, { params: Promise.resolve({ id: projectId }) });
    expect(res.status).toBe(400);
    const json = await res.json();

    expect(json.error).toBe("IN_PLATFORM_PAYMENT_PROHIBITED");
    expect(json.message).toContain("In-platform payment execution is strictly prohibited");
  });

  it("strictly prohibits and rejects UPI VPA strings in payload", async () => {
    const payloadWithUpi = {
      amountInr: 50000,
      paymentMode: "EXTERNAL_NEFT",
      externalReferenceNo: "NEFT-998877",
      recipientVpa: "institute@okhdfcbank",
    };

    const req = new Request(`http://localhost:3000/api/v1/projects/${projectId}/csr-ledger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${industryToken}`,
      },
      body: JSON.stringify(payloadWithUpi),
    });

    const res = await recordCsrLedgerHandler(req as any, { params: Promise.resolve({ id: projectId }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("IN_PLATFORM_PAYMENT_PROHIBITED");
  });

  // ==========================================================================
  // Section 4: Recording Off-Platform CSR Disbursements
  // ==========================================================================

  it("allows verified Industry Partner to record legitimate off-platform CSR disbursement", async () => {
    const req = new Request(`http://localhost:3000/api/v1/projects/${projectId}/csr-ledger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${industryToken}`,
      },
      body: JSON.stringify({
        amountInr: 200000,
        paymentMode: "EXTERNAL_NEFT",
        externalReferenceNo: "UTR-SBIN-20261120-445566",
        milestoneId,
        receiptKey: "s3://receipts/nitjsr-tata-neft-tranche1.pdf",
        remarks: "First tranche disbursed towards PoC solar inverter prototyping hardware",
      }),
    });

    const res = await recordCsrLedgerHandler(req as any, { params: Promise.resolve({ id: projectId }) });
    expect(res.status).toBe(201);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(Number(json.data.amount)).toBe(200000);
    expect(json.data.paymentMode).toBe("EXTERNAL_NEFT");
    expect(json.data.status).toBe(CsrEntryStatus.SUBMITTED);
    expect(json.data.externalReferenceNo).toBe("UTR-SBIN-20261120-445566");

    csrEntryId = json.data.id;

    // Verify AuditLog was recorded
    const audit = await prisma.auditLog.findFirst({
      where: {
        entityId: csrEntryId,
        action: "CSR_DISBURSEMENT_RECORDED",
      },
    });
    expect(audit).toBeDefined();
    expect(audit?.userId).toBe(industryPartnerUser.id);
  });

  it("computes accurate CSR financial ledger summary via GET /api/v1/projects/[id]/csr-ledger", async () => {
    const req = new Request(`http://localhost:3000/api/v1/projects/${projectId}/csr-ledger`, {
      headers: { authorization: `Bearer ${facultyToken}` },
    });

    const res = await getCsrLedgerHandler(req as any, { params: Promise.resolve({ id: projectId }) });
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.summary).toBeDefined();
    expect(json.summary.totalDisbursedInr).toBe(200000);
    expect(json.summary.pendingVerificationInr).toBe(200000);
    expect(json.summary.totalVerifiedInr).toBe(0);
    expect(json.summary.entriesCount).toBe(1);
  });

  // ==========================================================================
  // Section 5: CSR Tranche Verification Gate & Project Funding Status Update
  // ==========================================================================

  it("prevents Industry Partner or Student from verifying external CSR disbursement (403)", async () => {
    const partnerReq = new Request(
      `http://localhost:3000/api/v1/projects/${projectId}/csr-ledger/${csrEntryId}/verify`,
      {
        method: "PATCH",
        headers: { authorization: `Bearer ${industryToken}` },
      }
    );

    const partnerRes = await verifyCsrLedgerHandler(partnerReq as any, {
      params: Promise.resolve({ id: projectId, entryId: csrEntryId }),
    });
    expect(partnerRes.status).toBe(403);

    const studentReq = new Request(
      `http://localhost:3000/api/v1/projects/${projectId}/csr-ledger/${csrEntryId}/verify`,
      {
        method: "PATCH",
        headers: { authorization: `Bearer ${studentToken}` },
      }
    );

    const studentRes = await verifyCsrLedgerHandler(studentReq as any, {
      params: Promise.resolve({ id: projectId, entryId: csrEntryId }),
    });
    expect(studentRes.status).toBe(403);
  });

  it("allows HEI Admin to verify off-platform bank tranche, updating status to VERIFIED and project to CSR_FUNDED", async () => {
    const req = new Request(
      `http://localhost:3000/api/v1/projects/${projectId}/csr-ledger/${csrEntryId}/verify`,
      {
        method: "PATCH",
        headers: { authorization: `Bearer ${heiAdminToken}` },
      }
    );

    const res = await verifyCsrLedgerHandler(req as any, {
      params: Promise.resolve({ id: projectId, entryId: csrEntryId }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.entry.status).toBe(CsrEntryStatus.VERIFIED);
    expect(json.data.entry.verifiedAt).toBeDefined();
    expect(json.data.entry.verifiedBy).toBe(heiAdminUser.id);
    expect(json.data.project.fundingStatus).toBe("CSR_FUNDED");

    // Verify AuditLog
    const audit = await prisma.auditLog.findFirst({
      where: {
        entityId: csrEntryId,
        action: "CSR_DISBURSEMENT_VERIFIED",
      },
    });
    expect(audit).toBeDefined();
    expect(audit?.userId).toBe(heiAdminUser.id);

    // Verify Project GET reflects CSR_FUNDED and contains MoUs + CSR ledger entries
    const projReq = new Request(`http://localhost:3000/api/v1/projects/${projectId}`, {
      headers: { authorization: `Bearer ${facultyToken}` },
    });
    const projRes = await getProjectHandler(projReq as any, {
      params: Promise.resolve({ id: projectId }),
    });
    const projJson = await projRes.json();

    expect(projJson.data.fundingStatus).toBe("CSR_FUNDED");
    expect(projJson.data.mous.length).toBeGreaterThanOrEqual(1);
    expect(projJson.data.csrLedgerEntries.length).toBeGreaterThanOrEqual(1);
    expect(projJson.data.csrLedgerEntries[0].status).toBe(CsrEntryStatus.VERIFIED);
  });

  it("prevents double-verification of already verified CSR disbursement (409)", async () => {
    const req = new Request(
      `http://localhost:3000/api/v1/projects/${projectId}/csr-ledger/${csrEntryId}/verify`,
      {
        method: "PATCH",
        headers: { authorization: `Bearer ${govtToken}` },
      }
    );

    const res = await verifyCsrLedgerHandler(req as any, {
      params: Promise.resolve({ id: projectId, entryId: csrEntryId }),
    });

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("ALREADY_VERIFIED");
  });
});
