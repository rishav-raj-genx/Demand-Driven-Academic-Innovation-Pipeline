import { describe, it, expect } from "vitest";
import { ProjectPhase } from "./enums.js";
import { canTransitionPhase, PLM_TRANSITIONS } from "./plm.js";

describe("PLM Phase Transitions", () => {
  it("should permit valid forward sequential transitions", () => {
    expect(canTransitionPhase(ProjectPhase.POC, ProjectPhase.PROTOTYPING)).toBe(true);
    expect(canTransitionPhase(ProjectPhase.PROTOTYPING, ProjectPhase.FIELD_TEST)).toBe(true);
    expect(canTransitionPhase(ProjectPhase.FIELD_TEST, ProjectPhase.IP_TECH_TRANSFER)).toBe(true);
  });

  it("should disallow skipping phases", () => {
    expect(canTransitionPhase(ProjectPhase.POC, ProjectPhase.FIELD_TEST)).toBe(false);
    expect(canTransitionPhase(ProjectPhase.POC, ProjectPhase.IP_TECH_TRANSFER)).toBe(false);
    expect(canTransitionPhase(ProjectPhase.PROTOTYPING, ProjectPhase.IP_TECH_TRANSFER)).toBe(false);
  });

  it("should disallow backward transitions", () => {
    expect(canTransitionPhase(ProjectPhase.PROTOTYPING, ProjectPhase.POC)).toBe(false);
    expect(canTransitionPhase(ProjectPhase.FIELD_TEST, ProjectPhase.PROTOTYPING)).toBe(false);
    expect(canTransitionPhase(ProjectPhase.IP_TECH_TRANSFER, ProjectPhase.FIELD_TEST)).toBe(false);
  });

  it("should disallow transitioning from terminal phase IP_TECH_TRANSFER", () => {
    expect(canTransitionPhase(ProjectPhase.IP_TECH_TRANSFER, ProjectPhase.POC)).toBe(false);
    expect(canTransitionPhase(ProjectPhase.IP_TECH_TRANSFER, ProjectPhase.PROTOTYPING)).toBe(false);
    expect(canTransitionPhase(ProjectPhase.IP_TECH_TRANSFER, ProjectPhase.FIELD_TEST)).toBe(false);
    expect(canTransitionPhase(ProjectPhase.IP_TECH_TRANSFER, ProjectPhase.IP_TECH_TRANSFER)).toBe(false);
  });

  it("should disallow self transitions", () => {
    expect(canTransitionPhase(ProjectPhase.POC, ProjectPhase.POC)).toBe(false);
    expect(canTransitionPhase(ProjectPhase.PROTOTYPING, ProjectPhase.PROTOTYPING)).toBe(false);
    expect(canTransitionPhase(ProjectPhase.FIELD_TEST, ProjectPhase.FIELD_TEST)).toBe(false);
  });

  it("should maintain valid PLM_TRANSITIONS map integrity", () => {
    expect(PLM_TRANSITIONS[ProjectPhase.POC]).toEqual([ProjectPhase.PROTOTYPING]);
    expect(PLM_TRANSITIONS[ProjectPhase.PROTOTYPING]).toEqual([ProjectPhase.FIELD_TEST]);
    expect(PLM_TRANSITIONS[ProjectPhase.FIELD_TEST]).toEqual([ProjectPhase.IP_TECH_TRANSFER]);
    expect(PLM_TRANSITIONS[ProjectPhase.IP_TECH_TRANSFER]).toEqual([]);
  });
});
