import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { POST as createProjectHandler } from "@/app/api/v1/projects/route";
import { POST as assignPartnerHandler } from "@/app/api/v1/projects/[id]/partner/route";
import { POST as addMembersHandler } from "@/app/api/v1/projects/[id]/members/route";
import { POST as submitMilestoneHandler } from "@/app/api/v1/projects/[id]/milestones/route";
import { POST as signTransitionHandler } from "@/app/api/v1/projects/[id]/transitions/sign/route";
import { GET as getProjectHandler } from "@/app/api/v1/projects/[id]/route";
import { prisma, UserRole, ProjectPhase } from "@sih/db";
import { signAccessToken } from "@/lib/auth/jwt";

describe("PLM Dual-Signature Transition Engine Integration Suite (Milestone 6.2)", () => {
  let facultyUser: any;
  let facultyToken: string;

  let heiAdminUser: any;
  let heiAdminToken: string;

  let studentUser: any;
  let studentToken: string;

  let citizenUser: any;
  let citizenToken: string;

  let industryPartnerUser: any;
  let industryToken: string;

  let otherPartnerUser: any;
  let otherPartnerToken: string;

  let unverifiedPartnerUser: any;
  let unverifiedPartnerToken: string;

  let testInstitution: any;
  let testIndustryPartner: any;
  let unverifiedPartner: any;
  let otherPartner: any;

  let testChallenge: any;
  let projectId: string;
  let milestoneId: string;
  let initialContentHash: string;

  beforeAll(async () => {
    // 1. Institution Setup
    testInstitution = await prisma.institution.findFirst({
      where: { code: "U-DUALSIG-0602", verificationStatus: "VERIFIED" },
    });
    if (!testInstitution) {
      testInstitution = await prisma.institution.create({
        data: {
          name: "National Institute of Technology Jamshedpur (DualSig)",
          code: "U-DUALSIG-0602",
          tier: "TIER_1",
          verificationStatus: "VERIFIED",
          activeProjects: 1,
          maxCapacity: 10,
        },
      });
    }

    // 2. Industry Partners Setup
    testIndustryPartner = await prisma.industryPartner.findFirst({
      where: { cin: "L27100MH1907PLC000260" },
    });
    if (!testIndustryPartner) {
      testIndustryPartner = await prisma.industryPartner.create({
        data: {
          organizationName: "Tata Steel CSR Foundation",
          cin: "L27100MH1907PLC000260",
          industrySector: "METALS_MINING",
          verificationStatus: "VERIFIED",
        },
      });
    }

    unverifiedPartner = await prisma.industryPartner.findFirst({
      where: { organizationName: "Unverified Mining MSME" },
    });
    if (!unverifiedPartner) {
      unverifiedPartner = await prisma.industryPartner.create({
        data: {
          organizationName: "Unverified Mining MSME",
          cin: "U99999JH2024PTC999999",
          industrySector: "MANUFACTURING",
          verificationStatus: "PENDING",
        },
      });
    }

    otherPartner = await prisma.industryPartner.findFirst({
      where: { cin: "L17111MH1973PLC019786" },
    });
    if (!otherPartner) {
      otherPartner = await prisma.industryPartner.create({
        data: {
          organizationName: "Reliance Industries CSR",
          cin: "L17111MH1973PLC019786",
          industrySector: "ENERGY",
          verificationStatus: "VERIFIED",
        },
      });
    }

    // 3. User Setup
    // Faculty Lead
    facultyUser = await prisma.user.findFirst({
      where: { email: "faculty.dualsig@nitjsr.ac.in" },
    });
    if (!facultyUser) {
      facultyUser = await prisma.user.create({
        data: {
          email: "faculty.dualsig@nitjsr.ac.in",
          passwordHash: "hash",
          fullName: "Dr. Arvind Kumar",
          role: UserRole.FACULTY,
          institutionId: testInstitution.id,
          verificationStatus: "VERIFIED",
          phoneNumber: "+919876500001",
        },
      });
    } else {
      facultyUser = await prisma.user.update({
        where: { id: facultyUser.id },
        data: { institutionId: testInstitution.id, verificationStatus: "VERIFIED" },
      });
    }
    facultyToken = await signAccessToken({
      sub: facultyUser.id,
      email: facultyUser.email,
      role: facultyUser.role,
      institutionId: facultyUser.institutionId,
      verificationStatus: facultyUser.verificationStatus,
    });

    // HEI Admin
    heiAdminUser = await prisma.user.findFirst({
      where: { email: "admin.dualsig@nitjsr.ac.in" },
    });
    if (!heiAdminUser) {
      heiAdminUser = await prisma.user.create({
        data: {
          email: "admin.dualsig@nitjsr.ac.in",
          passwordHash: "hash",
          fullName: "NIT JSR Admin",
          role: UserRole.INSTITUTION_ADMIN,
          institutionId: testInstitution.id,
          verificationStatus: "VERIFIED",
          phoneNumber: "+919876500002",
        },
      });
    } else {
      heiAdminUser = await prisma.user.update({
        where: { id: heiAdminUser.id },
        data: { institutionId: testInstitution.id, verificationStatus: "VERIFIED" },
      });
    }
    heiAdminToken = await signAccessToken({
      sub: heiAdminUser.id,
      email: heiAdminUser.email,
      role: heiAdminUser.role,
      institutionId: heiAdminUser.institutionId,
      verificationStatus: heiAdminUser.verificationStatus,
    });

    // Student
    studentUser = await prisma.user.findFirst({
      where: { email: "student.dualsig@nitjsr.ac.in" },
    });
    if (!studentUser) {
      studentUser = await prisma.user.create({
        data: {
          email: "student.dualsig@nitjsr.ac.in",
          passwordHash: "hash",
          fullName: "Rahul Verma",
          role: UserRole.STUDENT,
          institutionId: testInstitution.id,
          verificationStatus: "VERIFIED",
        },
      });
    } else {
      studentUser = await prisma.user.update({
        where: { id: studentUser.id },
        data: { institutionId: testInstitution.id, verificationStatus: "VERIFIED" },
      });
    }
    studentToken = await signAccessToken({
      sub: studentUser.id,
      email: studentUser.email,
      role: studentUser.role,
      institutionId: studentUser.institutionId,
      verificationStatus: studentUser.verificationStatus,
    });

    // Citizen
    citizenUser = await prisma.user.findFirst({
      where: { email: "citizen.dualsig@jharkhand.gov.in" },
    });
    if (!citizenUser) {
      citizenUser = await prisma.user.create({
        data: {
          email: "citizen.dualsig@jharkhand.gov.in",
          passwordHash: "hash",
          fullName: "Amit Soren",
          role: UserRole.CITIZEN,
          verificationStatus: "VERIFIED",
        },
      });
    }
    citizenToken = await signAccessToken({
      sub: citizenUser.id,
      email: citizenUser.email,
      role: citizenUser.role,
      verificationStatus: citizenUser.verificationStatus,
    });

    // Verified Industry Partner Rep
    industryPartnerUser = await prisma.user.findFirst({
      where: { email: "csr.dualsig@tatasteel.com" },
    });
    if (!industryPartnerUser) {
      industryPartnerUser = await prisma.user.create({
        data: {
          email: "csr.dualsig@tatasteel.com",
          passwordHash: "hash",
          fullName: "Tata Steel CSR Lead",
          role: UserRole.INDUSTRY_PARTNER,
          industryPartnerId: testIndustryPartner.id,
          verificationStatus: "VERIFIED",
          phoneNumber: "+919876500005",
        },
      });
    }
    industryToken = await signAccessToken({
      sub: industryPartnerUser.id,
      email: industryPartnerUser.email,
      role: industryPartnerUser.role,
      industryPartnerId: industryPartnerUser.industryPartnerId,
      verificationStatus: industryPartnerUser.verificationStatus,
    });

    // Other Industry Partner Rep
    otherPartnerUser = await prisma.user.findFirst({
      where: { email: "rep.dualsig@reliance.com" },
    });
    if (!otherPartnerUser) {
      otherPartnerUser = await prisma.user.create({
        data: {
          email: "rep.dualsig@reliance.com",
          passwordHash: "hash",
          fullName: "Other Partner Rep",
          role: UserRole.INDUSTRY_PARTNER,
          industryPartnerId: otherPartner.id,
          verificationStatus: "VERIFIED",
        },
      });
    }
    otherPartnerToken = await signAccessToken({
      sub: otherPartnerUser.id,
      email: otherPartnerUser.email,
      role: otherPartnerUser.role,
      industryPartnerId: otherPartnerUser.industryPartnerId,
      verificationStatus: otherPartnerUser.verificationStatus,
    });

    // Unverified Partner User
    unverifiedPartnerUser = await prisma.user.findFirst({
      where: { email: "unverified.dualsig@msme.com" },
    });
    if (!unverifiedPartnerUser) {
      unverifiedPartnerUser = await prisma.user.create({
        data: {
          email: "unverified.dualsig@msme.com",
          passwordHash: "hash",
          fullName: "Unverified Rep",
          role: UserRole.INDUSTRY_PARTNER,
          industryPartnerId: unverifiedPartner.id,
          verificationStatus: "PENDING",
        },
      });
    }
    unverifiedPartnerToken = await signAccessToken({
      sub: unverifiedPartnerUser.id,
      email: unverifiedPartnerUser.email,
      role: unverifiedPartnerUser.role,
      industryPartnerId: unverifiedPartnerUser.industryPartnerId,
      verificationStatus: unverifiedPartnerUser.verificationStatus,
    });

    // 4. Create Project with Challenge and Matched Capability
    testChallenge = await prisma.challenge.create({
      data: {
        title: `Slag Beneficiation Dual-Sig Test ${Date.now()}`,
        problemStatement: "Testing dual-signature state machine transitions.",
        createdById: facultyUser.id,
        status: "OPEN",
      },
    });

    await prisma.capabilityMatch.create({
      data: {
        challengeId: testChallenge.id,
        institutionId: testInstitution.id,
        similarityScore: 0.95,
        status: "SUGGESTED",
      },
    });

    // Claim challenge -> Create Project (currentPhase: POC)
    const createReq = new Request("http://localhost:3000/api/v1/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sih_access_token=${facultyToken}`,
      },
      body: JSON.stringify({
        challengeId: testChallenge.id,
        title: "Slag Beneficiation PLM Incubator",
      }),
    });
    const createRes = await createProjectHandler(createReq as any);
    const createData = await createRes.json();
    projectId = createData.data.id;

    // Link Industry Partner
    const partnerReq = new Request(`http://localhost:3000/api/v1/projects/${projectId}/partner`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sih_access_token=${industryToken}`,
      },
    });
    await assignPartnerHandler(partnerReq as any, {
      params: Promise.resolve({ id: projectId }),
    });

    // Add Student Member
    const memberReq = new Request(`http://localhost:3000/api/v1/projects/${projectId}/members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sih_access_token=${facultyToken}`,
      },
      body: JSON.stringify({
        studentId: studentUser.id,
        role: "STUDENT",
      }),
    });
    await addMembersHandler(memberReq as any, {
      params: Promise.resolve({ id: projectId }),
    });

    // Submit Milestone Deliverable
    const msReq = new Request(`http://localhost:3000/api/v1/projects/${projectId}/milestones`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sih_access_token=${facultyToken}`,
      },
      body: JSON.stringify({
        title: "PoC Lab Leaching Characterization",
        summary: "Detailed wet chemical digestion and mineral extraction report.",
        artifactKeys: ["milestone_artifact/faculty/digestion-report.pdf"],
      }),
    });
    const msRes = await submitMilestoneHandler(msReq as any, {
      params: Promise.resolve({ id: projectId }),
    });
    const msData = await msRes.json();
    milestoneId = msData.data.milestone.id;
    initialContentHash = msData.data.contentHash;
  });

  afterAll(async () => {
    if (projectId) {
      await prisma.project.deleteMany({ where: { id: projectId } });
    }
    if (testChallenge?.id) {
      await prisma.capabilityMatch.deleteMany({ where: { challengeId: testChallenge.id } });
      await prisma.challenge.deleteMany({ where: { id: testChallenge.id } });
    }
  });

  // ==========================================================================
  // 1. Authorization & Role Rejections
  // ==========================================================================

  it("should reject unauthenticated transition signature requests with 401", async () => {
    const req = new Request(`http://localhost:3000/api/v1/projects/${projectId}/transitions/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        milestoneId,
        decision: "APPROVED",
      }),
    });

    const res = await signTransitionHandler(req as any, {
      params: Promise.resolve({ id: projectId }),
    });
    expect(res.status).toBe(401);
  });

  it("should reject Student role attempting to sign with 403 FORBIDDEN", async () => {
    const req = new Request(`http://localhost:3000/api/v1/projects/${projectId}/transitions/sign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sih_access_token=${studentToken}`,
      },
      body: JSON.stringify({
        milestoneId,
        decision: "APPROVED",
      }),
    });

    const res = await signTransitionHandler(req as any, {
      params: Promise.resolve({ id: projectId }),
    });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("FORBIDDEN");
  });

  it("should reject Citizen role attempting to sign with 403 FORBIDDEN", async () => {
    const req = new Request(`http://localhost:3000/api/v1/projects/${projectId}/transitions/sign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sih_access_token=${citizenToken}`,
      },
      body: JSON.stringify({
        milestoneId,
        decision: "APPROVED",
      }),
    });

    const res = await signTransitionHandler(req as any, {
      params: Promise.resolve({ id: projectId }),
    });
    expect(res.status).toBe(403);
  });

  it("should reject unverified industry partner attempting to sign with 403 ORG_NOT_VERIFIED", async () => {
    const req = new Request(`http://localhost:3000/api/v1/projects/${projectId}/transitions/sign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sih_access_token=${unverifiedPartnerToken}`,
      },
      body: JSON.stringify({
        milestoneId,
        decision: "APPROVED",
      }),
    });

    const res = await signTransitionHandler(req as any, {
      params: Promise.resolve({ id: projectId }),
    });
    expect(res.status).toBe(403);
  });

  it("should reject an industry partner not linked to the project with 403", async () => {
    const req = new Request(`http://localhost:3000/api/v1/projects/${projectId}/transitions/sign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sih_access_token=${otherPartnerToken}`,
      },
      body: JSON.stringify({
        milestoneId,
        decision: "APPROVED",
      }),
    });

    const res = await signTransitionHandler(req as any, {
      params: Promise.resolve({ id: projectId }),
    });
    expect(res.status).toBe(403);
  });

  // ==========================================================================
  // 2. Single Signature Behavior (Does NOT Advance Phase)
  // ==========================================================================

  it("should record Academic Lead signature, retain project in POC, and await External co-signature", async () => {
    const req = new Request(`http://localhost:3000/api/v1/projects/${projectId}/transitions/sign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sih_access_token=${facultyToken}`,
      },
      body: JSON.stringify({
        milestoneId,
        decision: "APPROVED",
        remarks: "PoC deliverables thoroughly reviewed and experimentally verified in laboratory.",
      }),
    });

    const res = await signTransitionHandler(req as any, {
      params: Promise.resolve({ id: projectId }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.transitioned).toBe(false);
    expect(json.data.signaturesCount).toBe(1);
    expect(json.data.awaitingTrack).toBe("EXTERNAL_APPROVER");
    expect(json.data.snapshotHash).toBe(initialContentHash);

    // Verify project current phase remains POC
    const currentProj = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    expect(currentProj.currentPhase).toBe(ProjectPhase.POC);

    // Verify PhaseApproval record created
    const approval = await prisma.phaseApproval.findFirst({
      where: {
        milestoneId,
        signerId: facultyUser.id,
      },
    });
    expect(approval).toBeDefined();
    expect(approval?.signerRole).toBe("ACADEMIC_APPROVER");
    expect(approval?.snapshotHash).toBe(initialContentHash);
  });

  // ==========================================================================
  // 3. Duplicate Signer & Same Track Rejection (409 Conflict)
  // ==========================================================================

  it("should prevent the same user from signing twice with 409 DUPLICATE_SIGNER", async () => {
    const req = new Request(`http://localhost:3000/api/v1/projects/${projectId}/transitions/sign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sih_access_token=${facultyToken}`,
      },
      body: JSON.stringify({
        milestoneId,
        decision: "APPROVED",
      }),
    });

    const res = await signTransitionHandler(req as any, {
      params: Promise.resolve({ id: projectId }),
    });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("DUPLICATE_SIGNER");
  });

  it("should prevent two different users from the same track from co-signing with 409 TRACK_ALREADY_SIGNED", async () => {
    // HEI Admin belongs to ACADEMIC_APPROVER track, which was already signed by Faculty Lead
    const req = new Request(`http://localhost:3000/api/v1/projects/${projectId}/transitions/sign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sih_access_token=${heiAdminToken}`,
      },
      body: JSON.stringify({
        milestoneId,
        decision: "APPROVED",
      }),
    });

    const res = await signTransitionHandler(req as any, {
      params: Promise.resolve({ id: projectId }),
    });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("TRACK_ALREADY_SIGNED");
  });

  // ==========================================================================
  // 4. Stale Snapshot Hash Invalidation (Milestone Deliverable Tampering/Resubmission)
  // ==========================================================================

  it("should invalidate stale snapshot hash when milestone is resubmitted with modified deliverables", async () => {
    // Deliverable resubmitted with modified contents -> recalculates contentHash
    const resubmitReq = new Request(`http://localhost:3000/api/v1/projects/${projectId}/milestones`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sih_access_token=${facultyToken}`,
      },
      body: JSON.stringify({
        title: "PoC Lab Leaching Characterization - Rev 2",
        summary: "Updated mineral leaching assay incorporating ultrasonic cavitation pretreatment.",
        artifactKeys: [
          "milestone_artifact/faculty/digestion-report-v2.pdf",
          "milestone_artifact/faculty/ultrasonic-cavitation-logs.csv",
        ],
      }),
    });
    const resubmitRes = await submitMilestoneHandler(resubmitReq as any, {
      params: Promise.resolve({ id: projectId }),
    });
    const resubmitData = await resubmitRes.json();
    const updatedHash = resubmitData.data.contentHash;

    expect(updatedHash).not.toBe(initialContentHash);

    // Now, Industry Partner signs for updatedHash
    const industrySignReq = new Request(
      `http://localhost:3000/api/v1/projects/${projectId}/transitions/sign`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `sih_access_token=${industryToken}`,
        },
        body: JSON.stringify({
          milestoneId,
          decision: "APPROVED",
          remarks: "Verified updated Rev 2 cavitation deliverables.",
        }),
      }
    );

    const industrySignRes = await signTransitionHandler(industrySignReq as any, {
      params: Promise.resolve({ id: projectId }),
    });
    expect(industrySignRes.status).toBe(200);
    const industrySignJson = await industrySignRes.json();

    // Faculty Lead's signature was on initialContentHash (stale!), so only 1 signature matches updatedHash
    expect(industrySignJson.data.transitioned).toBe(false);
    expect(industrySignJson.data.signaturesCount).toBe(1);
    expect(industrySignJson.data.awaitingTrack).toBe("ACADEMIC_APPROVER");

    // Project must STILL remain in POC!
    const projCheck = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    expect(projCheck.currentPhase).toBe(ProjectPhase.POC);

    // Now Faculty Lead re-signs for the updatedHash
    const facultyResignReq = new Request(
      `http://localhost:3000/api/v1/projects/${projectId}/transitions/sign`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `sih_access_token=${facultyToken}`,
        },
        body: JSON.stringify({
          milestoneId,
          decision: "APPROVED",
          remarks: "Confirmed Rev 2 deliverables.",
        }),
      }
    );

    const facultyResignRes = await signTransitionHandler(facultyResignReq as any, {
      params: Promise.resolve({ id: projectId }),
    });
    expect(facultyResignRes.status).toBe(200);
    const facultyResignJson = await facultyResignRes.json();

    // Now both signatures match updatedHash -> Atomic transition to PROTOTYPING!
    expect(facultyResignJson.data.transitioned).toBe(true);
    expect(facultyResignJson.data.previousPhase).toBe(ProjectPhase.POC);
    expect(facultyResignJson.data.currentPhase).toBe(ProjectPhase.PROTOTYPING);
    expect(facultyResignJson.data.nepCreditsAwarded).toBe(2);
  });

  // ==========================================================================
  // 5. Verification of Phase Advancement, NEP Credits, and Audit Trail
  // ==========================================================================

  it("should confirm project advanced to PROTOTYPING with awarded NEP credits on GET /api/v1/projects/[id]", async () => {
    const req = new Request(`http://localhost:3000/api/v1/projects/${projectId}`, {
      method: "GET",
      headers: {
        Cookie: `sih_access_token=${facultyToken}`,
      },
    });

    const res = await getProjectHandler(req as any, {
      params: Promise.resolve({ id: projectId }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    const proj = json.data;

    // Phase successfully advanced to PROTOTYPING
    expect(proj.currentPhase).toBe(ProjectPhase.PROTOTYPING);

    // NEP Experiential Learning Credits awarded
    expect(proj.nepCreditSummary.earnedCredits).toBe(2); // POC phase completed & approved
    expect(proj.nepCreditSummary.eligibleCredits).toBe(6); // POC (2) + PROTOTYPING (4) eligible
    expect(proj.nepCreditSummary.phases.POC.status).toBe("COMPLETED");
    expect(proj.nepCreditSummary.phases.POC.isEarned).toBe(true);
    expect(proj.nepCreditSummary.phases.PROTOTYPING.status).toBe("IN_PROGRESS");

    // Verify Platform Audit Log recorded
    const transitionAudit = await prisma.auditLog.findFirst({
      where: {
        entityId: projectId,
        action: "PHASE_TRANSITION_COMPLETED",
      },
    });
    expect(transitionAudit).toBeDefined();

    const nepAudit = await prisma.auditLog.findFirst({
      where: {
        action: "NEP_CREDITS_AWARDED",
      },
    });
    expect(nepAudit).toBeDefined();
  });

  // ==========================================================================
  // 6. Milestone Rejection Flow
  // ==========================================================================

  it("should mark milestone REJECTED and keep project in current phase when an approver rejects", async () => {
    // Submit deliverables for the new PROTOTYPING phase
    const protoMsReq = new Request(`http://localhost:3000/api/v1/projects/${projectId}/milestones`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sih_access_token=${facultyToken}`,
      },
      body: JSON.stringify({
        title: "Alpha Pilot Mechanical Separation Prototype",
        summary: "CAD blueprint and pilot separator mechanical test results.",
        artifactKeys: ["milestone_artifact/faculty/pilot-separator-v1.step"],
      }),
    });
    const protoMsRes = await submitMilestoneHandler(protoMsReq as any, {
      params: Promise.resolve({ id: projectId }),
    });
    const protoMsData = await protoMsRes.json();
    const protoMilestoneId = protoMsData.data.milestone.id;

    // Industry Partner rejects prototype
    const rejectReq = new Request(`http://localhost:3000/api/v1/projects/${projectId}/transitions/sign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sih_access_token=${industryToken}`,
      },
      body: JSON.stringify({
        milestoneId: protoMilestoneId,
        decision: "REJECTED",
        remarks: "Throughput metrics in blueprint do not satisfy 50 tons/hour industrial SLA requirement.",
      }),
    });

    const rejectRes = await signTransitionHandler(rejectReq as any, {
      params: Promise.resolve({ id: projectId }),
    });
    expect(rejectRes.status).toBe(200);
    const rejectJson = await rejectRes.json();
    expect(rejectJson.data.decision).toBe("REJECTED");
    expect(rejectJson.data.transitioned).toBe(false);

    // Verify milestone status in DB is REJECTED
    const dbMilestone = await prisma.milestone.findUniqueOrThrow({
      where: { id: protoMilestoneId },
    });
    expect(dbMilestone.status).toBe("REJECTED");

    // Project currentPhase remains PROTOTYPING
    const projCheck = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    expect(projCheck.currentPhase).toBe(ProjectPhase.PROTOTYPING);

    // Verify AuditLog
    const rejectAudit = await prisma.auditLog.findFirst({
      where: {
        entityId: protoMilestoneId,
        action: "MILESTONE_REJECTED",
      },
    });
    expect(rejectAudit).toBeDefined();
  });

  // ==========================================================================
  // 7. Capacity Deallocation on Transition to IP_TECH_TRANSFER
  // ==========================================================================

  it("should decrement institution.activeProjects and record completion audit when advancing into IP_TECH_TRANSFER", async () => {
    // 1. Manually set project phase to FIELD_TEST
    await prisma.project.update({
      where: { id: projectId },
      data: { currentPhase: ProjectPhase.FIELD_TEST },
    });

    const instBefore = await prisma.institution.findUniqueOrThrow({
      where: { id: testInstitution.id },
      select: { activeProjects: true },
    });

    // 2. Submit milestone for FIELD_TEST
    const ftMsReq = new Request(`http://localhost:3000/api/v1/projects/${projectId}/milestones`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sih_access_token=${facultyToken}`,
      },
      body: JSON.stringify({
        title: "Field Pilot Operational Validation",
        summary: "1000-hour operational trial at industrial smelting facility validating continuous mineral reclamation.",
        artifactKeys: ["milestone_artifact/faculty/field-pilot-1000h.pdf"],
      }),
    });
    const ftMsRes = await submitMilestoneHandler(ftMsReq as any, {
      params: Promise.resolve({ id: projectId }),
    });
    const ftMsData = await ftMsRes.json();
    const ftMilestoneId = ftMsData.data.milestone.id;

    // 3. Academic signature
    const acadSignReq = new Request(`http://localhost:3000/api/v1/projects/${projectId}/transitions/sign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sih_access_token=${facultyToken}`,
      },
      body: JSON.stringify({
        milestoneId: ftMilestoneId,
        decision: "APPROVED",
        remarks: "Field test successful. Ready for IP Tech Transfer & patent licensing.",
      }),
    });
    await signTransitionHandler(acadSignReq as any, {
      params: Promise.resolve({ id: projectId }),
    });

    // 4. External Industry Partner signature
    const extSignReq = new Request(`http://localhost:3000/api/v1/projects/${projectId}/transitions/sign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sih_access_token=${industryToken}`,
      },
      body: JSON.stringify({
        milestoneId: ftMilestoneId,
        decision: "APPROVED",
        remarks: "Tata Steel approves technology transfer to industrial manufacturing line.",
      }),
    });
    const extSignRes = await signTransitionHandler(extSignReq as any, {
      params: Promise.resolve({ id: projectId }),
    });
    expect(extSignRes.status).toBe(200);
    const extSignJson = await extSignRes.json();

    expect(extSignJson.data.transitioned).toBe(true);
    expect(extSignJson.data.previousPhase).toBe(ProjectPhase.FIELD_TEST);
    expect(extSignJson.data.currentPhase).toBe(ProjectPhase.IP_TECH_TRANSFER);

    // 5. Verify capacity slot freed: institution.activeProjects decremented by 1
    const instAfter = await prisma.institution.findUniqueOrThrow({
      where: { id: testInstitution.id },
      select: { activeProjects: true },
    });
    expect(instAfter.activeProjects).toBe(instBefore.activeProjects - 1);

    // 6. Verify completion audit log recorded
    const capacityAudit = await prisma.auditLog.findFirst({
      where: {
        entityId: testInstitution.id,
        action: "PROJECT_COMPLETED_CAPACITY_RELEASED",
      },
    });
    expect(capacityAudit).toBeDefined();
  });
});
