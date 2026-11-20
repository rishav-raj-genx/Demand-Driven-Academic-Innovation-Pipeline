import { Job } from "bullmq";
import { aiClient } from "../clients/ai-client.js";
import { logger } from "../redis.js";
import { type HeiEmbedJobData } from "../types.js";

export interface HeiEmbedProcessorResult {
  success: boolean;
  institutionId: string;
  code: string;
  name: string;
  tier: string;
  embeddingDimensions: number;
  durationMs: number;
}

export async function heiEmbedProcessor(
  job: Job<HeiEmbedJobData>
): Promise<HeiEmbedProcessorResult> {
  const {
    institutionId,
    domains,
    facultySpecializations,
    labFacilities,
    profileSummary,
  } = job.data;

  if (!institutionId) {
    throw new Error(`HeiEmbed job ${job.id} missing mandatory institutionId`);
  }

  const startTime = Date.now();
  logger.info(
    { jobId: job.id, institutionId },
    "Processing HEI capability embedding job"
  );

  const result = await aiClient.embedInstitution({
    institution_id: institutionId,
    domains,
    faculty_specializations: facultySpecializations,
    lab_facilities: labFacilities,
    profile_summary: profileSummary,
  });

  const durationMs = Date.now() - startTime;
  logger.info(
    {
      jobId: job.id,
      institutionId: result.institution_id,
      code: result.code,
      dimensions: result.embedding_dimensions,
      durationMs,
    },
    "HEI capability embedding generated and persisted successfully"
  );

  return {
    success: true,
    institutionId: result.institution_id,
    code: result.code,
    name: result.name,
    tier: result.tier,
    embeddingDimensions: result.embedding_dimensions,
    durationMs,
  };
}
