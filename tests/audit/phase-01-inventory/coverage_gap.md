# Phase 1 — Test Coverage Gap Analysis

> Legend: **Yes** = tests exist and cover this area | **Partial** = some coverage | **No** = no tests

---

## Summary

| Metric | Value |
|--------|-------|
| Unit tests | 0 |
| Integration tests | 0 |
| E2E tests | 0 |
| Test runner | None installed |
| Test dependencies | None in `package.json` |
| Test files | 0 (zero `.test.*` or `.spec.*` files) |
| **Overall coverage** | **0%** |

---

## Coverage by Module / Server Action

| Module | File | Unit Tests | Integration Tests | E2E Tests | Notes |
|--------|------|-----------|------------------|-----------|-------|
| Purchase Order — create | `purchase-orders.actions.ts:279` | No | No | No | Critical: stock + ledger |
| Purchase Order — receive | `purchase-orders.actions.ts:338` | No | No | No | Critical: stock + ledger atomic tx |
| Purchase Order — edit received | `purchase-orders.actions.ts:392` | No | No | No | Critical: reversal + reapply |
| Purchase Order — delete received | `purchase-orders.actions.ts:486` | No | No | No | Critical: pre-check + reversal |
| Material Issue — create | `material-issues.actions.ts:397` | No | No | No | — |
| Material Issue — issue (confirm) | `material-issues.actions.ts:464` | No | No | No | Critical: stock deduction atomic tx |
| Material Issue — edit issued | `material-issues.actions.ts:531` | No | No | No | Critical: reversal + reapply |
| Material Issue — delete issued | `material-issues.actions.ts:640` | No | No | No | Critical: invoice link guard |
| Invoice — create | `invoices.actions.ts` | No | No | No | — |
| Invoice — finalize | `invoices.actions.ts` | No | No | No | — |
| Invoice — cancel | `invoices.actions.ts` | No | No | No | — |
| Invoice — bill number generation | `invoices.actions.ts:59–99` | No | No | No | FY-scoped sequence |
| Stock adjustment | `stock.actions.ts:252` | No | No | No | Critical: optimistic lock, username |
| Stock dashboard | `stock.actions.ts:90` | No | No | No | — |
| Job cost report | `stock.actions.ts:357` | No | No | No | — |
| Invoice summary report | `reports.actions.ts` | No | No | No | IST date handling |
| Purchase report | `reports.actions.ts` | No | No | No | — |
| Monthly stock report | `reports.actions.ts` | No | No | No | — |
| Dashboard metrics | `dashboard.actions.ts` | No | No | No | — |
| Auth — login | `auth.actions.ts` | No | No | No | Username → email mapping |
| Auth — logout | `auth.actions.ts` | No | No | No | — |
| FY utilities | `src/lib/fy.ts` | No | No | No | Pure functions; easiest to test |
| Number-to-words | `src/lib/utils/number-to-words.ts` | No | No | No | Pure function |
| Masters — customers CRUD | `customers.actions.ts` | No | No | No | — |
| Masters — suppliers CRUD | `suppliers.actions.ts` | No | No | No | — |
| Masters — contractors CRUD | `contractors.actions.ts` | No | No | No | — |
| Masters — materials CRUD | `materials.actions.ts` | No | No | No | Deactivation guards |
| Masters — units CRUD | `units.actions.ts` | No | No | No | — |
| Masters — tax rates CRUD | `tax.actions.ts` | No | No | No | — |
| Masters — vehicles CRUD | `vehicles.actions.ts` | No | No | No | — |
| Company settings | `settings.actions.ts` | No | No | No | Singleton upsert |

---

## Coverage by Screen / Route

| Screen | Route | Unit Tests | Integration Tests | E2E Tests | Notes |
|--------|-------|-----------|------------------|-----------|-------|
| Login | `/login` | No | No | No | — |
| Dashboard | `/` | No | No | No | — |
| Customers | `/masters/customers` | No | No | No | — |
| Suppliers | `/masters/suppliers` | No | No | No | — |
| Contractors | `/masters/contractors` | No | No | No | — |
| Materials | `/masters/materials` | No | No | No | — |
| Units | `/masters/units` | No | No | No | — |
| Tax rates | `/masters/tax` | No | No | No | — |
| Vehicles | `/masters/vehicles` | No | No | No | — |
| PO list | `/transactions/purchase-orders` | No | No | No | — |
| PO new | `/transactions/purchase-orders/new` | No | No | No | — |
| PO view | `/transactions/purchase-orders/[id]/view` | No | No | No | — |
| PO edit | `/transactions/purchase-orders/[id]/edit` | No | No | No | — |
| MI list | `/transactions/material-issues` | No | No | No | — |
| MI new | `/transactions/material-issues/new` | No | No | No | — |
| MI view | `/transactions/material-issues/[id]/view` | No | No | No | — |
| MI edit | `/transactions/material-issues/[id]/edit` | No | No | No | — |
| Invoice list | `/invoice` | No | No | No | — |
| Invoice new | `/invoice/new` | No | No | No | — |
| Invoice view | `/invoice/[id]/view` | No | No | No | — |
| Invoice edit | `/invoice/[id]/edit` | No | No | No | — |
| Stock dashboard | `/stock` | No | No | No | — |
| Reports | `/reports` | No | No | No | — |
| Settings | `/settings` | No | No | No | — |

---

## Priority for Phase 2 (Unit Tests)

Based on financial and data-integrity risk, the highest-priority areas for Phase 2:

| Priority | Area | Reason |
|----------|------|--------|
| 1 | Stock ledger writes (PO receipt, MI issue, reversals, adjustments) | Money / inventory correctness |
| 2 | Duplicate prevention (PO and MI item validation) | Data integrity |
| 3 | Stock pre-check on issue (insufficient stock block) | Hard business rule |
| 4 | FY boundary checks on transaction dates | Incorrect FY tagging silently mis-sequences documents |
| 5 | Invoice bill number generation (FY-scoped sequence) | Duplicate bill numbers are a GST compliance issue |
| 6 | GST calculation (CGST+SGST vs IGST split) | Financial accuracy |
| 7 | `fy.ts` pure functions | Simple; high leverage for other tests |
| 8 | `number-to-words.ts` | Used on PDF invoice for amount-in-words |
