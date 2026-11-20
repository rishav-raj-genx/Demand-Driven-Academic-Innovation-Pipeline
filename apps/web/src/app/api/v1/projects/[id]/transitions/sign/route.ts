import { NextRequest, NextResponse } from "next/server";
import { prisma, recordAuditLog, UserRole, ProjectPhase } from "@sih/db";
import { PLM_TRANSITIONS, ApprovalDecision } from "@sih/shared";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { NEP_PHASE_CREDIT_WEIGHTS } from "@/lib/projects/nep";
import { enqueueNotifySms } from "@/lib/queues";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const SignTransitionSchema = z.object({
  milestoneId: z.string().uuid("Invalid milestone ID"),
  decision: z.enum(["APPROVED", "REJECTED"]),
  remarks: z.string().trim().max(2000).optional().nullable(),
});

type ApprovalTrack = "ACADEMIC_APPROVER" | "EXTERNAL_APPROVER";

interface ConflictError extends Error {
  code: "DUPLICATE_SIGNER" | "TRACK_ALREADY_SIGNED";
  statusCode: 409;
}

// ============================================================================
// POST /api/v1/projects/[id]/transitions/sign (Dual-Signature Engine)
// ============================================================================

export async function POST(req: NextRequest, { params }: RouteParams) {
  // 1. Authenticate Request
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

  // 2. Immediate Role Filter: Students and Citizens strictly prohibited
  if (user.role === UserRole.STUDENT || user.role === UserRole.CITIZEN) {
    return NextResponse.json(
      {
        error: "FORBIDDEN",
        message: "Students and Citizens are not authorized to sign phase transitions",
      },
      { status: 403 }
    );
  }

  // 3. Parse and Validate Request Payload
  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return NextResponse.json(
      { error: "INVALID_JSON", message: "Request body must be valid JSON" },
      { status: 400 }
    );
  }

  const parsed = SignTransitionSchema.safeParse(bodyJson);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "VALIDATION_ERROR",
        message: "Invalid transition signature payload",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const { milestoneId, decision, remarks } = parsed.data;

  // 4. Load Project State with Stakeholder Affiliations
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      institution: {
        select: {
          id: true,
          name: true,
          verificationStatus: true,
          activeProjects: true,
          maxCapacity: true,
        },
      },
      industryPartner: {
        select: {
          id: true,
          organizationName: true,
          verificationStatus: true,
        },
      },
      projectMembers: {
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phoneNumber: true,
              role: true,
              institutionId: true,
              industryPartnerId: true,
            },
          },
        },
      },
    },
  });

  if (!project) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: `Project with ID '${id}' not found` },
      { status: 404 }
    );
  }

  // 5. Determine Approval Track Eligibility
  let approvalTrack: ApprovalTrack | null = null;

  // 5a. Academic Track Check (Verified HEI Admin or assigned Faculty Lead)
  const isHeiAdmin =
    (user.role === UserRole.INSTITUTION_ADMIN || user.role === "HEI_ADMIN") &&
    user.institutionId === project.institutionId;

  const isAssignedFaculty =
    user.role === UserRole.FACULTY &&
    (user.institutionId === project.institutionId ||
      project.projectMembers.some(
        (m) =>
          m.userId === user.id &&
          (m.role === "FACULTY_LEAD" || m.role === "PI" || m.role === "FACULTY")
      ));

  const isVerifiedHei = project.institution.verificationStatus === "VERIFIED";

  // 5b. External Track Check (Verified Industry Partner or Govt Official)
  const isLinkedIndustryPartner =
    (user.role === UserRole.INDUSTRY_PARTNER || user.role === UserRole.CSR_PARTNER) &&
    project.industryPartnerId !== null &&
    user.industryPartnerId === project.industryPartnerId;

  const isVerifiedPartner = project.industryPartner?.verificationStatus === "VERIFIED";
  const isGovtOfficial = user.role === UserRole.GOVT_OFFICIAL;

  // Check track qualification
  if ((isHeiAdmin || isAssignedFaculty) && isVerifiedHei) {
    approvalTrack = "ACADEMIC_APPROVER";
  } else if ((isLinkedIndustryPartner && isVerifiedPartner) || isGovtOfficial) {
    approvalTrack = "EXTERNAL_APPROVER";
  } else if (user.role === UserRole.SUPER_ADMIN) {
    // Super Admin fallback: inspect pending signatures on milestone to assign track
    const existingSignatures = await prisma.phaseApproval.findMany({
      where: { milestoneId },
      select: { signerRole: true },
    });
    const hasAcademic = existingSignatures.some((s) => s.signerRole === "ACADEMIC_APPROVER");
    approvalTrack = hasAcademic ? "EXTERNAL_APPROVER" : "ACADEMIC_APPROVER";
  }

  if (!approvalTrack) {
    // Determine specific rejection cause for precise error reporting
    if (isLinkedIndustryPartner && !isVerifiedPartner) {
      return NextResponse.json(
        {
          error: "ORG_NOT_VERIFIED",
          message: "Industry Partner organization must be officially verified to sign phase transitions",
        },
        { status: 403 }
      );
    }
    if ((isHeiAdmin || isAssignedFaculty) && !isVerifiedHei) {
      return NextResponse.json(
        {
          error: "ORG_NOT_VERIFIED",
          message: "Educational institution must be officially verified to sign phase transitions",
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        error: "FORBIDDEN",
        message:
          "Signer must belong to either the Academic Track (verified HEI Admin or Faculty Lead) or External Track (verified Industry Partner or Govt Official)",
      },
      { status: 403 }
    );
  }

  const ipAddress =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  const userAgent = req.headers.get("user-agent") || undefined;

  // 6. Execute Atomic Transaction
  try {
    const result = await prisma.$transaction(async (tx) => {
      // 6a. Lock Project & Verify Current Phase
      const currentProject = await tx.project.findUnique({
        where: { id: project.id },
        include: {
          institution: true,
          industryPartner: true,
          projectMembers: {
            include: { user: true },
          },
        },
      });

      if (!currentProject) {
        throw new Error("Project not found in transaction");
      }

      // 6b. Lock Milestone & Validate Status & Phase
      const milestone = await tx.milestone.findUnique({
        where: { id: milestoneId },
        include: {
          phaseApprovals: true,
        },
      });

      if (!milestone || milestone.projectId !== currentProject.id) {
        const err = new Error("Milestone not found for this project");
        (err as any).statusCode = 404;
        (err as any).code = "MILESTONE_NOT_FOUND";
        throw err;
      }

      if (milestone.phase !== currentProject.currentPhase) {
        const err = new Error(
          `Milestone phase (${milestone.phase}) does not match project's current phase (${currentProject.currentPhase})`
        );
        (err as any).statusCode = 400;
        (err as any).code = "INVALID_PHASE";
        throw err;
      }

      if (milestone.status !== ("SUBMITTED_FOR_APPROVAL" as ApprovalDecision)) {
        const err = new Error(
          `Milestone must have status SUBMITTED_FOR_APPROVAL to receive signatures (current status: ${milestone.status})`
        );
        (err as any).statusCode = 400;
        (err as any).code = "INVALID_STATUS";
        throw err;
      }

      if (!milestone.contentHash) {
        const err = new Error(
          "Milestone lacks cryptographic contentHash. Please resubmit deliverables."
        );
        (err as any).statusCode = 400;
        (err as any).code = "MISSING_CONTENT_HASH";
        throw err;
      }

      // 6c. Check Unique Signature Constraints
      const existingUserApproval = milestone.phaseApprovals.find(
        (a) => a.signerId === user.id
      );

      if (existingUserApproval) {
        // If user already signed for this EXACT contentHash, prevent duplicate
        if (existingUserApproval.snapshotHash === milestone.contentHash) {
          const err = new Error(
            "User has already submitted a signature for this milestone content"
          ) as ConflictError;
          err.code = "DUPLICATE_SIGNER";
          err.statusCode = 409;
          throw err;
        }
      }

      // Check track duplication for current contentHash
      const existingTrackApproval = milestone.phaseApprovals.find(
        (a) =>
          a.signerRole === approvalTrack &&
          a.snapshotHash === milestone.contentHash &&
          a.signerId !== user.id
      );

      if (existingTrackApproval) {
        const err = new Error(
          `A signature for the ${approvalTrack} track has already been submitted for this milestone`
        ) as ConflictError;
        err.code = "TRACK_ALREADY_SIGNED";
        err.statusCode = 409;
        throw err;
      }

      // If user had signed a stale hash or stale track row exists, clean stale row to satisfy DB unique constraint
      if (existingUserApproval) {
        await tx.phaseApproval.delete({
          where: { id: existingUserApproval.id },
        });
      } else {
        const staleTrackRow = milestone.phaseApprovals.find(
          (a) => a.signerRole === approvalTrack
        );
        if (staleTrackRow) {
          await tx.phaseApproval.delete({
            where: { id: staleTrackRow.id },
          });
        }
      }

      // 6d. Insert / Record PhaseApproval
      const approval = await tx.phaseApproval.create({
        data: {
          milestoneId: milestone.id,
          signerId: user.id,
          signerRole: approvalTrack,
          snapshotHash: milestone.contentHash,
          decision: decision as ApprovalDecision,
          remarks: remarks ?? null,
          signedAt: new Date(),
        },
      });

      // 6e. Handling REJECTED decision
      if (decision === "REJECTED") {
        await tx.milestone.update({
          where: { id: milestone.id },
          data: { status: ApprovalDecision.REJECTED },
        });

        await recordAuditLog(
          {
            actorId: user.id,
            action: "MILESTONE_REJECTED",
            entityType: "Milestone",
            entityId: milestone.id,
            metadata: {
              projectId: currentProject.id,
              phase: currentProject.currentPhase,
              track: approvalTrack,
              snapshotHash: milestone.contentHash,
              remarks,
            },
            ipAddress,
            userAgent,
          },
          tx
        );

        return {
          transitioned: false,
          decision: "REJECTED",
          approval,
          message: `Milestone deliverable was rejected by ${approvalTrack}.`,
        };
      }

      // 6f. Handling APPROVED decision: Count valid signatures matching current snapshotHash
      const validApprovals = await tx.phaseApproval.findMany({
        where: {
          milestoneId: milestone.id,
          decision: ApprovalDecision.APPROVED,
          snapshotHash: milestone.contentHash,
        },
      });

      const hasAcademic = validApprovals.some((a) => a.signerRole === "ACADEMIC_APPROVER");
      const hasExternal = validApprovals.some((a) => a.signerRole === "EXTERNAL_APPROVER");

      // CASE A: Only 1 valid signature present -> Remain in phase, notify pending track
      if (!hasAcademic || !hasExternal) {
        const awaitingTrack: ApprovalTrack = hasAcademic
          ? "EXTERNAL_APPROVER"
          : "ACADEMIC_APPROVER";

        await recordAuditLog(
          {
            actorId: user.id,
            action: "TRANSITION_SIGNATURE_LOGGED",
            entityType: "PhaseApproval",
            entityId: approval.id,
            metadata: {
              projectId: currentProject.id,
              milestoneId: milestone.id,
              phase: currentProject.currentPhase,
              track: approvalTrack,
              awaitingTrack,
              snapshotHash: milestone.contentHash,
            },
            ipAddress,
            userAgent,
          },
          tx
        );

        return {
          transitioned: false,
          decision: "APPROVED",
          signaturesCount: 1,
          awaitingTrack,
          approval,
          snapshotHash: milestone.contentHash,
          currentPhase: currentProject.currentPhase,
          message: `Signature recorded for ${approvalTrack}. Awaiting second signature from ${awaitingTrack} to complete phase transition.`,
        };
      }

      // CASE B: Both Academic & External tracks present -> Advance Phase!
      const currentPhase = currentProject.currentPhase as ProjectPhase;
      const allowedNextPhases = PLM_TRANSITIONS[currentPhase];
      const nextPhase =
        allowedNextPhases && allowedNextPhases.length > 0 ? allowedNextPhases[0] : null;

      if (!nextPhase) {
        throw new Error(
          `Project is in terminal phase ${currentPhase}; no transition targets available`
        );
      }

      // Mark Milestone APPROVED and Completed
      await tx.milestone.update({
        where: { id: milestone.id },
        data: {
          status: ApprovalDecision.APPROVED,
          isCompleted: true,
          completedAt: new Date(),
        },
      });

      // Advance Project Current Phase
      const updatedProject = await tx.project.update({
        where: { id: currentProject.id },
        data: { currentPhase: nextPhase },
      });

      // Award NEP 2020 Experiential Learning Credits
      const phaseCredits = NEP_PHASE_CREDIT_WEIGHTS[currentPhase] ?? 2;
      const studentMembers = currentProject.projectMembers.filter(
        (m) => m.role.toUpperCase() === "STUDENT" || m.user.role === UserRole.STUDENT
      );

      for (const student of studentMembers) {
        await recordAuditLog(
          {
            actorId: user.id,
            action: "NEP_CREDITS_AWARDED",
            entityType: "ProjectMember",
            entityId: student.id,
            metadata: {
              projectId: currentProject.id,
              studentUserId: student.userId,
              studentName: student.user.fullName,
              phase: currentPhase,
              creditsAwarded: phaseCredits,
              framework: "NEP_2020_EXPERIENTIAL_LEARNING",
            },
            ipAddress,
            userAgent,
          },
          tx
        );
      }

      // Capacity freeing: If advancing into IP_TECH_TRANSFER, decrement Institution.activeProjects
      if (nextPhase === ProjectPhase.IP_TECH_TRANSFER) {
        await tx.institution.update({
          where: { id: currentProject.institutionId },
          data: { activeProjects: { decrement: 1 } },
        });

        await recordAuditLog(
          {
            actorId: user.id,
            action: "PROJECT_COMPLETED_CAPACITY_RELEASED",
            entityType: "Institution",
            entityId: currentProject.institutionId,
            metadata: {
              projectId: currentProject.id,
              phase: nextPhase,
              freedCapacity: 1,
            },
            ipAddress,
            userAgent,
          },
          tx
        );
      }

      // Platform Audit for Phase Transition
      await recordAuditLog(
        {
          actorId: user.id,
          action: "PHASE_TRANSITION_COMPLETED",
          entityType: "Project",
          entityId: currentProject.id,
          metadata: {
            previousPhase: currentPhase,
            currentPhase: nextPhase,
            milestoneId: milestone.id,
            snapshotHash: milestone.contentHash,
            academicSignerId: validApprovals.find(
              (a) => a.signerRole === "ACADEMIC_APPROVER"
            )?.signerId,
            externalSignerId: validApprovals.find(
              (a) => a.signerRole === "EXTERNAL_APPROVER"
            )?.signerId,
            nepCreditsAwarded: phaseCredits,
          },
          ipAddress,
          userAgent,
        },
        tx
      );

      return {
        transitioned: true,
        decision: "APPROVED",
        signaturesCount: 2,
        previousPhase: currentPhase,
        currentPhase: nextPhase,
        milestoneStatus: "APPROVED",
        nepCreditsAwarded: phaseCredits,
        approval,
        message: `Dual-signature verification complete! Project advanced from ${currentPhase} to ${nextPhase}.`,
      };
    });

    // 7. Post-Transaction Notifications (SMS Dispatch via BullMQ)
    if (result.decision === "REJECTED") {
      // Notify Faculty Lead
      const facultyLead = project.projectMembers.find(
        (m) => m.role === "FACULTY_LEAD" || m.user.role === UserRole.FACULTY
      );
      if (facultyLead) {
        try {
          await enqueueNotifySms({
            recipientId: facultyLead.user.id,
            phoneNumber: facultyLead.user.phoneNumber ?? undefined,
            title: "Milestone Deliverable Rejected",
            message: `Milestone deliverable for project '${project.title}' was rejected by ${approvalTrack}. Remarks: ${remarks || "None"}`,
            type: "MILESTONE_REJECTED",
            metadata: {
              projectId: project.id,
              milestoneId,
              decision: "REJECTED",
            },
          });
        } catch {
          // Non-blocking notification dispatch
        }
      }
    } else if (!result.transitioned && result.awaitingTrack) {
      // Alert Pending Approver Track
      if (result.awaitingTrack === "EXTERNAL_APPROVER") {
        // Find industry partner contacts
        const targetRecipients = project.projectMembers
          .filter(
            (m) =>
              m.role === "INDUSTRY_PARTNER" ||
              m.user.role === UserRole.INDUSTRY_PARTNER
          )
          .map((m) => m.user);

        for (const recipient of targetRecipients) {
          try {
            await enqueueNotifySms({
              recipientId: recipient.id,
              phoneNumber: recipient.phoneNumber ?? undefined,
              title: "Co-Signature Required for Phase Transition",
              message: `Academic Lead has approved milestone for project '${project.title}'. Your external co-signature is required to advance phase.`,
              type: "CO_SIGNATURE_REQUIRED",
              metadata: {
                projectId: project.id,
                milestoneId,
                awaitingTrack: "EXTERNAL_APPROVER",
              },
            });
          } catch {
            // Non-blocking
          }
        }
      } else {
        // Pending track is ACADEMIC_APPROVER
        const facultyLead = project.projectMembers.find(
          (m) => m.role === "FACULTY_LEAD" || m.user.role === UserRole.FACULTY
        );
        if (facultyLead) {
          try {
            await enqueueNotifySms({
              recipientId: facultyLead.user.id,
              phoneNumber: facultyLead.user.phoneNumber ?? undefined,
              title: "Co-Signature Required for Phase Transition",
              message: `External Industry Partner has approved milestone for project '${project.title}'. Academic co-signature is required to advance phase.`,
              type: "CO_SIGNATURE_REQUIRED",
              metadata: {
                projectId: project.id,
                milestoneId,
                awaitingTrack: "ACADEMIC_APPROVER",
              },
            });
          } catch {
            // Non-blocking
          }
        }
      }
    } else if (result.transitioned) {
      // Announce phase advancement to project members
      for (const member of project.projectMembers) {
        try {
          await enqueueNotifySms({
            recipientId: member.user.id,
            phoneNumber: member.user.phoneNumber ?? undefined,
            title: `Project Advanced to ${result.currentPhase}!`,
            message: `Dual-signature verification complete! Project '${project.title}' has advanced to phase ${result.currentPhase}.`,
            type: "PHASE_TRANSITION_ANNOUNCED",
            metadata: {
              projectId: project.id,
              fromPhase: result.previousPhase,
              toPhase: result.currentPhase,
            },
          });
        } catch {
          // Non-blocking
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "statusCode" in err && "code" in err) {
      const typedErr = err as { statusCode: number; code: string; message: string };
      return NextResponse.json(
        {
          error: typedErr.code,
          message: typedErr.message,
        },
        { status: typedErr.statusCode }
      );
    }

    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : "Failed to sign transition",
      },
      { status: 500 }
    );
  }
}
