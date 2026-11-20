import crypto from "node:crypto";

export interface MilestoneHashInput {
  projectId: string;
  phase: string;
  title: string;
  summary: string;
  artifactKeys: string[];
}

/**
 * Computes a deterministic SHA-256 hash of a milestone deliverable submission.
 * Exact key ordering: { projectId, phase, title, summary, artifactKeys }
 */
export function computeMilestoneContentHash(input: MilestoneHashInput): string {
  const deterministicPayload = {
    projectId: input.projectId,
    phase: input.phase,
    title: input.title,
    summary: input.summary,
    artifactKeys: [...input.artifactKeys],
  };

  const jsonString = JSON.stringify(deterministicPayload);
  return crypto.createHash("sha256").update(jsonString).digest("hex");
}
