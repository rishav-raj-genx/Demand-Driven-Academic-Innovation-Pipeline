import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

    // Add Milestone
    let milestone = await prisma.milestone.findFirst({
      where: {
        projectId: project.id,
        phase: proj.milestonePhase,
      },
    });

    if (!milestone) {
      milestone = await prisma.milestone.create({
        data: {
          projectId: project.id,
          title: proj.milestoneTitle,
          phase: proj.milestonePhase,
          status: proj.currentPhase === "POC" ? ApprovalDecision.PENDING : ApprovalDecision.APPROVED,
          isCompleted: proj.currentPhase !== "POC",
        },
      });
    }

    // For Project 1 in POC: Create single signature (FACULTY) leaving second signature (INDUSTRY_PARTNER) ready for live dual-signature transition!
    if (proj.currentPhase === "POC" && facultyUserId && milestone) {
      await prisma.phaseApproval.upsert({
        where: {
          milestoneId_signerRole: {
            milestoneId: milestone.id,
            signerRole: UserRole.FACULTY,
          },
        },
        update: {
          decision: ApprovalDecision.APPROVED,
          remarks: "Proof of Concept validation verified by faculty PI.",
        },
        create: {
          milestoneId: milestone.id,
          signerId: facultyUserId,
          signerRole: UserRole.FACULTY,
          decision: ApprovalDecision.APPROVED,
          remarks: "Proof of Concept validation verified by faculty PI.",
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
