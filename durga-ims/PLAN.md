# DVN Inventory Management — Comprehensive UX & Feature Plan (v3 — Final)

## Context
Sabari Steels IMS (Next.js 14 / Supabase / Drizzle ORM). User is keyboard-first. Three reference images confirmed the target UX: single-screen per transaction tab, inline editing everywhere, action buttons at the bottom, identifier dropdowns that filter inside themselves. This plan addresses UX redesign, keyboard navigation fix, new features, and bug fixes.

---

## PART 0 — UX Architecture: Single Working Screen

### The Model (from reference images)
```
┌── [Tab Name] ──────────────────────────────────────────────────────────┐
│  [Identifier ▼] [Field1] [Field2] ...            [Summary/Total]        │  ← Header: always visible
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │ S.No │ Material │ Qty │ Unit │ Rate │ TAX% │ Amount │ HSN   │       │  ← Grid: inline-editable
│  │  1   │  ...     │ ... │  ... │  ... │  ...  │  ...   │  ...  │       │
│  │  2   │          │     │      │      │       │        │       │       │
│  └──────────────────────────────────────────────────────────────┘       │
│  [New] [Save] [Delete] [Status Action] [Print] [Cancel] [Exit]           │  ← Buttons: always at bottom
└────────────────────────────────────────────────────────────────────────┘
```

### Rules
1. Page opens blank — no records shown
2. **Identifier dropdown** (PO Number, Slip Number, Bill Number): user types → records filter inside the dropdown; ↓ navigates options; Enter selects → fields populate in-place. No extra click needed.
3. **"New" button** (or Alt+N equivalent): clears all fields, cursor moves to first header field
4. **All fields are always inline-editable** — no "Edit" or "Modify" button. User clicks or arrows to any cell and types.
5. **Save** handles all cases (new / draft edit / received edit) based on current status — the server action determines atomic behavior
6. Bottom buttons reflect state (e.g., "Mark as Received" shown for Draft POs; "Revert to Draft" shown for Received POs)
7. No separate list view for PO, VMI, or Invoice

---

## PART 1 — Keyboard Navigation: Complete Fix

### 1.1 Root Cause Analysis (from codebase exploration)

| File | Location | Current State | Bug |
|------|----------|---------------|-----|
| `TransactionGrid.tsx` | Line 438 | `onKeyDown` Tab handler **only on Qty input** | Other cells (Material, Rate, Tax%) have zero keyboard nav |
| `TransactionGrid.tsx` | All inputs | No `data-row` / `data-col` attributes | Can't target cells by position |
| `combobox.tsx` | All | Delegates entirely to cmdk | cmdk handles ↑/↓ when dropdown open, but does nothing when closed — so ↓ on closed combobox doesn't move to next row |
| All forms | `po-form.tsx`, `material-issue-form.tsx`, `invoice-form.tsx` | No keyboard handlers | No arrow navigation at form/header level |

### 1.2 New Hook: `useKeyboardGrid`
**File:** `src/hooks/use-keyboard-grid.ts`

```typescript
// Tracks open state of any combobox in the grid
// Exposes: handleKeyDown(e, rowIndex, colIndex, isComboboxOpen)

function handleKeyDown(e, row, col, isComboboxOpen) {
  // When combobox is open: let cmdk handle ↑/↓/Enter/Escape — do NOT intercept
  if (isComboboxOpen) return;

  switch (e.key) {
    case 'ArrowDown':
    case 'Enter':
      e.preventDefault();
      const isLastRow = row === rows.length - 1;
      const rowHasData = rowHasAnyData(rows[row]); // at least one field non-empty
      if (isLastRow && rowHasData) {
        appendEmptyRow(); // only append if current row has data
        setTimeout(() => focusCell(row + 1, 0), 10); // col 0 = material
      } else if (!isLastRow) {
        focusCell(row + 1, col);
      }
      // Enter on empty last row: do nothing (no new row)
      break;
    case 'ArrowUp':
      e.preventDefault();
      if (row > 0) focusCell(row - 1, col);
      break;
    case 'ArrowRight':
      e.preventDefault();
      focusNextEditableCell(row, col, +1); // skips disabled/readonly
      break;
    case 'ArrowLeft':
      e.preventDefault();
      focusNextEditableCell(row, col, -1);
      break;
  }
}

// Focus using data-grid-row / data-grid-col attributes
function focusCell(row, col) {
  const el = gridRef.current?.querySelector(
    `[data-grid-row="${row}"][data-grid-col="${col}"]`
  );
  if (el) (el as HTMLElement).focus();
}

function focusNextEditableCell(row, col, direction) {
  let c = col + direction;
  const maxCol = COLUMN_COUNT - 1;
  while (c >= 0 && c <= maxCol) {
    const el = gridRef.current?.querySelector(
      `[data-grid-row="${row}"][data-grid-col="${c}"]`
    ) as HTMLElement;
    if (el && !el.hasAttribute('disabled') && !el.getAttribute('aria-readonly')) {
      el.focus(); return;
    }
    c += direction;
  }
}
```

### 1.3 TransactionGrid.tsx Changes
**File:** `src/components/forms/TransactionGrid.tsx`

**Changes:**
1. Add `data-grid-row={rowIndex}` and `data-grid-col={colIndex}` to **every** input and combobox trigger in every cell
2. Replace the current single Tab handler on Qty with `useKeyboardGrid` applied to all cells
3. Track combobox open state per row via `openComboboxCell: {row, col} | null` in state
4. Pass `isComboboxOpen = openComboboxCell?.row === rowIndex && openComboboxCell?.col === colIndex` to each `handleKeyDown` call
5. For combobox cells: add `onOpenChange={(open) => setOpenComboboxCell(open ? {row, col} : null)}` — this tells the hook when cmdk is handling keys
6. After material selected from combobox: auto-focus Qty cell (`focusCell(rowIndex, QTY_COL)`)
7. Remove old `handleTabOnLastCell` on Qty — replace with `useKeyboardGrid`
8. Tab key: browser default moves to next focusable element (natural tab order set by DOM); no override needed

**Column index constants (for reference):**
```
COL_MATERIAL = 0, COL_SUPPLIER = 1 (PO only), COL_CONTRACTOR = 1 (MI only),
COL_QTY = 2, COL_UNIT = 3 (read-only, skip), COL_RATE = 4, COL_TAX = 5, COL_AMOUNT = 6 (read-only, skip)
```

### 1.4 Identifier Dropdown Behavior (PO Number / Slip Number / Bill Number)
These are the primary search fields at the top of each single-screen tab.

**Behavior:**
- Page loads → focus auto-lands on identifier dropdown
- User types partial text → cmdk filters options inside dropdown (real-time)
- ↓ (when dropdown closed) → opens dropdown + moves highlight to first option
- ↓/↑ (when dropdown open) → navigate options (cmdk handles this natively)
- Enter → selects highlighted option → fields populate → focus moves to first editable header field
- Escape → closes dropdown, clears filter, form remains in current state
- "New" button → clears all fields, focus moves to first header field (e.g., Date)

**Implementation:** The existing `Combobox` component (cmdk-based) already handles ↑/↓/Enter when open. The only gap is: when closed, ↓ must open the dropdown. Fix: wrap trigger button with `onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); } }}`.

### 1.5 Keyboard Navigation: All Tabs

#### Masters (Customers, Suppliers, Materials, Units, Tax, Contractors, Vehicles)
Search box ↑/↓ navigates list, Enter opens record. **Gaps to fix (must be built from scratch — does NOT exist yet):**
- After Enter selects record: focus must move to first editable form field
- Tab through form fields → Tab to Save button → Enter saves
- Escape: if form is dirty → confirm dialog; if clean → deselect record, return to search

#### Purchase Orders (single screen)
- Page load: focus on PO Number dropdown
- ↓ on closed dropdown → opens; ↑/↓ navigate; Enter selects record
- After record loads: Tab cycles through header fields (Date → Supplier → Vehicle → etc.)
- Tab from last header field → focus enters grid row 0, col 0 (Material)
- In grid: full ↑/↓/←/→/Enter navigation via `useKeyboardGrid`
- Bottom buttons: Tab after last grid row reaches buttons; Enter activates focused button
- Escape: if unsaved changes → "Discard?" dialog

#### Vehicle Material Issue — Old (single screen)
- Page load: focus on Slip Number dropdown
- ↓ opens dropdown; navigate; Enter loads slip
- After record loads: Tab through header fields
- Tab from last header → grid row 0, col 0
- Grid: full arrow navigation

#### Vehicle Material Issue — New (single screen)
- Page load: focus on Vehicle dropdown
- After vehicle selected → customer populates; Tab to Stage dropdown
- After stage selected → grid populates; Tab enters grid row 0
- Grid: arrow navigation + Enter adds row only if current row has data
- Save → auto-generates slip number

#### Invoice (single screen)
- Page load: focus on Bill Number dropdown
- ↓ opens dropdown; navigate; Enter selects
- After bill loads: all header fields populate inline
- Tab through header fields; Tab enters grid
- Grid: arrow navigation
- Insurance Bill button: accessible via Tab from last button, Enter to activate

#### Reports
- Tab through filter fields; Enter on last filter field → triggers Show
- ↑/↓ in result table scrolls results (read-only)

#### Stock Tab
- Tab/↑/↓ to navigate stock table rows; Enter opens History drawer

#### Home Tab
- Tab between interactive elements (KPI cards are read-only)

#### Settings Tab
- Tab between all form fields; Ctrl+S → save

### 1.6 Edge Cases

| Edge Case | Handling |
|-----------|---------|
| Enter on empty row (grid) | Do nothing — no new row added, no navigation |
| ↓ on last row with data | Append new empty row; focus first cell of new row |
| ↓ on last row with no data | Do nothing |
| ←/→ on read-only cell | Skip to next editable cell in same direction |
| Combobox open + ↓/↑ | cmdk handles — hook does NOT intercept |
| Combobox open + Enter | cmdk selects; after selection hook resumes control |
| Modal open | Tab/Shift+Tab cycles WITHIN modal only (focus-trap via Radix Dialog) |
| Confirmation dialog | Enter = confirm; Escape = cancel; Tab cycles dialog buttons only |
| Received/Issued record | All cells editable; Save triggers appropriate atomic operation based on status |
| Invoice Finalized + grid edit | Cells editable; Save re-computes totals; finalized status kept |
| Insurance bill grid | Fully editable (independent items); same grid keyboard behavior |

---

## PART 2 — Database Schema Changes (Non-Destructive)

All changes use ADD COLUMN only. No existing columns dropped or type-changed. Existing records survive via DEFAULT values.

### 2.1 Stage Master
```sql
-- New table
CREATE TABLE stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_code TEXT UNIQUE NOT NULL,  -- auto-gen: S001, S002...
  stage_name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- New table
CREATE TABLE stage_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  default_qty NUMERIC(12,3) NOT NULL DEFAULT 0,
  unit_id UUID NOT NULL REFERENCES units(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(stage_id, material_id)
);
```

### 2.2 Material Issues: Issue Type
```sql
-- Non-destructive: existing rows get DEFAULT 'OLD'
ALTER TABLE material_issues
  ADD COLUMN issue_type TEXT NOT NULL DEFAULT 'OLD',
  ADD COLUMN stage_id UUID REFERENCES stages(id);  -- NULL for OLD type
```

### 2.3 Invoice: Tax Toggle
```sql
-- Non-destructive: existing invoices get false (tax columns hidden = current behavior)
ALTER TABLE invoices ADD COLUMN include_tax BOOLEAN DEFAULT false;
```

### 2.4 Insurance Invoice (New tables)
```sql
CREATE TABLE invoice_insurance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL UNIQUE REFERENCES invoices(id),
  -- No ON DELETE CASCADE: parent cancellation blocked if insurance bill exists
  bill_date DATE NOT NULL,
  tax_percentage NUMERIC(5,2) DEFAULT 18,
  material_margin NUMERIC(5,2) DEFAULT 0,
  discount NUMERIC(5,2) DEFAULT 0,
  net_amount NUMERIC(14,2) DEFAULT 0,
  gst_type TEXT NOT NULL,
  include_tax BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'Draft',   -- Draft | Finalized
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE invoice_insurance_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insurance_id UUID NOT NULL REFERENCES invoice_insurance(id) ON DELETE CASCADE,
  material_id UUID REFERENCES materials(id),
  material_name_override TEXT,  -- for free-text items with no master record
  hsn_code TEXT,
  qty NUMERIC(12,3) NOT NULL,
  unit_id UUID REFERENCES units(id),
  rate NUMERIC(14,4) NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  tax_percentage NUMERIC(5,2) NOT NULL,
  cgst_amount NUMERIC(14,2) DEFAULT 0,
  sgst_amount NUMERIC(14,2) DEFAULT 0,
  igst_amount NUMERIC(14,2) DEFAULT 0,
  gst_type TEXT NOT NULL,
  sort_order INT DEFAULT 0
);
```

**No `has_insurance_bill` flag** — use `EXISTS` subquery at query time to avoid sync bugs.

### 2.5 PO Revert Audit
```sql
-- Non-destructive: new columns nullable, existing records unaffected
ALTER TABLE purchase_orders
  ADD COLUMN reverted_at TIMESTAMPTZ,
  ADD COLUMN reverted_by TEXT;
```

### 2.6 Stock Ledger: Rate at Adjustment Time
```sql
-- Non-destructive: NULL for existing rows; populated going forward
ALTER TABLE stock_ledger ADD COLUMN rate_at_time NUMERIC(14,4);
```

---

## PART 3 — Purchase Order: Single-Screen Rewrite

### 3.1 Screen Layout
```
PO Number: [S ▼]     PO Date: [02/04/2026]     Status: [Draft] / [Received]
Supplier: [SRI SAKKTHI PAINTS ▼]    Vehicle: [SPARE]    Total: ₹17,464.56
──────────────────────────────────────────────────────────────────────────
Grid: S.No | M.No | Material Name | Qty | Unit | Rate | TAX% | Amount
──────────────────────────────────────────────────────────────────────────
[New] [Save] [Delete] [Mark as Received] [Revert to Draft] [Print] [Cancel] [Exit]
         ↑ only for Draft       ↑ only for Received
```

Right-side panel (from image 1):
```
PO No From: [  ▼]
PO No To:   [  ▼]
[Print POs]  ← batch print range
```

### 3.2 Inline Editing (No Edit/Modify Button)
- **All header fields** (Date, Supplier, Vehicle): always editable, inline
- **Grid cells**: always editable inline via click or keyboard
- **Save branches by status:** Draft → `updatePurchaseOrder()`; Received → `updateReceivedPurchaseOrder()` (atomic stock reversal + reapply)

### 3.3 Button State Logic
| Status | Visible Buttons |
|--------|----------------|
| No record loaded | New \| Exit |
| Draft | New \| Save \| Delete \| Mark as Received \| Print \| Cancel \| Exit |
| Received | New \| Save \| Delete \| Revert to Draft \| Print \| Cancel \| Exit |

### 3.4 PO Revert to Draft — Atomic Server Action
**File:** `src/lib/actions/purchase-orders.actions.ts`

Modelled exactly on existing `deletePurchaseOrder()` Received-PO path (lines 542–561 pre-flight, then atomic transaction).

```
revertPOToDraft(poId, userEmail):
  PRE-FLIGHT (outside transaction — same pattern as deletePurchaseOrder lines 542-561):
    Bulk query: SELECT m.name, m.current_stock, poi.qty
                FROM purchase_order_items poi JOIN materials m ON m.id = poi.material_id
                WHERE poi.purchase_order_id = $id AND (m.current_stock - poi.qty) < 0
    If any rows: return error listing all blocking materials

  TRANSACTION:
    If affects_stock = true:
      For each PO item:
        UPDATE materials SET current_stock = current_stock - item.qty
        INSERT stock_ledger (type=REVERSAL, reference_type=PO_REVERT,
                             adjusted_by=userEmail, rate_at_time=item.rate)
    UPDATE purchase_orders SET status='Draft', reverted_at=NOW(), reverted_by=userEmail

  Race condition guard: DB CHECK constraint current_stock_non_negative fires if stock goes negative
  reverted_at/reverted_by stamped even for affects_stock = false POs (audit trail always)
```

**UI:** Error dialog listing materials that can't be reverted with current stock levels. No partial revert — all-or-nothing.

### 3.5 Home Page Deep Links
Home page recent PO links → navigate to `/transactions/purchase-orders?id=<recordId>` — the single-screen reads the `id` query param on mount and auto-loads that PO.

### 3.6 Dead Routes to Remove
- `/transactions/purchase-orders/new/` — delete
- `/transactions/purchase-orders/[id]/edit/` — delete
- `/transactions/purchase-orders/[id]/view/` — delete

### 3.7 Files
- **Rewrite:** `purchase-orders-client.tsx` → single-screen component
- **New action:** `revertPOToDraft()` in `purchase-orders.actions.ts`
- **New query:** `getPOsForDropdown(fy)` → `{ id, poNumber, supplierName, date, status }[]`

---

## PART 4 — Vehicle Material Issue: Two Screens

### 4.1 Navigation
```
Transactions
  ├── Purchase Orders
  ├── Vehicle Material Issue (Old)   ← /transactions/material-issues
  └── Vehicle Material Issue (New)   ← /transactions/material-issues/new
```

`getMaterialIssues()` must accept `issueType` parameter — Old VMI passes `'OLD'`, New VMI passes `'NEW'`.

### 4.2 Old VMI Screen Layout (Single Screen Rewrite)
```
Slip No: [IS-322 ▼]  DC Date: [19/05/2026]  GST: [22]  Job No: [001973 auto]
Vehicle Name: [228 - SHAJEE ▼]
[Prices as on DC Date ☐]  [Inventory affect ☑]
                                           Customer Address:
                                           Mr./Ms. 228 - SHAJEE, KERALA
                                           Tamil Nadu(33)
                                           Total (Incl. Tax): ₹1,130.51
──────────────────────────────────────────────────────────────────────────
Grid: Sl# | Material No | Material Name | Qty | Unit | Rate | Amount | TAX% | HSN
──────────────────────────────────────────────────────────────────────────
[New] [Save] [Delete] [Issue] [Print] [Print Adv.] [Clone] [Cancel] [Exit]
                               ↑ Draft only
```

**Save branches by status:**
- Draft → `updateMaterialIssue()` (line 451 guards non-Draft with hard error — must branch to avoid it)
- Issued → `updateIssuedMaterialIssue()` (lines 546–649)

**No functional changes to Old VMI stock logic** — only UX (single-screen + inline edit + keyboard nav) and Clone button added.

**Clone (Old VMI) — corrected:**
```
cloneOldMaterialIssue(slipId):
  BEGIN TRANSACTION
    1. Fetch source slip including vehicle_id
    2. INSERT new material_issues row (status=Draft, issue_type='OLD',
       vehicle_id=source.vehicle_id  ← MUST copy; NOT NULL column)
       slip_number auto-generated
    3. INSERT all items (same materials, quantities, rates)
  COMMIT
  Return new slip id
```
After clone: form loads with same vehicle pre-filled; user can change vehicle.

### 4.3 New VMI Screen Layout (New Screen)
```
Slip No: [auto / IS-323 ▼]  DC Date: [today]  GST: [22 auto]  Job No: [auto]
Vehicle: [type/select ▼]    Stage: [type/select ▼]
[Prices as on DC Date ☐]  [Inventory affect ☑]
                                           Customer Address:
                                           [auto-filled when vehicle selected]
                                           Total (Incl. Tax): [calculated]
──────────────────────────────────────────────────────────────────────────
Grid: Sl# | Material No | Material Name | Qty | Unit | Rate | Amount | TAX% | HSN
[grid pre-populates with stage materials when stage selected; fully editable]
──────────────────────────────────────────────────────────────────────────
[New] [Save Draft] [Issue] [Delete] [Print] [Print Adv.] [Clone] [Cancel] [Exit]
```

**Empty state:** "Select a vehicle and stage to load materials"

**Stage selection flow:**
- User selects stage → `getStageMaterials(stageId)` → grid fills with default qty + last PO rate
- User modifies quantities/adds/removes rows freely
- Saving draft: `issue_type='NEW'`, `stage_id=selectedStageId`

**New VMI slips ARE invoiceable** — both Old and New issued slips appear in the invoice MI checklist. `getIssuedMIsForVehicle()` needs no `issue_type` filter.

**Clone (New VMI):** Same as Old VMI clone — copies `vehicle_id` (NOT NULL) and `stage_id`. Both fields remain editable after clone.

### 4.4 Files
- **Rewrite:** `material-issues-client.tsx` → single screen (Old VMI)
- **New:** `src/app/(dashboard)/transactions/material-issues/new/page.tsx` + `new-vmi-client.tsx`
- **Updated actions:** `cloneOldMaterialIssue()`, `cloneNewMaterialIssue()` in `material-issues.actions.ts`
- **New query:** `getSlipsForDropdown(fy, issueType)` → `{ id, slipNumber, vehicleName, date, status }[]`

---

## PART 5 — Invoice: Single-Screen Rewrite

### 5.1 Screen Layout
```
Bill Number: [D1800005 ▼]   GST: [auto]    Vehicle: [TN 82 H 3560 - 09.04.26 ▼]
Bill Date: [18/05/2026]                    Customer: THE NEW INDIA ASSURANCE-CO LTD
Bill for Tax%: [18 ▼]                      Address: 161-A, EAST VELI STREET, MADURAI-625001
Material Margin%: [0.00]                   GSTIN: 33AAACN4165C4ZV
Discount: [0.00]  Job No: [01963]          State: Tamil Nadu(33)
[Include Tax Columns ☐]                    Net Amount: ₹45,189.00
Status: [Draft] / [Finalized]   Insurance: [Not Created] / [Created ✓]
──────────────────────────────────────────────────────────────────────────
Grid: Sl# | Mat.Code | HSN | Material Name | Qty | Unit | Rate | Amount
      [+ Tax% | Tax Amt columns when "Include Tax Columns" checked]
──────────────────────────────────────────────────────────────────────────
[New] [Save] [Delete] [Finalize] [Print Customer] [Print Insurance] [Create Insurance Bill] [Cancel] [Exit]
              ↑ Draft only      ↑ if insurance bill exists              ↑ if Finalized + no insurance bill
```

**Removed from Invoice:** Rev.Chrg.Status field and Rate Date field — removed from UI only (columns remain in DB; removing from UI has zero backend impact as they are not in `InvoiceHeaderInput` interface).

**Vehicle → Auto-fills:** Customer name, address, GSTIN, state, Job No

### 5.2 Invoice Status Badges in Header
- Customer bill: Blue "Finalized" badge (or gray "Draft")
- Insurance bill: Green "Insurance ✓" badge (or amber "Insurance: Not Created" when finalized)

### 5.3 Tax Columns Toggle
- `include_tax` checkbox in header
- Unchecked: standard columns
- Checked: Adds Tax Rate% and Tax Amount (CGST+SGST or IGST) columns after Amount
- Value saved per invoice in `invoices.include_tax`

### 5.4 Finalize Button
- Confirms: "This will lock the bill number permanently."
- Sets `status = 'Finalized'`; bill_number assigned from tax prefix (D-00001, etc.)
- After finalize: "Create Insurance Bill" button appears
- `revertInvoiceToDraft()` already exists at `invoices.actions.ts` line 730 — reuse it

### 5.5 Cancellation Guard (add to `cancelInvoice()`)
```
Pre-check BEFORE db.transaction():
  Check invoice_insurance for this invoice_id
  If Finalized insurance bill: throw "Cannot cancel — finalized insurance bill exists"
  If Draft insurance bill: delete invoice_insurance_items, then invoice_insurance, inside same transaction
```

### 5.6 Dead Routes to Remove
- `/invoice/[id]/edit/` — delete
- `/invoice/[id]/view/` — delete

### 5.7 Files
- **Rewrite:** `invoice-client.tsx` (merges `invoice-list-client.tsx` + `invoice-form.tsx` into one)
- **New:** `insurance-form.tsx` (rendered in-place within invoice-client.tsx via state swap)
- **New actions in `invoices.actions.ts`:** `getInvoicesForDropdown()`, `createInsuranceBill()`, `saveInsuranceBill()`, `finalizeInsuranceBill()`, `deleteInsuranceBill()`

---

## PART 6 — Insurance Bill (In-Place)

### 6.1 In-Place Rendering
When "Create Insurance Bill" or "View Insurance Bill" clicked: invoice-client.tsx swaps the main content area to show the insurance form (state variable `activeView: 'invoice' | 'insurance'`). Back button or Escape returns to customer invoice view.

### 6.2 Insurance Bill Form
```
← Back to Customer Bill (D1800005)
Vehicle: [from parent — display only]    Customer: [from parent — display only]
Insurance Bill Date: [editable]          GSTIN: [from parent — display only]
Bill for Tax%: [18 editable]             State: [from parent — display only]
Material Margin%: [editable]  Discount: [editable]  Net Amount: [calculated]
[Include Tax Columns ☐]                  Status: [Draft] / [Finalized]
──────────────────────────────────────────────────────────────────────────
Grid: fully editable — starts as copy of customer bill items but is INDEPENDENT
Sl# | Material Name | Qty | Unit | Rate | Amount | [Tax% | Tax Amt if checked]
──────────────────────────────────────────────────────────────────────────
[Save Draft] [Finalize] [Print Insurance] [Delete] [Cancel] [Exit]
```

### 6.3 Business Rules
- Create: only from a **Finalized** customer invoice
- Pre-populate: copy customer invoice items as starting point; user modifies freely
- Items are completely independent after initial copy
- Draft: editable; can be deleted
- Finalized: read-only; blocks customer invoice cancellation
- Print Insurance PDF: requires adapter to map `invoice_insurance_items` → PDF data shape (existing `insurance-invoice-pdf.tsx` uses `InvoiceRow[][]` from customer items — new adapter or new PDF component needed)

### 6.4 Atomic Creation
```
createInsuranceBill(invoiceId, initialItems[]):
  BEGIN TRANSACTION
    1. Verify parent invoice status = 'Finalized'
    2. Read gst_type: SELECT gst_type FROM invoice_items WHERE invoice_id = $invoiceId LIMIT 1
       (invoices table has NO gst_type column — must read from first item)
    3. INSERT invoice_insurance (invoice_id, bill_date=today, gst_type, status='Draft')
    4. INSERT all invoice_insurance_items
  COMMIT
```

---

## PART 7 — Stage Master (Masters Tab)

### 7.1 Layout (matches existing masters pattern exactly)
```
Stage Code: [auto S001]    Stage Name: [_____________]
──────────────────────────────────────────────────────────────────────────
Sl# | Stage Code | Stage Name                    ← search list left side
 1    S001         WOOD WORK
 2    S002         SHEET METAL
Search NAME: [________________]
──────────────────────────────────────────────────────────────────────────
Materials in this Stage:
Sl# | Material (combobox) | Default Qty | Unit (auto-fill)
 1    25*3MM FLAT            10.000        FT
 2    32*3MM ANGLE           29.000        FT
[keyboard-navigable grid — Enter adds row]
──────────────────────────────────────────────────────────────────────────
[Add] [Save] [Delete] [Cancel] [Exit] [Find]
```

**No separate Modify/Edit button** — clicking any field in the form edits inline.

**Keyboard in Stage Master:**
- Search box: ↑/↓ navigate list; Enter loads record into form AND moves focus to first editable field
- Form fields: Tab between Stage Name field and materials sub-grid
- Materials sub-grid: full `useKeyboardGrid` arrow nav
- Save: saves stage name + all materials atomically

### 7.2 Deletion Rules
```
deleteStage(stageId):
  Check: SELECT COUNT(*) FROM material_issues
         WHERE stage_id = stageId AND status = 'Issued'
  If count > 0: return error "Stage used in {count} issued slips — cannot delete"
  If count = 0: UPDATE stages SET is_active = false (soft delete)
  Draft MIs referencing this stage: stage remains (FK still valid); warn user
```

### 7.3 Server Actions
```typescript
// src/lib/actions/stages.actions.ts
createStage(name)                               // auto stage_code: S001, S002...
updateStage(id, name)
deleteStage(id)                                 // soft delete; blocks if issued MIs exist
upsertStageMaterials(stageId, items[])          // atomic: DELETE + INSERT in transaction
getStagesWithMaterials()                        // for stage master list
getStagesForDropdown()                          // lightweight: for New VMI dropdown (active only)
getStageMaterials(stageId)                      // for New VMI: returns materials with last PO rate
```

---

## PART 8 — Reports: Stage Wise & Material Wise Costing

### 8.1 New Report Tab (5th tab in Reports left nav)

**UI:**
```
Vehicle: [221 - SHUBAIR ▼]    [Show] [Print] [Export]
Rpt Type: [Stage Wise ▼]   Margin%: [____]
──────────────────────────────────────────────────────────────────────────
S.No | Code | Name                      | Amount (Rs.)
  1    S001   WOOD WORK                   83,978.83
  2    DIRECT Direct Issue                12,450.00
```

**Edge cases:**
- Old VMI items (stage_id IS NULL): grouped under "Direct Issue / Unclassified" at the bottom
- If vehicle has no issued slips: show "No issued slips found for this vehicle"
- Margin %: applied as `amount × (1 + margin/100)` to each group total

### 8.2 Queries
```sql
-- Stage Wise
SELECT COALESCE(s.stage_code, 'DIRECT') AS code,
       COALESCE(s.stage_name, 'Direct Issue') AS name,
       SUM(mii.amount) AS base_amount
FROM material_issue_items mii
JOIN material_issues mi ON mi.id = mii.material_issue_id
LEFT JOIN stages s ON s.id = mi.stage_id
WHERE mi.vehicle_id = $vehicleId AND mi.status = 'Issued'
GROUP BY s.id, s.stage_code, s.stage_name
ORDER BY s.stage_code NULLS LAST

-- Material Wise (same materials across stages summed)
SELECT m.material_no AS code, m.name,
       SUM(mii.amount) AS base_amount
FROM material_issue_items mii
JOIN material_issues mi ON mi.id = mii.material_issue_id
JOIN materials m ON m.id = mii.material_id
WHERE mi.vehicle_id = $vehicleId AND mi.status = 'Issued'
GROUP BY m.id, m.material_no, m.name
ORDER BY m.name
```
Margin applied in application layer (not SQL) to avoid precision issues.

### 8.3 New Files
- `src/app/(dashboard)/reports/stage-wise-costing.tsx`
- `src/components/pdf/stage-wise-costing-pdf.tsx`
- `getStageWiseCostingData()` + `getMaterialWiseCostingData()` in `reports.actions.ts`

---

## PART 9 — Reports: Vehicle Comparison

### 9.1 New Report Tab (6th tab)
```
Source Vehicle:  [101 TO 105 - KONGU COLLEGE ▼]       [Compare] [Print]
Compare Vehicle: [1044 - THULASI ▼]
Stage: [All ▼]    ● All  ○ Diff.Material   ☐ Without Amount      [Exit]
──────────────────────────────────────────────────────────────────────────
S.No | Material Name | Stage | Qty(1) | Amt(1) | Qty(2) | Amt(2) | Diff
  1    6*3 9MM PF PLY  WW     1.000    984.53    0.000    0.00     +1.00  ← green
  2    7*3 9MM PF PLY  WW     0.000    0.00      6.000    6894.15  -6.00  ← red
```
Diff > 0: green text; Diff < 0: red text; Diff = 0: neutral

### 9.2 Query (Full Outer Join on material + stage pair)
```sql
WITH v1 AS (
  SELECT m.material_no, m.name AS mat_name,
         COALESCE(s.stage_name, 'Direct Issue') AS stage_name,
         SUM(mii.qty) AS qty, SUM(mii.amount) AS amt
  FROM material_issue_items mii
  JOIN material_issues mi ON mi.id = mii.material_issue_id
  JOIN materials m ON m.id = mii.material_id
  LEFT JOIN stages s ON s.id = mi.stage_id
  WHERE mi.vehicle_id = $v1Id AND mi.status = 'Issued'
    AND ($stageId IS NULL OR mi.stage_id = $stageId)
  GROUP BY m.id, m.material_no, m.name, s.id, s.stage_name
),
v2 AS (
  -- identical but for $v2Id
)
SELECT
  COALESCE(v1.material_no, v2.material_no) AS code,
  COALESCE(v1.mat_name, v2.mat_name) AS material_name,
  COALESCE(v1.stage_name, v2.stage_name) AS stage_name,
  COALESCE(v1.qty, 0) AS qty1, COALESCE(v1.amt, 0) AS amt1,
  COALESCE(v2.qty, 0) AS qty2, COALESCE(v2.amt, 0) AS amt2,
  COALESCE(v1.qty, 0) - COALESCE(v2.qty, 0) AS diff
FROM v1 FULL OUTER JOIN v2
  ON v1.material_no = v2.material_no AND v1.stage_name = v2.stage_name
ORDER BY stage_name, material_name
```

**"Diff.Material" filter:** `WHERE diff != 0` applied client-side on the result array.
**"Without Amount":** hides Amt(1) and Amt(2) columns in render (no re-fetch needed).

### 9.3 New Files
- `src/app/(dashboard)/reports/vehicle-comparison.tsx`
- `src/components/pdf/vehicle-comparison-pdf.tsx`
- `getVehicleComparisonData()` in `reports.actions.ts`

---

## PART 10 — Home Tab Changes

- **Remove:** "Out of Stock" KPI card
- **Remove from backend:** `outStockCount` removed from `getDashboardStats()` return type and query entirely
- **Add:** "Total Stock Value" KPI card (₹ formatted)
- **`getDashboardStats()` in `dashboard.actions.ts`** → add `totalStockValue` via lightweight DISTINCT ON rate query inline
- **Recent activity links:** Recent PO → `/transactions/purchase-orders?id=<id>`, Recent VMI → `/transactions/material-issues?id=<id>`, Recent Invoice → `/invoice?id=<id>` — each single-screen reads the `id` query param on mount and auto-loads the record

---

## PART 11 — Stock Tab Bug Fixes

### 11.1 Refresh Button Fix
**Root cause:** `const [rows, setRows] = useState(initialRows)` in `stock-client.tsx` ignores updated props after mount. `router.refresh()` updates Server Component props but client state doesn't sync.

**Fix in `stock-client.tsx`:**
```typescript
const [rows, setRows] = useState(initialRows)
// Sync when server re-renders with fresh data:
useEffect(() => { setRows(initialRows) }, [initialRows])
```
Note: state variable is `rows`/`setRows` — NOT `materials`/`setMaterials` (that name does not exist).

Also: ensure `stock/page.tsx` data fetch has no caching (`cache: 'no-store'` or `revalidatePath` called from `adjustStock()`).

### 11.2 Stock Value Transparency Fix
**What actually happened:** Material had a `last_po_rate` from an old PO. Manual adjustment increased `current_stock`. Value = `current_stock × last_po_rate` therefore increased. This is mathematically **correct** — more stock at same rate = more value.

**What was missing:** The History Drawer showed the ADJUSTMENT row with no rate information.

**Fix:**
1. In `adjustStock()`: query latest `last_po_rate` for the material (same DISTINCT ON pattern as `getStockDashboardMaterials()`); store in `stock_ledger.rate_at_time`
2. History Drawer: add "Value Impact" column: `qty_change × rate_at_time` formatted as ₹
3. Add note: "Rate used: ₹X.XX (from last received PO on [date])"
4. If `rate_at_time = NULL` (pre-migration entries): "Rate data not available for this adjustment"

---

## PART 12 — Visibility, Fonts & Whitespace

### 12.1 Font Size
**`tailwind.config.ts`:**
```js
fontSize: {
  xs:   ['0.6875rem', '1rem'],     // 11px
  sm:   ['0.75rem',   '1.125rem'], // 12px
  base: ['0.875rem',  '1.25rem'],  // 14px (down from 16px)
  lg:   ['1rem',      '1.5rem'],   // 16px
}
```

### 12.2 Whitespace Reduction
- Table `td`: `py-1.5 px-3` (was `py-3 px-4`)
- Card: `p-4` (was `p-6`)
- Form group gaps: `gap-2` (was `gap-4`)
- Apply via Tailwind `@layer base` overrides in `globals.css`

### 12.3 Background & Contrast
- Content area: `bg-slate-50` (not pure white — reduces eye strain)
- Table header: `bg-slate-700 text-white` (strong contrast, echoes reference image blue headers)
- Alternating rows: `bg-white` / `bg-slate-50/60`
- Input fields: `bg-white border-slate-300` — visible against slate-50 background
- Status badges: higher saturation colors

---

## PART 13 — Atomic Transaction Guarantee

Every multi-table operation uses Drizzle's `db.transaction(tx => ...)`:

| Operation | Tables Touched | Transaction Required |
|-----------|---------------|----------------------|
| PO Mark as Received | purchase_orders + materials + stock_ledger | ✓ existing |
| PO Revert to Draft | purchase_orders + materials + stock_ledger | ✓ NEW |
| VMI Issue | material_issues + materials + stock_ledger | ✓ existing |
| VMI Clone | material_issues + material_issue_items | ✓ NEW |
| Create Stage + Materials | stages + stage_materials | ✓ NEW |
| Update Stage Materials | stages + stage_materials (delete+insert) | ✓ NEW |
| Create Insurance Bill | invoice_insurance + invoice_insurance_items | ✓ NEW |
| Manual Stock Adjustment | materials + stock_ledger | ✓ existing |

---

## PART 14 — Implementation Order

### Phase 1: Foundation
1. DB migration (all schema changes from Part 2, in correct order)
2. `useKeyboardGrid` hook (`src/hooks/use-keyboard-grid.ts`)
3. `TransactionGrid.tsx` — wire keyboard hook + data-grid-row/col attributes
4. Global CSS font/whitespace/contrast (`globals.css`, `tailwind.config.ts`)

### Phase 2: Masters
1. Stage Master CRUD (`stages.actions.ts` + `stages-client.tsx`)
2. Add to sidebar nav
3. Masters keyboard fix (all master screens — build focus-move-after-Enter from scratch)

### Phase 3: Transaction UX Rewrite
1. PO single-screen (`purchase-orders-client.tsx` rewrite + `revertPOToDraft`)
2. Old VMI single-screen + Clone (save branching on status)
3. New VMI single-screen (`/transactions/material-issues/new/`)

### Phase 4: Invoice
1. Invoice single-screen rewrite (`invoice-client.tsx`)
2. Tax columns toggle
3. Insurance bill form + server actions

### Phase 5: Reports
1. Stage Wise Costing + Material Wise
2. Vehicle Comparison

### Phase 6: Home + Stock Fixes
1. Home KPI swap (Stock Value in, Out of Stock out)
2. Stock refresh fix + History Drawer rate transparency

---

## PART 15 — Critical Files

| Area | Action | Key Files |
|------|--------|-----------|
| Schema | Migrate | `src/lib/db/schema.ts`, new Drizzle migration file |
| Keyboard | New + modify | `src/hooks/use-keyboard-grid.ts` (**NEW**), `src/components/forms/TransactionGrid.tsx` |
| Combobox identifier | Modify | `src/components/ui/combobox.tsx` (add ↓ opens dropdown; add `onOpenChange` prop) |
| Masters search | Build new | All `*-client.tsx` in `masters/` (focus-move-after-Enter does not exist yet) |
| Stage Master | New | `src/app/(dashboard)/masters/stages/` (**NEW dir**), `src/lib/actions/stages.actions.ts` (**NEW**) |
| PO | Rewrite | `purchase-orders-client.tsx`, `purchase-orders.actions.ts` |
| Old VMI | Rewrite UX | `material-issues-client.tsx`, `material-issues.actions.ts` |
| New VMI | New | `transactions/material-issues/new/` (**NEW dir**) |
| Invoice | Rewrite | `invoice-client.tsx` (merged), `invoice-form.tsx` (gutted into client) |
| Insurance Bill | New | `invoice/insurance-form.tsx` (**NEW**), `invoices.actions.ts` |
| Reports (costing) | New | `reports/stage-wise-costing.tsx` (**NEW**), `reports.actions.ts` |
| Reports (compare) | New | `reports/vehicle-comparison.tsx` (**NEW**) |
| PDFs | New | `stage-wise-costing-pdf.tsx`, `vehicle-comparison-pdf.tsx` (**NEW**); insurance bill PDF adapter |
| Home | Modify | `page.tsx`, `dashboard.actions.ts` |
| Stock | Fix | `stock-client.tsx`, `stock.actions.ts` |
| Styles | Modify | `globals.css`, `tailwind.config.ts` |

---

## PART 16 — Verification Checklist

### Keyboard
- [ ] ↓ on closed identifier dropdown opens it; ↑/↓ navigate options; Enter selects → form populates
- [ ] In grid: ↓/Enter adds new row only if current row has at least one field filled
- [ ] ↓/Enter on empty row: nothing happens
- [ ] ↑/↓/←/→ navigate cells; skip disabled/readonly cells (Unit, Amount)
- [ ] Combobox open: cmdk handles keys; grid hook does NOT intercept
- [ ] Tab/Shift+Tab: header fields → grid → bottom buttons (linear focus order)
- [ ] Modal/dialog: focus trapped inside; Escape closes

### PO Revert to Draft
- [ ] Blocked with specific error when stock insufficient (lists all blocking materials)
- [ ] Stock ledger shows REVERSAL entries with `adjusted_by=userEmail` and `rate_at_time`
- [ ] Reverted PO is fully editable; "Mark as Received" button reappears
- [ ] `reverted_at` and `reverted_by` stamped even for `affects_stock = false` POs

### Inline Editing
- [ ] No "Edit" or "Modify" buttons anywhere
- [ ] Clicking any field in loaded record allows immediate typing
- [ ] Saving a Draft PO → `updatePurchaseOrder()`
- [ ] Saving a Received PO → `updateReceivedPurchaseOrder()` (atomic reversal + reapply)
- [ ] Saving a Draft VMI slip → `updateMaterialIssue()`
- [ ] Saving an Issued VMI slip → `updateIssuedMaterialIssue()` (no hard error)

### Insurance Bill
- [ ] "Create Insurance Bill" only appears for Finalized customer invoices
- [ ] `gst_type` read from `invoice_items[0].gst_type` at creation
- [ ] Insurance items start as copy of customer bill but are independent after creation
- [ ] Cancelling invoice with Finalized insurance bill is blocked with clear error
- [ ] Cancelling invoice with Draft insurance bill: warns, deletes insurance bill, proceeds
- [ ] Print Insurance renders `invoice_insurance_items` (not customer items)

### Stage Master
- [ ] Creating stage with materials is atomic (fails together or succeeds together)
- [ ] Deleting stage with issued VMI slips is blocked
- [ ] New VMI: selecting stage pre-populates grid with default quantities
- [ ] Soft-deleted stage hidden from New VMI dropdown; still visible in historical reports

### Costing Reports
- [ ] Stage Wise: Old VMI items appear under "Direct Issue"
- [ ] Material Wise: same material across multiple stages is summed
- [ ] Vehicle Comparison: FULL OUTER JOIN shows material unique to either vehicle

### Stock & Home
- [ ] Refresh button reflects latest data immediately (no tab-switch needed)
- [ ] History Drawer shows `rate_at_time` and value impact for ADJUSTMENT entries
- [ ] Home: Total Stock Value displayed; Out of Stock KPI removed
- [ ] Home recent activity links open transaction screens with record pre-loaded

---

## PART 17 — Libraries: What to Install vs. What to Code

### 17.1 Verdict
| Need | Library | Decision |
|------|---------|----------|
| Grid arrow navigation (↑↓←→ in table inputs) | None available that fits custom grid | **Write custom `useKeyboardGrid` hook** (~100 lines) |
| Global keyboard shortcuts (Ctrl+S, Alt+N, Escape) | `react-hotkeys-hook` | **Install** — not currently in package.json |
| Identifier dropdown search (type → filter → ↓ navigate → Enter select) | `cmdk` | **Already installed** — handles this natively |
| PDF printing | `@react-pdf/renderer` | **Already installed** — no change |
| Focus trap in modals/dialogs | Radix UI (via shadcn Dialog) | **Already installed** — Radix Dialog has built-in focus trap |

**Command:** `npm install react-hotkeys-hook`

### 17.2 `react-hotkeys-hook` Usage
```typescript
import { useHotkeys } from 'react-hotkeys-hook'

// In each single-screen component (PO, VMI, Invoice):
useHotkeys('ctrl+s', () => handleSave(), { enableOnFormTags: true })
useHotkeys('alt+n', () => handleNew(), { enableOnFormTags: true })
useHotkeys('escape', () => handleCancel(), { enableOnFormTags: true })
// enableOnFormTags: true — ensures shortcuts work even when input is focused
```

### 17.3 `useKeyboardGrid` — Why No Library
Libraries like AG Grid, React Table, or Handsontable have keyboard navigation, but:
- They would require replacing the entire custom `TransactionGrid.tsx`
- TransactionGrid has tightly coupled business logic (material auto-fill, tax calculation, combobox integration)
- The custom hook is simple (~100 lines) and integrates cleanly with `data-grid-row`/`data-grid-col` attributes
- No library matches this exact pattern (combobox-aware cell navigation in a React form grid)

---

## PART 18 — Comprehensive Edge Cases Per Feature

### 18.1 Keyboard Navigation Edge Cases
| Edge Case | Handling |
|-----------|---------|
| `setTimeout` race: new row appended async, ↓ tries to focus it immediately | `setTimeout(() => focusCell(row+1, 0), 10)` after appendRow |
| Combobox: Escape without selecting | Focus returns to same cell (no advance); `openComboboxCell` set to null |
| ↓/Enter on last row, row is EMPTY | Do nothing (check: at least one field non-empty/non-zero) |
| ↓/Enter on last row, row HAS data | Append new empty row; focus first cell of new row |
| ←/→ lands on Unit column (read-only) | `focusNextEditableCell` skips it; moves to next editable cell |
| ←/→ lands on Amount column (computed, read-only) | Same skip logic |
| After material combobox selects → auto-advance | Auto-focus Qty cell via `focusCell(rowIndex, QTY_COL)` inside `onSelect` callback |
| Focus leaves grid entirely (Tab past last cell) | Moves to bottom buttons via natural tab order |
| Scroll-into-view | `el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })` after `focus()` |
| Rapid arrow key presses | `focusCell` is synchronous querySelector; no debounce needed |
| Focus on bottom button, Enter pressed | Button's `onClick` fires; `onKeyDown` not needed for buttons |
| Modal open, arrow key pressed | Focus trap by Radix Dialog; grid arrow keys don't interfere |
| Delete row via keyboard | No keyboard shortcut for row delete; delete icon remains mouse-only for safety |

### 18.2 Stage Master Edge Cases
| Edge Case | Handling |
|-----------|---------|
| Duplicate stage name | Catch unique constraint; show "Stage name already exists" toast |
| Stage created with no materials | Allowed; New VMI shows "No default materials — add manually" |
| Same material added twice in stage sub-grid | Client-side duplicate check before save |
| Stage code auto-gen: S099 → S100 | Pad to 3 digits then 4: S001...S999 → S1000; use string MAX approach |
| Deleting stage used in Draft MIs (not Issued) | Soft-delete; warn: "X draft slips use this stage. Stage is deactivated but existing slips are unchanged." |
| Deleting stage used in Issued MIs | Block: "Cannot delete — used in {n} issued slips" |
| Soft-deleted stage appears in New VMI stage dropdown | Filter by `stages.is_active = true`; deleted stage not offered |
| Soft-deleted stage still referenced by old slip | Reports join works (stage row still exists in DB); shows stage name correctly |
| Stage name changed | Historical slips show new name via join — intentional (rename propagates to reports) |

### 18.3 New VMI Edge Cases
| Edge Case | Handling |
|-----------|---------|
| Vehicle has no linked customer | Block: "Vehicle has no associated customer. Please update vehicle master first." |
| Stage has no materials | Allow; grid empty with prompt: "No default materials — add materials manually" |
| Material in stage has no PO rate | Rate cell shows 0; amber warning per row: "No purchase rate found — enter manually" |
| Rate = 0 on Issue | Warn toast "Some items have ₹0 rate" + confirm dialog before issuing |
| Stock insufficient for ≥1 item | Block Issue; list ALL failing materials: "Insufficient stock: [Material A]: have 2 FT, need 10 FT" |
| User changes Stage after grid populated | Confirmation: "Changing stage will replace current grid items. Proceed?" |
| Same material multiple times in grid | Allowed; stock check aggregates by material_id |
| Qty = 0 for a row on Issue | Skip stock deduction for that row; include in slip record (informational) |
| Slip number uniqueness under concurrent saves | `UNIQUE(slip_number, financial_year)` at DB level; retry with MAX+1 if collision |
| Vehicle dropdown has 500+ vehicles | Combobox renders only first 10 matches; cmdk handles this efficiently |

### 18.4 Clone VMI Edge Cases
| Edge Case | Handling |
|-----------|---------|
| Clone source is Cancelled | Disallow; show "Cannot clone a cancelled slip" |
| Double-click on Clone button | Disable button while server action in flight (loading state) |
| Cloned slip's materials were soft-deleted | Clone still creates items; warn for any inactive materials on open |
| Concurrent clone + auto-increment collision | `UNIQUE(slip_number, FY)` catches it; retry once automatically |
| Rates are stale (original slip is old) | Toast warning after clone: "Rates copied from original slip — please verify before issuing" |
| Cloned slip vehicle field empty → user tries to Issue | Block Issue: "Vehicle must be selected before issuing" |

### 18.5 PO Revert to Draft Edge Cases
| Edge Case | Handling |
|-----------|---------|
| Pre-flight check | ONE bulk query: `SELECT ... WHERE (m.current_stock - poi.qty) < 0` — single round-trip |
| `affects_stock = false` PO | Skip stock step; still stamp `reverted_at`/`reverted_by` for audit trail |
| Race condition: stock reduced between pre-flight and actual update | `materials.current_stock >= 0` CHECK constraint (`current_stock_non_negative`) is final guard |
| After revert: immediate re-receive | Allowed; PO becomes Draft → user edits → receives again |
| Very large PO (50+ items) | Single bulk pre-flight query handles any size |

### 18.6 Insurance Bill Edge Cases
| Edge Case | Handling |
|-----------|---------|
| Create from Draft invoice | Button hidden for Draft; server action rejects with error |
| `UNIQUE(invoice_id)` violated (double-click Create) | DB constraint rejects; show "Insurance bill already exists" |
| Customer invoice cancelled with Draft insurance bill | Warn + confirm → delete insurance items → delete insurance header → cancel invoice |
| Customer invoice cancel with Finalized insurance bill | Block: "Cannot cancel — this invoice has a finalized insurance bill." |
| Insurance items: material not in master (free-text) | Use `material_name_override TEXT` column; `material_id = NULL` with override for display/PDF |
| Insurance bill margin changed → recalculate amounts | Same debounced margin logic as existing `invoice-form.tsx` (`useDebounce(300ms)`) |
| Print insurance before finalizing insurance bill | Allowed (Draft can be printed for preview) |
| `gst_type` for insurance bill | Read from `invoice_items[0].gst_type` at creation; stored in `invoice_insurance.gst_type` |
| Insurance bill net amount > customer bill | Completely allowed (primary use case) |

### 18.7 Costing Reports Edge Cases
| Edge Case | Handling |
|-----------|---------|
| Vehicle with no issued slips | Empty table + "No issued material slips found for vehicle [name]" |
| Margin% = 0 | Show base amounts (valid) |
| Margin% negative | Allow; show amounts as discounted |
| Margin% > 100 | Allow (user may need 200% markup for insurance) |
| Old VMI items (null stage_id) | Grouped under "Direct Issue" using COALESCE; appears at bottom |
| Stage name changed after VMI issued | Reports show current stage name (join at query time) |
| Export PDF with 100+ rows | `@react-pdf/renderer` handles multi-page natively |
| Export without selecting vehicle | Show/Print buttons disabled until vehicle selected |

### 18.8 Vehicle Comparison Edge Cases
| Edge Case | Handling |
|-----------|---------|
| Same vehicle selected for both | All diffs = 0; "Diff.Material" mode shows empty table + message |
| One vehicle has no issued slips | FULL OUTER JOIN shows all materials from other vehicle with 0 qty/amt |
| Stage filter + no data for that stage | Empty table + "No materials found for this stage in either vehicle" |
| "Diff.Material" + all diffs = 0 | Empty table + "No material differences between the two vehicles" |
| Long material names in PDF | `@react-pdf/renderer` text wrapping in table cells; no truncation |
| Compare + export before results shown | Export disabled until results loaded |

### 18.9 Stock Tab Edge Cases
| Edge Case | Handling |
|-----------|---------|
| Refresh while previous refresh pending | `isPending` state disables button; double-refresh prevented |
| `rate_at_time` NULL for old ADJUSTMENT entries | History Drawer shows "Rate data not available for this adjustment" |
| Manual adjustment: material has never been purchased | `rate_at_time = NULL` stored; drawer explains "No purchase rate on file" |
| `useEffect([initialRows])` trigger: object reference changes every render | Use `key={refreshCount}` on client component to force remount — simpler than deep equality |
| Concurrent adjustment by two users | Existing optimistic concurrency check in `adjustStock()` handles this |

---

## PART 19 — Cross-Tab & Cross-Feature Consistency Map

### 19.1 When VMI Is Issued
| Affected Area | Impact | Mechanism |
|--------------|--------|----------|
| `materials.current_stock` | Decremented for each item (affects_inventory=true) | `issueMaterialIssue()` existing |
| `stock_ledger` | ISSUE entries appended | same action |
| Stock Tab | Shows new stock level on refresh | router.refresh() |
| Home Tab | `lowStockCount` / stock value updates | re-fetched on page load |
| Invoice Tab | New issued slip appears in MI checklist for that vehicle | `getIssuedMIsForVehicle()` (no issue_type filter needed) |
| Stage Wise Costing | New slip included in totals | query re-runs on Show |
| Vehicle Comparison | New slip included in comparison | same |

### 19.2 When PO Is Received / Reverted
| Affected Area | Impact |
|--------------|--------|
| `materials.current_stock` | Incremented on receive; decremented on revert |
| `stock_ledger` | PO_INWARD on receive; REVERSAL on revert (with `adjusted_by=email`, `rate_at_time`) |
| Stock Tab | Stock level updates |
| Home Tab | `fyTotalPurchases` updates; stock value updates |

### 19.3 When Stage Is Created / Updated / Deleted
| Affected Area | Impact |
|--------------|--------|
| New VMI stage dropdown | Shows new/updated stage (filter `is_active=true`); deleted stage hidden |
| Stage Wise Costing | New stage appears once VMI slips are issued for it |
| Vehicle Comparison | New stage grouping appears in results |
| Existing issued VMI slips | Unaffected (`stage_id` FK preserved; stage name shown via join) |
| Stage material update | Affects only FUTURE New VMI slips; existing issued slips unaffected |

### 19.4 When Material Is Soft-Deleted
| Affected Area | Impact |
|--------------|--------|
| `stage_materials` FK | Remains valid; `getStageMaterials()` filters by `materials.is_active = true` |
| Existing PO/VMI/Invoice items | Unaffected (FK still valid; history preserved) |
| All master dropdowns | Filter `is_active = true`; deleted material not offered |
| Stock Tab | Soft-deleted material still shows in stock; UI should filter by is_active |

### 19.5 When Insurance Bill Is Created / Finalized
| Affected Area | Impact |
|--------------|--------|
| Invoice header badge | "Insurance ✓" green badge appears via EXISTS check |
| "Create Insurance Bill" button | Replaced by "View Insurance Bill" |
| "Print Insurance" button | Enabled |
| Customer invoice: Cancel button | Blocked if insurance bill is Finalized |
| Stock / Home / Reports | No impact (insurance bill is pricing-only, no stock movements) |

### 19.6 When Invoice Is Finalized / Cancelled
| Affected Area | Impact |
|--------------|--------|
| MI slips | Finalize: slips locked; Cancel: `invoiceSlipLinks` cascade deleted → slips freed for re-invoicing |
| Home Tab | `fyTotalSales` KPI updates |
| Insurance Bill | Cancellation blocked if Finalized insurance bill exists |

### 19.7 When New Record Created in Any Master
| Master | Immediate Effect |
|--------|-----------------|
| New Stage | Appears in New VMI stage dropdown immediately |
| New Material | Appears in TransactionGrid material combobox immediately |
| New Vehicle | Appears in VMI vehicle dropdown, Invoice vehicle dropdown |
| New Customer | Available for vehicle linking in Vehicle master |
| New Supplier | Appears in PO supplier combobox |
| New Unit | Available in material master; auto-fills in grid when material selected |
| New Contractor | Appears in VMI grid contractor combobox |

All dropdowns fetch fresh data (not cached), so new masters appear immediately without page refresh.

### 19.8 Single-Screen UX Consistency Rules (Applied Universally)
| Rule | Where Applied |
|------|--------------|
| Page opens blank | PO, Old VMI, New VMI, Invoice |
| Identifier dropdown auto-focused on load | PO (PO Number), Old VMI (Slip Number), Invoice (Bill Number) |
| All fields inline-editable (no Edit button) | PO, Old VMI, New VMI, Invoice, Stage Master sub-grid |
| Bottom buttons always visible | PO, Old VMI, New VMI, Invoice, Stage Master |
| Save branches by status | PO: Draft → `updatePurchaseOrder()`, Received → `updateReceivedPurchaseOrder()`; VMI: Draft → `updateMaterialIssue()`, Issued → `updateIssuedMaterialIssue()` |
| No "Edit" or "Modify" button anywhere | Universal |

---

## AUDIT FINDINGS (8-Lens Review)

> **Audit performed against actual codebase on 2026-06-21.**
> All function names, line numbers, column names, and table names are verified against the actual source files read during audit.

---

### LENS 1 — Business Logic & Workflow Reviewer

**[GAP][Lens 1] PO "Delete Received" already does a full stock reversal — `revertPOToDraft` should be modelled on it**

`deletePurchaseOrder()` (lines 527–598) is the perfect template. Key difference: instead of `tx.delete(purchaseOrders)`, call `tx.update(purchaseOrders).set({ status: 'Draft', reverted_at: NOW(), reverted_by: userId })`. Pre-flight stock check pattern (lines 542–561) is production-tested — reuse it.

**[GAP][Lens 1] `updatePurchaseOrder()` silently fails for Received POs (WHERE status = 'Draft' filter at line 364)**

Single-screen Save must branch: Draft → `updatePurchaseOrder()`; Received → `updateReceivedPurchaseOrder()`.

**[CONFLICT][Lens 1] Old VMI: `updateMaterialIssue()` throws hard error for Issued slips (line 451)**

Single-screen Save must branch: Draft → `updateMaterialIssue()`; Issued → `updateIssuedMaterialIssue()`.

**[CORRECTED][Lens 1] Old VMI: `materialIssues.vehicle_id` is NOT NULL — Clone cannot omit it**

Clone MUST copy `vehicle_id` from source slip. Form loads with same vehicle pre-filled; user can then change it.

**[GAP][Lens 1] `cancelInvoice()` does not check for insurance bills**

Add pre-check before `db.transaction()`: if Finalized insurance bill → throw; if Draft → delete insurance records in same transaction.

**[GAP][Lens 1] `revertInvoiceToDraft()` already exists at `invoices.actions.ts` line 730 — no new action needed**

**[RESOLVED][Lens 1] New VMI slips ARE invoiceable — `getIssuedMIsForVehicle()` needs no `issue_type` filter**

---

### LENS 2 — Database & Schema Architect

**[CRITICAL][Lens 2] All new columns/tables are absent from production schema — migrations are mandatory before any code runs**

- `materialIssues`: no `issue_type`, no `stage_id` → Part 2.2 mandatory
- `invoices`: no `include_tax` → Part 2.3 mandatory
- `stockLedger`: no `rate_at_time` → Part 2.6 mandatory
- `purchaseOrders`: no `reverted_at`, no `reverted_by` → Part 2.5 mandatory

**[CRITICAL][Lens 2] Migration order: `CREATE TABLE stages` must precede `ALTER TABLE material_issues ADD COLUMN stage_id REFERENCES stages(id)`**

**[CORRECTED][Lens 2] `materialIssues.vehicle_id` is NOT NULL — Clone plan corrected: must copy `vehicle_id`**

**[GAP][Lens 2] `invoice_insurance` FK to `invoices(id)` has no ON DELETE CASCADE — intentional**

`cancelInvoice()` does NOT delete the invoice row (sets `status = 'CANCELLED'`), so no FK violation occurs on cancellation. Safe by design.

**[GAP][Lens 2] `materials` table has DB CHECK constraint `current_stock_non_negative` at schema.ts line 119**

`current_stock >= 0` is the last-line defense for the PO revert race condition.

**[GAP][Lens 2] `invoice_insurance_items` must include `material_name_override TEXT` — added to Part 2.4 schema**

**[GAP][Lens 2] `stage_materials.material_id` FK should explicitly specify `ON DELETE RESTRICT`**

---

### LENS 3 — Backend Logic & API Reviewer

**[CORRECTED][Lens 3] Stock refresh fix: plan used wrong variable name `setMaterials` — actual variable is `setRows`**

`stock-client.tsx` has `const [rows, setRows] = useState(initialRows)`. Fix uses `setRows(initialRows)` in `useEffect`.

**[GAP][Lens 3] `adjustStock()` does not read `last_po_rate` — transparency fix requires new query**

Must add DISTINCT ON rate query to `adjustStock()` before inserting ledger entry. Two queries per adjustment.

**[RESOLVED][Lens 3] Remove `outStockCount` from `getDashboardStats()` — add `totalStockValue` via inline DISTINCT ON rate query**

**[GAP][Lens 3] `revertPOToDraft` pre-flight check: should be OUTSIDE transaction (matching `deletePurchaseOrder` pattern)**

Pre-flight outside, then atomic update inside, relying on DB CHECK constraint for races.

**[GAP][Lens 3] Monthly Stock Report: `REVERSAL` type from `PO_REVERT` correctly falls into "Reversals" bucket — no change needed to `reports.actions.ts`**

---

### LENS 4 — Frontend & UX Reviewer

**[CONFIRMED][Lens 4] TransactionGrid.tsx: single Tab handler on Qty only; no data-grid-row/col attributes — bug diagnosis is correct**

**[CONFIRMED][Lens 4] `combobox.tsx` `PopoverTrigger` has no `onKeyDown` — ↓-opens-dropdown fix confirmed absent**

**[GAP][Lens 4] `ComboboxProps` interface has no `onOpenChange` prop — must be added to `combobox.tsx`**

**[CORRECTED][Lens 4] Masters keyboard: focus-move-after-Enter does NOT exist in `customers-client.tsx` — must be built, not replicated**

**[CONFIRMED][Lens 4] Rev.Chrg.Status and Rate Date: safe to remove from UI only (not in `InvoiceHeaderInput` interface already)**

**[GAP][Lens 4] Dead routes for PO, VMI, Invoice must be cleaned up — Home page links updated to `?id=` pattern**

**[CONFIRMED][Lens 4] `tailwind.config.ts` has no custom `fontSize` — Part 12.1 will ADD it**

**[CONFIRMED][Lens 4] `globals.css` has no custom table/card/spacing overrides — Part 12.2 will ADD them**

**[CONFIRMED][Lens 4] `invoice-form.tsx` already has "Revert to Draft" button (lines 830–841) — reuse in single-screen rewrite**

**[GAP][Lens 4] Insurance bill PDF: existing `insurance-invoice-pdf.tsx` uses `InvoiceRow[][]` (customer items) — cannot be used without adapter or new component**

Print Insurance from insurance bill view must render `invoice_insurance_items`. New adapter mapping or new PDF component required.

---

### LENS 5 — Cross-Feature Impact Reviewer

**[RESOLVED][Lens 5] `getMaterialIssues()` must accept `issueType` parameter for Old/New VMI split**

Add `issueType: 'OLD' | 'NEW'` parameter. Old VMI screen passes `'OLD'`; New VMI screen passes `'NEW'`.

**[RESOLVED][Lens 5] `getIssuedMIsForVehicle()`: no `issue_type` filter needed — New VMI slips ARE invoiceable**

**[CONFIRMED][Lens 5] Adding `include_tax` to `invoices` table will NOT break `getInvoices()` or `getInvoiceSummaryReport()` — both use explicit column selection**

**[RESOLVED][Lens 5] `outStockCount`: remove completely from `getDashboardStats()` — only `page.tsx` line 100 references it**

**[CONFIRMED][Lens 5] Monthly Stock Report correctly handles new REVERSAL entries from `revertPOToDraft` — no change needed**

---

### LENS 6 — Test Coverage Reviewer

**[GAP][Lens 6] Zero test files in `src/` — all testing is manual**

**Required manual test checklist:**

**PO Revert to Draft:**
1. Create PO with 3 items, receive it; verify stock increases
2. Revert to Draft; verify stock decreases back to pre-receive levels
3. Verify `stock_ledger` shows 3 REVERSAL entries with `adjusted_by` and `rate_at_time`
4. Verify PO status is "Draft", all fields editable
5. Re-receive; verify stock increases again correctly
6. Race condition: two browser tabs simultaneously — verify DB CHECK constraint fires

**New VMI Stage Flow:**
1. Create stage with 3 materials
2. Open New VMI, select vehicle, select stage — grid pre-populates
3. Modify quantities, add 4th row manually
4. Save draft, reload — all items persist including `stage_id`
5. Issue; verify stock decreases for `affects_inventory=true` items
6. Stage Wise Costing report; verify items appear under correct stage

**Insurance Bill:**
1. Create invoice, finalize it
2. Click "Create Insurance Bill" — form opens in-place
3. Items pre-populated from customer bill
4. Modify quantities, finalize insurance bill
5. Attempt to cancel parent invoice — must be blocked
6. Double-click "Create Insurance Bill" — must show error (UNIQUE constraint)

**Keyboard Navigation:**
1. Open PO screen, press ↓ on identifier dropdown — must open and highlight first option
2. Tab from last header field → focus enters row 0 col 0 (Material combobox)
3. Arrow down on last filled row → new empty row appended, focus moves to it
4. Arrow down on empty last row → nothing happens
5. Arrow right on Unit column (read-only) → skips to Rate column
6. Open material combobox → arrow keys navigate options (cmdk), not grid
7. Close combobox via Escape → focus returns to same cell

**Stock Refresh:**
1. Open Stock Tab
2. In different tab, receive a PO (stock increases)
3. Return to Stock Tab, click Refresh — must show updated stock immediately

---

### LENS 7 — Security & Data Integrity Reviewer

**[RESOLVED][Lens 7] Insurance bill PDF body label — NOT required. PDF metadata title difference is sufficient.**

**[GAP][Lens 7] `revertPOToDraft` should set `adjusted_by=userEmail` in REVERSAL stock ledger entries**

Current `REVERSAL` entries in `deletePurchaseOrder` (line 584) and `updateReceivedPurchaseOrder` (line 464) do NOT set `adjusted_by`. New `revertPOToDraft` MUST set it for audit trail.

**[CONFIRMED][Lens 7] `adjustStock()` correctly logs `adjusted_by` and `reason` (lines 299–301)**

**[CONFIRMED][Lens 7] `current_stock >= 0` CHECK constraint confirmed at schema.ts line 119 — name: `current_stock_non_negative`**

**[RESOLVED][Lens 7] `reverted_by` stores email address — same pattern as `cancelled_by: user?.email ?? "unknown"` in `cancelInvoice()`**

---

### LENS 8 — Release & Deployment Reviewer

**[CRITICAL][Lens 8] Migration order is mandatory**

Safe deployment order:
1. `CREATE TABLE stages (...)`
2. `CREATE TABLE stage_materials (...)`
3. `ALTER TABLE material_issues ADD COLUMN issue_type TEXT NOT NULL DEFAULT 'OLD'`
4. `ALTER TABLE material_issues ADD COLUMN stage_id UUID REFERENCES stages(id)`
5. `ALTER TABLE invoices ADD COLUMN include_tax BOOLEAN DEFAULT false`
6. `ALTER TABLE purchase_orders ADD COLUMN reverted_at TIMESTAMPTZ`
7. `ALTER TABLE purchase_orders ADD COLUMN reverted_by TEXT`
8. `ALTER TABLE stock_ledger ADD COLUMN rate_at_time NUMERIC(14,4)`
9. `CREATE TABLE invoice_insurance (...)`
10. `CREATE TABLE invoice_insurance_items (...)`

**Day-1 safety:**
- Existing VMI slips → `issue_type = 'OLD'` via DEFAULT → appear in Old VMI screen correctly ✓
- Existing invoices → `include_tax = false` via DEFAULT → no tax columns shown by default ✓
- Existing stock ledger → `rate_at_time = NULL` → History Drawer shows "Rate data not available" ✓
- PO `reverted_at/by` → nullable → existing POs unaffected ✓

**[GAP][Lens 8] `ALTER TABLE stock_ledger ADD COLUMN rate_at_time NUMERIC(14,4)` is safe in PostgreSQL 12+ (nullable column, metadata-only, no table lock)**

**Post-deployment checklist (first 30 minutes):**
1. Open Stock Tab → confirm all materials show correct stock levels
2. Open Home Tab → confirm KPI cards render (especially `totalStockValue`)
3. Open Old VMI list → confirm all pre-migration slips appear with `issue_type = 'OLD'`
4. Open New VMI tab → confirm empty list (correct)
5. Open PO list → confirm all POs visible
6. Open Invoice list → confirm all invoices visible
7. Check Reports tab → confirm all 4 existing report tabs function
8. Create test PO → receive → revert to Draft → re-receive → verify stock at each step
9. Create test Invoice → Finalize → create Insurance Bill draft → confirm badge appears

**[ROLLBACK PLAN] All schema changes are ADD COLUMN / CREATE TABLE — rollback is DROP COLUMN / DROP TABLE**

Mark `[NO ROLLBACK — IRREVERSIBLE]` once production data uses new columns.

**[NO ROLLBACK][Lens 8] Finalizing an insurance bill blocks parent invoice cancellation permanently (unless insurance bill is separately reverted first) — by design.**

**[NO ROLLBACK][Lens 8] `stockLedger` is append-only — REVERSAL, PO_REVERT, ADJUSTMENT entries are permanent records.**

---

## CRITICAL FINDINGS SUMMARY

**[CRITICAL — DATA LOSS RISK]**
1. `[CORRECTED]` `materialIssues.vehicle_id` is `NOT NULL` — Clone must copy `vehicle_id` from source slip.
2. `[CRITICAL]` `materialIssues` table has no `issue_type` or `stage_id` — migration mandatory before New VMI code.
3. `[CRITICAL]` `invoices` table has no `include_tax` — migration mandatory before tax toggle.
4. `[CRITICAL]` `stockLedger` table has no `rate_at_time` — migration mandatory before stock transparency fix.
5. `[CRITICAL]` `purchaseOrders` table has no `reverted_at` or `reverted_by` — migration mandatory before revert feature.
6. `[CORRECTED]` Stock refresh fix used `setMaterials` — actual variable is `setRows`. Fixed in Part 11.1.
7. `[CRITICAL]` Column indices in `useKeyboardGrid` vary by mode (PO vs MI vs Invoice) — confirm actual indices during implementation.
8. `[RESOLVED]` `getMaterialIssues()` must accept `issueType` parameter for split Old/New VMI screens.
9. `[CRITICAL]` Migration order: `CREATE TABLE stages` must precede `ALTER TABLE material_issues ADD COLUMN stage_id`.

**[CONFLICT]**
10. `[CONFLICT]` Old VMI Save must branch by status: Draft → `updateMaterialIssue()`, Issued → `updateIssuedMaterialIssue()`.
11. `[CORRECTED]` Masters keyboard focus-move-after-Enter does NOT exist — must be built from scratch, not replicated.

**[NO ROLLBACK — IRREVERSIBLE]**
12. Finalizing an insurance bill blocks parent invoice cancellation permanently.
13. `stockLedger` is append-only — all entries are permanent records.
14. Once production data uses new columns, dropping them destroys data.

---

## DECISIONS LOG

All decisions finalized 2026-06-21:

| # | Decision | Answer |
|---|----------|--------|
| 1 | New VMI slips invoiceable via invoice checklist? | **Yes** — both Old and New appear; no filter needed |
| 2 | `reverted_at/by` stamped for `affects_stock = false` POs? | **Yes** — always stamp for complete audit trail |
| 3 | `gst_type` source for insurance bill? | **`invoice_items[0].gst_type`** of parent invoice |
| 4 | Remove `outStockCount` from backend completely? | **Yes** — remove from return type and query |
| 5 | `reverted_by` stores email or display name? | **Email address** — same as `cancelled_by` pattern |
| 6 | Home page recent-activity links? | **Open transaction screen with record pre-loaded** via `?id=<recordId>` query param |
| 7 | PDF CUSTOMER/INSURANCE COPY body label? | **Not required** — PDF metadata title difference is sufficient |

---

## CONFIRMED SOLID (Plan and Code Are Aligned)

- **`revertPOToDraft` pattern**: `deletePurchaseOrder` Received-PO path is the perfect template (pre-flight + atomic transaction + ledger entries).
- **`updateReceivedPurchaseOrder`**: Atomic reverse-then-reapply pattern is production-tested (lines 433–521).
- **VMI Issue/UpdateIssued**: Both `issueMaterialIssue()` and `updateIssuedMaterialIssue()` are production-tested. Old VMI single-screen calls them without modification.
- **`cancelInvoice()`**: Correct pattern for freeing MI slip links atomically. Insurance bill guard added as pre-check.
- **`invoice_slip_links` junction table**: Already works correctly; New VMI slips use the same table.
- **`stockLedger` append-only pattern**: Consistent across all existing operations. New operations follow this pattern.
- **`getStockDashboardMaterials()` `totalStockValue` computation**: Already computed in `stock.actions.ts` (lines 160–168). Home KPI replicates the aggregation inline in `getDashboardStats()`.
- **Combobox cmdk integration**: cmdk handles ↑/↓/Enter when dropdown is open. Only gap (↓ when closed) is correctly identified and fixable with one `onKeyDown` line.
- **`adjustStock()` concurrency pattern**: Optimistic concurrency check is solid. New actions follow where applicable.
- **Schema soft-delete pattern (`is_active`)**: Consistent across customers, suppliers, materials, vehicles, contractors, units. Stage master follows this exact pattern.
- **Financial year uniqueness constraints**: `slip_number_fy_unique` covers both Old and New VMI slips (same table, same constraint — correct).
- **No test suite**: Confirmed. All verification is manual. Lens 6 test checklist is the complete testing plan.
