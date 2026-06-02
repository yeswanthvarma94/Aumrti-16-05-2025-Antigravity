/**
 * Base test fixture — extend this in every spec file instead of importing
 * directly from @playwright/test. Provides:
 *   - `page`          : pre-authenticated browser page (admin role)
 *   - `navigate(path)`: go to a route and wait for the page to settle
 */
import { test as base, expect, Page } from "@playwright/test";

type HMSFixtures = {
  navigate: (path: string) => Promise<void>;
};

export const test = base.extend<HMSFixtures>({
  navigate: async ({ page }, use) => {
    const navigate = async (path: string) => {
      await page.goto(path);
      // Wait for Suspense / lazy-loaded chunk to settle
      await page.waitForLoadState("networkidle");
    };
    await use(navigate);
  },
});

export { expect };
export type { Page };
