/**
 * OPD Module Tests
 * Covers: token queue visibility, new token registration, consultation workspace
 */
import { test, expect } from "../../fixtures";

test.describe("OPD Token Queue", () => {
  test("OPD page loads with queue tab", async ({ navigate, page }) => {
    await navigate("/opd");
    await expect(page.getByRole("tab", { name: /queue|token/i })).toBeVisible();
  });

  test("New Token button is present", async ({ navigate, page }) => {
    await navigate("/opd");
    await expect(
      page.getByRole("button", { name: /new token|add token|register/i })
    ).toBeVisible();
  });

  test("register a new walk-in patient token", async ({ navigate, page }) => {
    await navigate("/opd");

    await page.getByRole("button", { name: /new token|add token/i }).click();

    // Modal / drawer opens
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: 8000 });

    // Fill patient name
    await modal.getByPlaceholder(/patient name|name/i).first().fill("Test Patient E2E");

    // Optionally fill mobile
    const mobileInput = modal.getByPlaceholder(/mobile|phone/i).first();
    if (await mobileInput.isVisible()) {
      await mobileInput.fill("9999999999");
    }

    // Save / Register
    await modal.getByRole("button", { name: /save|register|add/i }).click();

    // Token should appear in queue
    await expect(page.getByText("Test Patient E2E")).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("OPD Consultation Workspace", () => {
  test("clicking a token opens the consultation workspace", async ({ navigate, page }) => {
    await navigate("/opd");

    // Click the first patient row / token card in queue
    const firstToken = page.locator("[data-testid='token-row'], tr, [class*='queue']").first();
    await firstToken.click();

    // Consultation workspace or SOAP tabs should appear
    await expect(
      page.getByRole("tab", { name: /soap|vitals|notes|rx|prescri/i }).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
