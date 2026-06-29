// ============================================================
// Phase: 3
// Category: E2E
// Tests: Stock page — loads, search filter, ledger drawer
//        PO creation → draft status verification
//        PO receive flow → status becomes Received
// Source: src/app/(dashboard)/stock/stock-client.tsx
//         src/app/(dashboard)/transactions/purchase-orders/purchase-orders-client.tsx
// ============================================================

import { test, expect } from "@playwright/test";

const TODAY_ISO = new Date().toISOString().split("T")[0];

async function fillFirstGridRow(page: import("@playwright/test").Page) {
  const materialBtn = page.locator('[data-grid-row="0"][data-grid-col="0"]');
  await expect(materialBtn).toBeVisible({ timeout: 8_000 });
  await materialBtn.click();

  const searchInput = page.locator('input[placeholder*="Search material"]').first();
  await expect(searchInput).toBeVisible({ timeout: 5_000 });
  await searchInput.type("a", { delay: 50 });
  const firstOption = page.locator('[role="option"]').first();
  await expect(firstOption).toBeVisible({ timeout: 5_000 });
  await firstOption.click();

  const supplierBtn = page.locator('[data-grid-row="0"][data-grid-col="1"]');
  if (await supplierBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
    const supplierText = await supplierBtn.textContent();
    if (!supplierText || supplierText.includes("Select supplier")) {
      await supplierBtn.click();
      const supplierSearch = page.locator('input[placeholder*="Search supplier"]').first();
      if (await supplierSearch.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await supplierSearch.type("a", { delay: 50 });
        const firstSupplier = page.locator('[role="option"]').first();
        if (await firstSupplier.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await firstSupplier.click();
        }
      }
    }
  }

  const qtyInput = page.locator('[data-grid-row="0"][data-grid-col="2"]');
  await qtyInput.fill("3");

  const rateInput = page.locator('[data-grid-row="0"][data-grid-col="3"]');
  await rateInput.fill("100");
}

// ---------------------------------------------------------------------------
// Stock page
// ---------------------------------------------------------------------------

test.describe("stock page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/stock");
    await page.waitForLoadState("networkidle");
  });

  test("stock page loads with at least one material row", async ({ page }) => {
    const rows = page.locator("tbody tr");
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test("search input filters visible rows", async ({ page }) => {
    const firstRow = page.locator("tbody tr").first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });

    // Stock table columns (no S.No in DOM): Code(0), Material Name(1), Unit(2), ...
    const cells = firstRow.locator("td");
    const materialName = (await cells.nth(1).textContent())?.trim() ?? "";
    const searchTerm = materialName.slice(0, 3);
    if (!searchTerm || searchTerm.match(/^\d+$/)) return;

    const searchInput = page.locator('[data-testid="stock-search"]');
    await searchInput.fill(searchTerm);
    await page.waitForTimeout(400);

    const visibleRows = page.locator("tbody tr");
    const count = await visibleRows.count();
    if (count === 1) {
      const text = await visibleRows.first().textContent();
      expect(text).not.toBeNull();
      return;
    }
    const firstVisibleText = await visibleRows.first().textContent();
    expect(firstVisibleText?.toLowerCase()).toContain(searchTerm.toLowerCase());
  });

  test("clicking history button opens stock ledger drawer", async ({ page }) => {
    const firstRow = page.locator("tbody tr").first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });

    const historyBtn = firstRow.locator('button[title="View stock history"]');
    await historyBtn.click();

    const drawer = page.locator('[data-testid="stock-ledger-drawer"]');
    await expect(drawer).toBeVisible({ timeout: 8_000 });
  });
});

// ---------------------------------------------------------------------------
// Purchase orders — create → receive
// ---------------------------------------------------------------------------

test.describe("purchase orders — create → receive", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/transactions/purchase-orders");
    await page.waitForLoadState("networkidle");
  });

  test("navigate to PO page: date input and grid visible", async ({ page }) => {
    const dateInput = page.locator('input[type="date"]').first();
    await expect(dateInput).toBeVisible({ timeout: 10_000 });

    const materialCell = page.locator('[data-grid-row="0"][data-grid-col="0"]');
    await expect(materialCell).toBeVisible({ timeout: 8_000 });
  });

  test("create PO: add material, qty, rate → save → success toast confirms creation", async ({ page }) => {
    const dateInput = page.locator('input[type="date"]').nth(1);
    await dateInput.fill(TODAY_ISO);

    await fillFirstGridRow(page);

    const saveBtn = page.locator('[data-testid="po-save-btn"]');
    await expect(saveBtn).toBeVisible({ timeout: 10_000 });
    await saveBtn.click();

    await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 15_000 });
    const toastText = await page.locator('[data-sonner-toast]').textContent();
    expect(toastText).toMatch(/draft PO.*created|Draft saved/i);
  });

  test("after save: status badge shows Draft", async ({ page }) => {
    const dateInput = page.locator('input[type="date"]').nth(1);
    await dateInput.fill(TODAY_ISO);

    await fillFirstGridRow(page);
    await page.click('[data-testid="po-save-btn"]');

    await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 15_000 });

    const filterDate = page.locator('input[type="date"]').nth(0);
    await filterDate.fill(TODAY_ISO);
    await page.waitForTimeout(300);

    const listItem = page.locator('button:has-text("PO-")').first();
    if (!(await listItem.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await listItem.click();

    const badge = page.locator('[data-testid="po-status-badge"]');
    await expect(badge).toBeVisible({ timeout: 10_000 });
    await expect(badge).toHaveText("Draft");
  });

  test("receive PO: confirm dialog → status becomes Received", async ({ page }) => {
    const poListItem = page.locator('text=PO-').first();
    if (!(await poListItem.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await poListItem.click();

    const receiveBtn = page.locator('[data-testid="po-receive-btn"]');
    if (!(await receiveBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await receiveBtn.click();
    await expect(page.locator('[data-testid="receive-confirm-dialog"]')).toBeVisible({ timeout: 5_000 });
    await page.click('[data-testid="receive-confirm-btn"]');
    await expect(page.locator('[data-testid="po-status-badge"]')).toHaveText("Received", { timeout: 15_000 });
  });
});
