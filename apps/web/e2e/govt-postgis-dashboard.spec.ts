import { test, expect } from "@playwright/test";

test.describe("E2E User Journey 5: Government PostGIS Spatial Analytics & KPI Dashboard", () => {
  test("Login as Govt. Official → verify KPI cards, Recent Capability Matches table, and interactive Jharkhand district map render with zero console errors", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];

    // Capture browser console errors
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        // Ignore external OpenStreetMap tile fetch failures if rate-limited or offline
        if (
          !text.includes("tile.openstreetmap.org") &&
          !text.includes("favicon.ico") &&
          !text.includes("404 (Not Found)")
        ) {
          consoleErrors.push(text);
        }
      }
    });

    // 1. Authenticate as Government Official / Super Admin
    await page.goto("/login");
    await page.fill('input[type="email"]', "admin@sih.gov.in");
    await page.fill('input[type="password"]', "DemoPassword123!");
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
    await expect(
      page.locator("text=Department of Higher Education, Govt. of Jharkhand")
    ).toBeVisible({ timeout: 10_000 });

    // 2. Verify Executive KPI Cards Row
    await expect(page.locator("text=Active Civic Challenges")).toBeVisible();
    await expect(page.locator("text=Funded Prototypes")).toBeVisible();
    await expect(page.locator("text=Patents & Tech Transfer")).toBeVisible();
    await expect(page.locator("text=Deduplicated Demands")).toBeVisible();
    await expect(page.locator("text=Tier-2/3 Load Share")).toBeVisible();

    // Verify equitable Tier-2/3 load share callout is rendered
    await expect(page.locator("text=Equitable HEI distribution")).toBeVisible();

    // 3. Verify Recent Capability Matches Table
    await expect(page.locator("text=Recent Capability Matches")).toBeVisible();
    await expect(page.locator("th:has-text('Challenge')")).toBeVisible();
    await expect(page.locator("th:has-text('Assigned HEI')")).toBeVisible();

    // Verify table has populated match rows
    const matchRows = page.locator("tbody tr");
    const count = await matchRows.count();
    expect(count).toBeGreaterThan(0);

    // Verify first row contains match percentage and tier indicator
    const firstRow = matchRows.first();
    await expect(firstRow).toContainText(/TIER 1|TIER 2|TIER 3/);
    await expect(firstRow).toContainText(/%/);

    // 4. Verify Interactive PostGIS Jharkhand Spatial Map
    await expect(page.locator("text=Jharkhand Innovation Density Map")).toBeVisible();
    await expect(page.locator("text=Live PostGIS 3.7")).toBeVisible();

    // Leaflet map container should be mounted and visible
    const leafletMap = page.locator(".leaflet-container");
    await expect(leafletMap).toBeVisible({ timeout: 10_000 });

    // Verify Map filter dropdowns (Domain, District, Status)
    await expect(page.locator("select >> nth=0")).toBeVisible();

    // 5. Verify Bottom Analytics Charts Row
    await expect(page.locator("text=HEI Capacity & Load-Balancing")).toBeVisible();
    await expect(page.locator("text=4-Phase PLM Stage-Gate Funnel")).toBeVisible();

    // 6. Assert Zero Unhandled Console Errors
    expect(consoleErrors).toHaveLength(0);
  });
});
