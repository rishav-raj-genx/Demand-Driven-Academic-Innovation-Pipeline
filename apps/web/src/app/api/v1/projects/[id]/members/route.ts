import { NextRequest, NextResponse } from "next/server";
import { prisma, recordAuditLog } from "@sih/db";
import { UserRole } from "@sih/shared";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const AddMembersSchema = z.object({
  studentId: z.string().uuid("Invalid student ID").optional(),
  studentIds: z.array(z.string().uuid("Invalid student ID")).optional(),
  role: z.string().trim().min(2).max(50).default("STUDENT"),
});

// ============================================================================
// POST /api/v1/projects/[id]/members (Add Student Team Members)
// ============================================================================

export async function POST(req: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth(req);
  if (!authResult.success) {
    return authResult.response;
  }
  const { user } = authResult;

  const { id } = await params;

  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json(
      { error: "INVALID_ID", message: "Project ID must be a valid UUID" },
      { status: 400 }
    );
  }

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      institution: {
        select: { id: true, name: true },
      },
      projectMembers: {
        select: { userId: true, role: true },
      },
    },
  });

  if (!project) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: `Project with ID '${id}' not found` },
      { status: 404 }
    );
  }

  // Permission Gate: Caller must be HEI_ADMIN or FACULTY belonging to project's institution, or SUPER_ADMIN, or FACULTY_LEAD
  const isFacultyLead = project.projectMembers.some(
    (m) => m.userId === user.id && (m.role === "FACULTY_LEAD" || m.role === "PI")
  );
  const isAffiliatedAdminOrFaculty =
    (user.role === UserRole.INSTITUTION_ADMIN || user.role === UserRole.FACULTY) &&
    user.institutionId === project.institutionId;
  const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;

  if (!isFacultyLead && !isAffiliatedAdminOrFaculty && !isSuperAdmin) {
    return NextResponse.json(
      {
        error: "FORBIDDEN",
        message: "Only the Faculty Lead or affiliated HEI administrators can add student members to this project",
      },
      { status: 403 }
    );
  }

  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return NextResponse.json(
      { error: "INVALID_JSON", message: "Request body must be valid JSON" },
      { status: 400 }
    );
  }

  const parsed = AddMembersSchema.safeParse(bodyJson);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "VALIDATION_ERROR",
        message: "Invalid member addition payload",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const candidateIds: string[] = [];
  if (parsed.data.studentId) {
    candidateIds.push(parsed.data.studentId);
  }
  if (parsed.data.studentIds && parsed.data.studentIds.length > 0) {
    candidateIds.push(...parsed.data.studentIds);
  }

  const uniqueStudentIds = Array.from(new Set(candidateIds));

  if (uniqueStudentIds.length === 0) {
    return NextResponse.json(
      {
        error: "VALIDATION_ERROR",
        message: "At least one studentId or studentIds must be specified",
      },
      { status: 400 }
    );
  }

  // Verify all students exist, are active, have STUDENT role, and belong to the project's institution
  const students = await prisma.user.findMany({
    where: {
      id: { in: uniqueStudentIds },
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      institutionId: true,
      verificationStatus: true,
    },
  });

  const studentMap = new Map(students.map((s) => [s.id, s]));

  for (const sId of uniqueStudentIds) {
    const student = studentMap.get(sId);
    if (!student) {
      return NextResponse.json(
        {
          error: "STUDENT_NOT_FOUND",
          message: `User with ID '${sId}' does not exist`,
        },
        { status: 404 }
      );
    }

    if (student.role !== UserRole.STUDENT) {
      return NextResponse.json(
        {
          error: "INVALID_ROLE",
          message: `User '${student.fullName}' (${student.id}) has role '${student.role}'. Only students can be added via this endpoint.`,
        },
        { status: 400 }
      );
    }

    if (student.institutionId !== project.institutionId) {
      return NextResponse.json(
        {
          error: "STUDENT_NOT_AFFILIATED",
          message: `Student '${student.fullName}' (${student.id}) is not affiliated with the project's institution (${project.institution.name})`,
        },
        { status: 400 }
      );
    }
  }

  const ipAddress =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  const userAgent = req.headers.get("user-agent") || undefined;

  // Add members in transaction
  const roleName = parsed.data.role || "STUDENT";
  const addedMembers = await prisma.$transaction(async (tx) => {
    const records = [];
    for (const student of students) {
      const pm = await tx.projectMember.upsert({
        where: {
          projectId_userId: {
            projectId: project.id,
            userId: student.id,
          },
        },
        update: { role: roleName },
        create: {
          projectId: project.id,
          userId: student.id,
          role: roleName,
        },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
              institutionId: true,
            },
          },
        },
      });
      records.push(pm);
    }

    await recordAuditLog({
      actorId: user.id,
      action: "PROJECT_MEMBERS_ADDED",
      entityType: "Project",
      entityId: project.id,
      metadata: {
        studentIds: uniqueStudentIds,
        role: roleName,
        count: records.length,
      },
      ipAddress,
      userAgent,
    });

    return records;
  });

  return NextResponse.json({
    success: true,
    message: `Added ${addedMembers.length} student member(s) to project '${project.title}'`,
    data: addedMembers,
  });
}
