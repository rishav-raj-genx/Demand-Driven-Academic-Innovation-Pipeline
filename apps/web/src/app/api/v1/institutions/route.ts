import { NextResponse } from "next/server";
import { prisma, InstitutionTier, VerificationStatus, type Prisma } from "@sih/db";

// ============================================================================
// GET /api/v1/institutions - List Verified HEIs
// ============================================================================

export async function GET(req: Request): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20)
  );
  const tierParam = searchParams.get("tier");
  const districtId = searchParams.get("districtId");
  const domainParam = searchParams.get("domain");
  const statusParam = searchParams.get("status") || "VERIFIED";

  const where: Prisma.InstitutionWhereInput = {};

  if (
    statusParam &&
    Object.values(VerificationStatus).includes(statusParam as VerificationStatus)
  ) {
    where.verificationStatus = statusParam as VerificationStatus;
  }

  if (
    tierParam &&
    Object.values(InstitutionTier).includes(tierParam as InstitutionTier)
  ) {
    where.tier = tierParam as InstitutionTier;
  }

  if (districtId) {
    where.districtId = districtId;
  }

  if (domainParam) {
    where.domains = { has: domainParam };
  }

  const [total, institutions] = await Promise.all([
    prisma.institution.count({ where }),
    prisma.institution.findMany({
      where,
      select: {
        id: true,
        name: true,
        code: true,
        tier: true,
        districtId: true,
        address: true,
        website: true,
        contactEmail: true,
        verificationStatus: true,
        activeProjects: true,
        maxCapacity: true,
        domains: true,
        district: {
          select: {
            id: true,
            name: true,
            code: true,
            state: true,
          },
        },
      },
      orderBy: [{ tier: "asc" }, { name: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  const data = institutions.map((inst) => {
    const capacity = Math.max(inst.maxCapacity, 1);
    const utilizationRatio = Number((inst.activeProjects / capacity).toFixed(2));

    return {
      id: inst.id,
      name: inst.name,
      code: inst.code,
      tier: inst.tier,
      district: inst.district,
      activeProjects: inst.activeProjects,
      maxCapacity: inst.maxCapacity,
      utilizationRatio,
      domains: inst.domains,
      verificationStatus: inst.verificationStatus,
      website: inst.website,
      contactEmail: inst.contactEmail,
      address: inst.address,
    };
  });

  return NextResponse.json({
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
