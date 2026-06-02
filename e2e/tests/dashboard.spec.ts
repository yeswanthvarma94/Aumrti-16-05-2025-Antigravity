import { test, expect } from "../../fixtures";

test("dashboard loads with key stats cards", async ({ navigate, page }) => {
  await navigate("/dashboard");
  // The dashboard should show at least one stats card / widget
  await expect(page.locator("[class*=card], [class*=Card]").first()).toBeVisible();
});

test("sidebar navigation links are visible", async ({ navigate, page }) => {
  await navigate("/dashboard");
  // Core nav items present in AppShell sidebar
  for (const label of ["OPD", "IPD", "Billing", "Lab", "Pharmacy"]) {
    await expect(page.getByRole("link", { name: new RegExp(label, "i") })).toBeVisible();
  }
});
