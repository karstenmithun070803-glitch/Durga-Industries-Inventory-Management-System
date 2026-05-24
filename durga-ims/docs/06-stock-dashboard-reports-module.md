# Phase 6 — Stock Dashboard & Reports
## Complete Developer Documentation

**Project:** Durga Industries IMS (Inventory Management System for a bus body manufacturer in Karur, Tamil Nadu)  
**Phase Status:** Complete (as of 2026-05-24)  
**Commits covering this phase:**
- `c2cbe25` — initial build (stock dashboard, reports, CSV exports, PDF fixes, customer guard)
- `3f48fee` — refactor: extract FY helpers to `src/lib/fy.ts`
- `19999bc` — build fix: remove sync re-exports from `"use server"` file
- `5943eac` — audit fixes: 13 issues resolved

---

## Table of Contents

1. [What We Started With](#1-what-we-started-with)
2. [Scope — What Phase 6 Had to Deliver](#2-scope)
3. [Initial Build — What Was Created](#3-initial-build)
4. [File Map](#4-file-map)
5. [Architecture Decisions](#5-architecture-decisions)
6. [Feature Deep-Dives](#6-feature-deep-dives)
7. [Build Error: "use server" Re-export](#7-build-error-use-server-re-export)
8. [Comprehensive Audit — All 16 Findings](#8-comprehensive-audit)
9. [Audit Fixes — Implementation Record](#9-audit-fixes)
10. [Database Migration Applied](#10-database-migration)
11. [Deferred to Phase 7](#11-deferred-to-phase-7)
12. [Business Rules Encoded in This Phase](#12-business-rules)
13. [Known Limitations](#13-known-limitations)

---

## 1. What We Started With

Before Phase 6 began:

- **Phases 1–5 were complete.** The app had: Masters (customers, suppliers, materials, vehicles, units, taxes, contractors), Purchase Orders with full stock inward logic, Material Issues with stock deduction, Invoices with GST split + PDF printing, Company Settings.
- **Stock ledger was already in place.** Every PO receive, MI confirm, and reversal wrote an append-only row to `stock_ledger` (table created in Phase 1). The `current_stock` column on `materials` was the running total.
- **No visibility into stock.** There was no dashboard, no way to see what was in stock, no history, no reports.
- **No reporting.** Owners could print individual PO or MI PDFs, but had no summary reports, no ITC tracking, no period-end reconciliation.
- **Financial Year helper existed** but was embedded inside `reports.actions.ts` (which didn't exist yet — it was planned for this phase).

The `TASK_LIST.md` Phase 6 items at the start of this phase were all unchecked `[ ]`:

```
[ ] 6.1 Stock Dashboard — live materials table
[ ] 6.2 Stock Dashboard — summary cards
[ ] 6.3 Stock Dashboard — Job Search panel (job cost, PDF)
[ ] 6.4 Stock Dashboard — Manual Stock Adjustment
[ ] 6.5 Reports — Material-wise Costing
[ ] 6.6 Reports — Monthly Stock Report
[ ] 6.7 Reports — Purchase Report
[ ] 6.8 Reports — Invoice Summary
[ ] 6.9 Download buttons — CSV export
```

Gaps carried forward from earlier phases that were **completed in this phase**:
```
[x] 6.A Customer deactivation guard — COMPLETED (guard added to customers.actions.ts)
[x] 6.B PO and MI PDFs connect to company_settings — COMPLETED (both PDFs now read from DB)
```

---

## 2. Scope

### What Was Built in Phase 6

| Feature | Description |
|---|---|
| Stock Dashboard | Live table of all materials with current stock, min level, last PO rate, stock value, status badges |
| Summary Cards | 4 cards: Total Materials, Stock Value, Low Stock count, Out of Stock count |
| Job Cost Search | Search by job/vehicle → shows all issued material lines, billed vs unbilled split, PDF export |
| Manual Stock Adjustment | Dialog with live stock fetch, reason required (≥10 chars), optimistic concurrency, full ledger entry |
| Stock History Drawer | Slide-out panel showing last 100 stock movements per material with reference labels |
| Stock CSV Export | Export current filtered view to UTF-8 BOM CSV |
| Invoice Summary Report | FY-filtered report with GST columns, cancelled row handling, CSV export |
| Purchase Report | Per-line-item PO report with ITC columns, supplier/material/date filters, CSV export |
| Monthly Stock Report | Period reconciliation: opening → movements → closing, with optional price column, CSV export |
| Invoice List CSV Export | "Export CSV" button added to the invoice list page (respects current filters) |
| Purchase Order List CSV Export | "Export CSV" button added to the PO list page (respects current filters) |
| Material Issue List CSV Export | "Export CSV" button added to the MI list page (respects current filters) |
| Customer Deactivation Guard (6.A) | `deleteCustomer()` now blocks if the customer has any active vehicles linked |
| PO Register PDF — company settings (6.B) | PO Register PDF now reads company name/address/GSTIN from DB; falls back to hardcoded constants |
| MI Register PDF — company settings (6.B) | MI Register PDF now reads company name/address/GSTIN from DB; falls back to hardcoded constants |
| Sidebar navigation | "Stock" nav entry (Warehouse icon) added between Invoice and Reports |
| Sheet UI component | Shadcn `Sheet` component installed (`src/components/ui/sheet.tsx`) — used by stock history drawer |

### What Was NOT in Scope (deferred or excluded)

- Material-wise Costing report (partially handled via Job Cost Search; full standalone report deferred)
- GSTR-1 export — Phase 8
- H-4: Vehicle type in reports — Phase 7
- H-5: Supplier bill number on PO — Phase 7
- M-4: Create PO from low stock shortcut — Phase 7

---

## 3. Initial Build

### Commit Timeline

| Commit | Description | Key changes |
|---|---|---|
| `c2cbe25` | Initial Phase 6 build | 20 files, 3131 insertions — main feature build |
| `3f48fee` | Refactor FY helpers | Extract `getCurrentFY`/`fyDateRange` to `src/lib/fy.ts` |
| `19999bc` | Build fix | Remove sync re-exports from `"use server"` file |
| `5943eac` | Audit fixes | 13 issues resolved across 6 files |

### What Was Created (`commit c2cbe25`)

**New Server Actions:**
- `src/lib/actions/stock.actions.ts` — all stock dashboard server functions
- `src/lib/actions/reports.actions.ts` — all report query functions

**New Pages & Components:**
- `src/app/(dashboard)/stock/page.tsx` — server component, parallel data fetches
- `src/app/(dashboard)/stock/stock-client.tsx` — entire stock dashboard UI (client component)
- `src/app/(dashboard)/reports/page.tsx` — server component, parallel data fetches
- `src/app/(dashboard)/reports/reports-client.tsx` — tab layout for all reports
- `src/app/(dashboard)/reports/invoice-summary.tsx` — Invoice Summary report
- `src/app/(dashboard)/reports/purchase-report.tsx` — Purchase Report
- `src/app/(dashboard)/reports/monthly-stock.tsx` — Monthly Stock Report

**New PDF Component:**
- `src/components/pdf/job-cost-pdf.tsx` — Job Cost PDF document (uses @react-pdf/renderer)

**New UI Component:**
- `src/components/ui/sheet.tsx` — Shadcn `Sheet` component (138 lines), installed to support the stock history slide-out drawer

**Modified — CSV exports added to existing list pages:**
- `src/app/(dashboard)/invoice/invoice-list-client.tsx` — added `downloadCsv()` function + "Export CSV (N)" button; exports Bill#, Date, Vehicle, Job Ref, Customer, GSTIN, Net Amount, Status; respects active filters
- `src/app/(dashboard)/transactions/purchase-orders/purchase-orders-client.tsx` — added `downloadCsv()` + button; exports PO#, Date, Supplier, Material, Qty, Unit, Rate, all tax amounts, Stock Updated, Status; respects current tab + date filters
- `src/app/(dashboard)/transactions/material-issues/material-issues-client.tsx` — added `downloadCsv()` + button; exports Slip#, Date, Vehicle, Job Ref, Material, Qty, Unit, Rate, Amount, Contractor, Status; respects current tab + date filters

**Modified — company settings wired to PO and MI Register PDFs (completing task 6.B):**
- `src/components/pdf/po-register-pdf.tsx` — added `companySetting?: CompanySetting` prop; company name, address, GSTIN now read from DB with hardcoded constants as fallback
- `src/components/pdf/mi-register-pdf.tsx` — same pattern as PO Register PDF
- `src/app/(dashboard)/transactions/purchase-orders/page.tsx` — added `getCompanySettings()` to parallel fetch, passes to `PurchaseOrdersClient`
- `src/app/(dashboard)/transactions/material-issues/page.tsx` — same as PO page

**Modified — customer deactivation guard (completing task 6.A):**
- `src/lib/actions/customers.actions.ts` — `deleteCustomer()` now checks for active vehicles before deactivating:
  ```ts
  const [{ activeVehicles }] = await db
    .select({ activeVehicles: count() })
    .from(vehicles)
    .where(and(eq(vehicles.customer_id, id), eq(vehicles.is_active, true)));
  if (activeVehicles > 0) {
    throw new Error(
      `Cannot deactivate — ${activeVehicles} active vehicle(s) are linked to this customer. Deactivate those vehicles first.`
    );
  }
  ```

**Modified — navigation:**
- `src/components/sidebar.tsx` — added `{ label: "Stock", href: "/stock", icon: Warehouse }` entry between Invoice and Reports; imported `Warehouse` from lucide-react

**Modified — FY helpers refactor (`commit 3f48fee`):**
- `src/lib/fy.ts` — created; `getCurrentFY()` and `fyDateRange()` moved here from `reports.actions.ts`
- `src/lib/actions/reports.actions.ts` — FY helpers removed from this file; a re-export line `export { getCurrentFY, fyDateRange } from "@/lib/fy"` was temporarily added (later removed by `19999bc` as it violated `"use server"` rules)

---

## 4. File Map

Files created or meaningfully modified in Phase 6. `[NEW]` = created from scratch; `[MOD]` = existing file changed.

```
src/
├── lib/
│   ├── fy.ts                              [NEW] getCurrentFY(), fyDateRange() — pure sync helpers, NO "use server"
│   ├── actions/
│   │   ├── stock.actions.ts               [NEW] Stock dashboard server actions
│   │   ├── reports.actions.ts             [NEW] Report query server actions
│   │   └── customers.actions.ts           [MOD] Added active-vehicle guard to deleteCustomer()
│
├── app/(dashboard)/
│   ├── stock/
│   │   ├── page.tsx                       [NEW] Server component: fetches data, renders StockClient
│   │   └── stock-client.tsx               [NEW] Full stock dashboard UI + sub-components
│   │
│   ├── reports/
│   │   ├── page.tsx                       [MOD] Was empty stub → full server component with parallel fetches
│   │   ├── reports-client.tsx             [NEW] Tab layout (Invoice Summary / Purchase / Monthly)
│   │   ├── invoice-summary.tsx            [NEW] Invoice Summary report component
│   │   ├── purchase-report.tsx            [NEW] Purchase Report component
│   │   └── monthly-stock.tsx             [NEW] Monthly Stock Report component
│   │
│   ├── invoice/
│   │   └── invoice-list-client.tsx        [MOD] Added downloadCsv() + Export CSV button
│   │
│   └── transactions/
│       ├── purchase-orders/
│       │   ├── page.tsx                   [MOD] Added getCompanySettings() to parallel fetch
│       │   └── purchase-orders-client.tsx [MOD] Added downloadCsv() + Export CSV button + companySetting prop
│       └── material-issues/
│           ├── page.tsx                   [MOD] Added getCompanySettings() to parallel fetch
│           └── material-issues-client.tsx [MOD] Added downloadCsv() + Export CSV button + companySetting prop
│
├── components/
│   ├── sidebar.tsx                        [MOD] Added Stock nav entry (Warehouse icon)
│   ├── pdf/
│   │   ├── job-cost-pdf.tsx               [NEW] Job Cost PDF for printing from stock dashboard
│   │   ├── po-register-pdf.tsx            [MOD] Wired companySetting prop (DB name/address/GSTIN)
│   │   └── mi-register-pdf.tsx            [MOD] Wired companySetting prop (DB name/address/GSTIN)
│   └── ui/
│       └── sheet.tsx                      [NEW] Shadcn Sheet component (slide-out drawer)
│
└── app/
    └── globals.css                        [MOD] Added .line-through-cells utility class (audit fix C-1)
```

---

## 5. Architecture Decisions

### Server Component → Client Component Pattern

Both `/stock` and `/reports` use the same pattern:

```
page.tsx (Server Component, force-dynamic)
  └── parallel Promise.all() → fetches initial data from DB
  └── passes data as props to ClientComponent

ClientComponent ("use client")
  └── owns all UI state (tabs, filters, search, dialogs)
  └── calls server actions for on-demand data (run report, open history, adjust stock)
  └── uses router.refresh() to reload server-side data after mutations
```

`force-dynamic` is set on every page to prevent Next.js from statically caching DB queries at build time.

### "use server" Constraint

Next.js 14 App Router enforces: **every export from a `"use server"` file must be an async function.** Synchronous functions, constants, type exports, and re-exports of sync functions are all forbidden — webpack throws at build time (not `tsc`).

`getCurrentFY()` and `fyDateRange()` are synchronous. They live in `src/lib/fy.ts` (no directive). Reports page imports them directly from `@/lib/fy`, never from `reports.actions.ts`.

### Stock Data Types — NUMERIC as String

Supabase/Drizzle returns PostgreSQL `NUMERIC` columns as JavaScript strings. Every numeric field in `StockMaterialRow` that comes from a NUMERIC column (e.g., `current_stock`, `min_level`, `last_po_rate`) is typed `string | null`, not `number`. All display code calls `parseFloat()` before arithmetic or formatting. Report action return types explicitly convert to `number` via `parseFloat()` before returning.

### Optimistic Concurrency for Stock Adjustment

`adjustStock()` uses a verify-after-write pattern to handle concurrent access (max 4 users):

```ts
// Step 1: Read current stock
const [mat] = await db.select(...).where(eq(materials.id, materialId));
const currentQty = parseFloat(mat.current_stock);

// Step 2: Conditional update — WHERE includes the exact current_stock value
await db.update(materials)
  .set({ current_stock: String(newQty) })
  .where(and(eq(materials.id, materialId), eq(materials.current_stock, mat.current_stock)));

// Step 3: Re-read and verify — if another user changed stock between step 1 and 2,
// the WHERE matched 0 rows and the DB was not updated
const [verify] = await db.select(...).where(eq(materials.id, materialId));
if (Math.abs(parseFloat(verify.current_stock) - newQty) > 0.0001) {
  return { success: false, error: "Stock was changed by another user — please refresh and try again." };
}

// Step 4: Only write ledger entry after confirming update succeeded
await db.insert(stockLedger).values({ ... });
```

Ledger entry is written AFTER verification to ensure the ledger never records a change that didn't actually land.

### Monthly Stock Opening Calculation

The opening stock for a period is derived from the stock ledger, not from `materials.opening_stock`. Specifically: it takes the `stock_after` from the most recent ledger entry **before** the period start date. If no ledger entry exists before that date, it falls back to `materials.opening_stock` (the hand-keyed value set at material creation time).

```ts
// Fetch last ledger entry before period start, per material
const preLedger = await db.select({ material_id, stock_after, created_at })
  .from(stockLedger)
  .where(lte(stockLedger.created_at, from))
  .orderBy(desc(stockLedger.created_at))
  .limit(10000);

// First occurrence per material = most recent before period
const openingMap = new Map<string, number>();
for (const e of preLedger) {
  if (!openingMap.has(e.material_id)) {
    openingMap.set(e.material_id, parseFloat(e.stock_after));
  }
}
```

### Financial Year Handling

FY runs April 1 to March 31 (Indian standard). `getCurrentFY()` in `src/lib/fy.ts`:

```ts
export function getCurrentFY(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-indexed
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}
```

All date range filters in report actions use IST-correct timestamps:
```ts
gte(invoices.bill_date, new Date(dateFrom + "T00:00:00+05:30"))
lte(invoices.bill_date, new Date(dateTo + "T23:59:59+05:30"))
```

---

## 6. Feature Deep-Dives

### Stock Dashboard (`/stock`)

**Data fetch (`getStockDashboardMaterials`):**
- Fetches all active materials PLUS inactive materials with `current_stock > 0`
- Fetches all unit names in a separate query (in-memory join)
- Fetches the last received PO rate per material from `purchaseOrderItems` JOIN `purchaseOrders` WHERE status = "Received", ordered by `po_date DESC`, limited to 2000 rows (performance cap — covers ~200 materials × 10 PO entries)
- Computes `totalStockValue` = sum of (stock × last PO rate) for active materials only; materials with no PO history are excluded and counted separately

**UI state:**
- Four tabs: Active (all active materials) / Low Stock / Out of Stock / Inactive with Stock
- Text search filters by material name or code (M-0001 format)
- "Active" tab count reflects search when search is active (shows filtered count, not total)
- CSV export respects current tab + search filter
- Refresh button uses `useTransition` + `router.refresh()` to reload server data; `isPending` drives the spinner and disabled state

**Status logic (`getStatus`):**
```ts
function getStatus(row: StockMaterialRow): StockStatus {
  if (!row.is_active) return "inactive";
  const stock = parseFloat(row.current_stock);
  if (stock === 0) return "out";
  const minL = parseFloat(row.min_level ?? "0");
  if (minL > 0 && stock < minL) return "low";
  return "ok";
}
```
- Low stock only triggers when `min_level` is set AND greater than zero
- Materials with `min_level = 0` or null are never flagged as "low"

**Row colour coding:**
- Out of Stock → `bg-red-50`
- Low Stock → `bg-amber-50`
- Inactive → `bg-slate-50`
- OK → no background

### Stock History Drawer

- Side sheet (Shadcn `Sheet` component), 560px wide
- Loads last 100 entries from `stock_ledger` for the selected material (ordered by `created_at DESC`)
- Reference labels resolved in the action: PO IDs → `PO-0001` format; MI IDs → `MI-0001` format; otherwise "Manual"
- Transaction type shown as human-readable label via `LEDGER_TYPE_LABELS` map
- Reason text shown up to 80 characters; full text on hover via `title` attribute
- "Showing last 100 movements" notice appears when exactly 100 rows returned

**`LEDGER_TYPE_LABELS` map:**
```ts
const LEDGER_TYPE_LABELS: Record<string, string> = {
  PO_INWARD: "PO Receipt",
  ISSUE: "Material Issue",
  REVERSAL: "Reversal",
  ADJUSTMENT: "Manual Adjustment",
};
```
Falls back to `e.transaction_type.replace("_", " ")` for any future unknown types.

### Stock Adjustment Dialog

- Opens with stale stock from the table row as initial pre-fill (instant)
- Async fetches live stock from DB (`getStockForMaterial`) after opening — handles concurrent writes
- **Race condition fix:** Uses functional setState — only overwrites input if user hasn't typed yet:
  ```ts
  setNewQty((prev) => (prev === initialQty ? parseFloat(fresh.current_stock).toString() : prev));
  ```
- Shows live delta: "This will ADD X to stock" / "This will REMOVE X from stock"
- Validation: qty ≥ 0 (hard), reason ≥ 10 chars (hard), both enforced client AND server side
- Ledger entry stores: `reason + " — Adjusted from X to Y by username"` (username from Supabase Auth session)
- Optimistic concurrency on the update (see Architecture section)

### Job Cost Search Panel

- Collapsible panel on the stock page (chevron toggle)
- All vehicles (active + inactive) shown in dropdown so owner can look up completed jobs
- On vehicle select: calls `getJobCostData(vehicleId)` → fetches all Issued MI items for that vehicle where `affects_inventory = true`
- Groups rows by `material_id + contractor_id + rate` (same material at different rates from different contractors shown as separate rows)
- Billed/Unbilled split: checks `invoiceSlipLinks` JOIN `invoices` WHERE status = "Finalized" → billed_amount vs unbilled_amount per row
- Totals row at bottom: Total Cost / Billed / Unbilled
- Print button generates Job Cost PDF using `@react-pdf/renderer`

**Key business rule:** Only `affects_inventory = true` MI items are counted. Items with `affects_inventory = false` (like contractor labour charges) are excluded from job cost calculation.

### Invoice Summary Report

**Filters:** Financial Year (dropdown, last 5 FYs), Status (Finalized Only / All / Cancelled Only), Customer (optional), Vehicle (optional), Date From/To  
**Data:** Aggregates `invoiceItems` amounts per invoice — taxable_value, CGST, SGST, IGST summed; gross_total computed client-side; discount and net_amount from invoice header  
**Cancelled row handling:**
- Cancelled rows render at 60% opacity + strikethrough (via `line-through-cells td` CSS class)
- Totals footer EXCLUDES cancelled rows (they're void for GST purposes) — unless viewing "Cancelled Only" tab, in which case totals are shown as "Reference Total (void — excluded from GST)"
- Footer label shows "TOTAL (Cancelled excluded)" when mixed view includes some cancelled

**Customer filter caveat:** The customer filter joins via `vehicles.customer_id`, meaning it filters by the vehicle's assigned customer, not the invoice's snapshotted customer name. This works correctly for current data but would miss edge cases where the vehicle was reassigned after invoicing (theoretical — not a current business concern).

### Purchase Report

**Filters:** Financial Year, Status (Received Only / All / Draft Only), Supplier (optional), Material (optional), Date From/To  
**Data:** Joins `purchaseOrders` → `purchaseOrderItems` → `materials` → `suppliers` → `units` — one row per line item per PO  
**Key design:** Supplier filter is on `purchaseOrderItems.supplier_id`, not `purchaseOrders.supplier_id`. This is correct — each line item has its own supplier (Durga buys different materials from different suppliers on a single PO).  
**Footer totals:** Shows Received-only totals regardless of status filter (when mixed, label shows "(Received only)"). Includes qty total.  
**Qty total column alignment:** Footer has `colSpan={4}` (PO#, Date, Supplier, Material) + qty cell + two empty cells (Unit, Rate) + remaining amount cells. This exactly matches the 14-column table header.

### Monthly Stock Report

**Filters:** From Month, To Month (month picker), Material (optional), Show Prices toggle  
**Opening stock derivation:** From last ledger entry before period start (falls back to `materials.opening_stock` if no prior entries)  
**Movement categories:**
- `PO_INWARD` → added to "PO Inward" column (positive)
- `ISSUE` → added to "Issues" column (displayed negatively, stored as negative in ledger)
- `REVERSAL` → added to "Reversals" column (can be positive or negative)
- `ADJUSTMENT` → added to "Adjustments" column (can be positive or negative)
- Closing = Opening + Inward - Issues + Reversals + Adjustments

**Show Prices toggle:** Adds "Last Rate" and "Closing Value" columns (last received PO rate × closing stock)  
**Multi-unit footer:** If the report spans multiple materials with different units, the footer shows a note instead of a meaningless total: "Unit-wise total not shown — multiple units in this report"

### CSV Exports on Existing List Pages

Phase 6 task 6.9 ("Download buttons — CSV export for invoice list, MI list, PO list") was implemented by adding a `downloadCsv()` function and an "Export CSV (N)" button to each of the three existing transaction list pages. All three follow the same pattern: client-side CSV generation, UTF-8 BOM prepended, respects the current in-memory filter state.

**Invoice List (`invoice-list-client.tsx`):**
- Columns: Bill #, Date, Vehicle, Job Ref (`J00001` format), Customer, GSTIN, Net Amount, Status
- Exports `invoiceRows` (already filtered by active FY, status tab, date range, search)
- Button disabled when zero rows visible
- Filename: `invoices-YYYY-MM-DD.csv`

**Purchase Order List (`purchase-orders-client.tsx`):**
- Columns: PO #, Date, Supplier, Material, Qty, Unit, Rate, Taxable Amount, CGST, SGST, IGST, Total Amount, Stock Updated, Status
- Exports `visible` (already filtered by status tab, date range, search)
- Button disabled when zero rows visible
- Filename: `purchase-orders-YYYY-MM-DD.csv`

**Material Issue List (`material-issues-client.tsx`):**
- Columns: Slip #, Date, Vehicle, Job Ref, Material, Qty, Unit, Rate, Amount, Contractor, Status
- Exports `filtered` (already filtered by status tab, date range, search)
- Button disabled when zero rows visible
- Filename: `material-issues-YYYY-MM-DD.csv`

**Common CSV pattern across all exports:**
```ts
const bom = "﻿";  // UTF-8 BOM for Excel compatibility with Indian rupee character
const csv = bom + [headers, ...csvRows]
  .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
  .join("\n");
const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url; a.download = filename; a.click();
URL.revokeObjectURL(url);
```

### Customer Deactivation Guard (Task 6.A)

Added to `src/lib/actions/customers.actions.ts` in `deleteCustomer()` before the soft-delete update:

```ts
const [{ activeVehicles }] = await db
  .select({ activeVehicles: count() })
  .from(vehicles)
  .where(and(eq(vehicles.customer_id, id), eq(vehicles.is_active, true)));

if (activeVehicles > 0) {
  throw new Error(
    `Cannot deactivate — ${activeVehicles} active vehicle(s) are linked to this customer. Deactivate those vehicles first.`
  );
}
```

The error message is specific and actionable — it tells the user exactly how many vehicles are blocking and what to do. The error propagates to the customer master UI where it is caught and displayed as a toast.

This completes the gap noted as `2.D` in `TASK_LIST.md` since Phase 2.

### PO Register and MI Register PDFs — Company Settings (Task 6.B)

Both `PORegisterDocument` and `MIRegisterDocument` had hardcoded company name/address/GSTIN constants. This was fixed by:

1. Adding `companySetting?: CompanySetting` prop to both PDF component interfaces
2. Deriving display values with fallback:
   ```ts
   const coName    = companySetting?.company_name ?? COMPANY_NAME;
   const coAddress = companySetting?.address      ?? COMPANY_ADDRESS;
   const coGstin   = companySetting?.gstin        ?? COMPANY_GSTIN;
   ```
3. Updating the respective `page.tsx` files to fetch `companySetting` in parallel via `Promise.all()` and pass it down

The fallback to hardcoded constants means the PDFs still work if `companySetting` is null (e.g., company settings have never been saved).

This completes task `5.Y` and `6.B` from `TASK_LIST.md`. The gap item `5.Y` ("PO Register PDF and MI Register PDF still use hardcoded company constants") is now resolved.

### Sidebar Navigation Update

`src/components/sidebar.tsx` had the `nav` array updated:

```ts
// Before:
{ label: "Invoice", href: "/invoice", icon: FileText },
{ label: "Reports", href: "/reports", icon: BarChart2 },

// After:
{ label: "Invoice", href: "/invoice", icon: FileText },
{ label: "Stock", href: "/stock", icon: Warehouse },    // ← new
{ label: "Reports", href: "/reports", icon: BarChart2 },
```

`Warehouse` icon imported from `lucide-react`. Position between Invoice and Reports reflects the logical flow: issue materials to a vehicle → check stock → run reports.

### Sheet UI Component

`src/components/ui/sheet.tsx` was added (138 lines) — this is the standard Shadcn UI Sheet component. It was not previously installed in the project. It provides the slide-out panel (sidebar drawer) used for the stock history drawer. No custom modifications — pure Shadcn scaffolded component.

---

## 7. Build Error: "use server" Re-export

### What Happened

During Phase 6 initial implementation, `getCurrentFY()` and `fyDateRange()` were extracted to `src/lib/fy.ts`. However, a re-export line was left in `reports.actions.ts`:

```ts
// BAD — in a "use server" file:
export { getCurrentFY, fyDateRange } from "@/lib/fy";
```

This caused Vercel builds to fail with an error about non-async exports from a `"use server"` file. `tsc --noEmit` does NOT catch this — only Next.js webpack catches it at build time.

### Why This Happens

Next.js 14 `"use server"` files are special. The webpack bundler enforces: **every named export must be an async function** that can be serialized as a server action callable from the client. Synchronous functions, type re-exports, and constant re-exports are all rejected.

### The Fix (`commit 19999bc`)

1. Removed the re-export line from `reports.actions.ts`
2. Updated `reports/page.tsx` to import `getCurrentFY` directly from `@/lib/fy`:

```ts
// reports/page.tsx — correct
import { getCurrentFY } from "@/lib/fy";           // ← direct import from sync module
import { getActiveVehiclesForReports, ... } from "@/lib/actions/reports.actions"; // async only
```

**Rule going forward:** Never re-export anything from a `"use server"` file unless it is an async function.

---

## 8. Comprehensive Audit

After the initial build, a full code-reading audit was conducted covering developer perspective (bugs, performance, code quality), owner perspective (GST compliance, business rules), and user perspective (UX). 16 findings were identified.

### Finding Reference Table

| ID | Category | Severity | Description | Status |
|---|---|---|---|---|
| C-1 | Bug | High | `line-through-cells` CSS class undefined — cancelled rows had no strikethrough | Fixed |
| C-2 | Bug | Medium | `getActiveVehiclesForReports()` missing `is_active` filter — all vehicles shown including completed jobs | Fixed |
| C-3 | Bug | Low | Invoice customer filter uses `vehicles.customer_id` (live join), not the snapshotted customer on the invoice | Documented, not fixed — no current business impact |
| C-4 | Performance | Medium | No DB indexes on `stock_ledger(material_id, created_at)` — history queries do full table scans | Fixed (migration applied) |
| C-5 | Performance | Low | `getStockDashboardMaterials` fetched all PO rates with no LIMIT — unbounded table scan as data grows | Fixed |
| C-6 | Bug | Medium | Adjust dialog async fetch overwrote user's typed value unconditionally when it returned | Fixed |
| H-1 | Data | Medium | History reason truncated at " — " separator — hid audit evidence | Fixed |
| H-2 | Code Quality | Low | `isPending` from `useTransition` was destructured but unused; manual `isRefreshing` state duplicated it | Fixed |
| H-3 | Code Quality | Low | Duplicate `fmtAmt` function defined twice — once in `StockClient`, once in `JobCostPanel` | Fixed |
| H-4 | UX/Feature | Low | Vehicle type ("New Build" / "Repair") not surfaced in Job Cost or reports | Deferred to Phase 7 |
| H-5 | Data | Medium | Supplier's bill/invoice number not captured on PO — requires schema change | Deferred to Phase 7 |
| H-6 | Investigation | — | Purchase report supplier filter suspected wrong — audit confirmed NOT a bug | Confirmed correct |
| M-3 | UX | Low | "Active" tab count always showed `summary.totalMaterials`, ignoring active text search | Fixed |
| M-4 | UX/Feature | Low | No shortcut to create PO from low stock view | Deferred to Phase 7 |
| M-6 | UX | Low | "Clear filters" didn't reset Financial Year selector in reports | Fixed |
| UX-3 | UX | Medium | Raw transaction type enum values shown in history ("PO_INWARD", "ISSUE") instead of readable labels | Fixed |
| UX-6 | UX | Low | No quantity total in Purchase Report footer | Fixed |
| D-1 | UX/Safety | Medium | Application-layer stock validation gives generic error before hitting DB CHECK constraint | Confirmed already fixed — clear messages at material-issues.actions.ts:467, 569 |

### How the C-1 Bug Was Introduced

`line-through-cells` was added as a class in `invoice-summary.tsx` during initial implementation but the CSS rule was never defined in `globals.css`. It was a new custom utility class that needed to be in `@layer utilities`. Tailwind's purge would have removed it even if it existed in a normal CSS file without this layer declaration.

### Why H-6 Was NOT a Bug

`getPurchaseReport` filters by `purchaseOrderItems.supplier_id`, not `purchaseOrders.supplier_id`. A code reading of `purchase-orders.actions.ts` confirmed: every line item has its own `supplier_id` set at creation via the `itemValues()` helper function — it reads directly from the form's `items[i].supplier_id`. The PO header `supplier_id` is derived separately and may differ from any individual line item. Filtering on the line item's supplier is the correct business logic for per-item supplier tracking.

### Why D-1 Was Not Fixed in This Phase

Reading `material-issues.actions.ts` revealed the validation was already in place at two locations:
- Line 467: Before stock deduction for new issue confirmation
- Line 569: Before stock deduction for edit/re-confirm

Both already return: `"Insufficient stock for '${mat.name}': available X, requested Y."` — a clear, actionable message.

---

## 9. Audit Fixes — Implementation Record

All 13 in-scope fixes were applied in `commit 5943eac`.

### Fix C-1 — CSS `line-through-cells` class

**File:** `src/app/globals.css`

Added after the `@layer base` block:
```css
@layer utilities {
  .line-through-cells td {
    text-decoration: line-through;
  }
}
```

`@layer utilities` is required so Tailwind's build step doesn't purge it and so it has the correct cascade priority alongside other utility classes.

**Effect:** Cancelled invoice rows in Invoice Summary report now render with strikethrough text on top of the 60% opacity applied via the `opacity-60` class.

---

### Fix C-2 — Active vehicles filter for reports dropdown

**File:** `src/lib/actions/reports.actions.ts`

```ts
// Before:
export async function getActiveVehiclesForReports() {
  return db.select(...).from(vehicles).orderBy(vehicles.job_ref_no);
}

// After:
export async function getActiveVehiclesForReports() {
  return db.select(...).from(vehicles)
    .where(eq(vehicles.is_active, true))  // ← added
    .orderBy(vehicles.job_ref_no);
}
```

The Job Cost Search on the stock page still uses `getVehiclesForJobSearch()` (separate function) which intentionally shows ALL vehicles including inactive ones — you need to look up completed jobs.

---

### Fix C-4 — Stock ledger database indexes

**Supabase Migration applied to project `ejroglodhobkupgywwcj`:**

```sql
CREATE INDEX IF NOT EXISTS idx_stock_ledger_material_date
  ON stock_ledger(material_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_ledger_date
  ON stock_ledger(created_at);
```

- Composite index serves the history drawer query: `WHERE material_id = X ORDER BY created_at DESC LIMIT 100`
- Date index serves the monthly stock report: `WHERE created_at >= from AND created_at <= to`

---

### Fix C-5 — PO rates query performance cap

**File:** `src/lib/actions/stock.actions.ts` (inside `getStockDashboardMaterials`)

```ts
const poRates = await db
  .select({ material_id: ..., rate: ..., po_date: ... })
  .from(purchaseOrderItems)
  .innerJoin(purchaseOrders, ...)
  .where(eq(purchaseOrders.status, "Received"))
  .orderBy(desc(purchaseOrders.po_date))
  .limit(2000);  // ← added
```

2000 is sufficient for ~200 materials × 10 PO entries. The deduplication loop (`if (!rateMap.has(row.material_id))`) keeps only the most recent rate per material regardless of limit.

---

### Fix C-6 — Adjust dialog race condition

**File:** `src/app/(dashboard)/stock/stock-client.tsx`

The problem: `openAdjust()` set the input value to the stale table row stock, then awaited `getStockForMaterial()`, then unconditionally overwrote the input — even if the user had already started typing.

The fix uses functional setState to only update if the user hasn't modified the value:

```ts
async function openAdjust(mat: StockMaterialRow) {
  const initialQty = parseFloat(mat.current_stock).toString();
  setAdjustMaterial(mat);
  setAdjustFreshStock(null);
  setNewQty(initialQty);          // pre-fill with stale value
  setAdjustReason("");
  setAdjustOpen(true);

  const fresh = await getStockForMaterial(mat.id);
  if (fresh) {
    setAdjustFreshStock(fresh.current_stock);
    // Only update input if user hasn't changed it from the stale pre-fill
    setNewQty((prev) => (prev === initialQty ? parseFloat(fresh.current_stock).toString() : prev));
  }
}
```

---

### Fix H-1 — History reason display

**File:** `src/app/(dashboard)/stock/stock-client.tsx` (history table)

The stored reason for adjustments is in the format: `"User typed reason — Adjusted from X to Y by username"`. The old code split on " — " and showed only the first part, which was the user's text but hid the audit trail context.

```tsx
// Before:
{e.reason ? e.reason.split(" — ")[0] : "—"}

// After:
{e.reason ? (e.reason.length > 80 ? e.reason.slice(0, 80) + "…" : e.reason) : "—"}
```

Column width also widened from `max-w-[160px]` to `max-w-[200px]`. Full text visible on hover via `title={e.reason ?? ""}` (already present).

---

### Fix H-2 — Remove redundant `isRefreshing` state

**File:** `src/app/(dashboard)/stock/stock-client.tsx`

`useTransition` from React returns `[isPending, startTransition]`. `isPending` is true while the transition is in flight. The original code ignored `isPending` and instead used a manual `isRefreshing` state, requiring manual set/clear around the refresh call.

```ts
// Removed:
const [isRefreshing, setIsRefreshing] = useState(false);

// handleRefresh before:
async function handleRefresh() {
  setIsRefreshing(true);
  await new Promise<void>((resolve) => startTransition(() => { router.refresh(); resolve(); }));
  setIsRefreshing(false);
  setLastUpdated(new Date());
}

// handleRefresh after:
async function handleRefresh() {
  await new Promise<void>((resolve) => startTransition(() => { router.refresh(); resolve(); }));
  setLastUpdated(new Date());
}
```

JSX: replaced `isRefreshing` with `isPending` in the Refresh button's `disabled` prop and the RefreshCw icon's `animate-spin` condition.

---

### Fix H-3 — Remove duplicate `fmtAmt`

**File:** `src/app/(dashboard)/stock/stock-client.tsx`

`fmtAmt` was defined twice: once at module scope and once inside the `JobCostPanel` sub-component. The local `JobCostPanel` definition was removed; it now uses the module-level function.

The module-level helpers (all at top of file, before any component):
- `fmtQty(v)` — formats quantity with up to 4 decimal places
- `fmtAmt(v)` — formats amount as ₹X,XX,XXX.XX (Indian number format)
- `fmtLargeAmt(v)` — abbreviates large amounts: ₹1.23 Cr, ₹45.67 L, ₹890.1 K
- `fmtDateTime(d)` — full date + time for history drawer
- `fmtLastUpdated(d)` — "Today at 14:30" or "12 May at 09:15"

---

### Fix M-3 — Active tab count reflects search

**File:** `src/app/(dashboard)/stock/stock-client.tsx` (tab labels)

```tsx
// Before:
t === "all" ? `Active (${summary.totalMaterials})`

// After:
t === "all" ? `Active (${search.trim() ? filtered.length : summary.totalMaterials})`
```

Other tabs (Low Stock, Out of Stock, Inactive with Stock) show status-based counts that are independent of text search and remain unchanged.

---

### Fix M-6 — "Clear filters" resets Financial Year

**Files:** `invoice-summary.tsx` and `purchase-report.tsx`

**Invoice Summary — before:**
```tsx
{(customerId || vehicleId || dateFrom || dateTo || status !== "Finalized") && (
  <button onClick={() => { setCustomerId(""); setVehicleId(""); setDateFrom(""); setDateTo(""); setStatus("Finalized"); }}>
    Clear filters
  </button>
)}
```

**Invoice Summary — after:**
```tsx
{(customerId || vehicleId || dateFrom || dateTo || status !== "Finalized" || fy !== currentFY) && (
  <button onClick={() => { setCustomerId(""); setVehicleId(""); setDateFrom(""); setDateTo(""); setStatus("Finalized"); setFy(currentFY); }}>
    Clear filters
  </button>
)}
```

Same pattern applied to `purchase-report.tsx` (with status default "Received" instead of "Finalized").

Monthly Stock Report does not have an FY selector (uses calendar month pickers) — no change needed there.

---

### Fix UX-3 — Readable transaction type labels in history

**File:** `src/app/(dashboard)/stock/stock-client.tsx`

Added constant map after `LEDGER_TYPE_COLOR`:
```ts
const LEDGER_TYPE_LABELS: Record<string, string> = {
  PO_INWARD: "PO Receipt",
  ISSUE: "Material Issue",
  REVERSAL: "Reversal",
  ADJUSTMENT: "Manual Adjustment",
};
```

Usage in history table:
```tsx
{LEDGER_TYPE_LABELS[e.transaction_type] ?? e.transaction_type.replace("_", " ")}
```

The `??` fallback ensures any future transaction type renders reasonably without crashing.

---

### Fix UX-6 — Quantity total in Purchase Report footer

**File:** `src/app/(dashboard)/reports/purchase-report.tsx`

Added `qty` to the `totals` useMemo (filter same as financial totals — Received status only):
```ts
const totals = useMemo(() => {
  const active = rows.filter((r) => r.status === "Received");
  return {
    qty: active.reduce((s, r) => s + r.qty, 0),   // ← added
    taxable: active.reduce((s, r) => s + r.taxable_amount, 0),
    cgst: active.reduce((s, r) => s + r.cgst_amount, 0),
    sgst: active.reduce((s, r) => s + r.sgst_amount, 0),
    igst: active.reduce((s, r) => s + r.igst_amount, 0),
    total: active.reduce((s, r) => s + r.total_amount, 0),
  };
}, [rows]);
```

Footer column layout (14 columns total):

| Columns | Before | After |
|---|---|---|
| 1–7 (PO#, Date, Supplier, Material, Qty, Unit, Rate) | `colSpan={7}` label | Split: `colSpan={4}` label + qty cell + 2 empty cells |
| 8 (Taxable) | amount | amount (unchanged) |
| 9–11 (CGST, SGST, IGST) | amounts | amounts (unchanged) |
| 12 (Total) | amount | amount (unchanged) |
| 13–14 (Stock Updated, Status) | `colSpan={2}` empty | `colSpan={2}` empty (unchanged) |

---

## 10. Database Migration

**Applied via Supabase MCP to project `ejroglodhobkupgywwcj`**  
**Date:** 2026-05-24

```sql
-- Composite index for history drawer queries
CREATE INDEX IF NOT EXISTS idx_stock_ledger_material_date
  ON stock_ledger(material_id, created_at DESC);

-- Date range index for monthly stock report queries  
CREATE INDEX IF NOT EXISTS idx_stock_ledger_date
  ON stock_ledger(created_at);
```

These were applied using the Supabase MCP `apply_migration` tool directly to the remote project. No local migration file was created (the project does not currently use Supabase CLI local dev workflow).

---

## 11. Deferred to Phase 7

These three items from the Phase 6 audit are explicitly deferred:

| ID | Finding | Why Deferred |
|---|---|---|
| H-4 | Vehicle type ("New Build"/"Old Repair") not surfaced in Job Cost or reports | New feature — requires adding vehicle_type column to vehicles table or a field that tracks this, then surfacing it in the job cost panel and report PDFs |
| H-5 | Supplier bill/invoice number missing from PO — can't cross-reference against supplier invoices | Schema migration (add `supplier_bill_no` to `purchase_orders`), PO form change (new field), report column update — amounts to a small feature, not a bug fix |
| M-4 | No shortcut to create PO from Low Stock tab | New feature — "Create PO" button on low stock row linking to pre-filled PO form |

These are non-blocking for current usage. The app works correctly without them — they are missing features, not broken ones.

Note: Tasks 6.A (customer deactivation guard) and 6.B (PO/MI PDFs connect to company settings) were **completed** during this phase, not deferred. See Section 3 for implementation details.

---

## 12. Business Rules Encoded in This Phase

| Rule | Where |
|---|---|
| Stock value = last received PO rate × current stock (not weighted average) | `getStockDashboardMaterials` |
| Materials with no PO history are excluded from total stock value calculation | `getStockDashboardMaterials` |
| Inactive materials with zero stock are hidden from the dashboard | `getStockDashboardMaterials` WHERE clause |
| Inactive materials with remaining stock still appear (to allow adjustment to zero) | `getStockDashboardMaterials` WHERE clause |
| Low stock only triggers when min_level is set and > 0 | `getStatus()` function |
| Adjustment reason must be ≥ 10 characters (prevents lazy/meaningless entries) | Both client and `adjustStock()` server action |
| Stock cannot go below zero via manual adjustment | `adjustStock()` server action + DB CHECK constraint |
| Adjustment ledger reason includes full trail: user text + from/to values + username | `adjustStock()` fullReason construction |
| Only Issued MI items with `affects_inventory = true` counted in Job Cost | `getJobCostData()` WHERE clause |
| Job Cost billed/unbilled split based on whether slip is linked to a Finalized invoice | `invoiceSlipLinks` JOIN `invoices` WHERE status = "Finalized" |
| GST totals in Invoice Summary exclude Cancelled invoices (void for filing) | `getInvoiceSummaryReport` + tfoot logic |
| Monthly stock opening = last ledger entry before period start (or opening_stock if no prior entries) | `getMonthlyStockReport` opening calculation |
| ISSUE qty_change is stored as NEGATIVE in stock_ledger; report shows it as positive number in Issues column | `getMonthlyStockReport`: `m.issues += Math.abs(qty)` |
| Supplier filter on Purchase Report filters by line-item supplier, not PO-header supplier | `getPurchaseReport` WHERE clause on `purchaseOrderItems.supplier_id` |
| Vehicle dropdown in Invoice Summary report shows only active (current) vehicles | `getActiveVehiclesForReports()` with `is_active = true` filter |
| Vehicle dropdown in Job Cost Search shows ALL vehicles including inactive (for historical lookups) | `getVehiclesForJobSearch()` with no `is_active` filter |
| Date ranges use IST (+05:30) offsets, not UTC midnight | All report date filters |
| FY runs April 1 to March 31 | `getCurrentFY()` in `src/lib/fy.ts` |
| Customer cannot be deactivated if they have active vehicles | `deleteCustomer()` in `customers.actions.ts` — count check before soft-delete |
| PO and MI Register PDFs use DB company settings with hardcoded constant fallback | `PORegisterDocument`, `MIRegisterDocument` — `companySetting?.company_name ?? COMPANY_NAME` pattern |

---

## 13. Known Limitations

| Limitation | Impact | Path to Fix |
|---|---|---|
| Invoice customer filter joins live `vehicles.customer_id`, not the invoice's snapshotted customer | Filtering by customer finds invoices for that customer's vehicle — won't miss invoices unless vehicle was reassigned post-invoice | Add `customer_id` FK to `invoices` table (snapshots customer at invoice creation) — Phase 7 |
| Monthly stock opening uses last ledger entry before period (not "as of midnight IST" strictly) | Negligible — entries created within the same second at period boundary could be mis-classified | Acceptable for this business volume |
| PO rates query limited to 2000 rows for stock dashboard | Would undercount latest rate for the 2001st+ row's material if all 2000 are from a single material (impossible with 200 materials) | Increase limit or use lateral join if materials grow significantly |
| Job Cost PDF has no page break logic for jobs with many material lines | Long job cost tables may overflow a single page in the PDF | Add pagination to `JobCostDocument` component |
| Stock ledger history capped at 100 entries in the drawer | Users can see last 100 movements; older history requires Monthly Stock Report | Add "Load more" pagination if needed |
| Monthly stock pre-ledger query limited to 10000 rows | Covers ~300 materials × 33 entries before period — sufficient for current scale | Increase if ledger grows very large |
| Supplier bill number not captured on PO | Cannot cross-reference PO against supplier's invoice number | Schema + form change deferred to Phase 7 |
