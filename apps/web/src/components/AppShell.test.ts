import { describe, it, expect } from "vitest";
import { getAllowedNavItems, NAV_ITEMS } from "./AppShell";

describe("Role-Aware AppShell Navigation Access Suite", () => {
  it("should return empty array when no role is provided", () => {
    expect(getAllowedNavItems(undefined)).toEqual([]);
    expect(getAllowedNavItems("")).toEqual([]);
  });

  it("should provide STUDENT with Dashboard and Challenges routes", () => {
    const studentRoutes = getAllowedNavItems("STUDENT");
    const labels = studentRoutes.map((i) => i.label);

    expect(labels).toContain("Dashboard");
    expect(labels).toContain("Challenges");
    expect(labels).not.toContain("Admin Console");
    expect(labels).not.toContain("HEI Portal");
    expect(labels).not.toContain("Industry Hub");
  });

  it("should provide INSTITUTION_ADMIN and HEI_ADMIN with HEI Portal and Verify Org", () => {
    const instRoutes = getAllowedNavItems("INSTITUTION_ADMIN");
    const heiRoutes = getAllowedNavItems("HEI_ADMIN");

    const instLabels = instRoutes.map((i) => i.label);
    const heiLabels = heiRoutes.map((i) => i.label);

    expect(instLabels).toContain("Dashboard");
    expect(instLabels).toContain("HEI Portal");
    expect(instLabels).toContain("Challenges");
    expect(instLabels).toContain("Verify Org");
    expect(instLabels).toContain("Mock SMS Logs");
    expect(instLabels).not.toContain("Admin Console");
    expect(instLabels).not.toContain("Bulk Import");

    expect(heiLabels).toEqual(instLabels);
  });

  it("should provide INDUSTRY_PARTNER with Industry Hub and Verify Org", () => {
    const indRoutes = getAllowedNavItems("INDUSTRY_PARTNER");
    const labels = indRoutes.map((i) => i.label);

    expect(labels).toContain("Dashboard");
    expect(labels).toContain("Industry Hub");
    expect(labels).toContain("Challenges");
    expect(labels).toContain("Verify Org");
    expect(labels).not.toContain("HEI Portal");
    expect(labels).not.toContain("Admin Console");
  });

  it("should provide SUPER_ADMIN with full portal access including Admin Console, Bulk Import, and Mock SMS", () => {
    const adminRoutes = getAllowedNavItems("SUPER_ADMIN");
    const labels = adminRoutes.map((i) => i.label);

    expect(labels).toContain("Dashboard");
    expect(labels).toContain("HEI Portal");
    expect(labels).toContain("Industry Hub");
    expect(labels).toContain("Challenges");
    expect(labels).toContain("Verify Org");
    expect(labels).toContain("Admin Console");
    expect(labels).toContain("Bulk Import");
    expect(labels).toContain("Mock SMS Logs");
  });

  it("should provide GOVT_OFFICIAL with Bulk Import and Mock SMS logs", () => {
    const govtRoutes = getAllowedNavItems("GOVT_OFFICIAL");
    const labels = govtRoutes.map((i) => i.label);

    expect(labels).toContain("Dashboard");
    expect(labels).toContain("Challenges");
    expect(labels).toContain("Bulk Import");
    expect(labels).toContain("Mock SMS Logs");
    expect(labels).not.toContain("HEI Portal");
    expect(labels).not.toContain("Admin Console");
  });
});
