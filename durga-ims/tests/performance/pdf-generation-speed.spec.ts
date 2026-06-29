// ============================================================
// Phase: 5
// Category: Performance
// Tests: PDF generation speed — customer invoice PDF and MI
//        slip PDF. Measures client-side @react-pdf/renderer
//        blob generation time. Threshold: 15 seconds.
// Source: src/components/pdf/customer-invoice-pdf.tsx
//         src/components/pdf/mi-slip-pdf.tsx
//         src/components/pdf/print-button.tsx
// ============================================================

import { test, expect } from "@playwright/test";

const PDF_THRESHOLD_MS = 15_000;

// Block window.open so the generated blob URL doesn't open a new tab
// (which Playwright treats as a new page and may interrupt the test).
// The PDF is still generated — we just prevent the popup.
async function blockWindowOpen(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    window.open = () => null;
  });
}

async function clickPrintAndMeasure(
  page: import("@playwright/test").Page
): Promise<number | null> {
  const printBtn = page.locator('[data-testid="print-btn"]').first();
  const visible = await printBtn.isVisible({ timeout: 5_000 }).catch(() => false);
  if (!visible) return null;

  const start = Date.now();
  await printBtn.click();

  // Wait for button to exit the "Generating…" state — this is when toBlob() resolves.
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('[data-testid="print-btn"]');
      return btn && !btn.textContent?.includes("Generating");
    },
    { timeout: PDF_THRESHOLD_MS + 2_000 }
  );

  return Date.now() - start;
}

// ---------------------------------------------------------------------------
// Test 18 — Invoice PDF generation
// ---------------------------------------------------------------------------
test("Test 18: Invoice PDF generates within 15 second threshold", async ({ page }) => {
  await blockWindowOpen(page);

  await page.goto("/invoice");
  await page.waitForLoadState("networkidle");

  const invoiceLink = page.locator('a[href*="/invoice/"]').first();
  const hasInvoice = await invoiceLink.isVisible({ timeout: 3_000 }).catch(() => false);

  if (!hasInvoice) {
    console.log(
      "Test 18 SKIPPED: No invoices found in test DB — cannot test PDF generation."
    );
    test.skip();
    return;
  }

  const href = await invoiceLink.getAttribute("href");
  const viewUrl = href?.endsWith("/view") ? href : `${href}/view`;

  await page.goto(viewUrl!);
  await page.waitForLoadState("networkidle");

  const elapsed = await clickPrintAndMeasure(page);

  if (elapsed === null) {
    console.log("Test 18 SKIPPED: Print button not found on invoice view page.");
    test.skip();
    return;
  }

  console.log(
    `Invoice PDF generation: ${elapsed}ms (threshold: ${PDF_THRESHOLD_MS}ms)`
  );
  expect(
    elapsed,
    `Invoice PDF took ${elapsed}ms — exceeds ${PDF_THRESHOLD_MS}ms threshold`
  ).toBeLessThan(PDF_THRESHOLD_MS);
});

// ---------------------------------------------------------------------------
// Test 19 — MI slip PDF generation
// ---------------------------------------------------------------------------
test("Test 19: MI slip PDF generates within 15 second threshold", async ({ page }) => {
  await blockWindowOpen(page);

  await page.goto("/transactions/material-issues");
  await page.waitForLoadState("networkidle");

  // Check for an inline print button on the list page first.
  const inlineBtn = page.locator('[data-testid="print-btn"]').first();
  const hasInlineBtn = await inlineBtn.isVisible({ timeout: 3_000 }).catch(() => false);

  if (hasInlineBtn) {
    const elapsed = await clickPrintAndMeasure(page);
    if (elapsed !== null) {
      console.log(
        `MI slip PDF generation: ${elapsed}ms (threshold: ${PDF_THRESHOLD_MS}ms)`
      );
      expect(
        elapsed,
        `MI slip PDF took ${elapsed}ms — exceeds ${PDF_THRESHOLD_MS}ms threshold`
      ).toBeLessThan(PDF_THRESHOLD_MS);
      return;
    }
  }

  const miLink = page.locator('a[href*="/material-issues/"]').first();
  const hasMI = await miLink.isVisible({ timeout: 3_000 }).catch(() => false);

  if (!hasMI) {
    console.log(
      "Test 19 SKIPPED: No MI slips found in test DB — cannot test MI PDF generation."
    );
    test.skip();
    return;
  }

  const href = await miLink.getAttribute("href");
  await page.goto(href!);
  await page.waitForLoadState("networkidle");

  const elapsed = await clickPrintAndMeasure(page);

  if (elapsed === null) {
    console.log("Test 19 SKIPPED: Print button not found on MI slip page.");
    test.skip();
    return;
  }

  console.log(
    `MI slip PDF generation: ${elapsed}ms (threshold: ${PDF_THRESHOLD_MS}ms)`
  );
  expect(
    elapsed,
    `MI slip PDF took ${elapsed}ms — exceeds ${PDF_THRESHOLD_MS}ms threshold`
  ).toBeLessThan(PDF_THRESHOLD_MS);
});
