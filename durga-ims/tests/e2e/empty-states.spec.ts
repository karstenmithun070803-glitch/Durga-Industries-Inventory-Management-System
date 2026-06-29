// ============================================================
// Phase: 3
// Category: E2E
// Tests: Dashboard pages load without JavaScript console errors
// Note: True empty-state testing (zero rows) is impossible against the
//       production DB — real data is always present. These tests verify
//       that each page loads cleanly with no console errors instead.
// Source: All dashboard page components
// ============================================================

import { test, expect } from "@playwright/test";

const DASHBOARD_ROUTES = [
  "/",
  "/stock",
  "/masters/customers",
  "/transactions/purchase-orders",
  "/invoice",
];

test.describe("empty states — console error monitoring", () => {
  for (const route of DASHBOARD_ROUTES) {
    test(`${route}: loads without console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });

      await page.goto(route);
      await page.waitForLoadState("networkidle");

      expect(errors).toHaveLength(0);
    });
  }
});
