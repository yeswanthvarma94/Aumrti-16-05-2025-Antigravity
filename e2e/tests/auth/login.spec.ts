/**
 * Auth Tests
 * These run WITHOUT the saved auth state to test the login page itself.
 * They use a fresh context (no storageState) via the setup project.
 */
import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } }); // reset auth for this file

test("login page loads", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /aumrti|hms|login/i })).toBeVisible();
  await expect(page.getByPlaceholder(/email/i)).toBeVisible();
  await expect(page.getByPlaceholder(/password/i)).toBeVisible();
});

test("invalid credentials show an error", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder(/email/i).fill("wrong@test.com");
  await page.getByPlaceholder(/password/i).fill("wrongpass");
  await page.getByRole("button", { name: /sign in|login/i }).click();
  await expect(page.getByText(/invalid|incorrect|failed/i)).toBeVisible({ timeout: 8000 });
});

test("unauthenticated user is redirected to /login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/, { timeout: 8000 });
});
