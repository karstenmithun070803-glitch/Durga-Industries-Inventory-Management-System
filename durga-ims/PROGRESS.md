# DVN IMS — Progress Tracker

> **How to use:** At the start of a new chat say:
> "Read PLAN.md and PROGRESS.md. Today we are implementing: Phase X — [name]"
> Update this file at the end of every session.

## Status Key
✅ Done | 🔄 In Progress | ⏳ Not Started | ⚠️ Blocked | 📋 Reference (no code tasks)

---

## Current Status
**Last session:** 2026-06-22 — Phase 8 fully complete. All code steps done; tsc: clean. Two manual DB steps from Phase 5 + Phase 6 still pending in Supabase SQL editor (see those phases for SQL).
**Next up:** Manual testing + deployment (see Phase 8 test checklist TC-8-01 through TC-8-09)

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
| New file: src/hooks/use-keyboard-grid.ts | ✅ Done | ~110 lines; combobox-aware; uses data-grid-row/col attrs |
| handleKeyDown(e, row, col, isComboboxOpen) | ✅ Done | When combobox open: return early; let cmdk handle |
| focusCell(row, col) via querySelector | ✅ Done | el.scrollIntoView after focus |
| focusNextEditableCell(row, col, direction) | ✅ Done | Skips disabled/readonly cells (Unit, Amount) |
| appendEmptyRow only when current row has data | ✅ Done | rowHasAnyData() check before appending |

### Part 1.3 — TransactionGrid.tsx keyboard wiring
| Task | Status | Notes |
|------|--------|-------|
| Add data-grid-row + data-grid-col to every input and combobox trigger | ✅ Done | PO=5 cols, MI=6 cols, Invoice=3 cols |
| Replace Tab-only handler with useKeyboardGrid on all cells | ✅ Done | Removed old handleTabOnLastCell |
| Track openComboboxCell: {row,col} \| null in state | ✅ Done | |
| Pass onOpenChange to each combobox cell | ✅ Done | Sets/clears openComboboxCell |
| Auto-focus Qty cell after material selected from combobox | ✅ Done | setTimeout 100ms after async getLastMaterialRate |

### Part 1.4 — combobox.tsx identifier dropdown fix
| Task | Status | Notes |
|------|--------|-------|
| Add onKeyDown to PopoverTrigger: ↓ opens dropdown | ✅ Done | openOnArrowDown prop (default false) — only for identifier dropdowns |
| Add onOpenChange prop to ComboboxProps interface | ✅ Done | Also added gridRow, gridCol, onGridKeyDown props |

### Part 1.5 — Masters keyboard: all screens
| Task | Status | Notes |
|------|--------|-------|
| Focus-move-after-Enter in all *-client.tsx (customers, suppliers, materials, units, tax, contractors, vehicles) | ✅ Done | All 7 files: searchRef, firstFieldRef, saveRef wired |
| Tab through form fields → Tab to Save button → Enter saves | ✅ Done | Natural DOM order + ref on save button |
| Escape: dirty check → confirm dialog; clean → deselect, back to search | ✅ Done | useHotkeys("escape") + escapeDiscardOpen ConfirmDialog in all 7 |

### Part 1.6 — Keyboard nav: remaining tabs
| Task | Status | Notes |
|------|--------|-------|
| Stock: useEffect refresh fix | ✅ Done | Added useEffect for rows + summary sync |
| Reports/Home/Settings keyboard nav | ⏳ Not Started | Deferred — read-only or naturally tabable |

### Part 18.1 — Keyboard Navigation Edge Cases
| | Status |
|-|--------|
| setTimeout race on new row; Escape without combobox select; ↓ on empty last row; skip read-only cells; combobox intercept; scroll-into-view; modal focus trap | 📋 Reference — verify during Phase 2 testing |

### Part 12 — CSS / Fonts / Whitespace
| Task | Status | Notes |
|------|--------|-------|
| tailwind.config.ts: fontSize overrides (base=14px, sm=12px, xs=11px) | ✅ Done | xs=11px, sm=12px, base=14px, lg=16px |
| globals.css: alternating rows | ✅ Done | tbody tr:nth-child(even) slate-50/60 |
| Table headers: bg-slate-700 text-white | ✅ Done | All masters + TransactionGrid thead + sticky th cells |
| td padding: py-2.5 → py-1.5 | ✅ Done | All 7 master tbody tds tightened |

---

## Phase 3 — Stage Master
_Requires Part 2.1 (stages + stage_materials tables) from Phase 1, and Phase 2 (useKeyboardGrid hook needed for the Stage Master materials sub-grid)._

### Part 7.1 — Stage Master UI Layout
| Task | Status | Notes |
|------|--------|-------|
| stages-client.tsx: search list left; form right (matches existing masters pattern) | ✅ Done | Custom 2-panel layout (w-[480px] left) — skipped MasterLayout (hardcoded w-80 too narrow for sub-grid) |
| Materials sub-grid: Sl# \| Material (combobox) \| Default Qty \| Unit (auto-fill) | ✅ Done | Inline 2-col keyboard handler (↑↓←→ + append on Enter); Combobox onOpenChange wired |
| No Edit/Modify button — all fields inline-editable | ✅ Done | |
| Add Stage Master to Masters sidebar nav | ✅ Done | Added after Tax Rates with Layers icon |

### Part 7.2 — Deletion Rules
| Task | Status | Notes |
|------|--------|-------|
| deleteStage(): check Issued MIs → block if count > 0 | ✅ Done | Error: "Stage used in {n} issued slip(s) — cannot delete" |
| deleteStage(): soft-delete (is_active=false) if no Issued MIs | ✅ Done | |
| Warn if Draft MIs reference the stage (don't block, just warn) | ✅ Done | Returns draftCount; client shows warning toast after deactivation |

### Part 7.3 — Server Actions (stages.actions.ts)
| Task | Status | Notes |
|------|--------|-------|
| saveStage({ id, name, materials[] }) — atomic create/update + material upsert | ✅ Done | Single db.transaction(); duplicate name check inside tx |
| stage_code auto-gen: S001, S002... S999, S1000 | ✅ Done | Uses CAST(SUBSTRING(stage_code,2) AS INTEGER) MAX — avoids text-sort bug at S999→S1000 |
| deleteStage(id) — soft delete with Issued MI guard | ✅ Done | |
| reactivateStage(id) | ✅ Done | |
| getStagesWithMaterials() — for stage master list | ✅ Done | cached; joins stage_materials → materials + units |
| getStagesForDropdown() — active only; for New VMI dropdown | ✅ Done | cached |
| getStageMaterials(stageId) — with last PO rate; for New VMI grid pre-fill | ✅ Done | non-cached; attaches last PO rate per material |

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
| Rewrite purchase-orders-client.tsx as single screen | ✅ Done | Page opens blank; identifier dropdown auto-focused (openOnArrowDown) |
| All header fields always editable inline (Date, Supplier Bill No, Bill Date, Affects Stock) | ✅ Done | |
| Save branches by status: Draft → updatePurchaseOrder(); Received → updateReceivedPurchaseOrder() | ✅ Done | |

### Part 3.3 — Button State Logic
| Task | Status | Notes |
|------|--------|-------|
| No record: show New \| Exit | ✅ Done | |
| Draft: show New \| Save \| Delete \| Mark as Received \| Print \| Cancel \| Exit | ✅ Done | |
| Received: show New \| Save \| Delete \| Revert to Draft \| Print \| Cancel \| Exit | ✅ Done | |

### Part 3.4 — revertPOToDraft server action
| Task | Status | Notes |
|------|--------|-------|
| Pre-flight bulk stock check OUTSIDE transaction | ✅ Done | Lists ALL blocking materials |
| Atomic transaction: stock reversal + INSERT stock_ledger REVERSAL + set status='Draft' | ✅ Done | stock_after computed inside tx; rate_at_time + adjusted_by stamped |
| Stamp reverted_at=NOW(), reverted_by=userEmail even for affects_stock=false POs | ✅ Done | |
| Error dialog listing all blocking materials (not just first) | ✅ Done | whitespace-pre-line in dialog |
| DB CHECK constraint current_stock_non_negative as final race guard | ✅ Done | DB constraint fires if race occurs |

### Part 3.5 — Home page deep links
| Task | Status | Notes |
|------|--------|-------|
| PO screen reads ?id= query param on mount and auto-loads that PO | ✅ Done | searchParams in page.tsx; initialSelectedId prop |

### Part 3.6 — Dead routes to delete
| Task | Status | Notes |
|------|--------|-------|
| Delete /transactions/purchase-orders/new/ | ✅ Done | |
| Delete /transactions/purchase-orders/[id]/edit/ | ✅ Done | |
| Delete /transactions/purchase-orders/[id]/view/ | ✅ Done | po-form.tsx also deleted |

### Part 3.7 — New queries
| Task | Status | Notes |
|------|--------|-------|
| getPOsForDropdown(fy) → { id, poNumber, supplierName, date, status }[] | ✅ Done | Non-cached; leftJoin suppliers |

### Part 18.5 — PO Revert Edge Cases
| | Status |
|-|--------|
| affects_stock=false PO (skip stock, still stamp); race condition (DB CHECK fires); re-receive after revert; very large PO (single bulk pre-flight query) | 📋 Reference — verify during Phase 4 testing |

---

## Phase 5 — Vehicle Material Issue (Old VMI + New VMI)
_Requires Part 2.2 (issue_type, stage_id) from Phase 1, Phase 2 (TransactionGrid keyboard wiring needed for VMI grids), and Phase 3 (Stage Master — New VMI needs stage dropdown and getStageMaterials())._

> ⚠️ **Manual DB step still required** — run in Supabase SQL editor before testing:
> ```sql
> UPDATE material_issues SET issue_type = 'OLD' WHERE issue_type IS NULL;
> ALTER TABLE material_issues ADD CONSTRAINT mi_issue_type_valid CHECK (issue_type IN ('OLD', 'NEW'));
> ALTER TABLE material_issues ADD CONSTRAINT mi_stage_by_type CHECK (issue_type = 'NEW' OR (issue_type = 'OLD' AND stage_id IS NULL));
> ```

### Part 4.1 — Actions layer
| Task | Status | Notes |
|------|--------|-------|
| IssueHeaderInput extended: issue_type + stage_id fields | ✅ Done | |
| createMaterialIssue(): advisory lock + issue_type + stage_id + dual revalidatePath | ✅ Done | slip_number allocated inside db.transaction() with pg_advisory_xact_lock |
| updateMaterialIssue(): stage_id added to SET clause | ✅ Done | issue_type immutable after create |
| getMaterialIssues() accepts issueType: 'OLD' \| 'NEW' param | ✅ Done | |
| getSlipsForDropdown(fy, issueType) — identifier dropdown query | ✅ Done | |
| cloneOldMaterialIssue() — advisory lock + vehicle_id copy + today date clamped to FY | ✅ Done | |
| cloneNewMaterialIssue() — copies stage_id too | ✅ Done | |
| getDashboardStats() recent MIs: issue_type added to SELECT + type | ✅ Done | |
| deleteMaterialIssue(): invoice-link guard before deleting Issued slips | ✅ Done | |

### Part 4.2 — Old VMI single-screen
| Task | Status | Notes |
|------|--------|-------|
| Rewrite material-issues-client.tsx as single screen | ✅ Done | openOnArrowDown combobox; FY-switch dirty check; cross-screen guard (NEW slip → redirect to /new) |
| Save branches: Draft → updateMaterialIssue(); Issued → "Save & Reapply" confirm → updateIssuedMaterialIssue() | ✅ Done | |
| Clone + Delete + Issue + Cancel + Ctrl+S/Alt+N/Escape | ✅ Done | |
| Print + Print Adv. buttons (visible Draft + Issued) | ✅ Done | |
| Rewrite material-issues/page.tsx with searchParams + Promise.all | ✅ Done | |
| Dead routes deleted: [id]/view/, [id]/edit/, material-issue-form.tsx | ✅ Done | |

### Part 4.3 — New VMI single-screen
| Task | Status | Notes |
|------|--------|-------|
| new/page.tsx: getSlipsForDropdown('NEW') + getStagesForDropdown() + searchParams | ✅ Done | |
| new-vmi-client.tsx: Vehicle → Stage → DC Date → grid flow | ✅ Done | "NEW" badge; cross-screen guard (OLD slip → redirect to /?id=X) |
| Stage selected → getStageMaterials() → grid pre-populates with last PO rate | ✅ Done | |
| Stage change after grid populated → confirmation dialog | ✅ Done | |
| Amber warning banner when any row has no PO rate history | ✅ Done | |
| Zero-rate pre-Issue check dialog | ✅ Done | |
| Clone + Delete + Issue + Save & Reapply + Ctrl+S/Alt+N/Escape | ✅ Done | |
| Print + Print Adv. buttons | ✅ Done | |

### Part 4.4 — PDF + Nav + Home
| Task | Status | Notes |
|------|--------|-------|
| mi-slip-pdf.tsx: single-slip DC note (regular + advance rate internal copy) | ✅ Done | margin factor applied to amounts; INTERNAL COPY label on adv. print |
| Sidebar: "Veh. Issue (New)" nav entry (ClipboardCheck icon) | ✅ Done | |
| Home page: recent MIs deep link → /new?id=X or /?id=X by issue_type | ✅ Done | |

### Part 18.3 — New VMI Edge Cases
| | Status |
|-|--------|
| Stage change guard; zero-rate confirm before Issue; amber banner for missing PO rate; cross-screen redirect; slip_number advisory lock; FY-switch dirty check | 📋 Reference — verify during Phase 5 testing |

### Part 18.4 — Clone VMI Edge Cases
| | Status |
|-|--------|
| Clone cancelled slip (blocked); stale rates toast; vehicle_id NOT NULL guard; zero_rate_confirmed reset on clone | 📋 Reference — verify during Phase 5 testing |

---

## Phase 6 — Invoice (single-screen) + Insurance Bill
_Requires Part 2.3 (include_tax) and Part 2.4 (insurance tables) from Phase 1, and Phase 5 (VMI — for complete testing of the MI checklist on the invoice screen)._

> ⚠️ **Manual DB step still required** — run in Supabase SQL editor before testing:
> ```sql
> ALTER TABLE invoice_insurance ALTER COLUMN discount TYPE numeric(14,2);
> ```

### Part 5.1–5.7 — Invoice single-screen
| Task | Status | Notes |
|------|--------|-------|
| schema.ts: invoice_insurance.discount → numeric(14,2) | ✅ Done | Prevents overflow for discounts > ₹999 |
| InvoiceWithDetails + InvoiceHeaderInput: include_tax added | ✅ Done | |
| getInvoiceById(): include_tax in SELECT + return | ✅ Done | |
| createInvoice() + updateInvoice(): include_tax persisted | ✅ Done | |
| revertInvoiceToDraft(): insurance Finalized guard | ✅ Done | Throws if Finalized insurance bill exists |
| cancelInvoice(): insurance guard INSIDE db.transaction() (TOCTOU-safe) | ✅ Done | |
| getInvoicesForDropdown(fy): non-cached, LEFT JOIN vehicles | ✅ Done | |
| invoice/page.tsx rewritten: searchParams + Promise.all parallel fetch | ✅ Done | |
| invoice-client.tsx: single-screen (identifier dropdown, MI checklist, include_tax, status badges, insurance badge) | ✅ Done | Replaces invoice-form.tsx; invoice-list-client.tsx preserved for Phase 7 |
| Home page Recent Invoice links: /invoice/\[id\]/view → /invoice?id=\[id\] | ✅ Done | |
| Dead routes: edit + view → redirect; new → redirect; invoice-form.tsx deleted | ✅ Done | |
| TransactionGrid: showTaxColumns prop + dynamic COL_CONFIG for invoice mode | ✅ Done | colTax = 3 when showTaxColumns; columnCount 3→4 |

### Part 6.1–6.4 — Insurance Bill
| Task | Status | Notes |
|------|--------|-------|
| createInsuranceBill(): Finalized-parent guard + gst_type from invoice_items[0] + atomic INSERT | ✅ Done | Catches unique constraint violation |
| getInsuranceBillByInvoiceId(): explicit SELECT+JOIN (not db.query.*) | ✅ Done | Returns InsuranceBillWithItems \| null |
| saveInsuranceBill(): Draft guard + atomic header UPDATE + items DELETE+INSERT | ✅ Done | |
| finalizeInsuranceBill(): Draft guard + status flip | ✅ Done | |
| revertInsuranceBillToDraft(): Finalized guard + status flip (no preconditions) | ✅ Done | |
| deleteInsuranceBill(): Draft guard (Finalized must revert first) | ✅ Done | |
| insurance-form.tsx: header fields, items table, material combobox + free-text toggle, margin recalc | ✅ Done | |
| insurance-pdf-adapter.ts: InsuranceBillWithItems → InvoiceRow[] for PDF | ✅ Done | |
| insurance-invoice-pdf.tsx: "INSURANCE COPY" label added to printed page body | ✅ Done | |
| All insurance actions: auth guard (if (!user) throw "Unauthorized") | ✅ Done | |

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
| reports/stage-wise-costing.tsx | ✅ Done | FY + Vehicle + Stage Wise/Material Wise toggle + Margin% + Show button + CSV export |
| Margin% input: applied in app layer, not SQL | ✅ Done | useMemo on rawRows — no re-fetch on margin change |
| Old VMI items (stage_id IS NULL) grouped under "Direct Issue / Unclassified" at bottom | ✅ Done | COALESCE(stage_code, 'DIRECT'); amber/italic row styling |
| Empty state: "No issued slips found for this vehicle" | ✅ Done | Specific messages for pre-run and no-data states |
| Print + Export buttons | ✅ Done | Disabled until activeRows.length > 0 |

### Part 8.2 — Stage Wise / Material Wise Queries
| Task | Status | Notes |
|------|--------|-------|
| getStageWiseCostingData(vehicleId, fy) — GROUP BY stage | ✅ Done | Added fy param (audit finding L1-1); UUID + FY validation; no cache |
| getMaterialWiseCostingData(vehicleId, fy) — GROUP BY material | ✅ Done | STRING_AGG stages column added (audit finding L1-6) |

### Part 8.3 — Stage Wise PDF
| Task | Status | Notes |
|------|--------|-------|
| src/components/pdf/stage-wise-costing-pdf.tsx | ✅ Done | Portrait; both Stage Wise + Material Wise modes; Direct Issue rows amber background |

### Part 9.1 — Vehicle Comparison UI
| Task | Status | Notes |
|------|--------|-------|
| reports/vehicle-comparison.tsx | ✅ Done | FY + V1 + V2 + Stage filter + Compare button with loading spinner |
| Diff.Material toggle: client-side filter where diff != 0 | ✅ Done | No re-fetch needed |
| Without Amount toggle: hides Amt(1) and Amt(2) columns | ✅ Done | No re-fetch needed; passed to PDF too |
| Diff color coding | ✅ Done | Amber (neutral) for nonzero diff — not green/red (audit finding L1-3) |
| Compare + Export disabled until results loaded | ✅ Done | Compare disabled until v1Id + v2Id set; Export/Print disabled until rows exist |
| Stage filter amber info banner | ✅ Done | Shows when stageId set: warns Old VMI slips excluded |

### Part 9.2 — Vehicle Comparison Query
| Task | Status | Notes |
|------|--------|-------|
| getVehicleComparisonData(v1Id, v2Id, fy, stageId?) | ✅ Done | FULL OUTER JOIN via db.execute(sql\`\`); fy param added; UUID validation; stageParam ?? null for SQL NULL safety |

### Part 9.3 — Vehicle Comparison PDF
| Task | Status | Notes |
|------|--------|-------|
| src/components/pdf/vehicle-comparison-pdf.tsx | ✅ Done | Landscape; respects hideAmounts + showDiffOnly props; amber diff color |

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
| Remove Out of Stock KPI: delete from page.tsx + remove outStockCount from getDashboardStats() entirely | ✅ Done | Replaced with Total Stock Value card; lowStockCount kept as sub-text |
| Add Total Stock Value KPI: add totalStockValue + materialsExcludedFromValue to getDashboardStats() | ✅ Done | DISTINCT ON rate query (identical to getStockDashboardMaterials) + app-layer SUM |
| Update recent activity links: ?id=<recordId> for PO, VMI, Invoice | ✅ Done | Already completed in Phases 4–6 |

### Part 11.1 — Stock refresh fix
| Task | Status | Notes |
|------|--------|-------|
| stock-client.tsx: useEffect rows/summary sync | ✅ Done | Already completed in Phase 2 |
| stock/page.tsx: no caching (revalidatePath in adjustStock) | ✅ Done | revalidatePath("/stock") already in adjustStock |

### Part 11.2 — Stock value history transparency
| Task | Status | Notes |
|------|--------|-------|
| adjustStock(): query last_po_rate before inserting ledger entry; store in rate_at_time | ✅ Done | DISTINCT ON scoped to single materialId; placed before optimistic update |
| getStockMovementHistory(): SELECT + return rate_at_time; StockLedgerEntry interface updated | ✅ Done | |
| History Drawer: Value Δ column (ADJUSTMENT rows only); "—" with tooltip for null rate | ✅ Done | Note column max-w reduced to 120px to accommodate extra column |

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
| 2026-06-22 | Phase 2 | useKeyboardGrid hook created; combobox.tsx: onOpenChange+gridRow/Col+onGridKeyDown+openOnArrowDown props; TransactionGrid: full arrow-key nav with COL_CONFIG per mode, auto-focus Qty after material select; all 7 master files: focus-move-after-Enter + Escape dirty-check + ConfirmDialog + dark headers + tighter row padding; stock-client.tsx: useEffect refresh fix; tailwind fontSize scale (14px base); alternating row CSS | Phase 3: Stage Master |
| 2026-06-22 | Phase 3 | stages.actions.ts: saveStage (atomic tx, duplicate name check, numeric stage_code MAX), deleteStage (Issued MI guard + draftCount warning), reactivateStage, getStagesWithMaterials, getStagesForDropdown, getStageMaterials (with last PO rate); stages-client.tsx: 2-col sub-grid keyboard nav (inline handler), material auto-fill unit, dirty-check Escape, Ctrl+S, deactivate/reactivate ConfirmDialogs, inline 2-panel layout (w-[480px]); sidebar: Stages + Layers icon; cache.ts: stages tag; tsc: clean | Phase 4: Purchase Orders single-screen |
| 2026-06-22 | Phase 4 | getPOsForDropdown() + revertPOToDraft() (pre-flight + atomic tx + stock_after + rate_at_time + adjusted_by) added to purchase-orders.actions.ts; purchase-orders-client.tsx fully rewritten as single-screen (identifier combobox openOnArrowDown, inline header fields, status badge, TransactionGrid, receive/revert/delete/discard dialogs, multi-supplier split preview, batch print range panel, Ctrl+S/Alt+N/Escape hotkeys, ?id= deep link, FY-change refresh); page.tsx updated with searchParams + Promise.all fetch; home page PO link → ?id=; dead routes + po-form.tsx deleted; tsc: clean | Phase 5: Old VMI + New VMI single-screen |
| 2026-06-22 | Phase 5 | IssueHeaderInput extended (issue_type + stage_id); material-issues.actions.ts: createMaterialIssue (advisory lock inside tx), updateMaterialIssue (stage_id), getSlipsForDropdown, cloneOldMaterialIssue, cloneNewMaterialIssue, deleteMaterialIssue (invoice-link guard), getDashboardStats (issue_type); material-issues-client.tsx fully rewritten as Old VMI single-screen (openOnArrowDown, cross-screen guard, FY dirty check, Save & Reapply, Clone, Print, Print Adv.); new-vmi-client.tsx created (Stage → grid pre-populate, stage-change guard, zero-rate dialog, amber no-rate banner, "NEW" badge, cross-screen guard); new/page.tsx rewritten; mi-slip-pdf.tsx created (regular + advance rate internal copy); sidebar: "Veh. Issue (New)" entry; home page deep link fix; dead routes deleted; tsc: clean. Manual DB step (backfill + CHECK constraints) still pending in Supabase SQL editor. | Phase 6: Invoice single-screen + Insurance Bill |
| 2026-06-22 | Phase 6 | schema.ts: invoice_insurance.discount → numeric(14,2); InvoiceWithDetails + InvoiceHeaderInput: include_tax; getInvoiceById/createInvoice/updateInvoice: include_tax persisted; revertInvoiceToDraft + cancelInvoice: insurance guards (TOCTOU-safe tx); getInvoicesForDropdown(); all insurance CRUD actions (create/get/save/finalize/revert/delete) with auth guards; invoice/page.tsx rewritten (searchParams + parallel fetch); invoice-client.tsx: single-screen with identifier dropdown, MI checklist, include_tax toggle, insurance badge, activeView switcher; TransactionGrid: showTaxColumns prop + dynamic colConfig + Tax% editable col + Tax Amt display col; insurance-form.tsx: header + items table + material/free-text toggle + margin recalc + Finalize/Revert/Delete; insurance-pdf-adapter.ts; insurance-invoice-pdf.tsx: INSURANCE COPY label; dead routes → redirects; invoice-form.tsx deleted; tsc: clean. Manual DB step (ALTER TABLE invoice_insurance ALTER COLUMN discount TYPE numeric(14,2)) still pending in Supabase SQL editor. | Phase 7: Reports |
| 2026-06-22 | Phase 7 | 8-lens audit of plan before coding (critical findings: missing FY filter, Show-button vs auto-fetch contradiction, diff color semantics, raw SQL type safety); reports.actions.ts: getStageWiseCostingData + getMaterialWiseCostingData (both with fy param + UUID validation + STRING_AGG stages col) + getVehicleComparisonData (FULL OUTER JOIN via db.execute sql tag, stageParam ?? null, Array.from cast); stage-wise-costing.tsx: FY+vehicle+toggle+margin+Show button+CSV export; vehicle-comparison.tsx: FY+V1+V2+stage filter+loading spinner+Diff.Material toggle+Without Amount toggle+amber diff coloring+stage-filter info banner+CSV export; stage-wise-costing-pdf.tsx (portrait, amber Direct Issue rows); vehicle-comparison-pdf.tsx (landscape, respects hideAmounts); reports-client.tsx: 2 new tabs (TrendingUp + GitCompare icons) + stages prop; page.tsx: getStagesForDropdown() added to Promise.all; tsc: clean | Phase 8: Home Tab + Stock Tab Fixes |
| 2026-06-22 | Phase 8 | 8-lens audit surfaced 6 critical findings (stockRows missing id, rate_at_time absent from getStockMovementHistory SELECT + StockLedgerEntry interface, adjustStock INSERT missing rate_at_time, formula must match getStockDashboardMaterials exactly, lowStockCount orphaned → sub-text on new card, materialsExcludedFromValue missing from DashboardStats); dashboard.actions.ts: removed outStockCount, added totalStockValue + materialsExcludedFromValue via 7th Promise.all DISTINCT ON query + app-layer SUM (identical formula to getStockDashboardMaterials); page.tsx: Out of Stock card → Total Stock Value card with lowStockCount + materialsExcludedFromValue sub-text; stock.actions.ts: StockLedgerEntry interface + rate_at_time field in getStockMovementHistory SELECT + return mapping; adjustStock: DISTINCT ON rate query (scoped to single materialId) before optimistic update, rate_at_time in INSERT; stock-client.tsx: Value Δ column in History Drawer (ADJUSTMENT only, null → "—" with tooltip, Note column max-w 120px); tsc: clean | Manual testing via TC-8-01 through TC-8-09 |
