import { test, expect } from "@playwright/test";
import { prisma } from "@sih/db";

test.describe("E2E User Journey 4: PLM Dual-Signature Transition & Off-Platform CSR Ledger", () => {
  let projectId = "";

  test.beforeAll(async () => {
    // 1. Find PoC project seeded for SIH demo
    const pocProject = await prisma.project.findFirstOrThrow({
      where: {
        OR: [
          { currentPhase: "POC" },
          { title: { contains: "Groundwater Defluoridation" } },
        ],
      },
      include: { milestones: true },
    });
    projectId = pocProject.id;

    // Reset project phase to POC and delete leftover CSR entries from prior runs
    await prisma.project.update({
      where: { id: pocProject.id },
      data: { currentPhase: "POC" },
    });
    await prisma.csrLedgerEntry.deleteMany({
      where: { projectId: pocProject.id },
    });

    // Reset the first milestone to SUBMITTED_FOR_APPROVAL with no approvals
    const firstMilestone = pocProject.milestones[0];
    if (firstMilestone) {
      await prisma.phaseApproval.deleteMany({
        where: { milestoneId: firstMilestone.id },
      });
      await prisma.milestone.update({
        where: { id: firstMilestone.id },
        data: {
          status: "SUBMITTED_FOR_APPROVAL",
          isCompleted: false,
          completedAt: null,
        },
      });
    }
  });

  test("Faculty Lead signs milestone → stays in POC → Industry Partner co-signs → atomic transition to PROTOTYPING, MoU renders & off-platform CSR recorded", async ({
    page,
  }) => {
    // --------------------------------------------------------------------------
    // STEP 1: Login as Faculty Lead (Academic PI)
    // --------------------------------------------------------------------------
    await page.goto("/login");
    await page.fill('input[type="email"]', "faculty@sih.gov.in");
    await page.fill('input[type="password"]', "DemoPassword123!");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    // Navigate to PoC Project
    await page.goto(`/projects/${projectId}`);
    await expect(page.locator("text=POC Phase Active").first()).toBeVisible({ timeout: 10_000 });

    // Faculty Lead signs as ACADEMIC_APPROVER
    await page.click('button:has-text("Sign & Approve Transition")');
    await page.fill(
      'textarea[placeholder*="formal verification"]',
      "Academic validation completed and verified by Dr. Sunita Murmu (PI)."
    );
    await page.click('button:has-text("Confirm & Sign")');

    // Faculty track shows Signed & Approved
    await expect(page.locator("text=Signed & Approved").first()).toBeVisible({ timeout: 10_000 });
    // Project must STILL remain in POC because external partner has not co-signed yet
    await expect(page.locator("text=POC Phase Active").first()).toBeVisible();

    // --------------------------------------------------------------------------
    // STEP 2: Login as verified Industry Partner (Tata Steel CSR Foundation)
    // --------------------------------------------------------------------------
    await page.goto("/login");
    await page.fill('input[type="email"]', "industry@tata.com");
    await page.fill('input[type="password"]', "DemoPassword123!");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    await page.goto(`/projects/${projectId}`);
    await expect(page.locator("text=POC Phase Active").first()).toBeVisible({ timeout: 10_000 });

    // Industry Partner co-signs as EXTERNAL_APPROVER
    await page.click('button:has-text("Sign & Approve Transition")');
    await page.fill(
      'textarea[placeholder*="formal verification"]',
      "Tata Steel CSR Foundation confirms experimental viability and co-signs phase advancement."
    );
    await page.click('button:has-text("Confirm & Sign")');

    // --------------------------------------------------------------------------
    // STEP 3: Verify Atomic Transition into PROTOTYPING
    // --------------------------------------------------------------------------
    await expect(page.locator("text=PROTOTYPING Phase Active").first()).toBeVisible({ timeout: 15_000 });

    // --------------------------------------------------------------------------
    // STEP 4: Verify Formal Bilateral MoU View Renders
    // --------------------------------------------------------------------------
    await page.click('a:has-text("View Formal MoU")');
    await page.waitForURL(new RegExp(`/projects/${projectId}/mou`), { timeout: 10_000 });

    await expect(page.locator("text=Memorandum of Understanding (MoU)")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Tata Steel Foundation").first()).toBeVisible();
    await expect(page.locator("text=Intellectual Property (IP) Ownership Split")).toBeVisible();

    // --------------------------------------------------------------------------
    // STEP 5: Record Off-Platform CSR Disbursement Entry
    // --------------------------------------------------------------------------
    await page.goto(`/projects/${projectId}`);
    await page.click('button:has-text("Off-Platform CSR Ledger")');
    await page.click('button:has-text("Record Off-Platform Disbursement")');

    await page.fill('input[placeholder="250000"]', "250000");
    await page.selectOption("select", "EXTERNAL_NEFT");
    await page.fill('input[placeholder*="UTR-HDFC"]', "UTR-TATACSR-2026-TR1");
    await page.fill(
      'textarea[placeholder*="Tranche release"]',
      "Prototype lab fabrication materials tranche funded via external corporate banking NEFT."
    );

    await page.click('button:has-text("Record Disbursement")');

    // Verify confirmation and appearance in CSR ledger
    await expect(
      page.locator("text=External CSR disbursement tranche recorded successfully!")
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=UTR-TATACSR-2026-TR1").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=₹2,50,000").first()).toBeVisible();
  });
});
