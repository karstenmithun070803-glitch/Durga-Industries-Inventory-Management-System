// ============================================================
// Phase: 5
// Category: Performance
// Tests: Large dataset handling — DB client singleton, query
//        patterns (no N+1, batching), caching strategy, schema
//        index coverage, and loading UI for all server routes
// Source: src/lib/db/index.ts, src/lib/actions/*.actions.ts,
//         src/lib/db/schema.ts, src/components/pdf/
// ============================================================

import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

// Use process.cwd() (project root) rather than __dirname for ESM/CJS compatibility.
const SRC = resolve(process.cwd(), "src");
const read = (rel: string) => readFileSync(resolve(SRC, rel), "utf-8");

// ---------------------------------------------------------------------------
// Test 1 — DB client is a singleton with correct Supabase settings
// ---------------------------------------------------------------------------
test.describe("Test 1: DB client is singleton", () => {
  test("exports a single db constant with prepare:false and connection timeouts", async () => {
    const content = read("lib/db/index.ts");

    expect(content).toMatch(/export const db\s*=/);
    expect(content).toMatch(/prepare\s*:\s*false/);
    expect(content).toMatch(/idle_timeout/);
    expect(content).toMatch(/max_lifetime/);
    expect(content).toMatch(/drizzle\(/);
  });
});

// ---------------------------------------------------------------------------
// Test 2 — Dashboard uses Promise.all() — no sequential per-card queries
// ---------------------------------------------------------------------------
test.describe("Test 2: Dashboard uses Promise.all()", () => {
  test("getDashboardStats runs all queries in parallel via Promise.all()", async () => {
    const content = read("lib/actions/dashboard.actions.ts");

    expect(content).toContain("Promise.all(");
    expect(content).toContain("getDashboardStats");
    expect(content).toMatch(/revalidate\s*:\s*120/);
  });
});

// ---------------------------------------------------------------------------
// Test 3 — Stock ledger query uses LIMIT (not unbounded full-table scan)
// ---------------------------------------------------------------------------
test.describe("Test 3: Stock ledger fetch is bounded by LIMIT", () => {
  test("getStockMovementHistory applies .limit() to prevent unbounded fetches", async () => {
    const content = read("lib/actions/stock.actions.ts");

    expect(content).toContain("getStockMovementHistory");
    expect(content).toContain(".limit(");
  });
});

// ---------------------------------------------------------------------------
// Test 4 — Master data functions are cached (no DB hit on every page load)
// ---------------------------------------------------------------------------
test.describe("Test 4: Master data functions use unstable_cache()", () => {
  const masterFiles: [string, string][] = [
    ["lib/actions/materials.actions.ts", "materials"],
    ["lib/actions/suppliers.actions.ts", "suppliers"],
    ["lib/actions/customers.actions.ts", "customers"],
    ["lib/actions/units.actions.ts", "units"],
    ["lib/actions/contractors.actions.ts", "contractors"],
    ["lib/actions/tax.actions.ts", "tax rates"],
    ["lib/actions/vehicles.actions.ts", "vehicles"],
  ];

  for (const [file, label] of masterFiles) {
    test(`${label} actions use unstable_cache()`, async () => {
      const content = read(file);
      expect(content).toContain("unstable_cache(");
    });
  }
});

// ---------------------------------------------------------------------------
// Test 5 — Reports and dashboard use time-based revalidation (not stale-forever)
// ---------------------------------------------------------------------------
test.describe("Test 5: Aggregation caches use revalidate:120", () => {
  test("dashboard.actions.ts cache revalidates every 120s", async () => {
    const content = read("lib/actions/dashboard.actions.ts");
    expect(content).toMatch(/revalidate\s*:\s*120/);
  });

  test("reports.actions.ts cache revalidates every 120s", async () => {
    const content = read("lib/actions/reports.actions.ts");
    expect(content).toMatch(/revalidate\s*:\s*120/);
  });
});

// ---------------------------------------------------------------------------
// Test 6 — No N+1 pattern in material-issues (spot check)
// ---------------------------------------------------------------------------
test.describe("Test 6: No N+1 query pattern in material-issues", () => {
  test("getMaterialIssues exists and uses inArray() batch fetching", async () => {
    const content = read("lib/actions/material-issues.actions.ts");

    expect(content).toContain("getMaterialIssues");
    expect(content).toContain("inArray(");
  });

  test("does not await a db query directly inside a for-of loop body", async () => {
    const content = read("lib/actions/material-issues.actions.ts");

    const forLoopWithAwaitSelect = /for\s+\([\s\S]{0,60}\)\s*\{[^}]{0,500}await\s+\w+\.select\s*\(/;
    expect(forLoopWithAwaitSelect.test(content)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 7 — loading.tsx exists for all server-rendered invoice sub-routes
// ---------------------------------------------------------------------------
test.describe("Test 7: loading.tsx files exist for all invoice sub-routes", () => {
  test("invoice/[id]/edit has a loading.tsx", async () => {
    const path = resolve(
      process.cwd(),
      "src/app/(dashboard)/invoice/[id]/edit/loading.tsx"
    );
    expect(
      existsSync(path),
      "Missing: src/app/(dashboard)/invoice/[id]/edit/loading.tsx"
    ).toBe(true);
  });

  test("invoice/[id]/view has a loading.tsx", async () => {
    const path = resolve(
      process.cwd(),
      "src/app/(dashboard)/invoice/[id]/view/loading.tsx"
    );
    expect(
      existsSync(path),
      "Missing: src/app/(dashboard)/invoice/[id]/view/loading.tsx"
    ).toBe(true);
  });

  test("invoice/[id] parent has a loading.tsx (baseline: already confirmed)", async () => {
    const path = resolve(
      process.cwd(),
      "src/app/(dashboard)/invoice/[id]/loading.tsx"
    );
    expect(existsSync(path)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 8 — Schema has indexes on all high-frequency query paths
// ---------------------------------------------------------------------------
test.describe("Test 8: Schema defines indexes on hot-path columns", () => {
  const schemaContent = read("lib/db/schema.ts");

  const indexes: [string, string][] = [
    ["idx_sl_material_created", "stockLedger composite (material_id, created_at)"],
    ["idx_po_financial_year", "purchaseOrders financial_year"],
    ["idx_mi_vehicle_id", "materialIssues vehicle_id"],
    ["idx_inv_financial_year", "invoices financial_year"],
    ["idx_poi_po_id", "purchaseOrderItems po_id"],
    ["idx_mii_issue_id", "materialIssueItems issue_id"],
    ["idx_sl_material_id", "stockLedger material_id"],
    ["idx_mi_fy_status", "materialIssues (fy, status)"],
    ["idx_inv_fy_status", "invoices (fy, status)"],
    ["idx_po_fy_status", "purchaseOrders (fy, status)"],
  ];

  for (const [indexName, description] of indexes) {
    test(`index "${indexName}" exists (${description})`, async () => {
      expect(
        schemaContent,
        `Missing index: ${indexName} — needed for ${description}`
      ).toContain(indexName);
    });
  }
});

// ---------------------------------------------------------------------------
// Test 9 — PDF library is @react-pdf/renderer (informational — always passes)
// ---------------------------------------------------------------------------
test.describe("Test 9: PDF architecture (informational)", () => {
  test("customer-invoice-pdf uses @react-pdf/renderer (client-side)", async () => {
    const content = read("components/pdf/customer-invoice-pdf.tsx");
    expect(content).toContain("@react-pdf/renderer");
    expect(content).not.toContain("pdfkit");
    expect(content).not.toContain("puppeteer");
  });

  test("print-button dynamically imports @react-pdf/renderer to avoid bundle bloat", async () => {
    const content = read("components/pdf/print-button.tsx");
    expect(content).toContain('import("@react-pdf/renderer")');
  });
});
