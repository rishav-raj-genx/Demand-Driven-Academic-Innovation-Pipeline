import { test, expect } from "@playwright/test";

test.describe("E2E User Journey 2: Offline PWA Citizen Intake & Background Sync", () => {
  test("Login as Citizen → simulate browser offline → submit challenge → confirm saved in IndexedDB → restore online → automatic sync & status progression", async ({
    page,
    context,
  }) => {
    const timestamp = Date.now();
    const challengeTitle = `Barkagaon Groundwater Arsenic Alert ${timestamp}`;
    const challengeDescription = `Severe arsenic contamination detected in 14 public borewells in Barkagaon block exceeding 0.05 mg/L causing chronic health issues across rural families.`;

    // 1. Authenticate as pre-seeded Citizen
    await page.goto("/login");
    await page.fill('input[type="email"]', "citizen@sih.gov.in");
    await page.fill('input[type="password"]', "DemoPassword123!");
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    // 2. Navigate to New Challenge intake portal
    await page.goto("/challenges/new");
    await expect(page.locator("text=Submit a Civic or Industrial Challenge")).toBeVisible();

    // 3. Fill the demand form
    await page.fill("#challenge-title", challengeTitle);
    await page.fill("#challenge-description", challengeDescription);
    await page.selectOption("#challenge-domain", "Water Filtration");
    await page.selectOption("#challenge-urgency", "CRITICAL");

    // Click quick district button for Hazaribagh
    await page.click('button:has-text("Hazaribagh")');

    // 4. Attach a dummy photo to verify offline blob serialization
    const buffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );
    await page.setInputFiles('input[type="file"]', {
      name: "handpump_arsenic_sample.png",
      mimeType: "image/png",
      buffer,
    });
    await expect(page.locator('img[alt="Attachment 1"]')).toBeVisible();

    // 5. Simulate browser disconnection / offline network mode
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));

    // Verify Offline Banner from OfflineSyncProvider
    await expect(page.locator("text=Offline Mode").first()).toBeVisible({ timeout: 5_000 });

    // 6. Submit the challenge form while offline
    await page.click('button[type="submit"]:has-text("Save to Offline Outbox")');

    // 7. Verify submission was intercepted and queued locally in IndexedDB
    await expect(page.locator("text=Saved to device outbox!")).toBeVisible({ timeout: 10_000 });

    const outboxCount = await page.evaluate(async () => {
      return new Promise<number>((resolve) => {
        const req = indexedDB.open("sih_outbox_db", 1);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("challenges")) {
            resolve(0);
            return;
          }
          const tx = db.transaction("challenges", "readonly");
          const countReq = tx.objectStore("challenges").count();
          countReq.onsuccess = () => resolve(countReq.result);
          countReq.onerror = () => resolve(0);
        };
        req.onerror = () => resolve(0);
      });
    });
    expect(outboxCount).toBeGreaterThanOrEqual(1);

    // 8. Restore network connectivity (online)
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    // 9. Verify automatic outbox sync & queue draining
    await expect
      .poll(
        async () => {
          return await page.evaluate(async () => {
            return new Promise<number>((resolve) => {
              const req = indexedDB.open("sih_outbox_db", 1);
              req.onsuccess = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains("challenges")) {
                  resolve(0);
                  return;
                }
                const tx = db.transaction("challenges", "readonly");
                const countReq = tx.objectStore("challenges").count();
                countReq.onsuccess = () => resolve(countReq.result);
                countReq.onerror = () => resolve(0);
              };
              req.onerror = () => resolve(0);
            });
          });
        },
        { timeout: 25_000, intervals: [1000, 2000] }
      )
      .toBe(0);

    // 10. Confirm challenge persisted in backend database and processed by BullMQ/FastAPI
    await page.goto("/challenges");
    await expect(page.locator("text=Challenge Explorer")).toBeVisible();

    // Enable duplicates toggle to ensure visibility regardless of semantic merge status
    const duplicatesCheckbox = page.locator('input[type="checkbox"]');
    if (await duplicatesCheckbox.isVisible()) {
      await duplicatesCheckbox.check();
    }

    // Check that the challenge is visible in the challenges directory
    await page.fill('input[placeholder*="Search challenges"]', challengeTitle);
    await expect(page.locator(`text=${challengeTitle}`)).toBeVisible({ timeout: 15_000 });
  });
});
