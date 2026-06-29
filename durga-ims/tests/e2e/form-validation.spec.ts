// ============================================================
// Phase: 3
// Category: E2E
// Tests: PO save with no material → error toast,
//        MI qty exceeding stock → insufficient stock error,
//        Invoice save without vehicle → validation error
// Source: src/app/(dashboard)/transactions/purchase-orders/purchase-orders-client.tsx
//         src/app/(dashboard)/transactions/material-issues/material-issues-client.tsx
//         src/app/(dashboard)/invoice/invoice-client.tsx
// ============================================================

import { test, expect } from "@playwright/test";

test.describe("form validation", () => {
  test("PO: saving a row with no material shows a validation error toast", async ({ page }) => {
    await page.goto("/transactions/purchase-orders");
    await page.waitForLoadState("networkidle");

    // Fill qty WITHOUT selecting a material — this forces isDirty=true so save button appears
    const qtyInput = page.locator('[data-grid-row="0"][data-grid-col="2"]');
    await expect(qtyInput).toBeVisible({ timeout: 8_000 });
    await qtyInput.fill("5");

    // Save button is now visible (isDirty = true)
    const saveBtn = page.locator('[data-testid="po-save-btn"]');
    await expect(saveBtn).toBeVisible({ timeout: 8_000 });
    await saveBtn.click();

    // Should show a validation error (no material selected)
    await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 8_000 });
  });

  test("MI: qty exceeding stock triggers insufficient stock error", async ({ page }) => {
    await page.goto("/transactions/material-issues");
    await page.waitForLoadState("networkidle");

    // Select a vehicle from the dropdown
    const vehicleCombobox = page.locator('[role="combobox"]').first();
    await vehicleCombobox.click();
    const firstVehicle = page.locator('[role="option"]').first();
    if (!(await firstVehicle.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await firstVehicle.click();

    // Wait for the grid to appear
    const materialBtn = page.locator('[data-grid-row="0"][data-grid-col="0"]');
    await expect(materialBtn).toBeVisible({ timeout: 8_000 });
    await materialBtn.click();

    const searchInput = page.locator('input[placeholder*="Search material"]').first();
    await expect(searchInput).toBeVisible({ timeout: 5_000 });
    await searchInput.type("a", { delay: 50 });
    const firstMaterial = page.locator('[role="option"]').first();
    if (!(await firstMaterial.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await firstMaterial.click();

    // Enter absurdly large qty to force insufficient stock (MI mode: col3 = qty, col2 = affects-stock checkbox)
    const qtyInput = page.locator('[data-grid-row="0"][data-grid-col="3"]');
    await qtyInput.fill("999999");

    // Click the Issue/Save button
    const saveBtn = page.locator('[data-testid="mi-save-btn"]');
    await expect(saveBtn).toBeVisible({ timeout: 8_000 });
    await saveBtn.click();

    // If vehicle already has an MI, a "Reverse & Reapply Stock?" dialog appears instead of
    // the normal issue confirm dialog. Handle both cases.
    const reverseDialog = page.locator('text=Reverse & Reapply Stock?');
    if (await reverseDialog.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await page.click('button:has-text("Reverse & Reapply")');
    } else {
      // Standard new-MI confirmation dialog
      const issueDialog = page.locator('[data-testid="issue-confirm-dialog"]');
      if (await issueDialog.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await page.click('[data-testid="issue-confirm-btn"]');
      }
    }

    // Should show error toast about insufficient stock
    await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 10_000 });
    const toastText = await page.locator('[data-sonner-toast]').textContent();
    expect(toastText?.toLowerCase()).toMatch(/stock|insufficient|not enough/i);
  });

  test("invoice: saving without a vehicle shows validation error", async ({ page }) => {
    await page.goto("/invoice");
    await page.waitForLoadState("networkidle");

    // /invoice/new redirects to /invoice — must click "New Invoice" button on the list page
    const newInvoiceBtn = page.locator('button:has-text("New Invoice")');
    await expect(newInvoiceBtn).toBeVisible({ timeout: 10_000 });
    await newInvoiceBtn.click();
    await page.waitForLoadState("networkidle");

    const saveBtn = page.locator('[data-testid="invoice-save-btn"]');
    await expect(saveBtn).toBeVisible({ timeout: 10_000 });
    await saveBtn.click();
    await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 8_000 });
  });
});
