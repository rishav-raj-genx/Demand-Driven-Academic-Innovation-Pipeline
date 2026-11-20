import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { Prisma, UserRole, ProjectPhase, ApprovalDecision } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import {
  prisma,
  setChallengeLocation,
  setInstitutionLocation,
} from "../src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface DistrictSeed {
  code: string;
  name: string;
  state: string;
  centroid: {
    type: "Point";
    coordinates: [number, number];
  };
  boundary: {
    type: "MultiPolygon";
    coordinates: number[][][][];
  };
}

interface InstitutionSeed {
  code: string;
  name: string;
  tier: "TIER_1" | "TIER_2" | "TIER_3";
  districtCode: string;
  activeProjects: number;
  maxCapacity: number;
  lat: number;
  lng: number;
  address: string;
  website: string;
  contactEmail: string;
  contactPhone: string;
  verificationStatus: "VERIFIED" | "PENDING";
  domains?: string[];
  facultySpecializations?: string[];
  labFacilities?: string[];
  profileSummary?: string;
}

interface PartnerSeed {
  cin: string;
  organizationName: string;
  industrySector: string;
  districtCode: string;
  website: string;
  contactEmail: string;
  contactPhone: string;
  verificationStatus: "VERIFIED" | "PENDING";
}

interface UserSeed {
  email: string;
  fullName: string;
  role: UserRole;
  institutionCode?: string;
  partnerCin?: string;
  isEmailVerified: boolean;
  verificationStatus: "VERIFIED" | "PENDING";
}

interface ProjectSeed {
  title: string;
  description: string;
  currentPhase: ProjectPhase;
  institutionCode: string;
  partnerCin: string;
  budget: number;
  milestoneTitle: string;
  milestonePhase: ProjectPhase;
  mouTerms?: string;
}

interface ChallengeSeed {
  idempotencyKey: string;
  title: string;
  problemStatement: string;
  category: string;
  partnerCin: string;
  districtCode: string;
  lat: number;
  lng: number;
  budgetRange: number;
}

async function loadJsonFile<T>(relativePath: string): Promise<T> {
  const fullPath = path.resolve(__dirname, relativePath);
  const data = await fs.readFile(fullPath, "utf-8");
  return JSON.parse(data) as T;
}

export async function seed(): Promise<void> {
  console.log("Starting idempotent database seed for SIH26043...");

  // 1. Seed Districts
  const districtsData = await loadJsonFile<DistrictSeed[]>(
    "./seeds/data/jharkhand_districts.json"
  );
  const districtMap = new Map<string, string>(); // code -> id

  for (const d of districtsData) {
    const district = await prisma.district.upsert({
      where: { code: d.code },
      update: {
        name: d.name,
        state: d.state,
      },
      create: {
        code: d.code,
        name: d.name,
        state: d.state,
      },
    });

    districtMap.set(d.code, district.id);

    // Write PostGIS boundary & centroid
    const [centroidLng, centroidLat] = d.centroid.coordinates;
    const boundaryGeoJsonStr = JSON.stringify(d.boundary);

    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE districts
        SET 
          centroid = ST_SetSRID(ST_MakePoint(${centroidLng}, ${centroidLat}), 4326),
          boundary = ST_Multi(ST_GeomFromGeoJSON(${boundaryGeoJsonStr}))
        WHERE id = ${district.id}::uuid;
      `
    );
  }
  console.log(`✓ Seeded ${districtsData.length} Jharkhand districts with validated PostGIS geometries`);

  // 2. Seed Institutions
  const institutionsData = await loadJsonFile<InstitutionSeed[]>(
    "./seeds/data/institutions.json"
  );
  const institutionMap = new Map<string, string>(); // code -> id

  for (const inst of institutionsData) {
    const districtId = districtMap.get(inst.districtCode);

    const institution = await prisma.institution.upsert({
      where: { code: inst.code },
      update: {
        name: inst.name,
        tier: inst.tier,
        districtId: districtId ?? null,
        activeProjects: inst.activeProjects,
        maxCapacity: inst.maxCapacity,
        address: inst.address,
        website: inst.website,
        contactEmail: inst.contactEmail,
        contactPhone: inst.contactPhone,
        verificationStatus: inst.verificationStatus,
        domains: inst.domains ?? [],
        facultySpecializations: inst.facultySpecializations ?? [],
        labFacilities: inst.labFacilities ?? [],
        profileSummary: inst.profileSummary ?? null,
      },
      create: {
        code: inst.code,
        name: inst.name,
        tier: inst.tier,
        districtId: districtId ?? null,
        activeProjects: inst.activeProjects,
        maxCapacity: inst.maxCapacity,
        address: inst.address,
        website: inst.website,
        contactEmail: inst.contactEmail,
        contactPhone: inst.contactPhone,
        verificationStatus: inst.verificationStatus,
        domains: inst.domains ?? [],
        facultySpecializations: inst.facultySpecializations ?? [],
        labFacilities: inst.labFacilities ?? [],
        profileSummary: inst.profileSummary ?? null,
      },
    });

    institutionMap.set(inst.code, institution.id);
    await setInstitutionLocation(institution.id, inst.lat, inst.lng);
  }
  console.log(`✓ Seeded ${institutionsData.length} HEIs across Tier-1/Tier-2/Tier-3 with capacity controls`);

  // 3. Seed Industry & CSR Partners
  const partnersAndUsersData = await loadJsonFile<{
    partners: PartnerSeed[];
    users: UserSeed[];
    projects: ProjectSeed[];
  }>("./seeds/data/partners_and_users.json");

  const partnerMap = new Map<string, string>(); // cin -> id

  for (const p of partnersAndUsersData.partners) {
    const districtId = districtMap.get(p.districtCode);

    const partner = await prisma.industryPartner.upsert({
      where: { cin: p.cin },
      update: {
        organizationName: p.organizationName,
        industrySector: p.industrySector,
        districtId: districtId ?? null,
        website: p.website,
        contactEmail: p.contactEmail,
        contactPhone: p.contactPhone,
        verificationStatus: p.verificationStatus,
      },
      create: {
        cin: p.cin,
        organizationName: p.organizationName,
        industrySector: p.industrySector,
        districtId: districtId ?? null,
        website: p.website,
        contactEmail: p.contactEmail,
        contactPhone: p.contactPhone,
        verificationStatus: p.verificationStatus,
      },
    });

    partnerMap.set(p.cin, partner.id);
  }
  console.log(`✓ Seeded ${partnersAndUsersData.partners.length} verified MSME/CSR industry partners`);

  // 4. Seed Demo Users
  const defaultPasswordHash = await hash("DemoPassword123!");
  const userMap = new Map<string, string>(); // email -> id

  for (const u of partnersAndUsersData.users) {
    const institutionId = u.institutionCode
      ? institutionMap.get(u.institutionCode)
      : null;
    const industryPartnerId = u.partnerCin
      ? partnerMap.get(u.partnerCin)
      : null;

    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        fullName: u.fullName,
        role: u.role,
        institutionId: institutionId ?? null,
        industryPartnerId: industryPartnerId ?? null,
        isEmailVerified: u.isEmailVerified,
        verificationStatus: u.verificationStatus,
      },
      create: {
        email: u.email,
        passwordHash: defaultPasswordHash,
        fullName: u.fullName,
        role: u.role,
        institutionId: institutionId ?? null,
        industryPartnerId: industryPartnerId ?? null,
        isEmailVerified: u.isEmailVerified,
        verificationStatus: u.verificationStatus,
      },
    });

    userMap.set(u.email, user.id);
  }
  console.log(`✓ Seeded ${partnersAndUsersData.users.length} demo accounts for all roles (Argon2id hashed)`);

  // 5. Seed 30 Civic & Industrial Challenges
  const challengesData = await loadJsonFile<ChallengeSeed[]>(
    "./seeds/data/challenges_30.json"
  );
  const defaultCreatorId = userMap.get("industry@tata.com") ?? userMap.get("admin@sih.gov.in")!;

  for (const c of challengesData) {
    const partnerId = partnerMap.get(c.partnerCin);
    if (!partnerId) {
      throw new Error(`Partner not found for CIN: ${c.partnerCin}`);
    }

    const challenge = await prisma.challenge.upsert({
      where: { clientIdempotencyKey: c.idempotencyKey },
      update: {
        title: c.title,
        problemStatement: c.problemStatement,
        category: c.category,
        budgetRange: c.budgetRange,
        industryPartnerId: partnerId,
      },
      create: {
        clientIdempotencyKey: c.idempotencyKey,
        title: c.title,
        problemStatement: c.problemStatement,
        category: c.category,
        budgetRange: c.budgetRange,
        currency: "INR",
        industryPartnerId: partnerId,
        createdById: defaultCreatorId,
        status: "OPEN",
      },
    });

    await setChallengeLocation(challenge.id, c.lat, c.lng);
  }
  console.log(`✓ Seeded ${challengesData.length} challenges (including 3 duplicate pairs for semantic dedup)`);

  // 6. Seed Projects Across PLM Lifecycle Stages
  for (const proj of partnersAndUsersData.projects) {
    const institutionId = institutionMap.get(proj.institutionCode);
    const partnerId = partnerMap.get(proj.partnerCin);

    if (!institutionId || !partnerId) {
      continue;
    }

    const projectChallengeKeys: Record<string, string> = {
      "Solar-Powered Groundwater Defluoridation Unit for Palamu Rural Schools": "jh-chal-001",
      "IoT Sensor Array for Real-Time Coal Dust Suppression in Jharia Open-Cast Mines": "jh-chal-005",
      "Bio-Composite Lac Resin Formulations for Eco-Friendly Packaging": "jh-chal-007",
    };
    const challengeKey = projectChallengeKeys[proj.title];
    const linkedChallenge = challengeKey
      ? await prisma.challenge.findUnique({ where: { clientIdempotencyKey: challengeKey } })
      : null;

    let project = await prisma.project.findFirst({
      where: {
        title: proj.title,
        institutionId,
      },
    });

    if (!project) {
      project = await prisma.project.create({
        data: {
          title: proj.title,
          description: proj.description,
          currentPhase: proj.currentPhase,
          challengeId: linkedChallenge?.id ?? null,
          institutionId,
          industryPartnerId: partnerId,
          budget: proj.budget,
          startDate: new Date(),
        },
      });
    } else {
      project = await prisma.project.update({
        where: { id: project.id },
        data: {
          currentPhase: proj.currentPhase,
          challengeId: linkedChallenge?.id ?? null,
          budget: proj.budget,
        },
      });
    }

    // Ensure Faculty User is project member
    const facultyUserId = userMap.get("faculty@sih.gov.in");
    if (facultyUserId) {
      await prisma.projectMember.upsert({
        where: {
          projectId_userId: {
            projectId: project.id,
            userId: facultyUserId,
          },
        },
        update: { role: "PI" },
        create: {
          projectId: project.id,
          userId: facultyUserId,
          role: "PI",
        },
      });
    }

    // Add Milestone with cryptographic deliverable hash and submitted state
    let milestone = await prisma.milestone.findFirst({
      where: {
        projectId: project.id,
        phase: proj.milestonePhase,
      },
    });

    const isPocProject = proj.currentPhase === "POC";
    const milestoneSummary = isPocProject
      ? "Laboratory filtration efficiency test report showing 88.4% fluoride reduction in Palamu groundwater samples below BIS 10500 allowable limit."
      : "Milestone deliverable specification and verification protocol.";
    const artifactKeys = isPocProject
      ? ["milestone_artifact/faculty/poc-defluoridation-report.pdf"]
      : ["milestone_artifact/faculty/phase-deliverable-spec.pdf"];

    const contentHashPayload = {
      projectId: project.id,
      phase: proj.milestonePhase,
      title: proj.milestoneTitle,
      summary: milestoneSummary,
      artifactKeys,
    };
    const contentHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(contentHashPayload))
      .digest("hex");

    if (!milestone) {
      milestone = await prisma.milestone.create({
        data: {
          projectId: project.id,
          title: proj.milestoneTitle,
          summary: milestoneSummary,
          description: milestoneSummary,
          phase: proj.milestonePhase,
          status: isPocProject
            ? ApprovalDecision.SUBMITTED_FOR_APPROVAL
            : ApprovalDecision.APPROVED,
          isCompleted: !isPocProject,
          contentHash,
          artifactKeys,
          completedAt: !isPocProject ? new Date() : null,
        },
      });
    } else {
      milestone = await prisma.milestone.update({
        where: { id: milestone.id },
        data: {
          title: proj.milestoneTitle,
          summary: milestoneSummary,
          description: milestoneSummary,
          status: isPocProject
            ? ApprovalDecision.SUBMITTED_FOR_APPROVAL
            : ApprovalDecision.APPROVED,
          isCompleted: !isPocProject,
          contentHash,
          artifactKeys,
          completedAt: !isPocProject ? new Date() : null,
        },
      });
    }

    // For Project 1 in POC: Create single signature (ACADEMIC_APPROVER) leaving second signature (EXTERNAL_APPROVER) ready for live dual-signature transition!
    if (isPocProject && facultyUserId && milestone) {
      await prisma.phaseApproval.deleteMany({
        where: { milestoneId: milestone.id },
      });

      await prisma.phaseApproval.create({
        data: {
          milestoneId: milestone.id,
          signerId: facultyUserId,
          signerRole: "ACADEMIC_APPROVER",
          decision: ApprovalDecision.APPROVED,
          snapshotHash: contentHash,
          remarks: "Proof of Concept validation verified by faculty PI Dr. Sunita Murmu against BIS 10500 potable water benchmarks.",
          signedAt: new Date(),
        },
      });
    }

    // For Project 3 in IP_TECH_TRANSFER: Seed MoU
    if (proj.mouTerms) {
      const existingMou = await prisma.moU.findFirst({
        where: { projectId: project.id },
      });

      if (!existingMou) {
        await prisma.moU.create({
          data: {
            projectId: project.id,
            documentUrl: "https://sih26043-media.s3.amazonaws.com/mous/mou-lac-biocomposite-2026.pdf",
            status: "SIGNED",
            ipTerms: proj.mouTerms,
            signedDate: new Date(),
          },
        });
      }
    }
  }
  console.log(`✓ Seeded ${partnersAndUsersData.projects.length} lifecycle stage projects (POC, PROTOTYPING, IP_TECH_TRANSFER)`);

  // Seed initial Mock SMS logs for Live Demonstration Checkpoint 5
  const birsa = await prisma.user.findFirst({ where: { role: "CITIZEN" } });
  if (birsa) {
    await prisma.notificationLog.createMany({
      data: [
        {
          recipientId: birsa.id,
          title: "Challenge Match Alert",
          message:
            "[MOCK SMS - SIH26043] Your challenge jh-chal-001 (Groundwater Defluoridation) was assigned to BIT Mesra (Tier-1). Status: UNDER_EVALUATION.",
          type: "SMS",
          data: {
            phoneNumber: birsa.phoneNumber ?? "+91-9876543210",
            status: "DELIVERED_MOCK",
            gateway: "MOCK_SMS_GATEWAY_SIH26043",
          },
        },
        {
          recipientId: birsa.id,
          title: "Milestone Verified",
          message:
            "[MOCK SMS - SIH26043] Milestone 'Electrochemical reactor testing' submitted for Project 1. Ready for dual-signature signoff.",
          type: "SMS",
          data: {
            phoneNumber: birsa.phoneNumber ?? "+91-9876543210",
            status: "DELIVERED_MOCK",
            gateway: "MOCK_SMS_GATEWAY_SIH26043",
          },
        },
      ],
      skipDuplicates: true,
    });
    console.log("✓ Seeded mock SMS notification logs for Checkpoint 5");
  }

  console.log("Database seed completed successfully.");
}

seed()
  .catch((err) => {
    console.error("Seed execution failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
