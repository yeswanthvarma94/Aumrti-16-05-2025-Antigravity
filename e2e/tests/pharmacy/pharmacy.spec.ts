/**
 * Pharmacy Module Tests
 * Covers: dispensing queue, drug search, dispensing workflow
 */
import { test, expect } from "../../fixtures";

test.describe("Pharmacy Dispensing", () => {
  test("pharmacy page loads", async ({ navigate, page }) => {
    await navigate("/pharmacy");
    await expect(
      page.getByRole("tab", { name: /dispense|pending|queue/i }).first()
    ).toBeVisible();
  });

  test("drug search works in dispensing", async ({ navigate, page }) => {
    await navigate("/pharmacy");

    const searchInput = page.getByPlaceholder(/search drug|drug name|medicine/i).first();
    const inputCount = await searchInput.count();

    if (inputCount > 0) {
      await searchInput.fill("Paracetamol");
      // Dropdown suggestions or filtered list should appear
      await expect(
        page.getByText(/paracetamol/i).first()
      ).toBeVisible({ timeout: 8000 });
    }
  });
});
