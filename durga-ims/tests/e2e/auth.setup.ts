// ============================================================
// Phase: 3
// Category: E2E infrastructure
// Tests: One-time auth setup — logs in once, saves storageState
//        to playwright/.auth/user.json for reuse across all E2E tests
// Source: src/app/(auth)/login/page.tsx
// ============================================================

import { test as setup } from "@playwright/test";
import path from "path";

const authFile = path.join(process.cwd(), "playwright/.auth/user.json");

setup("authenticate", async ({ page }) => {
  const username = process.env.TEST_USERNAME;
  const password = process.env.TEST_PASSWORD;

  if (!username || !password || password === "FILL_ME_IN") {
    throw new Error(
      "TEST_USERNAME and TEST_PASSWORD must be set in .env.test. " +
        "Set them to the credentials you use to log into the app."
    );
  }

  await page.goto("/login");
  await page.fill('[name="username"]', username);
  await page.fill('[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("/", { timeout: 15_000 });

  await page.context().storageState({ path: authFile });
});
