# Phase 3 — Purchase Orders

> Purchase Orders are the **only way stock enters the warehouse** in this system. A PO records what was bought, from whom, at what price, and on what date. When marked Received, it triggers automated stock updates and creates permanent stock ledger entries.

---

## Table of Contents

1. [Overview](#1-overview)
2. [PO Lifecycle](#2-po-lifecycle)
3. [Key Design Decision: Per-Item Supplier](#3-key-design-decision-per-item-supplier)
4. [The "Update Stock" Flag (`affects_stock`)](#4-the-update-stock-flag-affects_stock)
5. [PO Form — Header Fields](#5-po-form--header-fields)
6. [Line Items — The TransactionGrid](#6-line-items--the-transactiongrid)
7. [GST Calculation Per Row](#7-gst-calculation-per-row)
8. [Validation Rules (Server-Enforced)](#8-validation-rules-server-enforced)
9. [Save as Draft](#9-save-as-draft)
10. [Mark as Received](#10-mark-as-received)
11. [Edit a Received PO](#11-edit-a-received-po)
12. [Delete a PO](#12-delete-a-po)
13. [PO List View](#13-po-list-view)
14. [Stock Ledger](#14-stock-ledger)
15. [Phase 3 Gap Fixes Applied](#15-phase-3-gap-fixes-applied)
16. [Key Files](#16-key-files)
17. [Verification Checklist](#17-verification-checklist)

---

## 1. Overview

A Purchase Order (PO) in this system:

- Is created as a **Draft** when materials are being ordered or recorded
- Is **received** when goods physically arrive — at that point, stock is updated
- Has **one supplier per line item** (not per PO header — see [Section 3](#3-key-design-decision-per-item-supplier))
- Optionally **does not update stock** (for purchases that bypass the warehouse — see [Section 4](#4-the-update-stock-flag-affects_stock))
- Is **scoped to a financial year** — PO numbers reset each April 1

---

## 2. PO Lifecycle

```
CREATE (Draft)
    │
    ├── Edit freely (items, quantities, rates, suppliers)
    │       └── Save Draft → stays Draft, no stock impact
    │
    ├── Mark as Received
    │       └── [Received]
    │               │
    │               ├── Edit Received PO
    │               │       └── Atomic: reverse old stock → apply new stock
    │               │
    │               └── Delete Received PO
    │                       ├── Safety check: would reversal cause negative stock?
    │                       │       YES → blocked with details
    │                       │       NO  → atomic stock reversal + delete
    │
    └── Delete Draft → simple delete, no stock impact
```

**Status transitions are one-directional**: Draft → Received. There is no "un-receive" button. To correct a received PO, use Edit Received (atomic reverse + reapply) or Delete (with stock reversal).

---

## 3. Key Design Decision: Per-Item Supplier

### Original Design (rejected)
One supplier per PO header. All line items inherit the same supplier.

### Final Design
Each line item has its own supplier. The PO header has no required supplier field.

### Why
In practice, a single purchase session (one trip to the market, one day's buying) involves materials from multiple vendors. The old design forced users to split what was logically one purchase session into multiple POs — one per supplier. This was extra work and fragmented the purchase history.

### DB Impact

```
purchase_orders.supplier_id     → NULLABLE (was NOT NULL in original schema)
purchase_order_items.supplier_id → per-item, authoritative
```

`purchase_orders.supplier_id` is now a **derived field**:
- Set to the single supplier's id if **all items share one supplier**
- Set to `NULL` if **items have multiple different suppliers**

This derived value is used in Phase 6 reports to filter by supplier when a PO happens to be single-supplier (the common case). It is computed by `deriveHeaderSupplierId()` in `purchase-orders.actions.ts` and stored on every create/update.

---

## 4. The "Update Stock" Flag (`affects_stock`)

A boolean on the PO header, default `true`. Shown as "Update Stock" checkbox in the form.

| `affects_stock` | What happens on Mark as Received |
|----------------|--------------------------------|
| `true` (default) | `materials.current_stock` is incremented per item. `PO_INWARD` stock ledger rows are inserted. |
| `false` | PO status is set to Received. **No stock changes. No ledger rows.** |

### Use Cases for `affects_stock = false`

- **Shop floor direct purchase**: Materials bought specifically for an active job and taken directly to the shop floor, bypassing the warehouse
- **Office consumables**: Printer paper, stationery, tools that are never tracked as warehouse stock
- **Equipment**: Machinery or capital equipment recorded for accounting but not as raw material stock

### Effect on Other Operations

All delete and edit-received operations check `affects_stock` before attempting stock changes:

```ts
if (po.affects_stock) {
  // do stock reversal
}
// always: update status / delete header
```

A non-stocking PO (affects_stock = false) can be deleted without any stock impact, even if its status is Received.

---

## 5. PO Form — Header Fields

| Field | Editable? | Notes |
|-------|----------|-------|
| PO Number | Read-only | Auto-assigned integer, formatted `PO-0001`. Scoped per financial year — resets each April 1. See [domain-rules.md](./domain-rules.md#po-number-scoping). |
| PO Date | ✅ | Defaults to today. Must fall within the active financial year (validated server-side). |
| Financial Year | Read-only | From `FYProvider` context. Displayed for clarity. |
| Update Stock | ✅ | Checkbox. Controls `affects_stock`. Default checked. Changing this on a received PO has no retroactive effect. |

---

## 6. Line Items — The TransactionGrid

The line-item grid is handled by `src/components/forms/TransactionGrid.tsx` — a reusable component that will also serve Phase 4 (Material Issues) and Phase 5 (Invoices).

### Columns

| Column | Type | How It's Populated |
|--------|------|-------------------|
| S.No | Auto | Row index |
| Material Code | Read-only | Auto-filled from selected material (`formatCode("M", material_no)`) |
| Material Name | Combobox | User selects from active materials |
| Supplier | Combobox | User selects from active suppliers, **per row** |
| Qty | Number input | User enters |
| Unit | Read-only | Auto-filled from `material.purchase_unit.unit_name` |
| Rate | Number input | Auto-filled from last received PO rate; blank + yellow if first purchase |
| Tax % | Number input | Auto-filled from `material.tax_rate.tax_percentage`; user-editable per row |
| CGST Amt | Calculated | Auto-computed based on `gst_type` |
| SGST Amt | Calculated | Auto-computed based on `gst_type` |
| IGST Amt | Calculated | Auto-computed based on `gst_type` |
| Amount | Calculated | `qty × rate` |
| ✕ | Button | Remove row (no confirmation) |

### Auto-Fill on Material Select

When a material is selected from the combobox, the following fields auto-fill immediately:

1. `material_no` → displayed as Material Code (read-only)
2. `unit_name` → auto-filled from `material.purchase_unit.unit_name` (display only; `unit_id` stored)
3. `tax_percentage` → auto-filled from `material.tax_rate.tax_percentage`
4. `rate` → fetched from server via `getLastMaterialRate(materialId)`
   - Queries the most recent **Received** PO for this material (Draft PO rates are not used — they may never be confirmed)
   - If a rate is found: fills the field
   - If no Received PO history exists: field remains blank, yellow border applied, label "First purchase — enter rate" shown below the field (`rateBlank = true` is set on the row state)

### Auto-Fill on Supplier Select

When a supplier is selected on a row:

1. `gst_type` is computed: `determineGstType(supplier.gstin, supplier.state)` → `"CGST_SGST"` or `"IGST"`
2. Tax amounts are recalculated immediately for that row using the new `gst_type`
3. `supplier_id` and `supplier_name` are stored on the row state

`gst_type` is frozen at save time — stored in `purchase_order_items.gst_type`. If a supplier's GSTIN changes later, all historical POs retain the correct tax split that was applied at the time of purchase.

### Keyboard Navigation

- `Tab` moves to the next input cell in the same row
- `Tab` on the last input of the last row appends a new empty row and focuses its first cell
- Delete row (✕) removes instantly with no confirmation modal

### Zero Rate Warning

If a row has `rate = 0` (user explicitly entered 0, not a blank first-purchase):
- Yellow border on the rate cell
- Inline checkbox: "Zero cost — confirm?"
- The form's Save/Receive button is disabled until all zero-rate rows are acknowledged
- This is enforced on the server as well — see [Section 8](#8-validation-rules-server-enforced)

---

## 7. GST Calculation Per Row

Each row independently determines its GST type based on the selected supplier. All three tax amount columns (CGST, SGST, IGST) are always shown in the grid — rows simply show 0.00 in the columns that don't apply. This prevents column layout shifting as different suppliers are selected.

### Calculation Formula

```
amount = qty × rate

if gst_type === "CGST_SGST":
  cgst_amount = round(amount × (tax_pct / 100) / 2, 2)
  sgst_amount = cgst_amount          // always equal to CGST
  igst_amount = 0

if gst_type === "IGST":
  igst_amount = round(amount × (tax_pct / 100), 2)
  cgst_amount = 0
  sgst_amount = 0
```

**Rounding**: At the line-item level (2 decimal places). Grand Total = sum of already-rounded row values. Do not recompute tax on the total — this matches standard GST invoice practice.

### Sticky Totals Bar

A bar at the bottom of the form (always visible, sticky to the viewport bottom) shows live-updating totals:

```
Subtotal: ₹XX,XXX  |  CGST: ₹X,XXX  |  SGST: ₹X,XXX  |  IGST: ₹X,XXX  |  Grand Total: ₹XX,XXX
```

All figures update in real time as rows are edited. CGST and SGST will be non-zero when there are Tamil Nadu suppliers; IGST will be non-zero when there are out-of-state suppliers. Both can be non-zero in the same PO (mixed-supplier scenario).

---

## 8. Validation Rules (Server-Enforced)

All validation runs in `validateItems()` — a shared helper called by `createPurchaseOrder`, `updatePurchaseOrder`, and `updateReceivedPurchaseOrder`. Because it runs server-side, it cannot be bypassed by crafting a direct function call from the client.

### Rule 1 — At Least One Item

```
items.length === 0 → throw "Add at least one material."
```

### Rule 2 — Every Item Must Have a Supplier

```ts
for (const item of items) {
  if (!item.supplier_id) throw new Error("All items must have a supplier selected.");
}
```

Previously this was only enforced in the UI. The server check ensures a crafted request (e.g. a direct function call without going through the form) cannot bypass it.

### Rule 3 — Duplicate Detection (Composite Key)

A duplicate is: **same material + same supplier + same rate**. This is blocked.

Allowed combinations:
- Same material + **different supplier** ✅ (two vendors supplying the same item at their own prices)
- Same material + same supplier + **different rate** ✅ (bulk order at ₹10 and urgent top-up at ₹12)
- Same material + same supplier + **same rate** ❌ (accidental double entry — combine into one row)

```ts
const seen = new Set<string>();
for (const item of items) {
  const rate = parseFloat(item.rate || "0").toFixed(2);  // normalize: "5", "5.0", "5.00" → "5.00"
  const key = `${item.material_id}|${item.supplier_id ?? ""}|${rate}`;
  if (seen.has(key)) throw new Error("Duplicate entry detected...");
  seen.add(key);
}
```

**Rate normalization** (`parseFloat(...).toFixed(2)`) is critical: without it, `"5"` and `"5.0"` would be treated as different rates, allowing true duplicates through.

### Rule 4 — Zero Rate Confirmation

```ts
if (item.rate === "0" && !item.rate_blank && !item.zero_rate_confirmed) {
  throw new Error("One or more items have a zero rate without confirmation...");
}
```

Three flags work together:
- `rate`: the submitted rate value (client converts blank to `"0"` before submitting)
- `rate_blank`: `true` when the material had no purchase history — the field was genuinely empty, not deliberately zero. Blank-rate items are **not** subject to zero-rate confirmation (the user is expected to fill it before receiving, or it's acceptable to save as Draft).
- `zero_rate_confirmed`: `true` when the user checked the "Zero cost — confirm?" checkbox. Only required when `rate === "0"` AND `rate_blank === false`.

### Rule 5 — PO Date Within Financial Year

Checked in `createPurchaseOrder` and `updatePurchaseOrder` (not in `validateItems` — date is a header-level field, not per-item):

```ts
const fyRange = getFinancialYearRange(data.financial_year);
if (poDate < fyRange.start || poDate > fyRange.end) {
  throw new Error("PO date must fall within the active financial year.");
}
```

---

## 9. Save as Draft

**What happens:**
1. Client calls `buildSubmitData()` to assemble the payload (includes `rate_blank` and `zero_rate_confirmed` per item, `affects_stock` from header state)
2. Server runs `validateItems()` + date check
3. **New PO**: inserts `purchase_orders` row (status = `'Draft'`) + all `purchase_order_items` rows. `po_number` is the next integer in the `(po_number, financial_year)` sequence.
4. **Existing Draft PO**: deletes all existing items for this po_id, inserts the new item set, updates header fields. `po_number` is not changed.
5. `revalidatePath("/transactions/purchase-orders")`
6. Redirect to edit page on new PO; stay on form for existing Draft update

No stock changes. `affects_stock` is stored but has no effect until the PO is received.

---

## 10. Mark as Received

### Confirmation Dialog

Before receiving, a confirmation dialog shows exactly which materials will be added and in what quantities:

```
Mark PO-0042 as Received?

This will add the following quantities to stock:
  • M001 — 25*3MM ANGLE     +200 KG
  • M005 — BOLTS 12MM       +500 NO

[Cancel]  [Mark as Received]
```

If `affects_stock = false`, an amber warning is shown instead: "Stock update is OFF — quantities will NOT be added to warehouse stock."

### Server Action (`receivePurchaseOrder`)

```
if (affects_stock === true):
  db.transaction():
    1. UPDATE purchase_orders SET status = 'Received'
    2. For each item:
       a. new_stock = current_stock + qty
       b. UPDATE materials SET current_stock = new_stock
       c. INSERT stock_ledger (transaction_type = 'PO_INWARD', qty_change = +qty, stock_after = new_stock)

if (affects_stock === false):
  UPDATE purchase_orders SET status = 'Received'
  (no stock operations)
```

The entire block (for `affects_stock = true`) is a single `db.transaction()`. If any insert or update fails, all are rolled back — the PO stays as Draft, stock is unchanged.

---

## 11. Edit a Received PO

### UI
An amber, non-dismissable warning banner appears at the top of the form:
> "⚠ This PO has already been received. Any changes will reverse the current stock additions and reapply them with the new values. This is an atomic operation."

The form is fully editable. The save button label changes to "Save & Reapply Stock".

### Server Action (`updateReceivedPurchaseOrder`)

```
if (affects_stock === true):
  db.transaction():
    1. Fetch current items from DB (to know the OLD quantities)
    2. For each OLD item:
       a. reversed_stock = current_stock - old_qty
       b. UPDATE materials SET current_stock = reversed_stock
       c. INSERT stock_ledger (type = 'REVERSAL', qty_change = -old_qty, stock_after = reversed_stock)
    3. Delete old purchase_order_items for this po_id
    4. Insert new purchase_order_items (new quantities)
    5. For each NEW item:
       a. new_stock = current_stock + new_qty  (current_stock is now the post-reversal value)
       b. UPDATE materials SET current_stock = new_stock
       c. INSERT stock_ledger (type = 'PO_INWARD', qty_change = +new_qty, stock_after = new_stock)
    6. Update purchase_orders header (date, total_amount, affects_stock, supplier_id)

if (affects_stock === false):
  Delete old items, insert new items, update header
  (no stock operations)
```

Full rollback on any failure. The PO remains in its previous state if the transaction fails.

---

## 12. Delete a PO

### Delete Draft PO

Simple: ConfirmDialog → delete `purchase_orders` (CASCADE deletes `purchase_order_items`). No stock impact.

### Delete Received PO (`affects_stock = false`)

Same as Draft: ConfirmDialog → delete. No stock operations needed.

### Delete Received PO (`affects_stock = true`)

**Step 1 — Safety Check (before showing confirm dialog)**:

For each item in the PO, check:
```ts
const afterReversal = parseFloat(item.current_stock) - parseFloat(item.qty);
if (afterReversal < 0) {
  throw new Error(
    `Cannot delete: reversing this PO would bring ${item.name} stock to ${afterReversal.toFixed(2)} ` +
    `(current: ${item.current_stock}). Reduce issued quantities first.`
  );
}
```

**Why this check (not a "was it ever issued?" check)**: The old approach blocked deletion if any material from this PO was ever issued, even if current stock was 500 and the reversal was only 10. That was too strict — it prevented legitimate corrections. The quantity-aware check only blocks when the reversal would actually cause a problem (stock going negative).

**Step 2 — Confirm Dialog** (shown only if safety check passes):

```
Deleting this received PO will remove the following quantities from stock:
  • M001 — 25*3MM ANGLE    −200 KG
  • M005 — BOLTS 12MM      −500 NO
This cannot be undone.

[Cancel]  [Delete & Reverse Stock]
```

**Step 3 — Atomic Transaction**:

```
db.transaction():
  For each item:
    a. new_stock = current_stock - qty
    b. UPDATE materials SET current_stock = new_stock
    c. INSERT stock_ledger (type = 'REVERSAL', qty_change = -qty, stock_after = new_stock)
  DELETE purchase_orders WHERE id = $id  (CASCADE deletes items)
```

---

## 13. PO List View

The list shows **one row per line item** (not one row per PO). This allows filtering by material and supplier — which is more useful than filtering by PO group.

Multiple rows share the same PO number when a PO has multiple line items. The Edit and Delete action buttons on any row open/affect the full PO (not just that line item).

### Columns

```
S.No | Date | PO# | Material Code | Material Name | Supplier | Qty | Unit | Rate | Tax | Amount | Status | Actions
```

- **Date**: `DD/MM/YYYY`
- **PO#**: `PO-0001` (monospace)
- **Material Code**: `M001` format
- **Tax**: Shows IGST amount if `> 0`, else CGST + SGST combined
- **Status badge**: Green = Received, Grey = Draft
- **"no stock" indicator**: Shown next to status when `affects_stock = false`

### Filters

- **Status tabs**: All | Draft | Received (with counts)
- **Date range**: From / To date inputs
- **Search**: Matches across supplier name, material name, and material code (M001 / "1" / "M1" all work)
- **Financial year selector**: Switching FY re-fetches data for that year

---

## 14. Stock Ledger

`stock_ledger` is an append-only audit table. Rows are **never updated or deleted**.

Every stock-affecting operation must create a row:

| Operation | `transaction_type` | `qty_change` |
|-----------|-------------------|-------------|
| PO Received | `PO_INWARD` | `+qty` |
| Received PO edited (old side) | `REVERSAL` | `-old_qty` |
| Received PO edited (new side) | `PO_INWARD` | `+new_qty` |
| Received PO deleted | `REVERSAL` | `-qty` |
| Material issued (Phase 4) | `ISSUE` | `-qty` |
| Stock adjustment (Phase 4) | `ADJUSTMENT` | `±qty` |

### Key Columns

```
material_id       → which material's stock changed
transaction_type  → why it changed
reference_id      → UUID of the source record (po_id, issue_id, etc.)
reference_type    → 'purchase_order', 'material_issue', etc.
qty_change        → signed number (+200 or -200)
stock_after       → balance after this transaction (stored for fast lookups)
created_at        → when this event occurred
```

`stock_after` is stored on each row so that you can reconstruct the stock history at any point in time without summing all prior `qty_change` values. A query like "what was the stock of M001 on 15-Jan-2026?" becomes a simple `WHERE material_id = X AND created_at <= '2026-01-15' ORDER BY created_at DESC LIMIT 1` on `stock_after`.

---

## 15. Phase 3 Gap Fixes Applied

Six gaps were identified after Phase 3 shipped. All are documented here with the problem, the fix, and the reasoning.

---

### Gap 1 — Zero-Rate Server Validation

**Problem**: `zeroRateConfirmed` was client state only. The UI would disable the save button until confirmed, but a developer could call `createPurchaseOrder()` directly (bypassing the UI) with `rate = "0"` and no confirmation.

**Fix**: Added `zero_rate_confirmed: boolean` and `rate_blank: boolean` to `LineItemInput`. `validateItems()` enforces the check server-side.

**`rate_blank` distinction**: The client converts empty rate fields to `"0"` before submitting (for numeric consistency). Without `rate_blank`, the server couldn't distinguish "user deliberately entered 0" from "no purchase history, field was empty." `rate_blank = true` bypasses the zero-rate check — a material being purchased for the first time with no prior rate is expected to have a blank/zero rate in a Draft PO.

---

### Gap 2 — Duplicate Material Detection (Composite Key)

**Problem**: No server-side duplicate check. A user could accidentally add the same material twice, doubling the stock on receive.

**Evolution of the rule** (went through 3 iterations):
1. First version: block on `material_id` alone → **Too strict.** Same material from Supplier A and Supplier B is valid.
2. Second version: block on `material_id + supplier_id` → **Still too strict.** Same material + same supplier at ₹10 (bulk) and ₹12 (urgent) is a legitimate scenario.
3. Final version: block on `material_id + supplier_id + rate` → **Correct.** If all three match, it is definitively an accidental double entry.

**Rate normalization**: `parseFloat(item.rate || "0").toFixed(2)` before building the key. Without this, `"5"` vs `"5.0"` vs `"5.00"` would be treated as different rates, allowing real duplicates through.

---

### Gap 3 — Delete Hard-Block (Quantity-Aware)

**Problem**: Old check blocked deletion of a received PO if any material from it was **ever** issued to a job — even when current stock was 500 and the PO reversal was only 10. This caused false positives and prevented legitimate corrections.

**Fix**: Replaced the "was it ever issued?" check with a quantity-aware stock check:

```ts
const afterReversal = parseFloat(item.current_stock) - parseFloat(item.qty);
if (afterReversal < 0) { throw error; }
```

Only blocks when the reversal would actually cause stock to go negative. If current stock is high enough to absorb the reversal, deletion proceeds.

---

### Gap 4 — Header `supplier_id` Derived from Items

**Problem**: `purchase_orders.supplier_id` was always `NULL` after the per-item supplier redesign. This field is used in Phase 6 reports to filter POs by supplier. Without it, single-supplier POs (which are the majority) would be invisible in supplier-filtered report queries.

**Fix**: Added `deriveHeaderSupplierId()` helper:

```ts
function deriveHeaderSupplierId(items: LineItemInput[]): string | null {
  const ids = Array.from(new Set(items.map((i) => i.supplier_id).filter(Boolean)));
  return ids.length === 1 ? ids[0] : null;
}
```

Called in `createPurchaseOrder`, `updatePurchaseOrder`, and `updateReceivedPurchaseOrder`. Result stored in `purchase_orders.supplier_id`.

Multi-supplier POs still get `NULL` — that's correct and expected for Phase 6 queries (filter by supplier would only match single-supplier POs where the header id is set).

---

### Gap 5 (Cleanup A) — Server-Side Supplier Check per Item

**Problem**: `validateItems()` initially had no check for missing `supplier_id` per item. The UI prevented submitting without a supplier, but the server function itself was not enforcing it.

**Fix**: Added an explicit check in `validateItems()`:

```ts
for (const item of items) {
  if (!item.supplier_id) throw new Error("All items must have a supplier selected.");
}
```

---

### Gap 6 (Cleanup B) — Rate Normalization in Duplicate Key

**Problem**: Without normalization, `"5"` and `"5.0"` build different composite keys — `"mat1|sup1|5"` vs `"mat1|sup1|5.0"` — and the duplicate check misses the true duplicate.

**Fix**: `parseFloat(item.rate || "0").toFixed(2)` applied before building the key. All representations of the same rate produce identical strings.

---

## 16. PDF Print Feature

Added after the core PO module shipped. Allows printing individual Purchase Order slips directly from the list view.

### How It Works

1. The list view has a **"Print (N)"** button (where N = number of visible rows after filters).
2. Clicking it generates a PDF **in the browser** (client-side, using `@react-pdf/renderer`) and opens it in a new tab for print preview.
3. No file is downloaded automatically — the browser's native PDF viewer opens with its built-in Print button.

### "Include Rates" Checkbox

A checkbox labeled "Include rates" sits next to the Print button. When unchecked (default), the PDF shows only: S.No | Material Name | Qty | Unit — suitable for shop floor use where rates should not be visible. When checked, Rate and Amount columns are added, plus a Total line.

### PDF Layout (per page)

Each PO gets its own page (portrait A4). The layout matches the client's traditional document format:

```
                    DURGA INDUSTRIES
   S.FNO.1994/2, MADURAI NEW BYE PASS RD, NEAR PERIYAR ARCH, KARUR - 639002
                    GSTIN: 33AALPU5476B1ZJ

                      PURCHASE ORDER

PURCHASE ORDER NO.  : PO-0001
DATE                : 21/05/2026
SUPPLIER NAME       : Sudharshan
──────────────────────────────────────────────────
S No.   Material Name                      Qty     Unit
──────────────────────────────────────────────────
  1     BOLT                           10.000       NO
──────────────────────────────────────────────────

                    Pg.No.:1    For DURGA INDUSTRIES
```

- Company name: centered, bold, 16pt
- Address + GSTIN: centered, 8pt
- Document type: centered, bold, 11pt
- Info block: left-aligned label:value pairs
- Table: no colored backgrounds, no alternating row stripes, solid separator lines only
- Qty formatted to 3 decimal places (`10.000`)
- Footer: page number + company name (right-aligned, repeats on every page)

### Key Files

```
src/components/pdf/
  pdf-styles.ts          ← Shared styles (document-format), company constants, fmtAmt/fmtQty/fmtDate helpers
  po-register-pdf.tsx    ← PORegisterDocument component (one Page per PO)
  print-button.tsx       ← PrintButton — lazy PDF generation, window.open() for browser preview
```

---

## 17. Key Files

```
src/lib/actions/
  purchase-orders.actions.ts
    ├── getActiveSuppliers()
    ├── getActiveMaterials()
    ├── getActiveUnits()
    ├── getLastMaterialRate(materialId)
    ├── getPurchaseOrders(financialYear)    ← returns one row per line item (expanded)
    ├── getPurchaseOrderById(id)
    ├── createPurchaseOrder(data)
    ├── updatePurchaseOrder(id, data)
    ├── receivePurchaseOrder(id)
    ├── updateReceivedPurchaseOrder(id, data)
    ├── deletePurchaseOrder(id)
    ├── validateItems(items)               ← shared validation helper (gaps 1–2 + cleanup A–B)
    └── deriveHeaderSupplierId(items)      ← gap 4 fix

src/app/(dashboard)/transactions/purchase-orders/
  page.tsx                                ← Server: fetches POs for current FY
  purchase-orders-client.tsx              ← list view with filters + Print button
  po-form.tsx                             ← create / edit / view form + sticky totals bar

src/components/forms/
  TransactionGrid.tsx                     ← Reusable line-item grid (also used by Phase 4)

src/components/pdf/
  pdf-styles.ts                           ← Shared document-format styles and helpers
  po-register-pdf.tsx                     ← PO PDF document component
  print-button.tsx                        ← Generic print trigger button
```

---

## 18. Verification Checklist

After any change to PO logic, verify these scenarios manually:

| # | Scenario | Expected Result |
|---|---------|----------------|
| 1 | Create PO, all items from same supplier → check DB | `purchase_orders.supplier_id` = that supplier's UUID |
| 2 | Create PO with items from two different suppliers → check DB | `purchase_orders.supplier_id` = NULL |
| 3 | Save draft with rate = `"0"` + zero-rate checkbox unchecked → submit | Server throws "zero rate without confirmation" error |
| 4 | Save draft with blank rate (first purchase, `rateBlank = true`) → submit | Server accepts |
| 5 | Add same material + same supplier + same rate twice | Server throws "Duplicate entry detected" |
| 6 | Add same material + different supplier | Server accepts |
| 7 | Add same material + same supplier + different rate | Server accepts |
| 8 | Delete received PO where reversal does NOT cause negative stock | Deletes successfully |
| 9 | Delete received PO where reversal WOULD cause negative stock | Server throws with material name and numbers |
| 10 | Create PO with "Update Stock" unchecked → receive → check DB | `materials.current_stock` unchanged; no `stock_ledger` rows inserted |
| 11 | Create PO with "Update Stock" checked → receive → check DB | `materials.current_stock` increased; `PO_INWARD` rows in `stock_ledger` |
| 12 | Edit a received PO → check DB before and after | Net effect: stock differences from old vs new quantities reflected; paired REVERSAL + PO_INWARD ledger rows |
