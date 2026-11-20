import { test, expect } from "@playwright/test";
import { prisma } from "@sih/db";

test.describe("E2E User Journey 3: Semantic Deduplication & Capacity-Aware Load Balancing", () => {
  test.beforeAll(async () => {
    // Delete non-seeded test challenges from previous runs to maintain pristine test isolation
    await prisma.capabilityMatch.deleteMany({
      where: {
        challenge: {
          clientIdempotencyKey: { not: { startsWith: "jh-chal-" } },
        },
      },
    });
    await prisma.challenge.deleteMany({
      where: {
        clientIdempotencyKey: { not: { startsWith: "jh-chal-" } },
      },
    });
  });

  test.beforeEach(async ({ page }) => {
    // Authenticate as Citizen to allow challenge submissions
    await page.goto("/login");
    await page.fill('input[type="email"]', "citizen@sih.gov.in");
    await page.fill('input[type="password"]', "DemoPassword123!");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("Paraphrased duplicate challenge triggers DUPLICATE_MERGED and increments parent endorsement", async ({
    page,
  }) => {
    // 1. Fetch initial endorsement count for canonical challenge jh-chal-001
    const canonical = await prisma.challenge.findFirstOrThrow({
      where: { clientIdempotencyKey: "jh-chal-001" },
    });
    const initialEndorsements = canonical.endorsementCount || 0;

    // 2. Submit a paraphrased variation of jh-chal-001
    const timestamp = Date.now();
    const duplicateTitle = `Community Defluoridation and Arsenic Units for Palamu Rural Villages ${timestamp}`;
    const duplicateNarrative = `Groundwater across 42 habitations in Medininagar and Lesliganj blocks contains dangerous fluoride concentrations exceeding 4.5 mg/L, causing severe skeletal fluorosis among children. We seek a resilient, zero-chemical-sludge adsorption or electrocoagulation filtration system capable of processing 1,500 liters/day powered by decentralized solar energy.`;

    await page.goto("/challenges/new");
    await page.fill("#challenge-title", duplicateTitle);
    await page.fill("#challenge-description", duplicateNarrative);
    await page.selectOption("#challenge-domain", "Water Filtration");
    await page.selectOption("#challenge-urgency", "CRITICAL");
    await page.click('button:has-text("Palamu (Medininagar)")');

    await page.click('button[type="submit"]:has-text("Submit Challenge Live")');

    // Wait for submission confirmation banner
    await expect(page.locator("text=Submission Confirmed!")).toBeVisible({ timeout: 15_000 });

    // 3. Await background BullMQ / AI Engine deduplication processing
    let duplicateChallengeId = "";
    await expect
      .poll(
        async () => {
          const ch = await prisma.challenge.findFirst({
            where: { title: duplicateTitle },
          });
          if (ch?.canonicalId) {
            duplicateChallengeId = ch.id;
            return ch.status;
          }
          return "";
        },
        { timeout: 25_000, intervals: [1000, 2000] }
      )
      .toBe("DUPLICATE_MERGED");

    // 4. Verify canonical parent challenge endorsement count incremented
    const updatedCanonical = await prisma.challenge.findUnique({
      where: { id: canonical.id },
    });
    expect(updatedCanonical?.endorsementCount).toBeGreaterThan(initialEndorsements);

    // 5. Navigate to Challenges Hub and enable merged duplicates filter
    await page.goto("/challenges");
    const duplicatesCheckbox = page.locator('input[type="checkbox"]');
    await duplicatesCheckbox.check();

    // 6. Verify newly submitted challenge is marked DUPLICATE_MERGED in the directory
    await page.fill('input[placeholder*="Search challenges"]', duplicateTitle);
    await expect(page.locator(`text=${duplicateTitle}`)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("text=DUPLICATE_MERGED").first()).toBeVisible({ timeout: 10_000 });

    // 7. Navigate to the duplicate challenge detail page to verify canonical link
    await page.goto(`/challenges/${duplicateChallengeId}`);
    await expect(page.locator("text=Merged Duplicate Challenge")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=View Canonical Challenge:")).toBeVisible();
  });

  test("Unique demand gives overloaded Tier-1 a capacity penalty and ranks capable Tier-2 as #1", async ({
    page,
  }) => {
    const timestamp = Date.now();
    const uniqueTitle = `Conveyor Belt Thermal Hotspot Sensor Mesh for Dhanbad Coal Washeries ${timestamp}`;
    const uniqueNarrative = `Continuous overland coal conveyors in Dhanbad washeries suffer from catastrophic fires caused by roller bearing friction seizure. We require intrinsically safe multi-point infrared thermal telemetry arrays to monitor idler bearings and automatically trigger nitrogen foam suppression.`;

    // 1. Submit unique demand matching Mining Dust/Safety in Dhanbad
    await page.goto("/challenges/new");
    await page.fill("#challenge-title", uniqueTitle);
    await page.fill("#challenge-description", uniqueNarrative);
    await page.selectOption("#challenge-domain", "Mining Dust/Safety");
    await page.selectOption("#challenge-urgency", "CRITICAL");
    await page.click('button:has-text("Dhanbad")');

    await page.click('button[type="submit"]:has-text("Submit Challenge Live")');
    await expect(page.locator("text=Submission Confirmed!")).toBeVisible({ timeout: 15_000 });

    // 2. Await AI capability matching processing
    let matchedChallengeId = "";
    await expect
      .poll(
        async () => {
          const ch = await prisma.challenge.findFirst({
            where: { title: uniqueTitle },
            include: {
              capabilityMatches: {
                include: { institution: true },
                orderBy: { matchRank: "asc" },
              },
            },
          });
          if (ch && ch.capabilityMatches.length > 0) {
            matchedChallengeId = ch.id;
            return ch.capabilityMatches.length;
          }
          return 0;
        },
        { timeout: 25_000, intervals: [1000, 2000] }
      )
      .toBeGreaterThan(0);

    expect(matchedChallengeId).toBeTruthy();

    // 3. Inspect capability matches on the Challenge Detail Page
    await page.goto(`/challenges/${matchedChallengeId}`);
    await expect(page.locator("text=Top AI-Matched Higher Education Institutions")).toBeVisible({ timeout: 15_000 });

    // 4. Verify Tier-2 BIT Sindri (C-44102) is ranked #1 due to capacity load-balancing
    await expect(page.locator("text=#1").first()).toBeVisible({ timeout: 15_000 });
    const topRankedItem = page.locator("div.bg-slate-950:has(span:text('#1'))").first();
    await expect(topRankedItem).toContainText(/Birsa Institute of Technology Sindri|BIT Sindri|TIER_2/);
  });
});
