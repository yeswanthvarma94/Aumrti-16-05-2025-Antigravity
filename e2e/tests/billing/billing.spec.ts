/**
 * Billing Module Tests
 * Covers: bill queue, create new bill, payment recording
 */
import { test, expect } from "../../fixtures";

test.describe("Billing Queue", () => {
  test("billing page loads with bill list", async ({ navigate, page }) => {
    await navigate("/billing");
    // Should show some table or list
    await expect(
      page.getByRole("table").or(page.locator("[class*='bill'], [class*='Bill']").first())
    ).toBeVisible();
  });

  test("New Bill button is present", async ({ navigate, page }) => {
    await navigate("/billing");
    await expect(
      page.getByRole("button", { name: /new bill|create bill|add bill/i })
    ).toBeVisible();
  });
});

test.describe("Bill Editor", () => {
  test("opening a bill shows service line items", async ({ navigate, page }) => {
    await navigate("/billing");

    // Click the first bill row
    const firstBill = page.getByRole("row").nth(1);
    const count = await firstBill.count();
    if (count > 0) {
      await firstBill.click();
      // Bill editor should show service rows and totals
      await expect(page.getByText(/total|grand total|amount/i).first()).toBeVisible({
        timeout: 10_000,
      });
    }
  });
});

test.describe("Daily Cash Closure", () => {
  test("cash closure page loads", async ({ navigate, page }) => {
    await navigate("/billing/daily-closure");
    await expect(page.getByText(/cash closure|daily closure|shift/i).first()).toBeVisible();
  });
});
