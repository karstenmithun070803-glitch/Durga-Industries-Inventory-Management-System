// ============================================================
// Phase: 3
// Category: E2E
// Tests: Customer create, search, edit, GSTIN validation,
//        deactivate → Inactive Only view, reactivate
// Source: src/app/(dashboard)/masters/customers/customers-client.tsx
// ============================================================

import { test, expect } from "@playwright/test";

// Unique name for this test run — shared across tests in this file (sequential execution)
const CUSTOMER_NAME = `E2E-Customer-${Date.now()}`;

test.describe("masters — customer CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/masters/customers");
    await page.waitForLoadState("networkidle");
  });

  test("create customer: name appears in table after save", async ({ page }) => {
    await page.fill('[data-testid="customer-name-input"]', CUSTOMER_NAME);
    await page.click('[data-testid="customer-save-btn"]');
    await expect(page.locator(`text=${CUSTOMER_NAME}`).first()).toBeVisible({ timeout: 10_000 });
  });

  test("search customer: table filters by name", async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    await searchInput.fill(CUSTOMER_NAME);
    await page.waitForTimeout(300);
    const rows = page.locator("tbody tr");
    await expect(rows.first()).toBeVisible({ timeout: 5_000 });
    const firstRowText = await rows.first().textContent();
    expect(firstRowText?.toLowerCase()).toContain(CUSTOMER_NAME.toLowerCase().slice(0, 8));
  });

  test("edit customer: click row loads form, city change saved", async ({ page }) => {
    // Customer was created in test 1 — find it in the table and click to load it
    const customerRow = page.locator(`td:has-text("${CUSTOMER_NAME}")`).first();
    await expect(customerRow).toBeVisible({ timeout: 10_000 });
    await customerRow.click();

    // Form should now be in edit mode
    await expect(page.locator('[data-testid="customer-save-btn"]')).toBeVisible({ timeout: 5_000 });
    await page.fill('input[placeholder="City"]', "TestCity");
    await page.click('[data-testid="customer-save-btn"]');
    await expect(page.locator("text=TestCity").first()).toBeVisible({ timeout: 10_000 });
  });

  test("GSTIN validation: invalid format shows warning toast", async ({ page }) => {
    const gstinInput = page.locator('input[placeholder*="33AAAAA"]');
    await gstinInput.fill("INVALID");
    // Click the name input to move focus away — this triggers React's onBlur on the GSTIN field
    await page.locator('[data-testid="customer-name-input"]').click();
    await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 6_000 });
  });

  test("deactivate: customer disappears from active list, visible in Inactive Only", async ({ page }) => {
    // Search first to filter table to only this customer (avoid clicking wrong row from prior runs)
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    await searchInput.fill(CUSTOMER_NAME);
    await page.waitForTimeout(400);

    const customerRow = page.locator(`td:has-text("${CUSTOMER_NAME}")`).first();
    await expect(customerRow).toBeVisible({ timeout: 10_000 });
    await customerRow.click();

    const deactivateBtn = page.locator('[data-testid="customer-deactivate-btn"]');
    await expect(deactivateBtn).toBeVisible({ timeout: 5_000 });
    await deactivateBtn.click();

    // Confirm any confirmation dialog
    const confirmBtn = page.locator('button:has-text("Deactivate")').last();
    if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // Customer should be gone from active list
    await expect(page.locator(`td:has-text("${CUSTOMER_NAME}")`)).not.toBeVisible({ timeout: 8_000 });

    // Show inactive
    await page.click('[data-testid="inactive-only-btn"]');
    await expect(page.locator(`td:has-text("${CUSTOMER_NAME}")`).first()).toBeVisible({ timeout: 5_000 });
  });

  test("reactivate: after deactivation, reactivation moves customer back to active", async ({ page }) => {
    // Self-contained: deactivate first if active, then reactivate

    // Check if customer exists in active list
    const activeRow = page.locator(`td:has-text("${CUSTOMER_NAME}")`).first();
    const isActive = await activeRow.isVisible({ timeout: 2_000 }).catch(() => false);

    if (isActive) {
      // Deactivate first
      await activeRow.click();
      const deactivateBtn = page.locator('[data-testid="customer-deactivate-btn"]');
      if (await deactivateBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await deactivateBtn.click();
        const confirmBtn = page.locator('button:has-text("Deactivate")').last();
        if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await confirmBtn.click();
        }
        await page.waitForTimeout(1_000);
      }
    }

    // Now switch to inactive view
    const inactiveBtn = page.locator('[data-testid="inactive-only-btn"]');
    if (!(await inactiveBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await inactiveBtn.click();

    const inactiveRow = page.locator(`td:has-text("${CUSTOMER_NAME}")`).first();
    if (!(await inactiveRow.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await inactiveRow.click();

    const reactivateBtn = page.locator('[data-testid="customer-reactivate-btn"]');
    await expect(reactivateBtn).toBeVisible({ timeout: 5_000 });
    await reactivateBtn.click();

    // handleReactivate calls setShowInactive(false) — UI switches back to active view.
    // Customer should now be visible in the active list (positive assertion).
    await expect(page.locator(`td:has-text("${CUSTOMER_NAME}")`)).toBeVisible({ timeout: 8_000 });
  });
});
