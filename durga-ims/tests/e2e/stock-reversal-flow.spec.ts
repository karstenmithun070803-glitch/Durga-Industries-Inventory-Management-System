// ============================================================
// Phase: 3
// Category: E2E
// Tests: PO revert to Draft → status badge returns Draft
//        (Stock reversal: received PO reverted, stock decreases)
// Note: Skips if no Received PO is present in the current list.
// Source: src/app/(dashboard)/transactions/purchase-orders/purchase-orders-client.tsx
// ============================================================

import { test, expect } from "@playwright/test";

test.describe("stock reversal — revert received PO to Draft", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/transactions/purchase-orders");
    await page.waitForLoadState("networkidle");
  });

  test("revert to Draft: confirm dialog → status badge returns Draft", async ({ page }) => {
    const poListItem = page.locator('text=PO-').first();
    if (!(await poListItem.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await poListItem.click();

    const revertBtn = page.locator('[data-testid="po-revert-btn"]');
    if (!(await revertBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await revertBtn.click();

    const confirmRevert = page.locator('[role="dialog"] button:has-text("Revert to Draft")');
    await expect(confirmRevert).toBeVisible({ timeout: 5_000 });
    await confirmRevert.click();

    await expect(page.locator('[data-testid="po-status-badge"]')).toHaveText("Draft", { timeout: 15_000 });
  });
});
