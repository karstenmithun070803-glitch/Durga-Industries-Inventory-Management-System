# CORE RULES — Durga Industries IMS

## The Golden Rule of Inventory Math

ALL stock math (additions and deductions) must be performed strictly on the
backend using Atomic Database Transactions via Next.js Server Actions.

The client/frontend is NEVER trusted to calculate or submit final
`current_stock` values. Any violation of this rule will cause inventory drift
and financial inaccuracy.

---

## The Three Stock Triggers (and only three)

1. **PO_INWARD** — `current_stock += qty` per line item when a Purchase Order
   status changes from Draft → Received.

2. **ISSUE** — `current_stock -= qty` per line item when a Material Issue is
   saved (only rows where `affects_inventory = TRUE`).

3. **ADJUSTMENT** — direct override via the Stock Dashboard manual adjustment
   flow, which requires typing "CONFIRM" and providing a reason ≥ 10 chars.

Every stock change writes an immutable row to `stock_ledger`. This table is
append-only — rows are never updated or deleted.

---

## Edit & Delete Rollback Rule

Editing or deleting a Received PO or a saved Material Issue must:
1. Reverse all prior stock changes for that document (write REVERSAL rows)
2. Apply the new stock changes (write new PO_INWARD or ISSUE rows)

Both steps must happen inside a single DB transaction.

---

## Hard Blocks (must never be bypassed)

- `current_stock` cannot go below 0 (DB CHECK constraint + app-layer pre-check)
- `discount` cannot make `net_amount` ≤ 0
- Document dates must fall within the active financial year
- Deleting a Received PO is blocked if any of its stock has already been issued

---

## GST Determination Rule

Check the **first 2 digits of the GSTIN** (not the state dropdown):
- Starts with "33" → Tamil Nadu → **CGST + SGST** (50/50 split)
- Anything else → inter-state → **IGST** (100%)
- No GSTIN present → fall back to state dropdown

Round GST at line-item level. Grand Total = SUM of rounded line totals.
Never round the grand total itself — prevents 1-paisa mismatch.
