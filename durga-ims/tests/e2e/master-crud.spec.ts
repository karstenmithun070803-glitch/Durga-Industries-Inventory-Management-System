// ============================================================
// Phase: 3
// Category: E2E
// Tests: Customer create, search, edit, GSTIN validation,
//        delete (unused record is permanently removed)
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

  test("delete: unused customer is permanently removed and does not reappear", async ({ page }) => {
    // Search first to filter table to only this customer (avoid clicking wrong row from prior runs)
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    await searchInput.fill(CUSTOMER_NAME);
    await page.waitForTimeout(400);

    const customerRow = page.locator(`td:has-text("${CUSTOMER_NAME}")`).first();
    await expect(customerRow).toBeVisible({ timeout: 10_000 });
    await customerRow.click();

    const deleteBtn = page.locator('[data-testid="customer-delete-btn"]');
    await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
    await deleteBtn.click();

    // Confirm the delete dialog
    const confirmBtn = page.locator('button:has-text("Delete")').last();
    await expect(confirmBtn).toBeVisible({ timeout: 3_000 });
    await confirmBtn.click();

    // This customer is a fresh, unused record → hard-deleted → gone from the list for good.
    // There is no "Inactive Only" view anymore, so it must not reappear anywhere.
    await expect(page.locator(`td:has-text("${CUSTOMER_NAME}")`)).not.toBeVisible({ timeout: 8_000 });
    await expect(page.locator('[data-testid="inactive-only-btn"]')).toHaveCount(0);
  });
});
