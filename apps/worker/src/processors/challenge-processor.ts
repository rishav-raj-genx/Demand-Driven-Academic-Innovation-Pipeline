import { Job } from "bullmq";
import { prisma } from "@sih/db";
import { aiClient, type AnalyzeChallengeResult } from "../clients/ai-client.js";
import { enqueueNotifySms } from "../queues.js";
import { logger } from "../redis.js";
import { type ChallengeProcessJobData } from "../types.js";

export interface ChallengeProcessorResult {
  success: boolean;
  challengeId: string;
  action: "MATCHED" | "DUPLICATE_MERGED";
  isDuplicate: boolean;
  matchesCount: number;
  citizenNotified: boolean;
  heiAdminNotified: boolean;
  topMatchInstitutionName?: string;
  canonicalTitle?: string;
  durationMs: number;
}

export async function challengeProcessor(
  job: Job<ChallengeProcessJobData>
): Promise<ChallengeProcessorResult> {
  const { challengeId } = job.data;

  if (!challengeId) {
    throw new Error(`Challenge process job ${job.id} missing mandatory challengeId`);
  }

  const startTime = Date.now();
  logger.info({ jobId: job.id, challengeId }, "Beginning challenge analysis pipeline");

  // 1. Fetch challenge details from database
  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
    include: { createdBy: true },
  });

  if (!challenge) {
    logger.error(
      { jobId: job.id, challengeId },
      "Challenge not found in database; cannot process"
    );
    throw new Error(`Challenge '${challengeId}' not found in database`);
  }

  // 2. Invoke FastAPI AI Engine for deduplication and capacity-aware matching
  const analysis: AnalyzeChallengeResult = await aiClient.analyzeChallenge(challengeId);

  let citizenNotified = false;
  let heiAdminNotified = false;
  let topMatchInstitutionName: string | undefined;
  let canonicalTitle: string | undefined;

  // 3. Dispatch notifications based on analysis outcome
  if (analysis.action === "DUPLICATE_MERGED") {
    canonicalTitle = analysis.canonical_title;
    logger.info(
      {
        jobId: job.id,
        challengeId,
        canonicalId: analysis.canonical_id,
        similarity: analysis.duplicate_similarity,
      },
      "Challenge merged into canonical parent initiative"
    );

    // Notify submitting citizen about duplicate merge
    if (challenge.createdBy) {
      const citizenMsg =
        `[MOCK SMS - SIH26043] Dear ${challenge.createdBy.fullName}, your challenge ` +
        `'${challenge.title}' was identified as related to '${analysis.canonical_title}' ` +
        `(${Math.round(analysis.duplicate_similarity * 100)}% match) and merged to amplify collective priority. ` +
        `Your endorsement has been counted!`;

      await enqueueNotifySms({
        recipientId: challenge.createdById,
        phoneNumber: challenge.createdBy.phoneNumber ?? undefined,
        title: "Challenge Merged with Existing Initiative",
        message: citizenMsg,
        type: "DUPLICATE_MERGED",
        metadata: {
          challengeId,
          canonicalId: analysis.canonical_id,
          similarity: analysis.duplicate_similarity,
          canonicalTitle: analysis.canonical_title,
        },
      });
      citizenNotified = true;
    }
  } else {
    // Action: MATCHED
    const topMatch = analysis.matches[0];
    topMatchInstitutionName = topMatch?.institution_name;

    logger.info(
      {
        jobId: job.id,
        challengeId,
        matchesCount: analysis.matches_count,
        topMatch: topMatch ? topMatch.institution_name : "none",
        topScore: topMatch ? topMatch.final_score : 0,
      },
      "Challenge capability matching completed successfully"
    );

    // Notify submitting citizen about successful match
    if (challenge.createdBy) {
      const matchScorePct = topMatch ? Math.round(topMatch.final_score * 100) : 0;
      const citizenMsg = topMatch
        ? `[MOCK SMS - SIH26043] Dear ${challenge.createdBy.fullName}, your challenge ` +
          `'${challenge.title}' has been matched with ${topMatch.institution_name} ` +
          `(Alignment: ${matchScorePct}%). Academic evaluation has commenced.`
        : `[MOCK SMS - SIH26043] Dear ${challenge.createdBy.fullName}, your challenge ` +
          `'${challenge.title}' has been analyzed and routed to regional academic partners.`;

      await enqueueNotifySms({
        recipientId: challenge.createdById,
        phoneNumber: challenge.createdBy.phoneNumber ?? undefined,
        title: "Challenge Match Found",
        message: citizenMsg,
        type: "CHALLENGE_MATCHED",
        metadata: {
          challengeId,
          topMatchInstitutionId: topMatch?.institution_id,
          topMatchInstitutionName: topMatch?.institution_name,
          finalScore: topMatch?.final_score,
          matchesCount: analysis.matches_count,
        },
      });
      citizenNotified = true;
    }

    // Notify top-ranked HEI admin
    if (topMatch) {
      let heiAdmin = await prisma.user.findFirst({
        where: {
          institutionId: topMatch.institution_id,
          role: "INSTITUTION_ADMIN",
        },
      });

      if (!heiAdmin) {
        // Fallback: search for any institution admin in the system
        heiAdmin = await prisma.user.findFirst({
          where: { role: "INSTITUTION_ADMIN" },
        });
      }

      if (heiAdmin) {
        const matchScorePct = Math.round(topMatch.final_score * 100);
        const adminMsg =
          `[MOCK SMS - SIH26043] Attention ${heiAdmin.fullName}: New challenge ` +
          `'${challenge.title}' has been matched to ${topMatch.institution_name} ` +
          `with ${matchScorePct}% capability fit. Log in to review the statement and team allocation.`;

        await enqueueNotifySms({
          recipientId: heiAdmin.id,
          phoneNumber: heiAdmin.phoneNumber ?? undefined,
          title: "New High-Alignment Challenge Match Assigned",
          message: adminMsg,
          type: "HEI_ADMIN_MATCH_ALERT",
          metadata: {
            challengeId,
            institutionId: topMatch.institution_id,
            institutionName: topMatch.institution_name,
            finalScore: topMatch.final_score,
            explanation: topMatch.explanation,
          },
        });
        heiAdminNotified = true;
      } else {
        logger.warn(
          { institutionId: topMatch.institution_id, institutionName: topMatch.institution_name },
          "No INSTITUTION_ADMIN user found to notify for top match"
        );
      }
    }
  }

  const durationMs = Date.now() - startTime;
  return {
    success: true,
    challengeId,
    action: analysis.action,
    isDuplicate: analysis.action === "DUPLICATE_MERGED",
    matchesCount: analysis.action === "MATCHED" ? analysis.matches_count : 0,
    citizenNotified,
    heiAdminNotified,
    topMatchInstitutionName,
    canonicalTitle,
    durationMs,
  };
}
