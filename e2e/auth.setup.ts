/**
 * Auth Setup — runs once before the entire test suite.
 * Logs in as hospital_admin and saves the authenticated browser state
 * so individual tests don't need to log in themselves.
 *
 * Credentials: set E2E_EMAIL and E2E_PASSWORD in .env.local
 * Defaults to the demo admin account if env vars are absent.
 */
import { test as setup, expect } from "@playwright/test";
import path from "path";

const AUTH_FILE = path.join(__dirname, ".auth/admin.json");

setup("authenticate as admin", async ({ page }) => {
  const email = process.env.E2E_EMAIL ?? "admin@demo.aumrti.com";
  const password = process.env.E2E_PASSWORD ?? "Demo@12345";

  await page.goto("/login");

  // Wait for the login form to be ready
  await expect(page.getByPlaceholder(/email/i)).toBeVisible();

  await page.getByPlaceholder(/email/i).fill(email);
  await page.getByPlaceholder(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|login/i }).click();

  // After login, admin lands on /dashboard
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  await expect(page).toHaveURL(/\/dashboard/);

  // Save the authenticated storage state (cookies + localStorage) to disk
  await page.context().storageState({ path: AUTH_FILE });
});
