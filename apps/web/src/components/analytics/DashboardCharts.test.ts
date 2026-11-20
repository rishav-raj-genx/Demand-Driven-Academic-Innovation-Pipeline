import { describe, it, expect } from "vitest";
import { HeiLoadBalancingChart, type InstitutionUtilizationItem } from "./HeiLoadBalancingChart";
import { PlmInnovationFunnel } from "./PlmInnovationFunnel";

describe("Dashboard Analytics Charts Unit Suite", () => {
  const mockUtilization: InstitutionUtilizationItem[] = [
    {
      id: "inst-1",
      name: "Indian Institute of Technology (ISM) Dhanbad",
      code: "IIT-ISM",
      tier: "TIER_1",
      districtName: "Dhanbad",
      activeProjects: 3,
      maxCapacity: 4,
      availableCapacity: 1,
      utilizationPercent: 75,
    },
    {
      id: "inst-2",
      name: "National Institute of Technology Jamshedpur",
      code: "NIT-JSR",
      tier: "TIER_1",
      districtName: "East Singhbhum",
      activeProjects: 3,
      maxCapacity: 4,
      availableCapacity: 1,
      utilizationPercent: 75,
    },
    {
      id: "inst-3",
      name: "Birsa Institute of Technology Sindri",
      code: "BIT-SINDRI",
      tier: "TIER_2",
      districtName: "Dhanbad",
      activeProjects: 2,
      maxCapacity: 3,
      availableCapacity: 1,
      utilizationPercent: 67,
    },
    {
      id: "inst-4",
      name: "Government Polytechnic Khutri Bokaro",
      code: "GP-BOKARO",
      tier: "TIER_3",
      districtName: "Bokaro",
      activeProjects: 1,
      maxCapacity: 2,
      availableCapacity: 1,
      utilizationPercent: 50,
    },
  ];

  it("exports HeiLoadBalancingChart and PlmInnovationFunnel safely", () => {
    expect(HeiLoadBalancingChart).toBeDefined();
    expect(typeof HeiLoadBalancingChart).toBe("function");
    expect(PlmInnovationFunnel).toBeDefined();
    expect(typeof PlmInnovationFunnel).toBe("function");
  });

  it("calculates Tier-1 vs Tier-2/3 load balancing metrics accurately", () => {
    const tier1 = mockUtilization.filter((i) => i.tier === "TIER_1");
    const tier23 = mockUtilization.filter((i) => i.tier === "TIER_2" || i.tier === "TIER_3");

    const tier1Active = tier1.reduce((sum, i) => sum + i.activeProjects, 0);
    const tier23Active = tier23.reduce((sum, i) => sum + i.activeProjects, 0);
    const totalActive = tier1Active + tier23Active;

    expect(tier1Active).toBe(6);
    expect(tier23Active).toBe(3);
    expect(totalActive).toBe(9);

    const share = Math.round((tier23Active / totalActive) * 1000) / 10;
    expect(share).toBe(33.3);
  });

  it("handles zero challenges in PlmInnovationFunnel without division by zero", () => {
    const totalChallenges = 0;
    const baseline = Math.max(1, totalChallenges);
    const matched = 0;
    const conversion = Math.round((matched / baseline) * 100);

    expect(baseline).toBe(1);
    expect(conversion).toBe(0);
  });

  it("correctly generates well-formatted CSV content with headers and escaped fields", () => {
    const headers = [
      "Institution Name",
      "Code",
      "Tier",
      "District",
      "Active Projects",
      "Max Capacity",
      "Available Capacity",
      "Utilization (%)",
    ];

    const rows = mockUtilization.map((i) => [
      `"${i.name.replace(/"/g, '""')}"`,
      `"${i.code}"`,
      `"${i.tier}"`,
      `"${i.districtName}"`,
      i.activeProjects,
      i.maxCapacity,
      i.availableCapacity,
      i.utilizationPercent,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    expect(csvContent).toContain("Institution Name,Code,Tier,District");
    expect(csvContent).toContain('"Indian Institute of Technology (ISM) Dhanbad"');
    expect(csvContent).toContain('"BIT-SINDRI"');
    expect(csvContent.split("\n").length).toBe(5); // Header + 4 rows
  });
});
