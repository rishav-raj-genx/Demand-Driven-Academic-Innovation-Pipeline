import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { POST as createProjectHandler, GET as listProjectsHandler } from "./route";
import { GET as getProjectHandler, PATCH as patchProjectHandler } from "./[id]/route";
import { POST as assignPartnerHandler } from "./[id]/partner/route";
import { POST as addMembersHandler } from "./[id]/members/route";
import { POST as submitMilestoneHandler } from "./[id]/milestones/route";
import { prisma, UserRole, ProjectPhase } from "@sih/db";
import { signAccessToken } from "@/lib/auth/jwt";
import { computeMilestoneContentHash } from "@/lib/projects/hash";
import crypto, { randomUUID } from "node:crypto";

describe("Project Lifecycle Management Integration Suite (Milestone 6.1)", () => {
  let facultyUser: any;
  let facultyToken: string;

  let heiAdminUser: any;
  let heiAdminToken: string;

  let studentUser: any;
  let otherHeiStudentUser: any;
  let studentToken: string;

  let industryUser: any;
  let industryToken: string;

  let unverifiedPartnerUser: any;
  let unverifiedPartnerToken: string;

  let testInstitution: any;
  let otherInstitution: any;
  let testIndustryPartner: any;
  let unverifiedPartner: any;

  let testChallenge: any;
  let createdProjectId: string;

  beforeAll(async () => {
    // 1. Fetch or create test Institution 1 (Verified)
    testInstitution = await prisma.institution.findFirst({
      where: { code: "U-0205", verificationStatus: "VERIFIED" },
    });

    if (!testInstitution) {
      testInstitution = await prisma.institution.create({
        data: {
          name: "National Institute of Technology Jamshedpur",
          code: "U-0205",
          tier: "TIER_1",
          verificationStatus: "VERIFIED",
          activeProjects: 0,
          maxCapacity: 5,
        },
      });
    } else {
      // Reset active projects for deterministic testing
      await prisma.institution.update({
        where: { id: testInstitution.id },
        data: { activeProjects: 0, maxCapacity: 5 },
      });
    }

    // 2. Fetch or create Institution 2 (for cross-HEI isolation tests)
    otherInstitution = await prisma.institution.findFirst({
      where: { code: "U-0202" },
    });
    if (!otherInstitution) {
      otherInstitution = await prisma.institution.create({
        data: {
          name: "Birla Institute of Technology Mesra",
          code: "U-0202",
          tier: "TIER_1",
          verificationStatus: "VERIFIED",
          activeProjects: 0,
          maxCapacity: 5,
        },
      });
    }

    // 3. Fetch or create verified Industry Partner
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

    // 4. Fetch or create unverified Industry Partner
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

    // 5. Setup Users & JWTs
    // Faculty Lead
    facultyUser = await prisma.user.findFirst({
      where: { email: "faculty.test@nitjsr.ac.in" },
    });
    if (!facultyUser) {
      facultyUser = await prisma.user.create({
        data: {
          email: "faculty.test@nitjsr.ac.in",
          passwordHash: "dummy-hash",
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
      where: { email: "admin.test@nitjsr.ac.in" },
    });
    if (!heiAdminUser) {
      heiAdminUser = await prisma.user.create({
        data: {
          email: "admin.test@nitjsr.ac.in",
          passwordHash: "dummy-hash",
          fullName: "NIT Jamshedpur Admin",
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

    // Affiliated Student
    studentUser = await prisma.user.findFirst({
      where: { email: "student.test@nitjsr.ac.in" },
    });
    if (!studentUser) {
      studentUser = await prisma.user.create({
        data: {
          email: "student.test@nitjsr.ac.in",
          passwordHash: "dummy-hash",
          fullName: "Rahul Verma",
          role: UserRole.STUDENT,
          institutionId: testInstitution.id,
          verificationStatus: "VERIFIED",
          phoneNumber: "+919876500003",
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

    // Student from other HEI
    otherHeiStudentUser = await prisma.user.findFirst({
      where: { email: "student.other@bitmesra.ac.in" },
    });
    if (!otherHeiStudentUser) {
      otherHeiStudentUser = await prisma.user.create({
        data: {
          email: "student.other@bitmesra.ac.in",
          passwordHash: "dummy-hash",
          fullName: "Pooja Kumari",
          role: UserRole.STUDENT,
          institutionId: otherInstitution.id,
          verificationStatus: "VERIFIED",
          phoneNumber: "+919876500004",
        },
      });
    }

    // Verified Industry User
    industryUser = await prisma.user.findFirst({
      where: { email: "csr.rep@tatasteel.com" },
    });
    if (!industryUser) {
      industryUser = await prisma.user.create({
        data: {
          email: "csr.rep@tatasteel.com",
          passwordHash: "dummy-hash",
          fullName: "Tata CSR Rep",
          role: UserRole.INDUSTRY_PARTNER,
          industryPartnerId: testIndustryPartner.id,
          verificationStatus: "VERIFIED",
          phoneNumber: "+919876500005",
        },
      });
    }
    industryToken = await signAccessToken({
      sub: industryUser.id,
      email: industryUser.email,
      role: industryUser.role,
      industryPartnerId: industryUser.industryPartnerId,
      verificationStatus: industryUser.verificationStatus,
    });

    // Unverified Industry User
    unverifiedPartnerUser = await prisma.user.findFirst({
      where: { email: "unverified@msme.com" },
    });
    if (!unverifiedPartnerUser) {
      unverifiedPartnerUser = await prisma.user.create({
        data: {
          email: "unverified@msme.com",
          passwordHash: "dummy-hash",
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

    // 6. Create Fresh Test Challenge with CapabilityMatch
    testChallenge = await prisma.challenge.create({
      data: {
        title: `Heavy Metal Slag Extraction & Recycling ${Date.now()}`,
        problemStatement:
          "Industrial blast furnace slag accumulation requires sustainable extraction of rare earth and construction aggregates.",
        domain: "Waste Management",
        urgency: "HIGH",
        status: "OPEN",
        createdById: facultyUser.id,
      },
    });

    await prisma.capabilityMatch.create({
      data: {
        challengeId: testChallenge.id,
        institutionId: testInstitution.id,
        similarityScore: 0.94,
        matchRank: 1,
        status: "SUGGESTED",
        feedback: "High capability alignment in metallurgy and environmental engineering.",
      },
    });
  });

  afterAll(async () => {
    // Cleanup created test project if exists
    if (createdProjectId) {
      await prisma.project.deleteMany({ where: { id: createdProjectId } });
    }
    if (testChallenge?.id) {
      await prisma.capabilityMatch.deleteMany({ where: { challengeId: testChallenge.id } });
      await prisma.challenge.deleteMany({ where: { id: testChallenge.id } });
    }
  });

  // ==========================================================================
  // 1. Auth & Capability Match Gates on POST /api/v1/projects
  // ==========================================================================

  it("should reject unauthenticated request with 401", async () => {
    const req = new Request("http://localhost:3000/api/v1/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId: testChallenge.id }),
    });

    const res = await createProjectHandler(req as any);
    expect(res.status).toBe(401);
  });

  it("should reject unauthorized student role attempting to claim challenge with 403", async () => {
    const req = new Request("http://localhost:3000/api/v1/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sih_access_token=${studentToken}`,
      },
      body: JSON.stringify({ challengeId: testChallenge.id }),
    });

    const res = await createProjectHandler(req as any);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error.code).toBe("FORBIDDEN");
  });

  it("should reject claiming challenge without a valid CapabilityMatch with 403", async () => {
    // Challenge with no match for testInstitution
    const unmatchedChallenge = await prisma.challenge.create({
      data: {
        title: "Unmatched Challenge for Gate Test",
        problemStatement: "No capability match exists for this test challenge.",
        createdById: facultyUser.id,
      },
    });

    const req = new Request("http://localhost:3000/api/v1/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sih_access_token=${facultyToken}`,
      },
      body: JSON.stringify({ challengeId: unmatchedChallenge.id }),
    });

    const res = await createProjectHandler(req as any);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("NO_CAPABILITY_MATCH");

    // Cleanup
    await prisma.challenge.delete({ where: { id: unmatchedChallenge.id } });
  });

  // ==========================================================================
  // 2. Atomic Project Creation & Capacity Verification
  // ==========================================================================

  it("should successfully claim AI-matched challenge, atomically increment activeProjects, and record AuditLog", async () => {
    const instBefore = await prisma.institution.findUniqueOrThrow({
      where: { id: testInstitution.id },
      select: { activeProjects: true },
    });

    const req = new Request("http://localhost:3000/api/v1/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sih_access_token=${facultyToken}`,
      },
      body: JSON.stringify({
        challengeId: testChallenge.id,
        title: "Blast Furnace Slag Reclamation PoC",
        budget: 500000,
      }),
    });

    const res = await createProjectHandler(req as any);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.currentPhase).toBe("POC");
    expect(json.data.title).toBe("Blast Furnace Slag Reclamation PoC");
    expect(json.data.members[0].role).toBe("FACULTY_LEAD");
    expect(json.data.members[0].userId).toBe(facultyUser.id);

    createdProjectId = json.data.id;

    // Verify atomic increment on institution.activeProjects
    const instAfter = await prisma.institution.findUniqueOrThrow({
      where: { id: testInstitution.id },
      select: { activeProjects: true },
    });
    expect(instAfter.activeProjects).toBe(instBefore.activeProjects + 1);

    // Verify CapabilityMatch.status = ACCEPTED
    const match = await prisma.capabilityMatch.findUniqueOrThrow({
      where: {
        challengeId_institutionId: {
          challengeId: testChallenge.id,
          institutionId: testInstitution.id,
        },
      },
    });
    expect(match.status).toBe("ACCEPTED");

    // Verify Challenge.status = IN_PROJECT
    const updatedChallenge = await prisma.challenge.findUniqueOrThrow({
      where: { id: testChallenge.id },
    });
    expect(updatedChallenge.status).toBe("IN_PROJECT");

    // Verify AuditLog was recorded
    const audit = await prisma.auditLog.findFirst({
      where: {
        entityId: createdProjectId,
        action: "PROJECT_CREATED",
      },
    });
    expect(audit).toBeDefined();
    expect(audit?.userId).toBe(facultyUser.id);
  });

  // ==========================================================================
  // 3. Double-Claim Prevention (409 Conflict)
  // ==========================================================================

  it("should prevent double-claiming the same challenge with 409 Conflict", async () => {
    const req = new Request("http://localhost:3000/api/v1/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sih_access_token=${heiAdminToken}`,
      },
      body: JSON.stringify({
        challengeId: testChallenge.id,
        title: "Duplicate Attempt to Claim Same Challenge",
      }),
    });

    const res = await createProjectHandler(req as any);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("CHALLENGE_ALREADY_CLAIMED");
  });

  // ==========================================================================
  // 4. Overloaded Institution Gate (409 CAPACITY_EXCEEDED)
  // ==========================================================================

  it("should block project creation with 409 CAPACITY_EXCEEDED when institution is at maximum capacity", async () => {
    // Temporarily set activeProjects = maxCapacity on testInstitution
    await prisma.institution.update({
      where: { id: testInstitution.id },
      data: { activeProjects: 5, maxCapacity: 5 },
    });

    // Create a new matched challenge
    const capacityChallenge = await prisma.challenge.create({
      data: {
        title: "Capacity Overflow Test Challenge",
        problemStatement: "Testing overload rejection.",
        createdById: facultyUser.id,
      },
    });
    await prisma.capabilityMatch.create({
      data: {
        challengeId: capacityChallenge.id,
        institutionId: testInstitution.id,
        similarityScore: 0.9,
      },
    });

    const req = new Request("http://localhost:3000/api/v1/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sih_access_token=${facultyToken}`,
      },
      body: JSON.stringify({ challengeId: capacityChallenge.id }),
    });

    const res = await createProjectHandler(req as any);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("CAPACITY_EXCEEDED");

    // Restore active projects count and cleanup
    await prisma.institution.update({
      where: { id: testInstitution.id },
      data: { activeProjects: 1, maxCapacity: 5 },
    });
    await prisma.capabilityMatch.deleteMany({ where: { challengeId: capacityChallenge.id } });
    await prisma.challenge.delete({ where: { id: capacityChallenge.id } });
  });

  // ==========================================================================
  // 5. Industry Partner Assignment (POST /api/v1/projects/[id]/partner)
  // ==========================================================================

  it("should allow a verified industry partner to join the active project and enqueue SMS notification", async () => {
    const req = new Request(`http://localhost:3000/api/v1/projects/${createdProjectId}/partner`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sih_access_token=${industryToken}`,
      },
    });

    const res = await assignPartnerHandler(req as any, {
      params: Promise.resolve({ id: createdProjectId }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    // Verify database update
    const proj = await prisma.project.findUniqueOrThrow({
      where: { id: createdProjectId },
      include: { projectMembers: true },
    });
    expect(proj.industryPartnerId).toBe(testIndustryPartner.id);
    const partnerMember = proj.projectMembers.find((m) => m.userId === industryUser.id);
    expect(partnerMember).toBeDefined();
    expect(partnerMember?.role).toBe("INDUSTRY_PARTNER");
  });

  it("should reject an unverified industry partner attempting to join with 403 ORG_NOT_VERIFIED", async () => {
    const req = new Request(`http://localhost:3000/api/v1/projects/${createdProjectId}/partner`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sih_access_token=${unverifiedPartnerToken}`,
      },
    });

    const res = await assignPartnerHandler(req as any, {
      params: Promise.resolve({ id: createdProjectId }),
    });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("ORG_NOT_VERIFIED");
  });

  // ==========================================================================
  // 6. Student Team Members (POST /api/v1/projects/[id]/members)
  // ==========================================================================

  it("should add affiliated student team members to the project", async () => {
    const req = new Request(`http://localhost:3000/api/v1/projects/${createdProjectId}/members`, {
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

    const res = await addMembersHandler(req as any, {
      params: Promise.resolve({ id: createdProjectId }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.length).toBe(1);
    expect(json.data[0].userId).toBe(studentUser.id);
    expect(json.data[0].role).toBe("STUDENT");
  });

  it("should reject adding a student affiliated with a DIFFERENT institution with 400 STUDENT_NOT_AFFILIATED", async () => {
    const req = new Request(`http://localhost:3000/api/v1/projects/${createdProjectId}/members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sih_access_token=${facultyToken}`,
      },
      body: JSON.stringify({
        studentId: otherHeiStudentUser.id,
      }),
    });

    const res = await addMembersHandler(req as any, {
      params: Promise.resolve({ id: createdProjectId }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("STUDENT_NOT_AFFILIATED");
  });

  // ==========================================================================
  // 7. Milestone Submission & Deterministic Hashing
  // ==========================================================================

  it("should submit milestone deliverables, compute valid SHA-256 hash, and transition status to SUBMITTED_FOR_APPROVAL", async () => {
    const milestonePayload = {
      title: "PoC Feasibility & Slag Leaching Assay",
      summary:
        "Comprehensive thermodynamic evaluation and chemical leaching assay of blast furnace slag samples indicating 68% rare mineral yield.",
      artifactKeys: [
        "milestone_artifact/faculty-id/slag-assay-report-v1.pdf",
        "milestone_artifact/faculty-id/xrd-crystallography.png",
      ],
    };

    // Calculate expected SHA-256 hash
    const expectedHash = computeMilestoneContentHash({
      projectId: createdProjectId,
      phase: "POC",
      title: milestonePayload.title,
      summary: milestonePayload.summary,
      artifactKeys: milestonePayload.artifactKeys,
    });

    const req = new Request(`http://localhost:3000/api/v1/projects/${createdProjectId}/milestones`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sih_access_token=${facultyToken}`,
      },
      body: JSON.stringify(milestonePayload),
    });

    const res = await submitMilestoneHandler(req as any, {
      params: Promise.resolve({ id: createdProjectId }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.contentHash).toBe(expectedHash);
    expect(json.data.contentHash).toHaveLength(64); // Valid SHA-256 hex string
    expect(json.data.milestone.status).toBe("SUBMITTED_FOR_APPROVAL");
    expect(json.data.milestone.phase).toBe("POC");

    // Verify in database
    const dbMilestone = await prisma.milestone.findFirstOrThrow({
      where: {
        projectId: createdProjectId,
        phase: "POC",
      },
    });
    expect(dbMilestone.contentHash).toBe(expectedHash);
    expect(dbMilestone.status).toBe("SUBMITTED_FOR_APPROVAL");
    expect(dbMilestone.artifactKeys).toEqual(milestonePayload.artifactKeys);
  });

  // ==========================================================================
  // 8. Full Project State Inspection & NEP Credit Summary
  // ==========================================================================

  it("should return full project state, nested milestones, and NEP credit summary on GET /api/v1/projects/[id]", async () => {
    const req = new Request(`http://localhost:3000/api/v1/projects/${createdProjectId}`, {
      method: "GET",
      headers: {
        Cookie: `sih_access_token=${facultyToken}`,
      },
    });

    const res = await getProjectHandler(req as any, {
      params: Promise.resolve({ id: createdProjectId }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    const project = json.data;

    expect(project.id).toBe(createdProjectId);
    expect(project.institution.code).toBe("U-0205");
    expect(project.industryPartner.cin).toBe("L27100MH1907PLC000260");
    expect(project.projectMembers.length).toBeGreaterThanOrEqual(3); // Faculty Lead, Partner, Student
    expect(project.milestones.length).toBe(1);
    expect(project.milestones[0].status).toBe("SUBMITTED_FOR_APPROVAL");

    // NEP credit summary validation
    expect(project.nepCreditSummary).toBeDefined();
    expect(project.nepCreditSummary.framework).toBe("NEP_2020_EXPERIENTIAL_LEARNING");
    expect(project.nepCreditSummary.totalMaxCredits).toBe(20);
    expect(project.nepCreditSummary.eligibleCredits).toBe(2); // POC phase eligible
    expect(project.nepCreditSummary.studentBeneficiariesCount).toBe(1);
    expect(project.nepCreditSummary.facultyBeneficiariesCount).toBe(1);
  });

  it("should list projects with pagination on GET /api/v1/projects", async () => {
    const req = new Request("http://localhost:3000/api/v1/projects?page=1&limit=10", {
      method: "GET",
      headers: {
        Cookie: `sih_access_token=${facultyToken}`,
      },
    });

    const res = await listProjectsHandler(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.length).toBeGreaterThanOrEqual(1);
    expect(json.meta.total).toBeGreaterThanOrEqual(1);

    const found = json.data.find((p: any) => p.id === createdProjectId);
    expect(found).toBeDefined();
    expect(found.nepCreditSummary).toBeDefined();
  });

  // ==========================================================================
  // 9. Direct PATCH Prohibition (OUT OF SCOPE Gate)
  // ==========================================================================

  it("should reject direct PATCH updates to Project with 405 METHOD_NOT_ALLOWED", async () => {
    const req = new Request(`http://localhost:3000/api/v1/projects/${createdProjectId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sih_access_token=${facultyToken}`,
      },
      body: JSON.stringify({ currentPhase: "PROTOTYPING" }),
    });

    const res = await patchProjectHandler();
    expect(res.status).toBe(405);
    const json = await res.json();
    expect(json.error).toBe("METHOD_NOT_ALLOWED");
  });
});
