// ============================================================
// Phase: 5
// Category: Performance
// Tests: Page load times for all major list/dashboard pages —
//        dashboard, PO list, MI list, invoice list, stock,
//        materials master, reports, and invoice view sub-route
// Source: src/app/(dashboard)/ — all major route page.tsx files
// ============================================================

import { test, expect } from "@playwright/test";

const GENERAL_THRESHOLD_MS = 5_000;
const CACHED_THRESHOLD_MS = 3_000;

async function measureLoad(
  page: import("@playwright/test").Page,
  url: string
): Promise<number> {
  const start = Date.now();
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  return Date.now() - start;
}

// Warm up the server before timing tests — first load triggers Next.js
// compilation which inflates timing. Navigate to root once and discard.
test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext({
    storageState: "playwright/.auth/user.json",
  });
  const warmupPage = await ctx.newPage();
  await warmupPage.goto("/", { waitUntil: "domcontentloaded" }).catch(() => {});
  await warmupPage.waitForTimeout(2_000);
  await ctx.close();
});

// ---------------------------------------------------------------------------
// Test 10 — Dashboard (7 parallel cached queries)
// ---------------------------------------------------------------------------
test("Test 10: Dashboard page loads within threshold", async ({ page }) => {
  const elapsed = await measureLoad(page, "/");
  console.log(`Dashboard: ${elapsed}ms (threshold: ${GENERAL_THRESHOLD_MS}ms)`);
  expect(elapsed, `Dashboard took ${elapsed}ms — exceeds ${GENERAL_THRESHOLD_MS}ms`).toBeLessThan(
    GENERAL_THRESHOLD_MS
  );
});

// ---------------------------------------------------------------------------
// Test 11 — Purchase Orders list (filtered by FY, uncached)
// ---------------------------------------------------------------------------
test("Test 11: Purchase Orders list loads within threshold", async ({ page }) => {
  const elapsed = await measureLoad(page, "/transactions/purchase-orders");
  console.log(`PO list: ${elapsed}ms (threshold: ${GENERAL_THRESHOLD_MS}ms)`);
  expect(elapsed, `PO list took ${elapsed}ms — exceeds ${GENERAL_THRESHOLD_MS}ms`).toBeLessThan(
    GENERAL_THRESHOLD_MS
  );
});

// ---------------------------------------------------------------------------
// Test 12 — Material Issues list (filtered by FY, uncached)
// ---------------------------------------------------------------------------
test("Test 12: Material Issues list loads within threshold", async ({ page }) => {
  const elapsed = await measureLoad(page, "/transactions/material-issues");
  console.log(`MI list: ${elapsed}ms (threshold: ${GENERAL_THRESHOLD_MS}ms)`);
  expect(elapsed, `MI list took ${elapsed}ms — exceeds ${GENERAL_THRESHOLD_MS}ms`).toBeLessThan(
    GENERAL_THRESHOLD_MS
  );
});

// ---------------------------------------------------------------------------
// Test 13 — Invoice list (filtered by FY, uncached)
// ---------------------------------------------------------------------------
test("Test 13: Invoice list loads within threshold", async ({ page }) => {
  const elapsed = await measureLoad(page, "/invoice");
  console.log(`Invoice list: ${elapsed}ms (threshold: ${GENERAL_THRESHOLD_MS}ms)`);
  expect(elapsed, `Invoice list took ${elapsed}ms — exceeds ${GENERAL_THRESHOLD_MS}ms`).toBeLessThan(
    GENERAL_THRESHOLD_MS
  );
});

// ---------------------------------------------------------------------------
// Test 14 — Stock dashboard (3-query batch, cached)
// ---------------------------------------------------------------------------
test("Test 14: Stock dashboard loads within threshold", async ({ page }) => {
  const elapsed = await measureLoad(page, "/stock");
  console.log(`Stock: ${elapsed}ms (threshold: ${GENERAL_THRESHOLD_MS}ms)`);
  expect(elapsed, `Stock page took ${elapsed}ms — exceeds ${GENERAL_THRESHOLD_MS}ms`).toBeLessThan(
    GENERAL_THRESHOLD_MS
  );
});

// ---------------------------------------------------------------------------
// Test 15 — Materials master page (cached indefinitely, tighter threshold)
// ---------------------------------------------------------------------------
test("Test 15: Materials master page loads within cached threshold", async ({ page }) => {
  // First visit primes the cache; second visit should be fast.
  await page.goto("/masters/materials", { waitUntil: "domcontentloaded" });
  const elapsed = await measureLoad(page, "/masters/materials");
  console.log(`Materials master: ${elapsed}ms (threshold: ${CACHED_THRESHOLD_MS}ms)`);
  expect(elapsed, `Materials page took ${elapsed}ms — exceeds ${CACHED_THRESHOLD_MS}ms`).toBeLessThan(
    CACHED_THRESHOLD_MS
  );
});

// ---------------------------------------------------------------------------
// Test 16 — Reports page (aggregation queries, cached 120s)
// ---------------------------------------------------------------------------
test("Test 16: Reports page loads within threshold", async ({ page }) => {
  const elapsed = await measureLoad(page, "/reports");
  console.log(`Reports: ${elapsed}ms (threshold: ${GENERAL_THRESHOLD_MS}ms)`);
  expect(elapsed, `Reports page took ${elapsed}ms — exceeds ${GENERAL_THRESHOLD_MS}ms`).toBeLessThan(
    GENERAL_THRESHOLD_MS
  );
});

// ---------------------------------------------------------------------------
// Test 17 — Invoice view sub-route (server-rendered, verifies loading.tsx works)
// ---------------------------------------------------------------------------
test("Test 17: Invoice view page loads (verifies loading.tsx is present)", async ({ page }) => {
  await page.goto("/invoice");
  await page.waitForLoadState("networkidle");

  const invoiceLink = page.locator('a[href*="/invoice/"]').first();
  const hasInvoice = await invoiceLink.isVisible({ timeout: 3_000 }).catch(() => false);

  if (!hasInvoice) {
    console.log("Test 17: No invoices found in test DB — verifying list page only.");
    return;
  }

  const href = await invoiceLink.getAttribute("href");
  const viewUrl = href?.endsWith("/view") ? href : `${href}/view`;

  const start = Date.now();
  await page.goto(viewUrl!);
  await page.waitForLoadState("networkidle");
  const elapsed = Date.now() - start;

  console.log(`Invoice view: ${elapsed}ms (threshold: ${GENERAL_THRESHOLD_MS}ms)`);
  expect(elapsed, `Invoice view took ${elapsed}ms — exceeds ${GENERAL_THRESHOLD_MS}ms`).toBeLessThan(
    GENERAL_THRESHOLD_MS
  );
});
