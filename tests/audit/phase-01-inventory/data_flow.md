# Phase 1 — Data Flow Map

> Maps the top 8 mutating operations: trigger → server action → tables written → side effects.
> Every step cites the exact file and line number from the source.

---

## Operation 1: PO Receipt (Draft → Received)

**Business event:** Workshop receives purchased goods; stock must be credited.

```
Trigger
  UI button "Mark as Received" on /transactions/purchase-orders/[id]/edit
  → calls server action receivePurchaseOrder(id)
     src/lib/actions/purchase-orders.actions.ts:338

Server Action Steps (inside db.transaction)
  1. SELECT purchase_orders WHERE id = ? AND status = 'Draft'
     └─ Throws "PO not found or already received" if guard fails
  2. SELECT purchase_order_items WHERE po_id = ?
     └─ Throws "Cannot receive a PO with no items" if empty
  3. UPDATE purchase_orders SET status = 'Received', updated_at = now()
  4. IF po.affects_stock = true:
       FOR EACH item:
         a. SELECT materials.current_stock WHERE id = item.material_id
         b. newStock = current_stock + item.qty
         c. UPDATE materials SET current_stock = newStock
         d. INSERT stock_ledger (
              material_id, transaction_type='PO_INWARD',
              reference_id=po.id, reference_type='purchase_order',
              qty_change=item.qty, stock_after=newStock
            )
     ELSE (affects_stock = false):
       Status updated; no stock or ledger writes.

Tables written
  purchase_orders   — status column
  materials         — current_stock column (one row per line item)
  stock_ledger      — one INSERT per line item (immutable, no UPDATE ever)

Side effects
  revalidatePath('/transactions/purchase-orders')   line 385
  No email / notification / external call
```

**Atomicity:** The entire block is wrapped in `db.transaction()` at line 339. If any step fails, all changes roll back.

---

## Operation 2: MI Slip Issue (Draft → Issued)

**Business event:** Workshop draws materials for a job; stock must be debited.

```
Trigger
  UI button "Confirm Issue" on /transactions/material-issues/[id]/edit
  → calls server action issueMaterialIssue(id)
     src/lib/actions/material-issues.actions.ts:464

Server Action Steps (inside db.transaction)
  1. SELECT material_issues WHERE id = ? → verify status = 'Draft'
  2. SELECT material_issue_items WHERE issue_id = ?
  3. INSIDE TRANSACTION:
     a. Aggregate requested qty per material (only affects_inventory=true items)
     b. FOR EACH material with inventory impact:
          SELECT materials WHERE id = ? → check current_stock >= requestedQty
          Throws "Insufficient stock for X" if check fails (rolls back entire tx)
     c. UPDATE material_issues SET status = 'Issued'
     d. FOR EACH item WHERE affects_inventory = true:
          SELECT materials.current_stock
          newStock = current_stock - item.qty
          UPDATE materials SET current_stock = newStock
          INSERT stock_ledger (
            transaction_type='ISSUE',
            reference_id=slip.id, reference_type='material_issue',
            qty_change=-item.qty, stock_after=newStock
          )
     (Items with affects_inventory = false: no stock or ledger writes)

Tables written
  material_issues   — status column
  materials         — current_stock (one row per inventory-affecting item)
  stock_ledger      — one INSERT per inventory-affecting item

Side effects
  revalidatePath('/transactions/material-issues')   line 523
  Returns slip_number to caller (used by UI to display confirmation)
  No external calls
```

**Atomicity:** Wrapped in `db.transaction()` at line 482.

---

## Operation 3: Manual Stock Adjustment

**Business event:** Stockroom count differs from system; override with confirmed reason.

```
Trigger
  UI "Adjust" dialog on /stock — user types new quantity, types reason (≥10 chars), clicks Confirm
  → calls server action adjustStock(materialId, newQty, reason)
     src/lib/actions/stock.actions.ts:252

Server Action Steps (NOT inside a DB transaction — see question Q-9)
  1. Validate newQty >= 0, reason.trim().length >= 10
  2. Get username from Supabase session (falls back to "system" on failure)
     createClient().auth.getUser()   line 263
  3. SELECT materials.current_stock WHERE id = ?
  4. delta = newQty - currentQty
  5. fullReason = "{reason} — Adjusted from {currentQty} to {newQty} by {username}"
  6. UPDATE materials SET current_stock = newQty
       WHERE id = ? AND current_stock = mat.current_stock
       (optimistic concurrency: WHERE clause matches 0 rows if another write raced)
  7. Re-read current_stock to verify update landed
     If verify.current_stock ≠ newQty → throw "Stock was changed by another user"
  8. INSERT stock_ledger (
       transaction_type='ADJUSTMENT',
       qty_change=delta, stock_after=newQty,
       reason=fullReason, adjusted_by=username
     )

Tables written
  materials    — current_stock
  stock_ledger — one INSERT (ADJUSTMENT)

Side effects
  revalidatePath('/stock')   line 310
  No external calls

Risk: Steps 6–8 are NOT in a single DB transaction. Between step 6 (UPDATE) and step 8 (INSERT ledger),
a crash would leave stock updated but no ledger entry. See questions.md Q-9.
```

---

## Operation 4: Edit Received PO (Reverse + Reapply)

**Business event:** Quantity or price on a received PO needs correction; stock must be adjusted accordingly.

```
Trigger
  User edits a Received PO and clicks Save
  → calls server action updateReceivedPurchaseOrder(id, data)
     src/lib/actions/purchase-orders.actions.ts:392

Server Action Steps (inside db.transaction)
  1. SELECT purchase_orders WHERE id = ? AND status = 'Received'
  2. SELECT old purchase_order_items WHERE po_id = ?
  3. IF po.affects_stock = true (original):
       FOR EACH old item:
         SELECT materials.current_stock
         newStock = current_stock - old_item.qty
         UPDATE materials SET current_stock = newStock
         INSERT stock_ledger (transaction_type='REVERSAL', qty_change=-old_item.qty)
  4. UPDATE purchase_orders SET po_date, supplier_id, total_amount, affects_stock
  5. DELETE purchase_order_items WHERE po_id = ?
  6. INSERT new purchase_order_items (all new line items)
  7. IF new data.affects_stock = true:
       FOR EACH new item:
         SELECT materials.current_stock
         newStock = current_stock + new_item.qty
         UPDATE materials SET current_stock = newStock
         INSERT stock_ledger (transaction_type='PO_INWARD', qty_change=new_item.qty)

Tables written
  purchase_orders       — header fields
  purchase_order_items  — deleted + re-inserted
  materials             — current_stock (REVERSAL then PO_INWARD)
  stock_ledger          — N REVERSAL rows + M PO_INWARD rows

Atomicity: db.transaction() at line 394.
```

---

## Operation 5: Edit Issued MI Slip (Reverse + Reapply)

**Business event:** Quantity issued to a job needs correction; stock must be reversed then re-deducted.

```
Trigger
  User edits an Issued MI slip and clicks "Save & Reapply"
  → calls server action updateIssuedMaterialIssue(id, data)
     src/lib/actions/material-issues.actions.ts:531

Server Action Steps (inside db.transaction)
  1. SELECT material_issues WHERE id = ? AND status = 'Issued'
  2. SELECT old material_issue_items WHERE issue_id = ?
  3. Reverse old stock:
       FOR EACH old item WHERE affects_inventory = true:
         SELECT materials.current_stock
         reversedStock = current_stock + old_item.qty
         UPDATE materials SET current_stock = reversedStock
         INSERT stock_ledger (transaction_type='REVERSAL', qty_change=+old_item.qty)
  4. DELETE material_issue_items WHERE issue_id = ?
  5. INSERT new material_issue_items
  6. Stock availability check (post-reversal state):
       Aggregate requested qty per material (new items, affects_inventory=true)
       FOR EACH material: check current_stock >= requestedQty (throws on failure)
  7. Apply new stock:
       FOR EACH new item WHERE affects_inventory = true:
         SELECT materials.current_stock
         newStock = current_stock - new_item.qty
         UPDATE materials SET current_stock = newStock
         INSERT stock_ledger (transaction_type='ISSUE', qty_change=-new_item.qty)
  8. UPDATE material_issues header (issue_date, vehicle_id, margin, total_amount)

Tables written
  material_issues       — header fields
  material_issue_items  — deleted + re-inserted
  materials             — current_stock (REVERSAL then ISSUE)
  stock_ledger          — N REVERSAL rows + M ISSUE rows

Atomicity: db.transaction() at line 548.
```

---

## Operation 6: Delete Received PO (With Stock Reversal)

**Business event:** PO entered in error must be removed; stock must be reversed.

```
Trigger
  User clicks Delete on a Received PO
  → calls server action deletePurchaseOrder(id)
     src/lib/actions/purchase-orders.actions.ts:486

Server Action Steps
  Phase A — Pre-check (OUTSIDE transaction):
    IF po.affects_stock:
      SELECT materials.current_stock + purchase_order_items.qty (joined)
      FOR EACH item: check current_stock - qty >= 0
      If any would go negative → throw descriptive error, abort.

  Phase B — Atomic delete (inside db.transaction):
    IF po.affects_stock:
      SELECT purchase_order_items
      FOR EACH item:
        SELECT materials.current_stock
        newStock = current_stock - item.qty
        UPDATE materials SET current_stock = newStock
        INSERT stock_ledger (transaction_type='REVERSAL', qty_change=-item.qty)
    DELETE purchase_orders WHERE id = ?
    (CASCADE deletes purchase_order_items automatically)

Tables written
  materials    — current_stock
  stock_ledger — one REVERSAL row per item
  purchase_orders + purchase_order_items — deleted (cascade)

Risk: Pre-check and transaction are not a single atomic unit (lines 501–519 vs 523–555).
Between the check and the transaction, another write could reduce stock further.
See questions.md Q-8.
```

---

## Operation 7: Delete Issued MI Slip (With Stock Reversal)

**Business event:** MI slip entered in error must be removed; stock must be returned.

```
Trigger
  User clicks Delete on an Issued MI slip
  → calls server action deleteMaterialIssue(id)
     src/lib/actions/material-issues.actions.ts:640

Server Action Steps
  1. SELECT material_issues WHERE id = ?
  2. IF status = 'Draft': simple DELETE (cascade handles items), done.
  3. IF status = 'Issued':
     Guard: SELECT invoiceSlipLinks JOIN invoices WHERE slip_id = ? LIMIT 1
     If linked to any invoice → throw "This issue slip has been used in Invoice {bill_number}"

     Atomic block (inside db.transaction):
       SELECT material_issue_items WHERE issue_id = ?
       FOR EACH item WHERE affects_inventory = true:
         SELECT materials.current_stock
         restoredStock = current_stock + item.qty
         UPDATE materials SET current_stock = restoredStock
         INSERT stock_ledger (transaction_type='REVERSAL', qty_change=+item.qty)
       DELETE material_issues WHERE id = ?
       (CASCADE deletes material_issue_items)

Tables written
  materials             — current_stock
  stock_ledger          — one REVERSAL row per inventory item
  material_issues + material_issue_items — deleted (cascade)

Note: Deleting an ISSUE always restores stock (adds back), so no negative-stock pre-check needed.
     Unlike PO deletion, stock reversal for MI deletion never risks going negative.
Atomicity: db.transaction() at line 674.
```

---

## Operation 8: Invoice Finalization (Draft → Finalized)

**Business event:** Invoice is approved; MI slips are permanently linked; bill number assigned.

```
Trigger
  User clicks "Finalize" on /invoice/[id]/edit
  → calls server action finalizeInvoice(id)
     src/lib/actions/invoices.actions.ts

Server Action Steps
  1. Verify invoice status = 'Draft'
  2. UPDATE invoices SET status = 'Finalized'
  3. (slip_ids supplied at creation time; invoice_slip_links already inserted by createInvoice)
     Existing links confirmed — no new writes needed at finalization in current implementation.

Tables written
  invoices  — status column

No stock movement.
No ledger entry.

Side effects
  revalidatePath('/invoice')
  After finalization, the invoice's linked MI slips are blocked from deletion
  (material-issues.actions.ts:653 checks invoice_slip_links for any finalized invoice)
```

---

## Supplemental: Invoice Cancellation

```
Trigger
  User clicks "Cancel Invoice" on a Finalized invoice
  → calls server action cancelInvoice(id, reason)
     src/lib/actions/invoices.actions.ts

Steps
  1. Get username from Supabase session
  2. UPDATE invoices SET status = 'Cancelled', cancelled_by = username, cancelled_at = now()

Tables written
  invoices  — status, cancelled_by, cancelled_at

No stock reversal on cancellation (invoices do not affect stock).
```

---

## Stock Ledger Integrity Summary

| Operation | Ledger type | qty_change sign | When written |
|-----------|------------|-----------------|--------------|
| PO Receipt | `PO_INWARD` | `+` (positive) | Inside atomic transaction |
| MI Issue | `ISSUE` | `−` (negative) | Inside atomic transaction |
| Edit Received PO | `REVERSAL` then `PO_INWARD` | `−` then `+` | Same transaction |
| Edit Issued MI | `REVERSAL` then `ISSUE` | `+` then `−` | Same transaction |
| Delete Received PO | `REVERSAL` | `−` | Inside transaction (after external pre-check) |
| Delete Issued MI | `REVERSAL` | `+` | Inside transaction |
| Manual Adjustment | `ADJUSTMENT` | delta (±) | Outside transaction (see Q-9) |

The ledger is never updated or deleted. `stock_after` on each row represents the running balance at that point in time.
