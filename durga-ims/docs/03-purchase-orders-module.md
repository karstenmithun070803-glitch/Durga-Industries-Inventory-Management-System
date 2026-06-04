# Purchase Orders

> Purchase Orders are the only way stock enters the warehouse. A PO records what was bought, from whom, at what price. Marking a PO as Received triggers automated stock updates and stock ledger entries.

*Last reviewed: 2026-06-04*

---

## Tables

### `purchase_orders` (header)
| Field | Notes |
|-------|-------|
| `po_number` | Auto-incrementing integer per financial year. Resets each April 1. |
| `financial_year` | e.g. `"2025-26"`. Scopes the PO number sequence. |
| `po_date` | Must fall within the active financial year (server-enforced). |
| `status` | `"Draft"` or `"Received"`. One-directional — no un-receive. |
| `affects_stock` | Boolean. `false` = PO is recorded but no warehouse stock changes occur. |
| `supplier_id` | Derived field — set to the single supplier's id if all items share one supplier; `NULL` if mixed. Not the authoritative supplier reference — see per-item supplier below. |
| `supplier_bill_no` | Supplier's own invoice number (optional). For reconciliation. |
| `supplier_bill_date` | Date on the supplier's invoice (optional). |

### `purchase_order_items` (line items)
| Field | Notes |
|-------|-------|
| `supplier_id` | **Authoritative supplier per line item**. Each row can have a different supplier. |
| `gst_type` | `"CGST_SGST"` or `"IGST"`. Frozen at save time from supplier's GSTIN/state. Historical POs retain the split that applied at the time of purchase. |
| `rate` | Rate per unit at time of purchase. |
| `amount` | `qty × rate` (taxable amount before tax). |

---

## Key Design Decision: Per-Item Supplier

Each line item has its own supplier field. The PO header has no required supplier. This is intentional — a single buying session (one trip to the market) commonly involves materials from multiple vendors. Forcing one supplier per PO would split one logical purchase event into multiple POs.

`purchase_orders.supplier_id` is a derived summary field (set to the single supplier if all items match, null if mixed). It is used in reports for filtering single-supplier POs but is not authoritative. The per-item `purchase_order_items.supplier_id` is always authoritative.

---

## Lifecycle

```
CREATE (Draft)
    │
    ├── Edit freely → Save Draft (no stock impact)
    │
    ├── Mark as Received
    │       └── [Received]
    │               ├── Edit Received → atomic: reverse old stock → apply new stock
    │               └── Delete Received → safety check → atomic stock reversal + delete
    │
    └── Delete Draft → simple delete, no stock impact
```

Draft → Received is one-directional. No "un-receive" button exists.

---

## `affects_stock` Flag

A boolean on the PO header (default `true`). When `false`:
- PO status can still be set to Received
- No changes to `materials.current_stock`
- No `stock_ledger` rows written

Use cases: direct-to-site purchases that bypass the warehouse, office consumables, equipment that isn't tracked as raw material inventory.

---

## GST Calculation Per Row

```
amount = qty × rate

CGST_SGST:
  cgst_amount = round(amount × (tax_pct / 100) / 2, 2)
  sgst_amount = cgst_amount      ← always equal to CGST
  igst_amount = 0

IGST:
  igst_amount = round(amount × (tax_pct / 100), 2)
  cgst_amount = 0
  sgst_amount = 0
```

Rounding at line-item level (2 decimal places). Grand total = sum of already-rounded row values. Do not recompute tax on the total — this matches standard GST practice.

A PO can have mixed tax types in the same form (some Tamil Nadu suppliers → CGST+SGST, some out-of-state → IGST). All three tax columns always render; rows show 0 in columns that don't apply.

---

## Validation (Server-Enforced)

All rules run in `validateItems()`, called by create, update, and updateReceived actions.

| Rule | Check |
|------|-------|
| At least one item | `items.length === 0` → throw |
| Every item has a supplier | `!item.supplier_id` → throw |
| No duplicate rows | Same `material_id + supplier_id + rate` (rate normalized to 2dp) → throw |
| Zero-rate confirmation | Rate = 0 AND not a blank-first-purchase AND not explicitly confirmed → throw |
| PO date in FY | `po_date < fy.start OR po_date > fy.end` → throw |

**Rate normalization for duplicate check:** `parseFloat(rate).toFixed(2)` — without this, `"5"` and `"5.0"` would be treated as different rates, allowing true duplicates through.

**Zero rate vs blank rate:** `rate_blank = true` means no purchase history exists — this is expected and not subject to zero-rate confirmation. Zero-rate confirmation only triggers when the user explicitly typed `0` into a field that had prior purchase history.

---

## Mark as Received (Server Action)

If `affects_stock = true`, the entire block runs in a single `db.transaction()`:
1. `UPDATE purchase_orders SET status = 'Received'`
2. For each item: `UPDATE materials SET current_stock = current_stock + qty`
3. For each item: `INSERT stock_ledger (transaction_type = 'PO_INWARD', qty_change = +qty, stock_after = new_stock)`

Full rollback on any failure — PO stays Draft if the transaction fails.

---

## Edit a Received PO (Server Action)

Atomic reverse-and-reapply inside a single transaction:
1. Fetch current (old) items from DB
2. For each old item: decrement stock + write `REVERSAL` ledger entry
3. Delete old `purchase_order_items`
4. Insert new `purchase_order_items`
5. For each new item: increment stock (from post-reversal value) + write `PO_INWARD` ledger entry
6. Update PO header

Full rollback on failure.

---

## Delete a Received PO (Server Action)

**Step 1 — Safety check** (before showing confirmation dialog):
For each item: `after_reversal = current_stock - qty`. If any result < 0 → throw with details (material name, current stock, would-be-negative result). The user must reduce issued quantities first.

**Step 2 — Confirmation dialog** lists exactly what stock quantities will be removed.

**Step 3 — Atomic transaction:** decrement stock per item + write `REVERSAL` entries + `DELETE purchase_orders` (CASCADE deletes items).

---

## PO List View

**One row per line item** (not per PO). Multiple rows share the same PO number when a PO has multiple items. Clicking any row navigates to the full PO edit page. The delete button in the row deletes the entire PO (with confirmation).

**Columns:** S.No | Date | PO# | Mat. Code | Material Name | Supplier | Qty | Unit | Rate | Tax | Amount | Status | Actions (delete)

**Filters:** Status tabs (All/Draft/Received), date range, text search (supplier name, material name, material code)

**Rate auto-fill:** When a material is selected in the PO form, the last received PO rate for that material is fetched from the server and pre-filled. If no received PO history exists, the field is left blank with a yellow border indicating "First purchase — enter rate".

---

## Key Files

```
src/lib/actions/
  purchase-orders.actions.ts    — createPurchaseOrder, updatePurchaseOrder,
                                  updateReceivedPurchaseOrder, deletePurchaseOrder,
                                  receivePurchaseOrder, validateItems(),
                                  deriveHeaderSupplierId()

src/app/(dashboard)/transactions/purchase-orders/
  page.tsx                      — server component
  purchase-orders-client.tsx    — list view (filter, table, delete)
  new/page.tsx                  — new PO form
  [id]/edit/page.tsx            — edit PO form

src/components/forms/
  TransactionGrid.tsx           — reusable line-item grid (used by PO, MI, Invoice)

src/components/pdf/
  po-register-pdf.tsx           — PDF document for PO register print
```

---

## Gotchas

- **List is per-item, not per-PO:** The delete button on any row deletes the entire PO, not just that line item. The edit (row click) navigates to the full PO edit page.
- **`supplier_id` on the header is derived:** Never query `purchase_orders.supplier_id` to find all POs for a supplier — it's null for mixed-supplier POs. Query `purchase_order_items.supplier_id` instead.
- **`gst_type` is frozen at save:** Changing a supplier's GSTIN later doesn't retroactively update existing PO items. The split at the time of purchase is permanently stored.
- **Stock reversal safety check is quantity-aware:** It doesn't check "was this material ever issued?" — it checks "would reversing this specific qty cause negative stock?". A material can have been issued and still have plenty of stock to safely reverse a PO.
- **Draft PO items can be deleted without stock impact:** Only Received POs with `affects_stock = true` require the atomic reversal flow.
