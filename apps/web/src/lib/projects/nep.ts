import { ProjectPhase, ApprovalDecision } from "@sih/shared";

export interface NepPhaseCredit {
  phase: ProjectPhase;
  credits: number;
  isEligible: boolean;
  isEarned: boolean;
  status: "COMPLETED" | "IN_PROGRESS" | "PENDING";
}

export interface NepCreditSummary {
  framework: "NEP_2020_EXPERIENTIAL_LEARNING";
  totalMaxCredits: number;
  eligibleCredits: number;
  earnedCredits: number;
  studentBeneficiariesCount: number;
  facultyBeneficiariesCount: number;
  phases: Record<ProjectPhase, NepPhaseCredit>;
}

export const NEP_PHASE_CREDIT_WEIGHTS: Record<ProjectPhase, number> = {
  [ProjectPhase.POC]: 2,
  [ProjectPhase.PROTOTYPING]: 4,
  [ProjectPhase.FIELD_TEST]: 6,
  [ProjectPhase.IP_TECH_TRANSFER]: 8,
};

export const NEP_PHASE_SEQUENCE: readonly ProjectPhase[] = [
  ProjectPhase.POC,
  ProjectPhase.PROTOTYPING,
  ProjectPhase.FIELD_TEST,
  ProjectPhase.IP_TECH_TRANSFER,
];

export function getPhaseOrderIndex(phase: ProjectPhase | string): number {
  const idx = NEP_PHASE_SEQUENCE.indexOf(phase as ProjectPhase);
  return idx >= 0 ? idx + 1 : 1;
}

export function calculateNepCreditSummary(
  currentPhase: ProjectPhase | string,
  milestones: Array<{
    phase: ProjectPhase | string;
    status: ApprovalDecision | string;
    isCompleted?: boolean;
  }>,
  members: Array<{ role: string }>
): NepCreditSummary {
  const currentPhaseIndex = NEP_PHASE_SEQUENCE.indexOf(currentPhase as ProjectPhase);

  let earnedCredits = 0;
  let eligibleCredits = 0;

  const phases = {} as Record<ProjectPhase, NepPhaseCredit>;

  for (let i = 0; i < NEP_PHASE_SEQUENCE.length; i++) {
    const phaseKey = NEP_PHASE_SEQUENCE[i]!;
    const weight = NEP_PHASE_CREDIT_WEIGHTS[phaseKey];
    const isEligible = i <= currentPhaseIndex;

    if (isEligible) {
      eligibleCredits += weight;
    }

    const milestone = milestones.find((m) => m.phase === phaseKey);
    const isEarned = milestone
      ? milestone.status === ApprovalDecision.APPROVED || milestone.isCompleted === true
      : false;

    if (isEarned) {
      earnedCredits += weight;
    }

    let status: "COMPLETED" | "IN_PROGRESS" | "PENDING" = "PENDING";
    if (isEarned) {
      status = "COMPLETED";
    } else if (i === currentPhaseIndex) {
      status = "IN_PROGRESS";
    }

    phases[phaseKey] = {
      phase: phaseKey,
      credits: weight,
      isEligible,
      isEarned,
      status,
    };
  }

  const studentCount = members.filter(
    (m) => m.role.toUpperCase() === "STUDENT"
  ).length;

  const facultyCount = members.filter((m) =>
    ["FACULTY_LEAD", "FACULTY", "PI"].includes(m.role.toUpperCase())
  ).length;

  return {
    framework: "NEP_2020_EXPERIENTIAL_LEARNING",
    totalMaxCredits: 20,
    eligibleCredits,
    earnedCredits,
    studentBeneficiariesCount: studentCount,
    facultyBeneficiariesCount: facultyCount,
    phases,
  };
}
