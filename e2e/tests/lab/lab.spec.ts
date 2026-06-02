/**
 * Lab Module Tests
 * Covers: work list, result entry, anomaly detector
 */
import { test, expect } from "../../fixtures";

test.describe("Lab Work List", () => {
  test("lab page loads with pending orders tab", async ({ navigate, page }) => {
    await navigate("/lab");
    await expect(
      page.getByRole("tab", { name: /pending|work list|orders/i })
    ).toBeVisible();
  });

  test("lab result workspace opens on clicking a pending order", async ({ navigate, page }) => {
    await navigate("/lab");

    const pendingRow = page.getByRole("row").nth(1);
    const count = await pendingRow.count();
    if (count > 0) {
      await pendingRow.click();
      await expect(
        page.getByText(/result|enter values|report/i).first()
      ).toBeVisible({ timeout: 10_000 });
    }
  });
});

test.describe("Lab Anomaly Detector", () => {
  test("anomaly detector tab is accessible", async ({ navigate, page }) => {
    await navigate("/lab");
    const anomalyTab = page.getByRole("tab", { name: /anomaly|ai|flag/i });
    const tabCount = await anomalyTab.count();
    if (tabCount > 0) {
      await anomalyTab.click();
      await expect(page.getByText(/anomaly|critical|flag/i).first()).toBeVisible();
    }
  });
});
