# Material Issues

> Material Issues record when materials leave the warehouse for a vehicle job. Each confirmed slip reduces `current_stock` atomically and writes permanent stock ledger entries. POs add stock; Material Issues remove it.

*Last reviewed: 2026-06-04*

---

## Tables

### `material_issues` (header)
| Field | Notes |
|-------|-------|
| `slip_number` | Auto-incrementing integer per financial year. Resets each April 1. `UNIQUE(slip_number, financial_year)`. |
| `financial_year` | Scopes the slip number sequence. |
| `status` | `"Draft"` or `"Issued"`. One-directional. |
| `vehicle_id` | Required. Every slip must tie to a vehicle/job. |
| `margin_percentage` | Stored but informational only — does not affect stock or totals. |

### `material_issue_items` (line items)
| Field | Notes |
|-------|-------|
| `contractor_id` | Nullable. Materials can be assigned to a contractor or issued directly to the job. |
| `affects_inventory` | Boolean (default `true`). `false` = pass-through — recorded on slip but no stock deduction. |
| `gst_type` | `"CGST_SGST"` or `"IGST"`. Frozen at save time from the vehicle's customer GSTIN. |
| `unit_id` | Sales unit (not purchase unit) — see Unit section below. |
| `hsn_code` | Frozen from material master at issue time. |

---

## Lifecycle

```
CREATE (Draft)
    │
    ├── Edit freely → Save Draft (no stock impact)
    │
    ├── Issue Materials (confirm)
    │       └── [Issued]
    │               ├── Edit Issued → atomic: reverse old stock → apply new stock
    │               └── Delete Issued → atomic: restore stock → delete
    │
    └── Delete Draft → simple delete, no stock impact
```

Draft → Issued is one-directional. Deleting an Issued slip always **adds stock back** — this never causes negative stock (opposite of deleting a received PO). No pre-deletion safety check is needed for MI slips.

---

## Key Design Points

### Per-Item Contractor (Optional)
A single slip can have materials going to different contractors (e.g. Contractor A uses ANGLE for fabrication, Contractor B uses BOLTS for welding — same job, same slip, different rows). `contractor_id` is nullable; items without a contractor are valid.

### Per-Item `affects_inventory` Flag
Controls whether each row deducts stock when the slip is confirmed:

| `affects_inventory` | Stock impact on Issue |
|---------------------|----------------------|
| `true` (default) | `current_stock -= qty`, ISSUE ledger entry written |
| `false` | No stock change, no ledger entry |

Use cases for `false`: tools temporarily lent to a job (not consumed), pass-through items purchased separately and never in the warehouse, service charges captured on the slip for costing.

**Stock availability check aggregates by material_id:** If two rows on the same slip use the same material (e.g. M001 × 10 for Contractor A and M001 × 15 for Contractor B), the check sums both (25 total) before comparing to `current_stock`. Without this aggregation, individual row checks could allow a combined over-issue.

### GST Type is Header-Level (Not Per-Row)
Unlike POs (where each row has its own supplier with its own GSTIN), MI slips have one vehicle/customer context. All rows share one GST type determined by the customer's GSTIN when the vehicle is selected. When the vehicle changes, all row tax amounts recalculate.

### Sales Unit (Not Purchase Unit)
Materials are bought in purchase units (e.g. BOX) but issued in sales units (e.g. NO/pieces). The issue form uses `material.sales_unit_id`; falls back to `purchase_unit_id` if no sales unit is set; shows an amber warning if neither is set.

---

## Validation (Server-Enforced)

All rules run in `validateIssueItems()`, called by create, update, and updateIssued actions.

| Rule | Check |
|------|-------|
| At least one item | `items.length === 0` → throw |
| All items have a material | `!item.material_id` → throw |
| Qty > 0 on every row | `qty <= 0` → throw |
| No duplicate rows | Same `material_id + contractor_id + normalized_rate` → throw |
| Zero-rate confirmation | Rate = 0, not a blank first-purchase, not confirmed → throw |
| Issue date in FY | `issue_date` outside active FY range → throw |
| Vehicle required | `!data.vehicle_id` → throw |

Duplicate key normalization: `parseFloat(rate || "0").toFixed(2)` before building the composite key.

---

## Issue Materials (Confirm — Server Action)

1. Verify slip status is `'Draft'`
2. `checkStockAvailability()`: aggregate qty by `material_id` for all `affects_inventory = true` rows; if any material's total requested > `current_stock` → throw with name + available + requested
3. `db.transaction()`:
   - `UPDATE material_issues SET status = 'Issued'`
   - For each item where `affects_inventory = true`: decrement `current_stock` + insert `stock_ledger` row (`ISSUE`, qty_change = −qty)

---

## Edit an Issued Slip (Server Action)

Atomic reverse-and-reapply inside a single transaction:
1. Fetch current (old) items from DB
2. For each old item where `affects_inventory = true`: increment stock + write `ISSUE_REVERSAL` ledger entry
3. Delete old `material_issue_items`
4. Insert new `material_issue_items`
5. For each new item where `affects_inventory = true`: decrement stock (from post-reversal value) + write `ISSUE` ledger entry
6. Update header fields

---

## Delete an Issued Slip (Server Action)

No pre-check needed (restoring stock never goes negative).
- Atomic transaction: for each item where `affects_inventory = true` → increment `current_stock` + write `ISSUE_REVERSAL` entry
- `DELETE material_issues` (CASCADE deletes items)

**Delete is blocked** if any MI slip is linked in `invoice_slip_links` (the slip was used in an invoice). Resolve: delete or cancel the invoice first.

---

## Material Issues List View

**Route:** `/transactions/material-issues`

**One row per line item** (not per slip). Multiple rows share the same slip number when a slip has multiple items. Click any row → navigates to the full slip edit page. Delete button in the row deletes the entire slip (with confirmation).

**Columns:** S.No | Date | Slip# | Vehicle/Job | Mat. Code | Material | Contractor | Qty | Unit | Rate | Tax | Amount | Status | Actions (delete)

**Filters:** Status tabs (All/Draft/Issued), date range, text search (vehicle, material name, material code, slip number)

---

## Key Files

```
src/lib/actions/
  material-issues.actions.ts    — createMaterialIssue, updateMaterialIssue,
                                  updateIssuedMaterialIssue, issueMaterialIssue,
                                  deleteMaterialIssue, validateIssueItems(),
                                  checkStockAvailability()

src/app/(dashboard)/transactions/material-issues/
  page.tsx                      — server component
  material-issues-client.tsx    — list view
  new/page.tsx                  — new slip form
  [id]/edit/page.tsx            — edit slip form

src/components/forms/
  TransactionGrid.tsx           — reusable grid, mode="material-issue" activates MI columns

src/components/pdf/
  mi-register-pdf.tsx           — MI Register PDF document
```

---

## Gotchas

- **GST type is header-level, not per-row** — unlike POs. If you change the vehicle on a slip, all row tax amounts recalculate automatically.
- **Stock aggregation in availability check** — two rows for the same material on one slip are summed before the availability check. A single material can appear multiple times (for different contractors) and the combined total is what's validated.
- **Sales unit, not purchase unit** — rates and quantities on MI slips are in sales units. If conversion is set (e.g. 1 BOX = 100 NO), the rate shown is per NO, not per BOX.
- **Deleting an issued slip always restores stock** — no negative-stock risk, so no pre-deletion safety check. This is the opposite of deleting a received PO.
- **Invoice link blocks deletion** — if a slip is linked to any invoice via `invoice_slip_links`, it cannot be deleted. Cancel or delete the invoice first to free the slip.
