import { test, expect } from "@playwright/test";

test.describe("E2E User Journey 1: Authentication & Trust Verification", () => {
  test("Register HEI Admin → blocked while unverified → verify via mock AISHE → access granted; invalid AISHE rejected", async ({
    page,
  }) => {
    const timestamp = Date.now();
    const testEmail = `hei_admin_${timestamp}@bitmesra.ac.in`;
    const testPassword = "DemoPassword123!";
    const testFullName = `Dr. Rameshwar Verma ${timestamp}`;

    // 1. Navigate to Registration page
    await page.goto("/register");
    await expect(page).toHaveTitle(/SIH26043/i);

    // 2. Fill HEI Admin Registration Form
    await page.fill("#fullName", testFullName);
    await page.fill("#email", testEmail);
    await page.selectOption("#role", "HEI_ADMIN");
    await page.fill("#password", testPassword);

    // Verify institutional policy notice is displayed for HEI_ADMIN
    await expect(page.locator("text=Organization Verification Required:")).toBeVisible();

    // 3. Submit Registration
    await page.click('button[type="submit"]:has-text("Complete Registration")');

    // Expect successful registration and PENDING_VERIFICATION notification
    await expect(page.locator("text=Account Created Successfully")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=PENDING_VERIFICATION")).toBeVisible();

    // 4. Navigate to Login and authenticate as the newly created unverified HEI user
    await page.click('a:has-text("Sign In to Workspace")');
    await expect(page).toHaveURL(/\/login/);

    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');

    // 5. User is redirected to Dashboard and flagged as unverified in the Shell
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page.locator("text=Verify Org").first()).toBeVisible({ timeout: 10_000 });

    // 6. Navigate to Trust Verification Portal
    await page.locator('a:has-text("Verify Org")').first().click();
    await page.waitForURL(/\/onboarding\/verify/, { timeout: 10_000 });
    await expect(page.locator("text=Trust Architecture Policy Notice")).toBeVisible();

    // 7. Test Negative Case: Invalid AISHE Code Rejected
    await page.fill("#aisheCode", "U-FAKE-999");
    await page.click('button:has-text("Run AISHE Verification")');

    // Verify rejection record is rendered
    await expect(page.locator("text=Verification REJECTED")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Fraudulent or unrecognized educational institution registration")).toBeVisible();

    // 8. Test Positive Case: Valid AISHE Code (BIT Mesra U-0202) Confirmed
    await page.fill("#aisheCode", "U-0202");
    await page.click('button:has-text("Run AISHE Verification")');

    // Verify successful verification badge and official mock provenance
    await expect(page.locator("text=Verification Confirmed")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Institution successfully verified via AISHE database")).toBeVisible();
    await expect(page.locator("text=Controlled Mock (MVP)").first()).toBeVisible();

    // 9. Navigate to HEI Dashboard: Educational body access verified
    await page.goto("/hei/dashboard");
    await expect(page.locator("text=AISHE Identity Verification")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Verified Educational Body")).toBeVisible();
  });
});
