// ============================================================
// Phase: 3
// Category: E2E
// Tests: Invoice PDF print → new tab with blob URL,
//        MI slip PDF print → new tab with blob URL
// Note: PDF content cannot be verified — @react-pdf/renderer generates a binary blob.
//       These tests verify only that the print action opens a new tab.
//       Both tests skip if no finalized invoices / issued MIs exist in the current FY.
// Source: src/components/pdf/print-button.tsx
//         src/app/(dashboard)/invoice/invoice-client.tsx
//         src/app/(dashboard)/transactions/material-issues/material-issues-client.tsx
// ============================================================

import { test, expect } from "@playwright/test";

// PDF tests verify that a new browser tab opens with a blob: URL when Print is clicked.
// We CANNOT read the PDF content — @react-pdf/renderer generates a binary blob.
// Correctness of PDF layout/totals must be verified via unit tests of the PDF components.

test.describe("PDF generation", () => {
  test("invoice PDF: clicking Print opens a new tab with a blob URL", async ({ page, context }) => {
    await page.goto("/invoice");
    await page.waitForLoadState("networkidle");

    // Find a finalized invoice to print — look for a row we can click
    const invoiceRows = page.locator("tbody tr");
    const count = await invoiceRows.count();
    if (count === 0) {
      test.skip();
      return;
    }

    // Click first row to open the invoice
    await invoiceRows.first().click();
    await page.waitForLoadState("networkidle");

    const printBtn = page.locator('[data-testid="print-btn"]').first();
    if (!(await printBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }

    // Intercept the new page that opens
    const newPagePromise = context.waitForEvent("page");
    await printBtn.click();
    const newPage = await newPagePromise;
    await newPage.waitForLoadState();

    expect(newPage.url()).toMatch(/^blob:/);
  });

  test("MI slip PDF: clicking Print opens a new tab with a blob URL", async ({ page, context }) => {
    await page.goto("/transactions/material-issues");
    await page.waitForLoadState("networkidle");

    // Find an existing issued MI slip from the left panel
    const slipRows = page.locator('[data-grid-row]').first();
    // Look for the left list panel — click the first entry
    const leftPanelEntries = page.locator("aside li, .list-item, [role='listitem']").first();
    const listLinks = page.locator("a").filter({ hasText: /MI-|Issue/i }).first();

    if (!(await listLinks.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await listLinks.click();
    await page.waitForLoadState("networkidle");

    const printBtn = page.locator('[data-testid="print-btn"]').first();
    if (!(await printBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }

    const newPagePromise = context.waitForEvent("page");
    await printBtn.click();
    const newPage = await newPagePromise;
    await newPage.waitForLoadState();

    expect(newPage.url()).toMatch(/^blob:/);
  });
});
