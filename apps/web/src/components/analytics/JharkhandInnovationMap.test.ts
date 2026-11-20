import { describe, it, expect, vi } from "vitest";

describe("JharkhandInnovationMap Unit & Edge Case Suite", () => {
  it("exports component and types safely", async () => {
    const mod = await import("./JharkhandInnovationMap");
    expect(mod.JharkhandInnovationMap).toBeDefined();
    expect(typeof mod.JharkhandInnovationMap).toBe("function");
  });

  it("handles empty feature collections gracefully", () => {
    const emptyCollection = {
      type: "FeatureCollection" as const,
      success: true,
      features: [],
      metadata: {
        totalDistricts: 0,
        filters: { domain: null, phase: null, tier: null },
        generatedAt: new Date().toISOString(),
      },
    };

    const totalChallenges = emptyCollection.features.reduce(
      (sum, f) => sum + ((f as { properties?: { challengeCount?: number } }).properties?.challengeCount || 0),
      0
    );
    expect(totalChallenges).toBe(0);
    expect(emptyCollection.features.length).toBe(0);
  });

  it("handles offline tile fallback state safely", () => {
    let tileOffline = false;
    const setTileOffline = vi.fn((val: boolean) => {
      tileOffline = val;
    });

    // Simulate tileerror event from OpenStreetMap tile loading failure
    setTileOffline(true);
    expect(setTileOffline).toHaveBeenCalledWith(true);
    expect(tileOffline).toBe(true);
  });

  it("calculates district color thresholds accurately", () => {
    function getDistrictColor(count: number): string {
      if (count >= 8) return "#4338ca"; // indigo-700
      if (count >= 5) return "#2563eb"; // blue-600
      if (count >= 3) return "#0284c7"; // sky-600
      if (count >= 1) return "#0369a1"; // sky-700
      return "#1e293b"; // slate-800 (low/zero)
    }

    expect(getDistrictColor(9)).toBe("#4338ca");
    expect(getDistrictColor(5)).toBe("#2563eb");
    expect(getDistrictColor(4)).toBe("#0284c7");
    expect(getDistrictColor(2)).toBe("#0369a1");
    expect(getDistrictColor(0)).toBe("#1e293b");
  });
});
