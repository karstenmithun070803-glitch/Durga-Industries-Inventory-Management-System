# DVN IMS — Progress Tracker

> **How to use:** At the start of a new chat say:
> "Read PLAN.md and PROGRESS.md. Today we are implementing: [section name]"
> Update this file at the end of every session.

## Status Key
✅ Done | 🔄 In Progress | ⏳ Not Started | ⚠️ Blocked

---

## Current Status
**Last session:** 2026-06-21
**Last worked on:** Planning — finalized PLAN.md with all decisions resolved
**Next up:** Phase 1 — DB Migrations

---

## Phase 1: Foundation
| Task | PLAN.md ref | Status | Notes |
|------|------------|--------|-------|
| DB Migrations | Part 2 | ⏳ Not Started | Run in order — stages table BEFORE material_issues FK |
| `useKeyboardGrid` hook | Part 1.2 | ⏳ Not Started | New file: `src/hooks/use-keyboard-grid.ts` |
| `TransactionGrid.tsx` keyboard wiring | Part 1.3 | ⏳ Not Started | Add data-grid-row/col attrs; wire hook; track openComboboxCell |
| `combobox.tsx` ↓ fix + onOpenChange prop | Part 1.4 | ⏳ Not Started | Add `onKeyDown` to PopoverTrigger; add `onOpenChange` to ComboboxProps |
| CSS: fonts, whitespace, contrast | Part 12 | ⏳ Not Started | `tailwind.config.ts` fontSize + `globals.css` @layer base overrides |

## Phase 2: Masters
| Task | PLAN.md ref | Status | Notes |
|------|------------|--------|-------|
| Stage Master CRUD | Part 7 | ⏳ Not Started | New dir: `masters/stages/`; new `stages.actions.ts` |
| Masters keyboard fix (all screens) | Part 1.5 | ⏳ Not Started | Focus-move-after-Enter does NOT exist yet — build from scratch in all `*-client.tsx` |

## Phase 3: Transaction UX Rewrite
| Task | PLAN.md ref | Status | Notes |
|------|------------|--------|-------|
| PO single-screen rewrite | Part 3 | ⏳ Not Started | Rewrite `purchase-orders-client.tsx`; add `revertPOToDraft()`; delete dead routes |
| Old VMI single-screen + Clone | Part 4.2 | ⏳ Not Started | Rewrite `material-issues-client.tsx`; save must branch Draft vs Issued |
| New VMI single-screen | Part 4.3 | ⏳ Not Started | New: `transactions/material-issues/new/` |

## Phase 4: Invoice
| Task | PLAN.md ref | Status | Notes |
|------|------------|--------|-------|
| Invoice single-screen rewrite | Part 5 | ⏳ Not Started | Merge list + form; remove Rev.Chrg + Rate Date; add include_tax toggle |
| Insurance Bill in-place form | Part 6 | ⏳ Not Started | New: `invoice/insurance-form.tsx`; new server actions in `invoices.actions.ts` |

## Phase 5: Reports
| Task | PLAN.md ref | Status | Notes |
|------|------------|--------|-------|
| Stage Wise & Material Wise Costing | Part 8 | ⏳ Not Started | New: `reports/stage-wise-costing.tsx` + PDF component + actions |
| Vehicle Comparison report | Part 9 | ⏳ Not Started | New: `reports/vehicle-comparison.tsx` + PDF component + actions |

## Phase 6: Home + Stock Fixes
| Task | PLAN.md ref | Status | Notes |
|------|------------|--------|-------|
| Home: remove Out of Stock KPI, add Total Stock Value | Part 10 | ⏳ Not Started | `page.tsx` + `dashboard.actions.ts`; update recent activity links to `?id=` pattern |
| Stock refresh button fix | Part 11.1 | ⏳ Not Started | `stock-client.tsx`: add `useEffect(() => { setRows(initialRows) }, [initialRows])` |
| Stock value history transparency | Part 11.2 | ⏳ Not Started | `adjustStock()` captures `rate_at_time`; History Drawer shows value impact |

---

## Session Log
| Date | What was implemented | Completed tasks | Next session starts with |
|------|---------------------|-----------------|--------------------------|
| 2026-06-21 | Planning only — PLAN.md finalized, all 7 decisions resolved | None (no code written) | Phase 1: DB Migrations |
