# Stock Dashboard & Reports

> The Stock module gives a live view of warehouse inventory and provides the manual adjustment and history tools. The Reports module surfaces four FY-scoped analytical reports across purchase, issue, and invoice activity.

*Last reviewed: 2026-06-04*

---

## Tables

### `materials` (core stock table)
| Field | Notes |
|-------|-------|
| `current_stock` | Running total maintained by triggers/actions. Never updated directly — always via server actions. |
| `min_level` / `max_level` | Thresholds for low-stock badge and summary cards. `min_level` = null means no threshold set. |
| `last_po_rate` | **Not stored** — computed at query time from the most recent received PO item for that material. |

### `stock_ledger` (append-only audit log)
Every stock movement writes a row here. Never updated or deleted.

| Field | Notes |
|-------|-------|
| `transaction_type` | Enum: `PO_INWARD`, `ISSUE`, `ADJUSTMENT`, `PO_REVERSAL`, `ISSUE_REVERSAL` |
| `qty_change` | Positive = stock added, negative = stock removed |
| `stock_after` | Snapshot of `materials.current_stock` after this entry |
| `reference_id` / `reference_type` | Points to the PO or MI that caused the movement |
| `reason` | Required for ADJUSTMENT entries (≥ 10 characters enforced) |
| `adjusted_by` | Supabase user ID of who made a manual adjustment |

DB indexes exist on `(material_id, created_at)` for history queries.

---

## Stock Dashboard

**File:** `src/app/(dashboard)/stock/stock-client.tsx`
**Server action:** `src/lib/actions/stock.actions.ts` → `getStockDashboardMaterials()`

### Summary Cards
Four computed cards shown at the top:
- **Total Materials** — count of active materials
- **Stock Value** — sum of `current_stock × last_po_rate` for all active materials (excludes materials with no received PO rate)
- **Low Stock** — active materials where `0 < current_stock < min_level` (only when `min_level` is set)
- **Out of Stock** — active materials where `current_stock = 0`

### Table Interaction
- **Click any row** → opens the stock history drawer for that material
- **History button** (in row) → same as row click
- **Adjust button** (in row) → opens the manual adjustment dialog (fetches live stock before showing)
- **Create PO link** (in row, only for low/out-of-stock) → navigates to new PO pre-filled with that material
- All row action buttons use `stopPropagation` so they don't trigger the row's drawer click

### Low Stock Logic
A material is considered "low stock" when:
```
current_stock > 0 AND min_level IS NOT NULL AND current_stock < min_level
```
"Out of stock" = `current_stock = 0`. These determine badge color and the summary card counts.

---

## Manual Stock Adjustment

**Dialog source:** within `stock-client.tsx`

- Opens via the Adjust button on a row
- Fetches live current stock from DB when the dialog opens (not stale from page load)
- Requires a `reason` field of ≥ 10 characters
- Adjustment creates a `stock_ledger` entry with `transaction_type = ADJUSTMENT`
- Uses optimistic concurrency: the server checks that the current DB stock matches the value shown to the user before applying — if another user changed stock in between, the request is rejected

---

## Stock History Drawer

- Slide-out panel (Shadcn `Sheet` component)
- Shows last 50 ledger entries for the selected material, newest first
- `reference_label` is resolved from PO numbers and MI slip numbers on the server — displayed as "PO-0012" or "MI-0003"
- Transaction types are displayed as readable labels (`PO_INWARD` → "PO Inward", `ISSUE` → "Issue", etc.)

---

## Reports

**Files:** `src/app/(dashboard)/reports/`
**Server actions:** `src/lib/actions/reports.actions.ts`

All reports are scoped to the active financial year. Filters are applied client-side from server-fetched data, except for the Monthly Stock Report which re-fetches on filter change.

### 1. Invoice Summary Report
**File:** `invoice-summary.tsx`

Aggregates all invoices for the FY. Shows per-invoice: bill number, date, vehicle, customer, GSTIN, taxable value, CGST, SGST, IGST, gross total, discount, net amount, status.

- Cancelled invoices shown with strikethrough (via `line-through-cells` CSS utility class in `globals.css`)
- Filters: status (All/Draft/Finalized/Cancelled), vehicle, customer, date range
- CSV export respects active filters

**Note on customer filter:** Filters by `vehicles.customer_id` (live join) — not the snapshotted customer name on the invoice. If a vehicle was reassigned (rare), filter results may differ from the stored customer name.

### 2. Purchase Report
**File:** `purchase-report.tsx`

One row per **purchase order line item** (not per PO). Shows: PO number, date, supplier, supplier bill no., material, qty, unit, rate, taxable amount, CGST, SGST, IGST, total, stock flag, status.

- Supplier filter uses `purchaseOrderItems.supplier_id` (per-item supplier) — this is intentional and correct because each line item can have a different supplier
- React key for each row is `purchaseOrderItems.id` (unique per line item) — critical for correct DOM reconciliation when filters change; using PO UUID alone caused ghost row accumulation
- Filters: status, supplier, material, date range
- CSV and PDF export available

### 3. Monthly Stock Report
**File:** `monthly-stock.tsx`

Period reconciliation report. Two views:
- **Detailed view** — one row per material per month: opening stock, inward (from POs), issued (from MIs), closing stock. Optional rate column (last PO rate × closing stock).
- **Grouped view** — groups by supplier + material, shows monthly movement columns side-by-side.

Fetches from server on filter change (not just client-side filtering). Filters: material (optional), month range.

**Server action:** `getMonthlyStockReport()` in `reports.actions.ts`

### 4. Invoice Summary (removed: Supplier Report)
A standalone Supplier Report tab was built during development but was subsequently removed. Do not look for it — the Reports page has three tabs: Invoice Summary, Purchase Report, Monthly Stock.

---

## Key Files

```
src/lib/
  fy.ts                          — getCurrentFY(), fyDateRange() — pure sync, no "use server"
  actions/
    stock.actions.ts             — getStockDashboardMaterials(), getStockMovementHistory(),
                                   adjustStock(), getJobCost()
    reports.actions.ts           — getInvoiceSummaryReport(), getPurchaseReport(),
                                   getMonthlyStockReport(), getActiveVehiclesForReports()

src/app/(dashboard)/
  stock/
    page.tsx                     — server component, parallel data fetches
    stock-client.tsx             — full stock dashboard UI (table, drawers, dialogs)
  reports/
    page.tsx                     — server component, parallel data fetches
    reports-client.tsx           — tab layout (Invoice Summary / Purchase / Monthly Stock)
    invoice-summary.tsx          — Invoice Summary report
    purchase-report.tsx          — Purchase Report
    monthly-stock.tsx            — Monthly Stock Report

src/components/ui/
  sheet.tsx                      — Shadcn Sheet used by history drawer
```

---

## Gotchas

- **`fy.ts` must NOT have `"use server"`** — it exports synchronous functions (`getCurrentFY`, `fyDateRange`). The Next.js `"use server"` bundler only accepts async function exports. Import from `@/lib/fy` directly in server components; never re-export from a `"use server"` file.

- **Stock value excludes materials with no PO rate** — `StockSummary.materialsExcludedFromValue` tracks the count. If a material was never in a received PO, it has no rate and is excluded from the total value calculation.

- **Adjust dialog fetches live stock** — the current stock shown in the adjustment dialog is fetched fresh when the dialog opens, not taken from the table's loaded data. This prevents the user from adjusting based on stale numbers.

- **Purchase report ghost rows** — the React key for purchase report rows must be `purchaseOrderItems.id`, not a composite of PO UUID + material number. POs can have two items for the same material (from different suppliers), causing key collisions and orphaned DOM nodes on filter changes.
