# Invoice Module

> Generates GST-compliant tax invoices billing customers for materials issued to their vehicle jobs. Two PDF formats (Insurance and Customer copy). Three-stage lifecycle with MI slip double-billing protection.

*Last reviewed: 2026-06-04*

---

## Tables

### `invoices`
| Column | Notes |
|--------|-------|
| `bill_number` | e.g. `D-00001`. Unique per `financial_year`. Prefix comes from the tax rate's `inv_prefix`. |
| `financial_year` | e.g. `"2025-26"`. Scopes bill number sequence. |
| `status` | `"Draft"` \| `"Finalized"` \| `"Cancelled"` |
| `net_amount` | Stored at save time. PDFs read this — no recalculation. |
| `discount` | Flat rupee discount subtracted from gross total. |
| `rev_charge_status` | If true, PDF prints "Tax to be paid on reverse charge basis." |
| `customer_name/gstin/state/address` | **Frozen snapshots** taken from master at save time. Changes to the customer master don't affect historical invoices. |
| `vehicle_id` | FK → vehicles |
| `issue_id` | Deprecated. Always null since multi-slip design was adopted. |

### `invoice_items`
| Column | Notes |
|--------|-------|
| `gst_type` | `"CGST_SGST"` or `"IGST"` — frozen at save |
| `tax_percentage` | Frozen at save — survives future tax rate master changes |
| `cgst_amount`, `sgst_amount`, `igst_amount`, `amount` | Computed and stored |
| `hsn_code` | Frozen at save |

### `invoice_slip_links`
Junction table — maps invoices to MI slips. Guards against double-billing.
- `(invoice_id, slip_id)` — unique constraint
- CASCADE-deleted when an invoice is cancelled or deleted

---

## Lifecycle

```
New Invoice (Draft)
     │
     ├── Save Draft          → stays Draft (editable)
     ├── Finalize            → Finalized (editable, not deletable)
     │        ├── Revert to Draft  → back to Draft
     │        └── Cancel          → Cancelled (permanent, read-only)
     └── Cancel              → Cancelled (permanent, read-only)
```

| Action | Draft | Finalized | Cancelled |
|--------|-------|-----------|-----------|
| Edit form | ✅ | ✅ (amber warning) | ❌ |
| Finalize | ✅ | — | ❌ |
| Revert to Draft | — | ✅ | ❌ |
| Cancel | ✅ | ✅ | ❌ |
| Delete | ✅ | ❌ | ❌ |
| Print PDF | ✅ | ✅ | ✅ |

---

## Invoice Types (Vehicle Type Field)

Vehicles have a `type` field: `"New Build"` or `"Old Build"`. This surfaces in the Invoice Summary report and is displayed on the invoice form. (Note: previously called "Repair" — renamed to "Old Build".)

---

## Creating an Invoice

1. **Select Tax Rate / Bill Series** — determines the bill number prefix (e.g. `"D"` → `D-00001`). Next bill number previewed live via `peekNextBillNumber()`. Prefix is locked permanently after creation.

2. **Select Vehicle / Job** — on selection, the system:
   - Auto-detects GST type (CGST+SGST for Tamil Nadu, IGST for other states)
   - Loads all Issued MI slips for that vehicle (excluding slips used in other invoices)
   - Auto-checks all slips and populates the line item grid
   - Merges duplicate material+rate rows (quantities summed) when two slips have the same material at the same rate

3. **MI Slip Checklist** — each Issued slip appears as a checkbox. Checking/unchecking adds/removes its items.

4. **Set Bill Date** — defaults to today.

5. **Edit Line Items** — TransactionGrid allows adding, editing, removing rows. GST amounts auto-calculate per row.

6. **Discount** — optional flat rupee amount subtracted from gross total.

7. **Save Draft** → saves and stays on form at `/invoice/{id}/edit`

8. **Finalize Invoice** → confirmation dialog shows net amount → finalizes

---

## GST Calculation

GST type is determined from the customer's GSTIN state code when a vehicle is selected:

| Condition | GST Type |
|-----------|----------|
| GSTIN starts with `"33"` (Tamil Nadu) | CGST + SGST (each at half the rate) |
| Any other GSTIN / no GSTIN | IGST (full rate) |

```
Amount = Qty × Rate

CGST+SGST:
  cgst_amount = Amount × (tax% / 2)
  sgst_amount = Amount × (tax% / 2)
  igst_amount = 0

IGST:
  igst_amount = Amount × tax%
  cgst_amount = sgst_amount = 0

Invoice totals:
  Subtotal   = Σ line amounts
  CGST       = Σ cgst_amount
  SGST       = Σ sgst_amount
  IGST       = Σ igst_amount
  Gross      = Subtotal + CGST + SGST + IGST
  Net Amount = Gross − Discount
```

Net Amount is stored in DB at save time. PDFs read the stored value.

---

## Customer Data Snapshot

At invoice creation and every update, the system fetches customer details from the master and stores them directly on the `invoices` row: `customer_name`, `customer_gstin`, `customer_state`, `customer_address`. PDFs and the form display these frozen columns — never a live JOIN to the customers table. This preserves the GST audit trail if a customer's details change later.

---

## MI Slip Double-Billing Guard

`invoice_slip_links` records which MI slips are claimed by each invoice. When loading available slips for an invoice form, a `NOT EXISTS` subquery filters out slips already used in other invoices (the current invoice's own slips remain available).

When an invoice is cancelled: all its `invoice_slip_links` rows are deleted — those slips become available again for a corrective invoice.

When deleting an MI slip: blocked if the slip appears in `invoice_slip_links` ("This issue slip has been used in an invoice. Delete or revert the invoice first.").

---

## Invoice List Page

**Route:** `/invoice`

One row per invoice (first line item shown; `(+N more)` badge if multiple items). Click any row → navigates to `/invoice/{id}/edit`. Draft invoices show a delete button in the row.

**Columns:** S.No | Bill # | Date | Vehicle/Job | Customer | Mat. Code | Material | HSN | Qty | Unit | Rate | Tax % | Amount | Status | Actions

**Filters:** Status tabs (All/Draft/Finalized/Cancelled), date range, text search (bill number, vehicle, customer, material, job number)

**Bulk PDF:** "Insurance PDF (N)" and "Customer PDF (N)" in the toolbar generate multi-page PDFs for all currently filtered invoices.

---

## PDF Generation

Two formats, both client-side via `@react-pdf/renderer`. Company details from `company_settings` DB table (hardcoded fallbacks if empty).

**Insurance Copy** (`insurance-invoice-pdf.tsx`) — Full GST breakdown:
- Line item columns: S.No | HSN | Material Name | Qty | Unit | Rate | CGST | SGST | IGST | Amount | Tax Amount
- CGST+SGST columns shown only for intra-state invoices; IGST column shown only for inter-state
- Totals: Subtotal, CGST/SGST/IGST, Gross Total, Discount (if > 0), Net Amount
- Amount in words (Indian number system), Authorised Signatory block, page footer

**Customer Copy** (`customer-invoice-pdf.tsx`) — Simplified, no tax columns:
- Line item columns: S.No | Material Name | Qty | Unit | Rate | Amount
- Totals: Subtotal (if discount > 0), Discount, Net Amount

---

## Business Rules

1. Only Draft invoices can be deleted
2. Cancelled invoices are permanent — cannot edit, delete, or cancel again
3. Cancelling an invoice frees all linked MI slips (deletes `invoice_slip_links`)
4. Finalized invoices can be edited or cancelled — no stock impact (invoices never affect inventory)
5. The same MI slip cannot be linked to two invoices simultaneously
6. A vehicle with a Finalized invoice cannot be deactivated in the Vehicle master
7. An Issued MI slip linked to any invoice cannot be deleted
8. Bill number prefix is locked at creation — cannot be changed
9. Bill numbers are unique per financial year (DB `UNIQUE(bill_number, financial_year)`)
10. Customer details are frozen at creation — master changes don't affect historical invoices
11. Discount cannot exceed gross total
12. `material_margin` field exists but is informational only — does not affect totals (pending client business rule decision)

---

## Key Files

```
src/lib/actions/
  invoices.actions.ts           — all server actions (create, update, finalize, cancel,
                                  delete, peekNextBillNumber, slip loading, etc.)

src/app/(dashboard)/invoice/
  page.tsx                      — server component, invoice list + company settings
  invoice-list-client.tsx       — list view (filters, table, delete, bulk PDF)
  invoice-form.tsx              — full create/edit/view form
  new/page.tsx                  — SSR wrapper for new invoice
  [id]/edit/page.tsx            — SSR wrapper for edit
  [id]/view/page.tsx            — SSR wrapper for view (read-only mode)

src/components/pdf/
  insurance-invoice-pdf.tsx     — Insurance copy PDF
  customer-invoice-pdf.tsx      — Customer copy PDF
  pdf-styles.ts                 — shared PDF styles + company fallbacks

src/lib/utils/
  number-to-words.ts            — Indian number system for "Rupees X Only"
```

---

## Gotchas

- **`issue_id` column on invoices is deprecated** — always null. Kept in schema for backwards compatibility but should be removed in a future migration.
- **Bill series is locked at creation** — the form shows a read-only "D — locked at creation" display instead of the combobox on edit. Do not try to update it via a server action; the `bill_number` prefix is stored as part of the bill number string.
- **`net_amount` is stored, not recomputed** — PDFs read the stored value. If line items are edited without saving, the displayed net amount on a PDF would reflect the last saved state, not the current unsaved form state.
- **CGST and SGST will always be equal** — the formula splits the tax rate exactly in half for each. Never try to set them independently.
- **Auto-merge on auto-populate** — when a vehicle is selected and MI slips are auto-loaded, rows with the same material ID and rate are merged (quantities summed). This is intentional to avoid duplicate material rows in the invoice.
