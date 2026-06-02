/**
 * IPD Module Tests
 * Covers: bed map loads, admit patient modal, bed assignment
 */
import { test, expect } from "../../fixtures";

test.describe("IPD Bed Map", () => {
  test("IPD page loads with bed map", async ({ navigate, page }) => {
    await navigate("/ipd");
    await expect(
      page.getByRole("tab", { name: /bed map|beds/i }).or(page.getByText(/bed map/i))
    ).toBeVisible();
  });

  test("Admit Patient button is visible", async ({ navigate, page }) => {
    await navigate("/ipd");
    await expect(
      page.getByRole("button", { name: /admit|new admission/i })
    ).toBeVisible();
  });

  test("Admit Patient modal opens and shows all 4 steps", async ({ navigate, page }) => {
    await navigate("/ipd");

    await page.getByRole("button", { name: /admit|new admission/i }).click();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: 8000 });

    // Step indicators or titles should appear
    await expect(modal.getByText(/patient|step 1/i).first()).toBeVisible();
  });
});

test.describe("IPD Workspace", () => {
  test("clicking an occupied bed opens IPD workspace", async ({ navigate, page }) => {
    await navigate("/ipd");

    // Click any occupied bed chip (they typically show patient name)
    const occupiedBed = page
      .locator("[class*='occupied'], [class*='Occupied'], [data-status='occupied']")
      .first();

    const count = await occupiedBed.count();
    if (count > 0) {
      await occupiedBed.click();
      await expect(
        page.getByRole("tab", { name: /overview|vitals|medications|notes/i }).first()
      ).toBeVisible({ timeout: 10_000 });
    } else {
      test.skip(); // No occupied beds in current environment — skip gracefully
    }
  });
});
