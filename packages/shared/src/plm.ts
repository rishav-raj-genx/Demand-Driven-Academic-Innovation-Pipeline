import { ProjectPhase } from "./enums.js";

/**
 * Sequential PLM Phase Transition Map:
 * POC -> PROTOTYPING -> FIELD_TEST -> IP_TECH_TRANSFER
 */
export const PLM_TRANSITIONS: Readonly<Record<ProjectPhase, readonly ProjectPhase[]>> = {
  [ProjectPhase.POC]: [ProjectPhase.PROTOTYPING],
  [ProjectPhase.PROTOTYPING]: [ProjectPhase.FIELD_TEST],
  [ProjectPhase.FIELD_TEST]: [ProjectPhase.IP_TECH_TRANSFER],
  [ProjectPhase.IP_TECH_TRANSFER]: [],
} as const;

/**
 * Determines whether a project can transition from one PLM phase to another.
 *
 * @param from - Current project phase
 * @param to - Proposed target phase
 * @returns boolean indicating if the transition is permissible
 */
export function canTransitionPhase(from: ProjectPhase, to: ProjectPhase): boolean {
  const allowedTargets = PLM_TRANSITIONS[from];
  if (!allowedTargets) {
    return false;
  }
  return allowedTargets.includes(to);
}
