// ============================================================
// Phase: 3
// Category: E2E infrastructure
// Tests: Second one-time auth setup — logs in as the data-entry EMPLOYEE and saves
//        storageState to playwright/.auth/employee.json.
//
//        The ceiling feature introduced two roles, so the concurrency specs need two
//        simultaneous logins (admin edits a ceiling while the employee has a PO open).
//        The original auth.setup.ts only ever produced one.
//
// Source: src/app/(auth)/login/page.tsx, scripts/set-user-roles.ts
// Requires: TEST_EMPLOYEE_USERNAME / TEST_EMPLOYEE_PASSWORD in .env.test, and the
//           employee auth user created by scripts/set-user-roles.ts.
// ============================================================

import { test as setup } from "@playwright/test";
import path from "path";

const authFile = path.join(process.cwd(), "playwright/.auth/employee.json");

setup("authenticate employee", async ({ page }) => {
  const username = process.env.TEST_EMPLOYEE_USERNAME;
  const password = process.env.TEST_EMPLOYEE_PASSWORD;

  // Skip, never throw: this setup runs in the shared "setup" project that every other
  // E2E project depends on. Failing here would block the entire suite just because the
  // employee login has not been provisioned yet.
  //
  // To enable: create the employee auth user
  //   NODE_PATH="$(pwd)/node_modules" EMPLOYEE_PASSWORD='...' npx tsx scripts/set-user-roles.ts
  // (needs a real SUPABASE_SERVICE_ROLE_KEY in .env.local, or add the user by hand in
  //  Supabase Dashboard -> Authentication -> Users), then set TEST_EMPLOYEE_USERNAME and
  //  TEST_EMPLOYEE_PASSWORD in .env.test.
  setup.skip(
    !username || !password,
    "TEST_EMPLOYEE_USERNAME / TEST_EMPLOYEE_PASSWORD not set — two-login specs will skip."
  );

  await page.goto("/login");
  await page.fill('[name="username"]', username!);
  await page.fill('[name="password"]', password!);
  await page.click('button[type="submit"]');
  await page.waitForURL("/", { timeout: 15_000 });

  await page.context().storageState({ path: authFile });
});
