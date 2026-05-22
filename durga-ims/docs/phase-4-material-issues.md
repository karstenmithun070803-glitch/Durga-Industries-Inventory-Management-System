# Phase 4 — Material Issues

> Material Issues record when materials leave the warehouse for a job. Every issue slip is tied to a specific vehicle/job, reduces `current_stock` atomically when confirmed, and creates permanent stock ledger entries. Phase 4 closes the stock-management loop that Phase 3 opened: **POs add stock, Issues remove it.**

---

## Table of Contents

1. [Overview](#1-overview)
2. [Material Issue Lifecycle](#2-material-issue-lifecycle)
3. [Key Design Decisions](#3-key-design-decisions)
4. [Database Schema](#4-database-schema)
5. [Form — Header Fields](#5-form--header-fields)
6. [Line Items — TransactionGrid in Material-Issue Mode](#6-line-items--transactiongrid-in-material-issue-mode)
7. [GST Handling — Header-Level vs Per-Row](#7-gst-handling--header-level-vs-per-row)
8. [Validation Rules (Server-Enforced)](#8-validation-rules-server-enforced)
9. [Save as Draft](#9-save-as-draft)
10. [Issue Materials (Confirm)](#10-issue-materials-confirm)
11. [Edit a Draft Slip](#11-edit-a-draft-slip)
12. [Edit a Confirmed (Issued) Slip](#12-edit-a-confirmed-issued-slip)
13. [Delete a Slip](#13-delete-a-slip)
14. [Material Issues List View](#14-material-issues-list-view)
15. [PDF Print Feature](#15-pdf-print-feature)
16. [Lessons Applied from Phase 3](#16-lessons-applied-from-phase-3)
17. [Key Files](#17-key-files)
18. [Verification Checklist](#18-verification-checklist)

---

## 1. Overview

A Material Issue slip in this system:

- Records materials taken from the warehouse for a **specific vehicle/job**
- Is created as a **Draft** and confirmed by clicking "Issue Materials"
- Has one or more line items, each with an **optional contractor** assignment
- Each line item has an **`affects_inventory`** flag — rows can be marked as pass-through (recorded on the slip but not deducted from stock)
- Reduces `materials.current_stock` atomically when confirmed
- Is **scoped to a financial year** — slip numbers reset each April 1
- Has a **GST type** derived from the customer attached to the selected vehicle — the same type applies to all rows on the slip

---

## 2. Material Issue Lifecycle

```
CREATE (Draft)
    │
    ├── Edit freely (items, contractor, qty, rate)
    │       └── Save Draft → stays Draft, no stock impact
    │
    ├── Issue Materials (confirm)
    │       └── [Issued]
    │               │
    │               ├── Edit Issued Slip
    │               │       └── Atomic: reverse old stock → apply new stock
    │               │
    │               └── Delete Issued Slip
    │                       └── Atomic: reverse stock (add back) → delete
    │
    └── Delete Draft → simple delete, no stock impact
```

**Status transitions are one-directional**: Draft → Issued. There is no "un-issue" button. To correct a confirmed slip, use Edit (atomic reverse + reapply) or Delete (with stock restoration).

**Key difference from POs**: Deleting an Issued slip **always adds stock back** — this never causes negative stock. Compare to deleting a Received PO, which *removes* stock and could go negative. This asymmetry means deletion of Issued slips has no safety pre-check.

---

## 3. Key Design Decisions

### 3.1 — Per-Item Contractor (Optional)

A single issue slip can have materials going to different contractors. For example, Contractor A handles fabrication (uses ANGLE), Contractor B handles welding (uses BOLTS). Both are on the same job (same vehicle/slip), so they appear as separate rows on the same slip rather than separate slips.

`contractor_id` is nullable — many materials are issued directly for the job without being assigned to a specific contractor.

### 3.2 — Per-Item `affects_inventory` Flag

Not every line item on a slip necessarily reduces warehouse stock. The `affects_inventory` boolean controls this per row (default: `true`).

| `affects_inventory` | Stock impact on Issue | Stock ledger row |
|---------------------|----------------------|-----------------|
| `true` (default) | `current_stock -= qty` | `ISSUE` row inserted |
| `false` | No change | No row inserted |

Use cases for `affects_inventory = false`:
- **Tools and equipment** that are temporarily lent to a job (not consumed)
- **Pass-through items** that are recorded on the slip for billing purposes but were purchased separately and never passed through the warehouse
- **Services or labour charges** being captured on the issue document for costing

**Stock availability check aggregates by `material_id`**: If a slip has two rows for the same material (e.g. M001 × 10 for Contractor A and M001 × 15 for Contractor B), the availability check sums both (`25` total) before comparing to `current_stock`. Individual row checks would miss this aggregation and allow a combined over-issue.

### 3.3 — GST Type is Header-Level (Not Per-Row)

Unlike Purchase Orders (where each row has its own supplier with its own GSTIN, making the GST type per-row), Material Issues have a single job/customer context. All materials on a slip go to the same customer and therefore share one GST type.

**Derivation**: When a vehicle is selected, the system looks up the customer attached to that vehicle and calls `determineGstType(customer.gstin, customer.state)`. The result (`"CGST_SGST"` or `"IGST"`) is passed as a single `gstType` prop to the TransactionGrid — all rows use it.

When the vehicle is changed, all rows recalculate their tax amounts using the new GST type.

### 3.4 — Sales Unit (not Purchase Unit)

In Purchase Orders, the unit used is the **purchase unit** (e.g. buy BOLT in BOX).

In Material Issues, the unit used is the **sales unit** (e.g. issue BOLT as NO/pieces). The sales unit is the field `material.sales_unit_id`. If no sales unit is set, the system falls back to `purchase_unit_id`. If neither is set, an amber "⚠ Not set" warning is shown in the Unit column.

This matters for conversion: if a material was bought in BOX (purchase unit) and issued in NO (sales unit), the qty on the issue slip is in NO, not BOX.

---

## 4. Database Schema

### `material_issues` (header table)

```sql
CREATE TABLE material_issues (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slip_number      INTEGER NOT NULL,
  financial_year   TEXT NOT NULL,
  issue_date       DATE NOT NULL,
  vehicle_id       UUID NOT NULL REFERENCES vehicles(id),
  status           TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Issued')),
  margin_percentage NUMERIC(5,2) DEFAULT 0,
  total_amount     NUMERIC(15,2) DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (slip_number, financial_year)
);
```

Key constraints:
- `UNIQUE(slip_number, financial_year)`: Slip numbers restart at 1 each April 1 — uniqueness is scoped per FY.
- `vehicle_id NOT NULL`: Every issue must be tied to a job.
- `status` check constraint: only `'Draft'` and `'Issued'` are valid — no typos can sneak in.

### `material_issue_items` (line items)

```sql
CREATE TABLE material_issue_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id         UUID NOT NULL REFERENCES material_issues(id) ON DELETE CASCADE,
  material_id      UUID NOT NULL REFERENCES materials(id),
  hsn_code         TEXT,
  qty              NUMERIC(15,3) NOT NULL,
  unit_id          UUID REFERENCES units(id),
  rate             NUMERIC(15,2) DEFAULT 0,
  tax_percentage   NUMERIC(5,2) DEFAULT 0,
  cgst_amount      NUMERIC(15,2) DEFAULT 0,
  sgst_amount      NUMERIC(15,2) DEFAULT 0,
  igst_amount      NUMERIC(15,2) DEFAULT 0,
  amount           NUMERIC(15,2) DEFAULT 0,
  gst_type         TEXT,
  contractor_id    UUID REFERENCES contractors(id),
  affects_inventory BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT now()
);
```

Key design notes:
- `ON DELETE CASCADE`: deleting the header automatically deletes all line items. No orphan items.
- `gst_type`: frozen at save time (same reason as in PO items — historical integrity).
- `hsn_code`: copied from the material master at the time of creating the slip (denormalized). If the material's HSN changes later, the slip retains the value that was correct at issue time.
- `contractor_id`: nullable — items without a contractor are perfectly valid.

---

## 5. Form — Header Fields

| Field | Editable? | Notes |
|-------|----------|-------|
| Slip Number | Read-only | Auto-assigned integer, formatted `MI-0001`. Scoped per financial year. |
| Issue Date | ✅ | Defaults to today. Must fall within the active financial year (server-validated). |
| Financial Year | Read-only | From `FYProvider` context. |
| Vehicle / Job | ✅ | Combobox showing `J00001 — TN01AB1234 — Customer Name`. Selecting a vehicle auto-fills Customer Name, Customer GSTIN, Customer State, and derives GST Type. |
| Customer Name | Read-only | Auto-filled from selected vehicle's customer. Display only. |
| GST Type Badge | Read-only | Derived from customer GSTIN/state. Green badge = "CGST + SGST", Blue badge = "IGST". Updates when vehicle changes. |
| Margin % | ✅ | Optional. Stored but not yet used in calculations. Reserved for Phase 5 invoice costing. |

### Vehicle Selection Auto-Fill Chain

```
User selects vehicle
  ↓
System looks up vehicle.customer_id
  ↓
Fetches customer (name, gstin, state)
  ↓
Computes gstType = determineGstType(customer.gstin, customer.state)
  ↓
Updates:
  - customer_name (displayed read-only)
  - gstType prop on TransactionGrid → all row tax amounts recalculate
```

---

## 6. Line Items — TransactionGrid in Material-Issue Mode

The same `TransactionGrid` component used by Purchase Orders is reused here with `mode="material-issue"`. The mode prop activates issue-specific columns and hides PO-specific ones.

### Columns (Material Issue Mode)

| Column | Type | Notes |
|--------|------|-------|
| S.No | Auto | Row index |
| Material Code | Read-only | Auto-filled from selected material (`M001` format) |
| Material Name | Combobox | User selects from active materials |
| HSN | Read-only | Auto-filled from `material.hsn_code`. Display only. |
| Contractor | Combobox | Optional. Selects from active contractors. "None" / blank = no contractor. |
| Affects Stock | Checkbox | Per row. Default `true`. Unchecking marks the row as pass-through. |
| Qty | Number input | User enters |
| Unit | Read-only | Auto-filled from `material.sales_unit_id`; falls back to `purchase_unit_id`; amber warning if neither |
| Rate | Number input | Auto-filled from last received PO rate; blank + yellow if first purchase |
| Tax % | Number input | Auto-filled from `material.tax_rate.tax_percentage`; user-editable |
| CGST Amt | Calculated | Uses header-level `gstType` |
| SGST Amt | Calculated | Uses header-level `gstType` |
| IGST Amt | Calculated | Uses header-level `gstType` |
| Amount | Calculated | `qty × rate` |
| ✕ | Button | Remove row (no confirmation) |

**Hidden in material-issue mode** (shown in PO mode): Supplier column.

### Auto-Fill on Material Select

When a material is selected:
1. `material_no` → Material Code column
2. `hsn_code` → HSN column
3. `unit_id` + `unit_name` → Unit column (sales unit → purchase unit → amber warning)
4. `tax_percentage` → Tax % column — directly from the DB join (`getActiveIssueMaterials()` returns `tax_percentage` on each material row via a JOIN on `tax_rates`)
5. `rate` → auto-filled from `getLastMaterialRate(materialId)` (same as PO mode)

### Tax % Auto-Fill — How It Works

`getActiveIssueMaterials()` JOINs `materials` with `tax_rates` and returns `tax_percentage` directly on each material object. The `handleMaterialSelect` function in TransactionGrid uses this value directly:

```ts
const taxPct =
  mat.tax_percentage ??                                                    // Issue mode: from DB join
  (mat.tax_rate_id ? taxRates.find(t => t.id === mat.tax_rate_id)?.tax_percentage : null) ??  // PO mode fallback
  "0";
```

This is backward-compatible: PO mode uses the `taxRates` array lookup (unchanged behavior), Issue mode uses the direct value from the material object.

---

## 7. GST Handling — Header-Level vs Per-Row

This is the **most important difference** between the PO grid and the Issue grid.

| Aspect | Purchase Orders | Material Issues |
|--------|----------------|----------------|
| GST type determined by | Supplier GSTIN (per row) | Customer GSTIN (per header) |
| `gstType` prop | Not used (each row computes its own) | Passed as single prop, applies to all rows |
| When type changes | On supplier select (one row recalculates) | On vehicle select (all rows recalculate) |

### Formula

Same formula as PO (see [phase-3-purchase-orders.md § 7](./phase-3-purchase-orders.md#7-gst-calculation-per-row)):

```
amount = qty × rate

if gstType === "CGST_SGST":
  cgst_amount = round(amount × (tax_pct / 100) / 2, 2)
  sgst_amount = cgst_amount
  igst_amount = 0

if gstType === "IGST":
  igst_amount = round(amount × (tax_pct / 100), 2)
  cgst_amount = 0
  sgst_amount = 0
```

`gst_type` is frozen per item at save time (stored in `material_issue_items.gst_type`) for the same reason as in PO items: if the customer's GSTIN changes, historical slips retain the correct tax split.

---

## 8. Validation Rules (Server-Enforced)

All validation runs in `validateIssueItems()` — called by `createMaterialIssue`, `updateMaterialIssue`, `updateIssuedMaterialIssue`. Runs server-side; cannot be bypassed.

### Rule 1 — At Least One Item
```
items.length === 0 → throw "Add at least one material."
```

### Rule 2 — Every Item Must Have a Material Selected
```ts
if (!item.material_id) throw "All items must have a material selected."
```

### Rule 3 — Qty > 0 on Every Row
```ts
if (parseFloat(item.qty) <= 0) throw "All quantities must be greater than zero."
```

### Rule 4 — No Duplicate Rows (Composite Key)

Duplicate key: `material_id | contractor_id | normalized_rate`

Same logic as PO (see [phase-3-purchase-orders.md § Gap 2](./phase-3-purchase-orders.md#gap-2--duplicate-material-detection-composite-key)):
- Same material + different contractor = ✅ allowed
- Same material + same contractor + different rate = ✅ allowed
- Same material + same contractor + same rate = ❌ blocked

Rate normalized with `parseFloat(rate || "0").toFixed(2)` before building the key.

### Rule 5 — Zero Rate Confirmation
```ts
if (item.rate === "0" && !item.rate_blank && !item.zero_rate_confirmed)
  throw "One or more items have a zero rate without confirmation."
```

Same three-flag pattern as PO (see [phase-3-purchase-orders.md § Gap 1](./phase-3-purchase-orders.md#gap-1--zero-rate-server-validation)).

### Rule 6 — Issue Date Within Financial Year
```ts
const fyRange = getFinancialYearRange(data.financial_year);
if (issueDate < fyRange.start || issueDate > fyRange.end)
  throw "Issue date must fall within the active financial year."
```

### Rule 7 — Vehicle Required
```ts
if (!data.vehicle_id) throw "Vehicle is required."
```

---

## 9. Save as Draft

1. Client assembles payload (header + items array, each with `rate_blank`, `zero_rate_confirmed`, `affects_inventory`, `contractor_id`)
2. Server runs `validateIssueItems()` + date check + vehicle check
3. **New slip**: inserts `material_issues` header (status = `'Draft'`) + all items; `slip_number` = `MAX(slip_number) + 1` for this FY, or 1 if none exist
4. **Existing Draft**: deletes old items, inserts new items, updates header
5. `revalidatePath("/transactions/material-issues")`

No stock changes. `affects_inventory` is stored but has no effect until the slip is confirmed.

---

## 10. Issue Materials (Confirm)

### Pre-Check on Client (Before Dialog Opens)

When the user clicks "Issue Materials", a pre-check runs client-side:

```
For each row where affects_inventory = true:
  If row.qty > material.current_stock:
    Show amber warning "Insufficient stock for [Material Name]"
    Disable the confirm button
```

This is a UX convenience only — the server independently validates stock availability.

### Confirmation Dialog

Shows exactly what will be deducted:

```
Confirm Issue Slip MI-0003?

Quantities removed from stock:
  • M001 — 25*3MM ANGLE      −20 KG
  • M005 — BOLTS 12MM        −50 NO

Pass-through (no stock change):
  • M010 — GRINDING WHEEL    (affects_inventory = false)

[Cancel]   [Issue Materials]
```

### Server Action (`issueMaterialIssue`)

```
1. Fetch slip + items from DB
2. Verify status === 'Draft' (throw if already Issued)
3. checkStockAvailability(items):
   a. Aggregate qty by material_id (items with affects_inventory = false are skipped)
   b. For each material_id: if current_stock < total_requested → throw with name + amounts
4. db.transaction():
   a. UPDATE material_issues SET status = 'Issued'
   b. For each item where affects_inventory = true:
      i.  new_stock = current_stock - qty
      ii. UPDATE materials SET current_stock = new_stock
      iii.INSERT stock_ledger (type = 'ISSUE', qty_change = -qty, stock_after = new_stock)
5. revalidatePath
```

**Stock aggregation is critical** (Rule from [Section 3.2](#32--per-item-affects_inventory-flag)): Two rows for the same material on the same slip are summed before checking availability. Without this, the check could approve each row individually even when the combined total exceeds stock.

---

## 11. Edit a Draft Slip

1. Load slip into the form (mode = `"edit-draft"`)
2. Full editing allowed — all header and item fields editable
3. Save behavior is identical to creating a new slip: delete old items, insert new items, update header
4. Attempting to edit a slip that has already been Issued → server throws "Cannot edit a confirmed issue slip."

---

## 12. Edit a Confirmed (Issued) Slip

### UI

An amber, non-dismissable warning banner appears at the top:
> "⚠ This slip has been confirmed. Saving will reverse current stock reductions and reapply them with the new values."

The form is fully editable. The save button label changes to "Save & Reapply".

### Server Action (`updateIssuedMaterialIssue`)

```
db.transaction():
  1. Fetch OLD items from DB
  2. For each OLD item (affects_inventory = true):
     a. reversed_stock = current_stock + old_qty   ← adding back (reversing the deduction)
     b. UPDATE materials SET current_stock = reversed_stock
     c. INSERT stock_ledger (type = 'REVERSAL', qty_change = +old_qty, stock_after = reversed_stock)
  3. Delete old material_issue_items
  4. Insert new material_issue_items
  5. checkStockAvailability(new_items)  ← runs INSIDE the transaction, after reversal
     (post-reversal stock is higher, so this check is more permissive)
  6. For each NEW item (affects_inventory = true):
     a. new_stock = current_stock - new_qty
     b. UPDATE materials SET current_stock = new_stock
     c. INSERT stock_ledger (type = 'ISSUE', qty_change = -new_qty, stock_after = new_stock)
  7. Update material_issues header
```

**Why check availability inside the transaction after reversal?** Because the reversal restores the old quantities first, giving the stock check a more accurate current state to evaluate against. This prevents false "insufficient stock" errors when the edit is making quantities smaller rather than larger.

Full rollback on any failure.

---

## 13. Delete a Slip

### Delete Draft Slip

Simple: ConfirmDialog → delete `material_issues` (CASCADE deletes items). No stock impact.

### Delete Issued Slip

Unlike deleting a Received PO (which *removes* stock and might cause negatives), deleting an Issued slip **adds stock back**. This can never cause stock to go negative. Therefore **no safety pre-check is needed**.

```
db.transaction():
  Fetch items from DB
  For each item (affects_inventory = true):
    a. restored_stock = current_stock + qty
    b. UPDATE materials SET current_stock = restored_stock
    c. INSERT stock_ledger (type = 'REVERSAL', qty_change = +qty, stock_after = restored_stock)
  DELETE material_issues WHERE id = $id  (CASCADE deletes items)
```

> **Note (Phase 5 bridge)**: Before deleting an Issued slip, Phase 5 will need to check if the slip is referenced in any Invoice. A TODO comment is placed in `deleteMaterialIssue()`:
> ```ts
> // TODO Phase 5: check invoices WHERE issue_id = $id AND status != 'Cancelled' LIMIT 1
> // If found: throw "Cannot delete: referenced in Invoice INV-XXXX."
> ```

---

## 14. Material Issues List View

The list shows **one row per line item** (same pattern as PO list — see reasoning in [phase-3-purchase-orders.md § 13](./phase-3-purchase-orders.md#13-po-list-view)).

### Columns

```
S.No | Date | Slip# | Vehicle | Customer | Mat. Code | HSN | Material Name | Contractor | Qty | Unit | Rate | Tax | Amount | Affects Stock | Status | Actions
```

- **Slip#**: `MI-0001` format via `formatCode("MI-", slip_number, 4)`
- **Affects Stock**: Green tick (✓) = affects inventory; Grey dash (—) = pass-through
- **Status badge**: Grey = Draft, Emerald = Issued
- **Actions**: View (eye), Edit (pencil), Delete (trash)

### Filters

- **Status tabs**: All | Draft | Issued
- **Date range**: From / To date inputs
- **Search**: Matches across slip number, vehicle name, customer name, material name, material code, contractor name
- **Financial year selector**: Switching FY re-fetches all data for that year

### FY Change Re-fetch

When the active financial year changes (via the FY banner), the client detects `activeFY !== loadedFY` and calls `getMaterialIssues(activeFY)` to reload. This is the same pattern used in the PO list.

---

## 15. PDF Print Feature

Same architecture as the PO PDF (see [phase-3-purchase-orders.md § 16](./phase-3-purchase-orders.md#16-pdf-print-feature)).

### Differences from PO PDF

| Aspect | PO PDF | Material Issue PDF |
|--------|--------|--------------------|
| Document title | PURCHASE ORDER | MATERIAL ISSUE SLIP |
| Info block fields | PO No / Date / Supplier | Slip No / Date / Vehicle / Job No / Customer |
| Table columns (no rates) | S.No / Material / Qty / Unit | S.No / Material / Contractor / Qty / Unit |
| Table columns (with rates) | + Rate / Amount | + Rate / Amount |
| One page per | PO | Issue Slip |

### PDF Layout Example

```
                    DURGA INDUSTRIES
   S.FNO.1994/2, MADURAI NEW BYE PASS RD, NEAR PERIYAR ARCH, KARUR - 639002
                    GSTIN: 33AALPU5476B1ZJ

                   MATERIAL ISSUE SLIP

SLIP NO.            : MI-0001
DATE                : 21/05/2026
VEHICLE / JOB       : TN01AB1234  (J00001)
CUSTOMER            : ABC Industries
──────────────────────────────────────────────────
S No.   Material Name      Contractor   Qty     Unit
──────────────────────────────────────────────────
  1     25*3MM ANGLE       Rajan     20.000       KG
  2     BOLTS 12MM         —         50.000       NO
──────────────────────────────────────────────────

                    Pg.No.:1    For DURGA INDUSTRIES
```

### Key File

```
src/components/pdf/mi-register-pdf.tsx    ← MIRegisterDocument component
```

---

## 16. Lessons Applied from Phase 3

Phase 4 was built with explicit awareness of every gap that was discovered and fixed in Phase 3. The table below shows how each lesson was applied:

| Phase 3 Gap | Phase 4 Application |
|-------------|---------------------|
| Zero-rate check was client-only | `validateIssueItems()` enforces `zero_rate_confirmed` + `rate_blank` server-side from day one |
| Duplicate detection took 3 iterations | Composite key `material_id\|contractor_id\|normalized_rate` defined upfront — same logic applied immediately |
| Delete hard-block too strict | Deleting an Issued slip *adds* stock back (no negatives possible) → no safety check needed at all |
| Header `supplier_id` was always NULL | No equivalent derived header field needed for issues |
| `gst_type` must be frozen per item | `gst_type` stored in `material_issue_items.gst_type` at confirmation time |
| `rate_blank` flag to distinguish blank vs deliberate zero | Same `rate_blank` flag applied to issue items |
| Per-item supplier required server-side check | `vehicle_id` required server-side from the start |
| Stock check must aggregate by `material_id` | `checkStockAvailability()` aggregates qty across rows for the same material before checking |
| Master deactivation guards needed | Contractor + Vehicle deactivation guards added to their respective server actions |

### Master Deactivation Guards (Added in Phase 4)

Two masters got new guards when Phase 4 shipped:

**`contractors.actions.ts` → `deleteContractor(id)`:**
```ts
const inUse = await db
  .select({ id: materialIssueItems.id })
  .from(materialIssueItems)
  .innerJoin(materialIssues, eq(materialIssueItems.issue_id, materialIssues.id))
  .where(and(eq(materialIssueItems.contractor_id, id), eq(materialIssues.status, "Draft")))
  .limit(1);
if (inUse.length > 0)
  throw new Error(`Cannot deactivate: assigned to a Draft issue slip. Complete or delete that slip first.`);
```

**`vehicles.actions.ts` → `deleteVehicle(id)`:**
```ts
const inUse = await db
  .select({ slip_number: materialIssues.slip_number })
  .from(materialIssues)
  .where(and(eq(materialIssues.vehicle_id, id), eq(materialIssues.status, "Draft")))
  .limit(1);
if (inUse.length > 0)
  throw new Error(`Cannot deactivate: referenced in a Draft issue slip. Complete or delete that slip first.`);
```

Both guards check **Draft only** — Issued slips are historical records. Deactivating a vehicle or contractor that appears in an already-confirmed slip is safe because the slip is finalized and the foreign key reference is still intact.

---

## 17. Key Files

```
src/lib/actions/
  material-issues.actions.ts
    ├── getActiveVehicles()              ← JOIN vehicles→customers; active only
    ├── getActiveContractors()           ← active only
    ├── getActiveIssueMaterials()        ← JOIN materials→tax_rates→units; includes tax_percentage directly
    ├── getNextSlipNumber(fy)            ← MAX(slip_number)+1 for this FY
    ├── getMaterialIssues(fy)            ← one row per item; full JOIN for list view
    ├── getMaterialIssueById(id)         ← header + items for form editing
    ├── createMaterialIssue(data)
    ├── updateMaterialIssue(id, data)    ← Draft only
    ├── issueMaterialIssue(id)           ← Draft → Issued + stock deduction
    ├── updateIssuedMaterialIssue(id, data) ← atomic reverse + reapply
    ├── deleteMaterialIssue(id)
    ├── validateIssueItems(items)        ← shared validation helper
    └── checkStockAvailability(items)    ← aggregates by material_id, called by issue + updateIssued

src/app/(dashboard)/transactions/material-issues/
  page.tsx                              ← Server: fetches MIs for current FY
  material-issues-client.tsx            ← List view with filters, status tabs, Print button
  material-issue-form.tsx               ← Create / edit / view form (4 modes)
  new/page.tsx                          ← Server: fetches dropdowns + next slip number → form mode="new"
  [id]/edit/page.tsx                    ← Server: fetches slip + dropdowns → form mode="edit-draft"|"edit-issued"
  [id]/view/page.tsx                    ← Server: fetches slip → form mode="view"

src/components/forms/
  TransactionGrid.tsx                   ← Reused from Phase 3, extended with mode="material-issue"
                                           New props: mode, contractors, gstType

src/components/pdf/
  mi-register-pdf.tsx                   ← MIRegisterDocument (one Page per slip)
  pdf-styles.ts                         ← Shared with PO PDF (no changes needed)
  print-button.tsx                      ← Shared with PO PDF (no changes needed)

src/lib/actions/
  contractors.actions.ts                ← Modified: added Draft issue slip deactivation guard
  vehicles.actions.ts                   ← Modified: added Draft issue slip deactivation guard
```

---

## 18. Verification Checklist

After any change to Material Issue logic, verify these scenarios manually:

| # | Scenario | Expected Result |
|---|---------|----------------|
| 1 | Create Draft slip, check DB | `status = 'Draft'`, items inserted with correct `affects_inventory` values |
| 2 | Save without vehicle | Server throws "Vehicle is required" |
| 3 | Save with zero items | Server throws "Add at least one material" |
| 4 | Save item with qty = 0 | Server throws "All quantities must be greater than zero" |
| 5 | Duplicate: same material + same contractor + same rate | Server throws "Duplicate entry" |
| 6 | Same material + different contractors | Server accepts both rows |
| 7 | Same material + same contractor + different rates | Server accepts both rows |
| 8 | Issue slip where one material has insufficient stock | Server throws with material name, available qty, requested qty |
| 9 | Issue slip where two rows of same material together exceed stock | Server throws (aggregate check catches it even if each individual row would pass) |
| 10 | Row with `affects_inventory = false` → confirm slip | That row does NOT reduce `current_stock`; no `ISSUE` row in `stock_ledger` |
| 11 | Confirm issue slip → check DB | `current_stock` reduced for all `affects_inventory = true` rows; `ISSUE` rows in `stock_ledger` |
| 12 | Edit confirmed slip, change qty → Save & Reapply → check DB | `REVERSAL` rows for old qtys + `ISSUE` rows for new qtys; net stock effect is correct |
| 13 | Delete Draft slip | Deleted cleanly; no stock change; no ledger rows |
| 14 | Delete Issued slip → check DB | `REVERSAL` rows inserted; stock restored; slip deleted |
| 15 | Select TN vehicle (customer GSTIN starts with 33) | GST type = CGST+SGST; all row tax amounts use CGST+SGST formula |
| 16 | Select non-TN vehicle (customer GSTIN starts with ≠33) | GST type = IGST; all row tax amounts recalculate to IGST |
| 17 | Change vehicle mid-form | All existing rows recalculate tax amounts with the new GST type |
| 18 | Deactivate contractor assigned to Draft issue slip | Server throws with slip reference |
| 19 | Deactivate vehicle assigned to Draft issue slip | Server throws with vehicle name |
| 20 | Material with only purchase unit (no sales unit) | Unit column auto-fills with purchase unit |
| 21 | Material with no units at all | Amber "⚠ Not set" shown in Unit column |
| 22 | Second slip in same FY | Slip number = MI-0002 (not MI-0001) |
| 23 | First slip of new FY | Slip number = MI-0001 (resets) |
| 24 | Issue date outside active FY | Server throws date validation error |
| 25 | Select material with tax rate assigned | Tax % auto-fills correctly |
| 26 | Select material with no tax rate assigned | Tax % = 0 |
