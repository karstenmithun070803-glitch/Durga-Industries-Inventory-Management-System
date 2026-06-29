// ============================================================
// Phase: 3
// Category: E2E
// Tests: Protected route redirect, wrong credential error,
//        successful login lands on dashboard, session expired banner
// Source: src/app/(auth)/login/page.tsx
//         src/middleware.ts
// ============================================================

import { test, expect } from "@playwright/test";

// Auth tests do NOT use storageState — they test the auth flow itself.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("auth", () => {
  test("protected route redirects unauthenticated user to /login", async ({ page }) => {
    await page.goto("/stock");
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("wrong credentials shows error message", async ({ page }) => {
    await page.goto("/login");
    await page.fill('[name="username"]', "fakeuser");
    await page.fill('[name="password"]', "wrongpassword");
    await page.click('button[type="submit"]');
    await page.waitForURL(/error=invalid/, { timeout: 10_000 });
    await expect(page.locator("text=Invalid username or password")).toBeVisible();
  });

  test("correct credentials land on dashboard", async ({ page }) => {
    const username = process.env.TEST_USERNAME!;
    const password = process.env.TEST_PASSWORD!;
    await page.goto("/login");
    await page.fill('[name="username"]', username);
    await page.fill('[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL("/", { timeout: 15_000 });
    await expect(page).toHaveURL("/");
  });

  test("session expired reason shows amber banner", async ({ page }) => {
    await page.goto("/login?reason=session_expired");
    await expect(page.locator("text=Your session has expired")).toBeVisible();
  });
});
