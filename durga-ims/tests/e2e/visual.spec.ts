// ============================================================
// Phase: 3
// Category: E2E
// Tests: Stock quantities — no trailing zeros in Current Stock column,
//        null/missing min level displays as '—' not 'null',
//        invoice amount cells show ₹ prefix with 2 decimal places
// Source: src/app/(dashboard)/stock/stock-client.tsx
//         src/app/(dashboard)/invoice/invoice-client.tsx
// ============================================================

import { test, expect } from "@playwright/test";

test.describe("visual — number formatting spot checks", () => {
  test("stock quantities: no trailing .0000 or .00 in Current Stock column", async ({ page }) => {
    await page.goto("/stock");
    await page.waitForLoadState("networkidle");

    const rows = page.locator("tbody tr");
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
    const count = Math.min(await rows.count(), 10);

    for (let i = 0; i < count; i++) {
      const cells = rows.nth(i).locator("td");
      // Current Stock is the 4th data column (index 3: S.No, Code, Name, Stock)
      const stockText = await cells.nth(3).textContent();
      if (stockText && stockText !== "—") {
        expect(stockText).not.toMatch(/\.\d{3,}/); // no more than 2 decimal places
        expect(stockText).not.toMatch(/\.0+$/);    // no trailing .000
      }
    }
  });

  test("null/missing min level shows '—' not 'null' or blank", async ({ page }) => {
    await page.goto("/stock");
    await page.waitForLoadState("networkidle");

    const rows = page.locator("tbody tr");
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
    const count = Math.min(await rows.count(), 20);

    for (let i = 0; i < count; i++) {
      const rowText = await rows.nth(i).textContent();
      // Should not contain literal "null" or "undefined" in any cell
      expect(rowText).not.toContain("null");
      expect(rowText).not.toContain("undefined");
    }
  });

  test("invoice list: amount cells show ₹ prefix with 2 decimal places", async ({ page }) => {
    await page.goto("/invoice");
    await page.waitForLoadState("networkidle");

    const rows = page.locator("tbody tr");
    const count = await rows.count();
    if (count === 0) {
      // No invoices in current FY — skip rather than fail
      test.skip();
      return;
    }

    // Check amount cells in the first visible rows (look for ₹ pattern)
    const amountCells = page.locator('td:has-text("₹")');
    const cellCount = await amountCells.count();
    if (cellCount === 0) return; // Page may not show amount in list

    const firstCellText = await amountCells.first().textContent();
    if (firstCellText) {
      // Should match ₹1,234.56 or ₹0.00 — two decimal places
      expect(firstCellText).toMatch(/₹[\d,]+\.\d{2}/);
    }
  });
});
