# DVN IMS — Progress Tracker

> **How to use:** At the start of a new chat say:
> "Read PLAN.md and PROGRESS.md. Today we are implementing: Phase X — [name]"
> Update this file at the end of every session.

## Status Key
✅ Done | 🔄 In Progress | ⏳ Not Started | ⚠️ Blocked | 📋 Reference (no code tasks)

---

## Current Status
**Last session:** 2026-06-22 — Phase 1 fully complete. schema.ts updated, migration 0002_unknown_hydra.sql generated and pushed to DB, react-hotkeys-hook installed.
**Next up:** Phase 2 — Keyboard Navigation + CSS

---

## Phase 1 — Foundation: DB Migrations + Library Install
_Everything else depends on these schema changes. Do this first._

### Part 2.1 — stages + stage_materials tables
| Task | Status | Notes |
|------|--------|-------|
| CREATE TABLE stages | ✅ Done | Added to schema.ts; migration 0002_unknown_hydra.sql generated |
| CREATE TABLE stage_materials | ✅ Done | FK to stages(id) CASCADE + materials(id) RESTRICT; UNIQUE(stage_id, material_id) |

### Part 2.2 — material_issues: new columns
| Task | Status | Notes |
|------|--------|-------|
| ADD COLUMN issue_type TEXT NOT NULL DEFAULT 'OLD' | ✅ Done | Existing rows get 'OLD' automatically |
| ADD COLUMN stage_id UUID REFERENCES stages(id) | ✅ Done | Nullable; only set for New VMI slips |

### Part 2.3 — invoices: tax toggle
| Task | Status | Notes |
|------|--------|-------|
| ADD COLUMN include_tax BOOLEAN DEFAULT false | ✅ Done | Existing invoices show no tax columns by default |

### Part 2.4 — insurance bill tables
| Task | Status | Notes |
|------|--------|-------|
| CREATE TABLE invoice_insurance | ✅ Done | UNIQUE(invoice_id); no ON DELETE CASCADE — intentional |
| CREATE TABLE invoice_insurance_items | ✅ Done | Includes material_name_override TEXT for free-text items |

### Part 2.5 — purchase_orders: revert audit columns
| Task | Status | Notes |
|------|--------|-------|
| ADD COLUMN reverted_at TIMESTAMPTZ | ✅ Done | Nullable; existing rows unaffected |
| ADD COLUMN reverted_by TEXT | ✅ Done | Stores email address (same pattern as cancelled_by) |

### Part 2.6 — stock_ledger: rate transparency
| Task | Status | Notes |
|------|--------|-------|
| ADD COLUMN rate_at_time NUMERIC(14,4) | ✅ Done | Nullable; NULL for pre-migration rows is expected |

### Part 17 — Library Install
| Task | Status | Notes |
|------|--------|-------|
| npm install react-hotkeys-hook | ✅ Done | Installed successfully |

### DB Push
| Task | Status | Notes |
|------|--------|-------|
| npx drizzle-kit push | ✅ Done | Applied successfully — "Changes applied" confirmed |

---

## Phase 2 — Keyboard Navigation + CSS
_Can start once Phase 1 is done. Part 12 (CSS) can be done any time — it's cosmetic._

### Part 1.1 — Root Cause Analysis
| | Status |
|-|--------|
| Diagnosis: Tab-only handler on Qty in TransactionGrid; no data-grid attrs; combobox ↓ gap | 📋 Reference |

### Part 1.2 — useKeyboardGrid hook
| Task | Status | Notes |
|------|--------|-------|
| New file: src/hooks/use-keyboard-grid.ts | ⏳ Not Started | ~100 lines; combobox-aware; uses data-grid-row/col attrs |
| handleKeyDown(e, row, col, isComboboxOpen) | ⏳ Not Started | When combobox open: return early; let cmdk handle |
| focusCell(row, col) via querySelector | ⏳ Not Started | el.scrollIntoView after focus |
| focusNextEditableCell(row, col, direction) | ⏳ Not Started | Skips disabled/readonly cells (Unit, Amount) |
| appendEmptyRow only when current row has data | ⏳ Not Started | rowHasAnyData() check before appending |

### Part 1.3 — TransactionGrid.tsx keyboard wiring
| Task | Status | Notes |
|------|--------|-------|
| Add data-grid-row + data-grid-col to every input and combobox trigger | ⏳ Not Started | |
| Replace Tab-only handler with useKeyboardGrid on all cells | ⏳ Not Started | Remove old handleTabOnLastCell |
| Track openComboboxCell: {row,col} \| null in state | ⏳ Not Started | |
| Pass onOpenChange to each combobox cell | ⏳ Not Started | Sets/clears openComboboxCell |
| Auto-focus Qty cell after material selected from combobox | ⏳ Not Started | Inside onSelect callback: focusCell(rowIndex, QTY_COL) |

### Part 1.4 — combobox.tsx identifier dropdown fix
| Task | Status | Notes |
|------|--------|-------|
| Add onKeyDown to PopoverTrigger: ↓ opens dropdown | ⏳ Not Started | e.preventDefault(); setOpen(true) |
| Add onOpenChange prop to ComboboxProps interface | ⏳ Not Started | Not currently in the interface |

### Part 1.5 — Masters keyboard: all screens
| Task | Status | Notes |
|------|--------|-------|
| Focus-move-after-Enter in all *-client.tsx (customers, suppliers, materials, units, tax, contractors, vehicles) | ⏳ Not Started | Does NOT exist yet — build from scratch |
| Tab through form fields → Tab to Save button → Enter saves | ⏳ Not Started | |
| Escape: dirty check → confirm dialog; clean → deselect, back to search | ⏳ Not Started | |

### Part 1.6 — Keyboard nav: remaining tabs
| Task | Status | Notes |
|------|--------|-------|
| Reports: Tab through filters; Enter on last filter → Show | ⏳ Not Started | |
| Stock: Tab/↑/↓ navigate rows; Enter opens History drawer | ⏳ Not Started | |
| Home: Tab between interactive elements (KPIs are read-only) | ⏳ Not Started | |
| Settings: Tab fields; Ctrl+S save | ⏳ Not Started | |

### Part 18.1 — Keyboard Navigation Edge Cases
| | Status |
|-|--------|
| setTimeout race on new row; Escape without combobox select; ↓ on empty last row; skip read-only cells; combobox intercept; scroll-into-view; modal focus trap | 📋 Reference — verify during Phase 2 testing |

### Part 12 — CSS / Fonts / Whitespace
| Task | Status | Notes |
|------|--------|-------|
| tailwind.config.ts: fontSize overrides (base=14px, sm=12px, xs=11px) | ⏳ Not Started | |
| globals.css @layer base: td py-1.5 px-3; card p-4; form gap-2 | ⏳ Not Started | |
| globals.css: bg-slate-50 content area; bg-slate-700 table headers; alternating rows | ⏳ Not Started | |

---

## Phase 3 — Stage Master
_Requires Part 2.1 (stages + stage_materials tables) from Phase 1, and Phase 2 (useKeyboardGrid hook needed for the Stage Master materials sub-grid)._

### Part 7.1 — Stage Master UI Layout
| Task | Status | Notes |
|------|--------|-------|
| stages-client.tsx: search list left; form right (matches existing masters pattern) | ⏳ Not Started | |
| Materials sub-grid: Sl# \| Material (combobox) \| Default Qty \| Unit (auto-fill) | ⏳ Not Started | Full useKeyboardGrid arrow nav |
| No Edit/Modify button — all fields inline-editable | ⏳ Not Started | |
| Add Stage Master to Masters sidebar nav | ⏳ Not Started | |

### Part 7.2 — Deletion Rules
| Task | Status | Notes |
|------|--------|-------|
| deleteStage(): check Issued MIs → block if count > 0 | ⏳ Not Started | Error: "Stage used in {n} issued slips — cannot delete" |
| deleteStage(): soft-delete (is_active=false) if no Issued MIs | ⏳ Not Started | |
| Warn if Draft MIs reference the stage (don't block, just warn) | ⏳ Not Started | |

### Part 7.3 — Server Actions (stages.actions.ts)
| Task | Status | Notes |
|------|--------|-------|
| createStage(name) — auto stage_code: S001, S002... | ⏳ Not Started | |
| updateStage(id, name) | ⏳ Not Started | |
| deleteStage(id) — soft delete | ⏳ Not Started | |
| upsertStageMaterials(stageId, items[]) — atomic DELETE + INSERT in transaction | ⏳ Not Started | |
| getStagesWithMaterials() — for stage master list | ⏳ Not Started | |
| getStagesForDropdown() — active only; for New VMI dropdown | ⏳ Not Started | |
| getStageMaterials(stageId) — with last PO rate; for New VMI grid pre-fill | ⏳ Not Started | |

### Part 18.2 — Stage Master Edge Cases
| | Status |
|-|--------|
| Duplicate stage name; stage with no materials; same material twice in sub-grid; stage_code S999→S1000; soft-delete with Draft MIs; deleted stage in reports via join | 📋 Reference — verify during Phase 3 testing |

---

## Phase 4 — Purchase Orders (single-screen)
_Requires Part 2.5 (reverted_at/by columns) from Phase 1, and Phase 2 (TransactionGrid keyboard wiring needed for PO grid navigation)._

### Part 3.1 — Screen Layout
| | Status |
|-|--------|
| Layout defined: PO No, Date, Status, Supplier, Vehicle, Total; right panel batch print range | 📋 Reference |

### Part 3.2 — Inline Editing (no Edit/Modify button)
| Task | Status | Notes |
|------|--------|-------|
| Rewrite purchase-orders-client.tsx as single screen | ⏳ Not Started | Page opens blank; identifier dropdown auto-focused |
| All header fields always editable inline (Date, Supplier, Vehicle) | ⏳ Not Started | |
| Save branches by status: Draft → updatePurchaseOrder(); Received → updateReceivedPurchaseOrder() | ⏳ Not Started | updatePurchaseOrder() has WHERE status='Draft' — must branch |

### Part 3.3 — Button State Logic
| Task | Status | Notes |
|------|--------|-------|
| No record: show New \| Exit | ⏳ Not Started | |
| Draft: show New \| Save \| Delete \| Mark as Received \| Print \| Cancel \| Exit | ⏳ Not Started | |
| Received: show New \| Save \| Delete \| Revert to Draft \| Print \| Cancel \| Exit | ⏳ Not Started | |

### Part 3.4 — revertPOToDraft server action
| Task | Status | Notes |
|------|--------|-------|
| Pre-flight bulk stock check OUTSIDE transaction | ⏳ Not Started | Modelled on deletePurchaseOrder() lines 542–561 |
| Atomic transaction: stock reversal + INSERT stock_ledger REVERSAL + set status='Draft' | ⏳ Not Started | |
| Stamp reverted_at=NOW(), reverted_by=userEmail even for affects_stock=false POs | ⏳ Not Started | |
| Error dialog listing all blocking materials (not just first) | ⏳ Not Started | |
| DB CHECK constraint current_stock_non_negative as final race guard | ⏳ Not Started | Surfaces as error if race occurs |

### Part 3.5 — Home page deep links
| Task | Status | Notes |
|------|--------|-------|
| PO screen reads ?id= query param on mount and auto-loads that PO | ⏳ Not Started | |

### Part 3.6 — Dead routes to delete
| Task | Status | Notes |
|------|--------|-------|
| Delete /transactions/purchase-orders/new/ | ⏳ Not Started | |
| Delete /transactions/purchase-orders/[id]/edit/ | ⏳ Not Started | |
| Delete /transactions/purchase-orders/[id]/view/ | ⏳ Not Started | |

### Part 3.7 — New queries
| Task | Status | Notes |
|------|--------|-------|
| getPOsForDropdown(fy) → { id, poNumber, supplierName, date, status }[] | ⏳ Not Started | |

### Part 18.5 — PO Revert Edge Cases
| | Status |
|-|--------|
| affects_stock=false PO (skip stock, still stamp); race condition (DB CHECK fires); re-receive after revert; very large PO (single bulk pre-flight query) | 📋 Reference — verify during Phase 4 testing |

---

## Phase 5 — Vehicle Material Issue (Old VMI + New VMI)
_Requires Part 2.2 (issue_type, stage_id) from Phase 1, Phase 2 (TransactionGrid keyboard wiring needed for VMI grids), and Phase 3 (Stage Master — New VMI needs stage dropdown and getStageMaterials())._

### Part 4.1 — Navigation split
| Task | Status | Notes |
|------|--------|-------|
| getMaterialIssues() accepts issueType: 'OLD' \| 'NEW' param | ⏳ Not Started | Old VMI screen passes 'OLD'; New VMI passes 'NEW' |

### Part 4.2 — Old VMI single-screen
| Task | Status | Notes |
|------|--------|-------|
| Rewrite material-issues-client.tsx as single screen | ⏳ Not Started | Page opens blank; Slip No dropdown auto-focused |
| Save branches by status: Draft → updateMaterialIssue(); Issued → updateIssuedMaterialIssue() | ⏳ Not Started | updateMaterialIssue() throws hard error for Issued slips — must branch |
| Clone Old VMI button + cloneOldMaterialIssue() server action | ⏳ Not Started | MUST copy vehicle_id (NOT NULL column) — clone fails at DB if omitted |
| Clone: form loads with same vehicle pre-filled; user can change | ⏳ Not Started | |
| Add getSlipsForDropdown(fy, issueType) query | ⏳ Not Started | |

### Part 4.3 — New VMI single-screen
| Task | Status | Notes |
|------|--------|-------|
| New: src/app/(dashboard)/transactions/material-issues/new/page.tsx | ⏳ Not Started | |
| New: new-vmi-client.tsx | ⏳ Not Started | Page opens blank; Vehicle dropdown auto-focused |
| Vehicle selected → auto-fill customer address | ⏳ Not Started | |
| Stage selected → getStageMaterials(stageId) → grid pre-populates with default qty + last PO rate | ⏳ Not Started | |
| Stage change after grid populated → confirmation dialog | ⏳ Not Started | "Changing stage will replace current grid items. Proceed?" |
| Empty state when no vehicle/stage selected: "Select a vehicle and stage to load materials" | ⏳ Not Started | |
| Clone New VMI + cloneNewMaterialIssue() | ⏳ Not Started | Copies vehicle_id + stage_id; both remain editable after clone |
| Slip number auto-generated on Save/Issue | ⏳ Not Started | |

### Part 4.4 — Files summary
| | Status |
|-|--------|
| material-issues-client.tsx (rewrite); new-vmi-client.tsx (new); material-issues.actions.ts (clone actions + issueType param) | 📋 Reference |

### Part 18.3 — New VMI Edge Cases
| | Status |
|-|--------|
| Vehicle with no customer (block); stage with no materials (allow + prompt); zero rate warning; stock check all-or-nothing; stage change confirmation; same material twice (aggregate); slip_number collision retry | 📋 Reference — verify during Phase 5 testing |

### Part 18.4 — Clone VMI Edge Cases
| | Status |
|-|--------|
| Clone cancelled slip (block); double-click clone (disable during flight); inactive materials in clone (warn); stale rates warning toast; vehicle NOT NULL guard before Issue | 📋 Reference — verify during Phase 5 testing |

---

## Phase 6 — Invoice (single-screen) + Insurance Bill
_Requires Part 2.3 (include_tax) and Part 2.4 (insurance tables) from Phase 1, and Phase 5 (VMI — for complete testing of the MI checklist on the invoice screen). Within this phase: build Parts 5.x (Invoice) fully before starting Parts 6.x (Insurance Bill depends on the invoice UI being in place)._

### Part 5.1 — Screen Layout
| | Status |
|-|--------|
| Layout: Bill No, GST, Vehicle, Date, Tax%, Margin%, Discount, Job No, include_tax checkbox, status badges, Net Amount | 📋 Reference |

### Part 5.2 — Invoice Status Badges
| Task | Status | Notes |
|------|--------|-------|
| Draft / Finalized badge in header | ⏳ Not Started | |
| Insurance badge via EXISTS subquery: green "Insurance ✓" or amber "Insurance: Not Created" | ⏳ Not Started | No has_insurance_bill flag — use EXISTS at query time |

### Part 5.3 — Tax Columns Toggle
| Task | Status | Notes |
|------|--------|-------|
| include_tax checkbox in header | ⏳ Not Started | |
| Checked: add Tax Rate% + Tax Amount columns to grid | ⏳ Not Started | |
| Save include_tax per invoice in invoices.include_tax | ⏳ Not Started | |

### Part 5.4 — Finalize + Revert
| Task | Status | Notes |
|------|--------|-------|
| Finalize button: confirm dialog → status=Finalized → bill_number assigned | ⏳ Not Started | |
| Revert to Draft: reuse existing revertInvoiceToDraft() at invoices.actions.ts line 730 | ⏳ Not Started | Already exists — no new action needed |
| After Finalize: "Create Insurance Bill" button appears | ⏳ Not Started | |

### Part 5.5 — Cancellation Guard
| Task | Status | Notes |
|------|--------|-------|
| cancelInvoice(): pre-check BEFORE db.transaction() | ⏳ Not Started | Finalized insurance → block with error |
| Draft insurance bill: delete insurance items + header inside same transaction, then cancel invoice | ⏳ Not Started | |

### Part 5.6 — Dead routes to delete
| Task | Status | Notes |
|------|--------|-------|
| Delete /invoice/[id]/edit/ | ⏳ Not Started | |
| Delete /invoice/[id]/view/ | ⏳ Not Started | |

### Part 5.7 — Files
| Task | Status | Notes |
|------|--------|-------|
| Rewrite invoice-client.tsx (merges invoice-list-client.tsx + invoice-form.tsx) | ⏳ Not Started | Remove Rev.Chrg.Status and Rate Date fields from UI |
| Add getInvoicesForDropdown() | ⏳ Not Started | |

### Part 6.1 — Insurance Bill: in-place rendering
| Task | Status | Notes |
|------|--------|-------|
| State variable activeView: 'invoice' \| 'insurance' in invoice-client.tsx | ⏳ Not Started | |
| "Create Insurance Bill" / "View Insurance Bill" → swaps content area to insurance form | ⏳ Not Started | |
| Back button or Escape → returns to customer invoice view | ⏳ Not Started | |

### Part 6.2 — Insurance Bill UI
| Task | Status | Notes |
|------|--------|-------|
| New insurance-form.tsx component | ⏳ Not Started | |
| Header: Insurance Bill Date, Tax%, Margin%, Discount, Net Amount, include_tax, status badge | ⏳ Not Started | Vehicle/Customer/GSTIN/State from parent — display only |
| Grid: fully editable; starts as copy of customer items; independent after creation | ⏳ Not Started | |
| Save Draft / Finalize / Delete / Print Insurance buttons | ⏳ Not Started | |

### Part 6.3 — Business Rules
| Task | Status | Notes |
|------|--------|-------|
| Create only from Finalized customer invoice | ⏳ Not Started | |
| Draft: editable + deletable; Finalized: read-only | ⏳ Not Started | |
| Finalized insurance bill blocks parent invoice cancellation | ⏳ Not Started | |

### Part 6.4 — Server Actions
| Task | Status | Notes |
|------|--------|-------|
| createInsuranceBill(): verify parent Finalized; read gst_type from invoice_items[0]; INSERT insurance + items | ⏳ Not Started | invoices table has NO gst_type — must read from invoice_items[0] |
| saveInsuranceBill() | ⏳ Not Started | |
| finalizeInsuranceBill() | ⏳ Not Started | |
| deleteInsuranceBill() | ⏳ Not Started | |
| Insurance PDF adapter: map invoice_insurance_items → PDF data shape | ⏳ Not Started | Existing insurance-invoice-pdf.tsx uses InvoiceRow[][] — needs adapter or new PDF component |

### Part 18.6 — Insurance Bill Edge Cases
| | Status |
|-|--------|
| Create from Draft invoice (block); UNIQUE double-click; cancel parent with Draft/Finalized insurance; free-text items (material_name_override); gst_type from invoice_items[0]; net amount > customer bill (allowed) | 📋 Reference — verify during Phase 6 testing |

---

## Phase 7 — Reports
_Requires Phase 1 (stage tables), Phase 3 (Stage Master), Phase 5 (VMI issued data to exist)._

### Part 8.1 — Stage Wise Costing UI
| Task | Status | Notes |
|------|--------|-------|
| reports/stage-wise-costing.tsx | ⏳ Not Started | Vehicle selector; Stage Wise / Material Wise toggle |
| Margin% input: applied in app layer, not SQL | ⏳ Not Started | amount × (1 + margin/100) per group |
| Old VMI items (stage_id IS NULL) grouped under "Direct Issue / Unclassified" at bottom | ⏳ Not Started | COALESCE(stage_code, 'DIRECT') |
| Empty state: "No issued slips found for this vehicle" | ⏳ Not Started | |
| Print + Export buttons | ⏳ Not Started | Disabled until vehicle selected |

### Part 8.2 — Stage Wise / Material Wise Queries
| Task | Status | Notes |
|------|--------|-------|
| getStageWiseCostingData(vehicleId) — GROUP BY stage | ⏳ Not Started | In reports.actions.ts |
| getMaterialWiseCostingData(vehicleId) — GROUP BY material | ⏳ Not Started | Same materials across stages summed |

### Part 8.3 — Stage Wise PDF
| Task | Status | Notes |
|------|--------|-------|
| src/components/pdf/stage-wise-costing-pdf.tsx | ⏳ Not Started | |

### Part 9.1 — Vehicle Comparison UI
| Task | Status | Notes |
|------|--------|-------|
| reports/vehicle-comparison.tsx | ⏳ Not Started | Two vehicle selectors + Stage filter (All / specific stage) |
| Diff.Material toggle: client-side filter where diff != 0 | ⏳ Not Started | No re-fetch needed |
| Without Amount toggle: hides Amt(1) and Amt(2) columns | ⏳ Not Started | No re-fetch needed |
| Diff color coding: green if diff > 0; red if diff < 0 | ⏳ Not Started | |
| Compare + Export disabled until results loaded | ⏳ Not Started | |

### Part 9.2 — Vehicle Comparison Query
| Task | Status | Notes |
|------|--------|-------|
| getVehicleComparisonData(v1Id, v2Id, stageId?) | ⏳ Not Started | FULL OUTER JOIN on material_no + stage_name; in reports.actions.ts |

### Part 9.3 — Vehicle Comparison PDF
| Task | Status | Notes |
|------|--------|-------|
| src/components/pdf/vehicle-comparison-pdf.tsx | ⏳ Not Started | |

### Part 18.7 — Costing Reports Edge Cases
| | Status |
|-|--------|
| No issued slips; margin% extremes (negative, >100); Old VMI under Direct Issue; PDF multi-page | 📋 Reference — verify during Phase 7 testing |

### Part 18.8 — Vehicle Comparison Edge Cases
| | Status |
|-|--------|
| Same vehicle both sides (all diff=0); one vehicle no slips (FULL OUTER JOIN handles); stage filter + no data; Diff.Material all-zero | 📋 Reference — verify during Phase 7 testing |

---

## Phase 8 — Home Tab + Stock Tab Fixes
_Requires Part 2.6 (rate_at_time column) from Phase 1._

### Part 10 — Home Tab
| Task | Status | Notes |
|------|--------|-------|
| Remove Out of Stock KPI: delete from page.tsx line 100 + remove outStockCount from getDashboardStats() entirely | ⏳ Not Started | Only page.tsx line 100 references it — safe to remove |
| Add Total Stock Value KPI: add totalStockValue to getDashboardStats() | ⏳ Not Started | DISTINCT ON rate query inline (same pattern as getStockDashboardMaterials()) |
| Update recent activity links: [id]/view → ?id=<recordId> for PO, VMI, Invoice | ⏳ Not Started | Each single-screen reads ?id= on mount and auto-loads record |

### Part 11.1 — Stock refresh fix
| Task | Status | Notes |
|------|--------|-------|
| stock-client.tsx: add useEffect(() => { setRows(initialRows) }, [initialRows]) | ⏳ Not Started | Variable is rows/setRows — NOT materials/setMaterials (that name does not exist) |
| Verify stock/page.tsx fetch has no caching (cache: 'no-store' or revalidatePath called) | ⏳ Not Started | |

### Part 11.2 — Stock value history transparency
| Task | Status | Notes |
|------|--------|-------|
| adjustStock(): query last_po_rate before inserting ledger entry; store in rate_at_time | ⏳ Not Started | DISTINCT ON pattern same as getStockDashboardMaterials() |
| History Drawer: add Value Impact column (qty_change × rate_at_time formatted as ₹) | ⏳ Not Started | |
| If rate_at_time NULL: show "Rate data not available for this adjustment" | ⏳ Not Started | |

### Part 18.9 — Stock Tab Edge Cases
| | Status |
|-|--------|
| Double-refresh guard (isPending disables button); NULL rate for pre-migration rows; material never purchased (rate_at_time NULL); concurrent adjustment | 📋 Reference — verify during Phase 8 testing |

---

## Reference Sections
_No implementation tasks. Read these when working on the relevant phase._

| Section | Read When | Status |
|---------|-----------|--------|
| Part 0 — UX Architecture (single-screen model + rules) | Before Phases 4–6 | 📋 Reference |
| Part 13 — Atomic Transaction Guarantee | Before every server action touching multiple tables | 📋 Reference |
| Part 14 — Implementation Order | Reflected in phase sequence above | 📋 Reference |
| Part 15 — Critical Files | Before starting any phase | 📋 Reference |
| Part 16 — Verification Checklist | After all phases complete — final QA | 📋 Reference |
| Part 19.1 — When VMI Is Issued (cross-tab impact) | Phase 5 | 📋 Reference |
| Part 19.2 — When PO Is Received / Reverted | Phase 4 | 📋 Reference |
| Part 19.3 — When Stage Is Created / Updated / Deleted | Phase 3 | 📋 Reference |
| Part 19.4 — When Material Is Soft-Deleted | Phase 3 | 📋 Reference |
| Part 19.5 — When Insurance Bill Is Created / Finalized | Phase 6 | 📋 Reference |
| Part 19.6 — When Invoice Is Finalized / Cancelled | Phase 6 | 📋 Reference |
| Part 19.7 — When New Record Created in Any Master | Phase 3 | 📋 Reference |
| Part 19.8 — Single-Screen UX Consistency Rules | Phases 4–6 | 📋 Reference |

---

## Session Log
| Date | Phase worked on | What was done | Next session |
|------|----------------|---------------|--------------|
| 2026-06-21 | Planning | PLAN.md + PROGRESS.md created; all 7 decisions resolved; no code written | Phase 1: DB Migrations + Library Install |
| 2026-06-22 | Phase 1 | schema.ts: added stages, stage_materials, invoice_insurance, invoice_insurance_items tables; added issue_type+stage_id to material_issues, include_tax to invoices, reverted_at+reverted_by to purchase_orders, rate_at_time to stock_ledger; Drizzle migration 0002_unknown_hydra.sql generated; react-hotkeys-hook installed; DB push needs manual run (TTY required) | Phase 2: Keyboard Navigation + CSS |
