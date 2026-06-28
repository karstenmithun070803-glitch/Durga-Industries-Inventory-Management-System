# Observations — Durga Industries IMS

Non-bug findings logged here. These are behaviors that are correct and working,
but worth documenting for developers building on top of this code.

Format:
```
## OBS-[PHASE]-[NUMBER] — [Short description]
- **Phase found:** Phase X
- **Category:** Architecture | Data | API | UX
- **File:** /src/path/to/file.ts
- **What was observed:** [description]
- **Why this is not a bug:** [explanation]
- **Developer note:** [guidance for future integrations]
```

---

## OBS-1-001 — calcAmountsForRow() returns strings, not numbers

- **Phase found:** Phase 1
- **Category:** Architecture
- **File:** src/lib/utils/row-calc.ts
- **What was observed:** `calcAmountsForRow()` accepts string inputs for qty, rate, and taxPct, and returns string outputs for amount, cgst_amount, sgst_amount, and igst_amount. All four output fields are strings (e.g., `"1000.00"`), not numbers.
- **Why this is not a bug:** Transaction grid rows are backed by form field state, which is always strings. Keeping the types consistent (string in, string out) avoids parsing/formatting at the boundary. The function internally converts to float for calculation, then converts back to string via `.toFixed(2)`.
- **Developer note:** If you call `calcAmountsForRow()` and try to do arithmetic with the result directly (e.g., `result.amount + result.igst_amount`), you will get string concatenation, not numeric addition. Parse first: `parseFloat(result.amount)`.

---

## OBS-2-001 — createPurchaseOrder() and updatePurchaseOrder() are not wrapped in db.transaction()

- **Phase found:** Phase 2
- **Category:** Architecture
- **File:** src/lib/actions/purchase-orders.actions.ts
- **What was observed:** Both `createPurchaseOrder()` and `updatePurchaseOrder()` touch two tables (purchaseOrders + purchaseOrderItems) without a `db.transaction()` wrapper. `updatePurchaseOrder()` deletes old items then inserts new ones — a partial failure between those two operations would leave the PO with zero items.
- **Why this is not a bug:** The developer verified both functions work correctly in manual testing for this 4-user internal tool. The failure window is narrow (the two statements execute on the same Postgres connection, back-to-back). No test has reproduced an actual failure scenario.
- **Developer note:** If these functions are ever refactored or moved to a background job, wrapping them in `db.transaction()` is the correct defensive step. For now, leave as-is per RULE 1 (do not touch working code).

---

## OBS-2-002 — stock_ledger.stock_after lacks a DB-level CHECK constraint

- **Phase found:** Phase 2
- **Category:** Data
- **File:** src/lib/db/schema.ts
- **What was observed:** `materials.current_stock` has a CHECK constraint (`current_stock >= 0`) enforced at the database level. `stock_ledger.stock_after` has no equivalent constraint — a negative value can be inserted directly via SQL without error. App-layer validation in `adjustStock()` is the only guard.
- **Why this is not a bug:** App-layer validation catches this for all Server Action paths. No user-facing flow bypasses it. A DB CHECK on `stock_after` would be a defensive redundancy, not a correctness fix.
- **Evidence:** tests/integration/schema-constraints.test.ts (`stockLedger: no DB-level check on stock_after`) and tests/integration/stock-ledger.test.ts (GAP-3 evidence block) both confirm a negative `stock_after` inserts without error.
- **Developer note:** If the DB is ever accessed by non-application clients (direct SQL, migrations, scripts), a CHECK constraint on `stock_after` would be worth adding. Leave as-is for now.

---
