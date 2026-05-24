# Durga IMS — Phase 6: Invoice Module Documentation

**Project:** Sabari Steels ERP — Inventory Management System for a bus body manufacturer
**Stack:** Next.js 14 App Router, Drizzle ORM, Supabase (PostgreSQL), @react-pdf/renderer, Tailwind CSS
**Module:** Invoice (`/invoice`)
**Status:** Feature complete as of Phase 6 (commit a9d4c28, 2026-05-24)
**Zero TODO/FIXME markers** remain in any invoice-related file.

---

## 1. What the Invoice Module Does

The invoice module generates GST-compliant tax invoices for a bus body manufacturer (Durga Industries). Each invoice bills a customer for materials issued to their vehicle during workshop repair or manufacturing. It supports two PDF formats (Insurance copy and Customer copy), tracks invoice status through a three-stage lifecycle, and integrates directly with the Material Issue slip system to prevent double-billing.

---

## 2. Invoice Lifecycle

```
New Invoice (Draft)
     │
     ├── Save Draft          → stays Draft (editable)
     ├── Finalize Invoice    → Finalized (still editable, not deletable)
     │        │
     │        ├── Revert to Draft   → back to Draft
     │        └── Cancel Invoice    → Cancelled (permanent, read-only)
     │
     └── Cancel Invoice      → Cancelled (permanent, read-only)
         (from Draft)
```

### Rules by Status

| Action | Draft | Finalized | Cancelled |
|--------|-------|-----------|-----------|
| Edit form fields | ✅ | ✅ (amber warning shown) | ❌ |
| Save / update | ✅ | ✅ | ❌ |
| Finalize | ✅ | — | ❌ |
| Revert to Draft | — | ✅ | ❌ |
| Cancel Invoice | ✅ | ✅ | ❌ (already cancelled) |
| Delete | ✅ | ❌ | ❌ |
| Print PDF | ✅ | ✅ | ✅ |

---

## 3. Creating an Invoice

**Route:** `/invoice/new`

### Step-by-step flow

1. **Select Tax Rate / Bill Series** — determines the bill number prefix (e.g., selecting "D" series → `D-00001`). The next bill number is previewed live via `peekNextBillNumber()`. Once saved, the prefix is locked permanently.

2. **Select Vehicle / Job** — on selection, the system immediately:
   - Auto-detects GST type (CGST+SGST for Tamil Nadu customers, IGST for out-of-state)
   - Loads all Issued MI slips available for that vehicle (excluding slips already used in other invoices)
   - Auto-checks all slips and populates the line item grid
   - Shows a toast: "Auto-populated N items from M issue slips"

3. **MI Slip Checklist** — each Issued slip appears as a checkbox. Checking/unchecking a slip adds/removes its items. If two slips have the same material at the same rate, they are automatically merged into one row (quantities summed).

4. **Set Bill Date** — defaults to today. Rate Date is optional.

5. **Edit Line Items** — TransactionGrid allows adding, editing, or removing rows. GST amounts auto-calculate per row based on material's tax percentage.

6. **Discount** — optional flat rupee discount subtracted from the gross total.

7. **Reverse Charge** — if checked, PDF prints "Tax to be paid on reverse charge basis."

8. **Material Margin %** — field exists (pending client decision on business rule; currently informational only, does not affect totals).

9. **Save Draft** → saves and redirects to `/invoice/{id}/edit`

10. **Finalize Invoice** → confirm dialog shows net amount → saves and finalizes → redirects to `/invoice/{id}/view`

---

## 4. Editing an Invoice

**Route:** `/invoice/{id}/edit` (works for both Draft and Finalized)

- All form fields remain editable regardless of status.
- Finalized invoices show an **amber warning banner**: "This invoice is Finalized. Editing will update the stored record. No stock reversal needed."
- **Bill Series** field shows a locked read-only display (e.g., `D — locked at creation`) instead of the editable combobox. The prefix cannot be changed after creation.
- MI slip checklist reloads fresh — excludes slips used in other invoices, includes slips currently linked to this invoice.
- Saving a Finalized invoice updates it and keeps the Finalized status.

### Action Bar

**Draft edit:** `Save Draft` | `Finalize Invoice` | ————— | `Cancel Invoice` | `Delete`

**Finalized edit:** `Save Changes` (amber) | `Revert to Draft` | ————— | `Cancel Invoice`

---

## 5. Viewing an Invoice (Read-Only)

**Route:** `/invoice/{id}/view`

- All fields displayed read-only.
- **Sourced from Issue Slips** section shows linked MI slips as a read-only checked list (slip number + date). Useful for auditors to trace which materials were billed.
- **Action Bar:** `Edit` | `Insurance PDF` | `Customer PDF`

### Cancelled Invoice View
- **Rose banner:** "This invoice is Cancelled. It is a permanent record and cannot be edited or deleted. The MI slips linked to it have been freed and can be used in a corrective invoice."
- **Action Bar:** `Insurance PDF` | `Customer PDF` | `Back to Invoices` (no Edit)

---

## 6. Invoice List Page

**Route:** `/invoice`

### Filters (all client-side, instant)
| Filter | How it works |
|--------|-------------|
| Status tabs | All / Draft / Finalized / Cancelled — each shows count of unique invoices |
| Date range | From / To — filters by `bill_date` |
| Search box | Searches bill number, vehicle name, customer name, material name, material code (M-0001), job number |

### Table
- **One row per invoice** — shows the first line item; if the invoice has more items, a grey `(+N more)` badge appears.
- **Columns:** S.No | Bill # | Date | Vehicle/Job | Customer | Mat. Code | Material | HSN | Qty | Unit | Rate | Tax % | Amount | Status | Actions
- **Status badges:** Draft (grey) | Finalized (emerald green) | Cancelled (rose)
- **Actions:** Edit pencil (all statuses) | Delete trash (Draft only)

### Toolbar
| Button | Action |
|--------|--------|
| `Insurance PDF (N)` | Generates a multi-page Insurance PDF for all currently filtered invoices |
| `Customer PDF (N)` | Generates a multi-page Customer PDF for all currently filtered invoices |
| `New Invoice` | Navigates to `/invoice/new` |

---

## 7. MI Slip Double-Billing Guard

**The problem:** The same MI slip could auto-populate into two different invoices for the same vehicle, billing the same materials twice.

**The solution:** `invoice_slip_links` junction table. Every time an invoice is saved (created or updated), the system records which MI slip IDs it references. When loading available slips for any invoice, a `NOT EXISTS` subquery filters out slips already claimed by another invoice.

**When an invoice is cancelled:** All its `invoice_slip_links` rows are deleted — those slips become available again for a corrective invoice.

**When deleting an MI slip:** Blocked with an error if the slip appears in `invoice_slip_links`: *"This issue slip has been used in an invoice. Delete or revert the invoice first."*

---

## 8. Customer Data Snapshot

**The problem:** If a customer's GSTIN or name is updated in the master after an invoice is created, the old invoice would show the new (wrong) data — breaking the GST audit trail.

**The solution:** At invoice creation and update, the system fetches the customer's current details and stores them directly in the `invoices` table:

| Snapshot column | Source |
|----------------|--------|
| `customer_name` | `customers.customer_name` |
| `customer_gstin` | `customers.gstin` |
| `customer_state` | `customers.state` |
| `customer_address` | `address_1 + address_2 + street + city + state` (joined) |

PDFs and the form display read these frozen columns directly — never a live JOIN to the customers table.

---

## 9. GST Calculation

GST type is auto-determined from the customer's GSTIN state code when a vehicle is selected:

| Condition | GST Type | Tax columns |
|-----------|----------|-------------|
| GSTIN starts with "33" (Tamil Nadu) | CGST + SGST | Two columns, each at half the rate |
| Any other GSTIN / no GSTIN | IGST | One column at the full rate |

**Per-line-item calculation** (done in TransactionGrid):
- Amount = Qty × Rate
- CGST/SGST = Amount × (tax% / 2) each — if intra-state
- IGST = Amount × tax% — if inter-state

**Invoice totals:**
```
Subtotal   = Σ line amounts (excluding tax)
CGST       = Σ cgst_amount (0 if IGST)
SGST       = Σ sgst_amount (0 if IGST)
IGST       = Σ igst_amount (0 if CGST+SGST)
Gross      = Subtotal + CGST + SGST + IGST
Net Amount = Gross − Discount
```

Net Amount is stored in the DB at save time. PDFs read the stored value — no recalculation.

---

## 10. PDF Generation

Two formats, both generated client-side using `@react-pdf/renderer`. Company details are read from the `company_settings` DB table (with hardcoded fallbacks if the table is empty).

### Insurance Copy — `insurance-invoice-pdf.tsx`

Full GST tax invoice with per-item tax breakdown.

**Header block:**
```
DURGA INDUSTRIES
S.FNO.1994/2, MADURAI NEW BYE PASS RD, NEAR PERIYAR ARCH, KARUR - 639002
GSTIN: 33AALPU5476B1ZJ

                    INVOICE
```

**Info block (left-aligned labels):**
- BILL NO. / BILL DATE / RATE DATE (if set)
- VEHICLE / JOB NO.
- CUSTOMER / GSTIN / ADDRESS / PLACE OF SUPPLY (customer's state)
- *(italic)* "Tax to be paid on reverse charge basis" — only if reverse charge is ON

**Line item table columns:**
`S.No | HSN | Material Name | Qty | Unit | Rate | CGST | SGST | IGST | Amount`

CGST and SGST columns appear only if invoice has CGST/SGST amounts. IGST column appears only if invoice has IGST amounts. Impossible to have both simultaneously.

**Totals block (right-aligned):**
```
Subtotal            ₹X
CGST / SGST / IGST  ₹X each
Gross Total         ₹X
Discount            -₹X  (only if > 0)
Net Amount          ₹X
```
Amount in words: *"Rupees One Lakh Twenty Thousand and Fifty Paise Only"*

**Authorised Signatory block** (bottom right):
```
________________________
For DURGA INDUSTRIES
Authorised Signatory
```

**Page footer:** `Pg.No.:1 of N          For DURGA INDUSTRIES`

---

### Customer Copy — `customer-invoice-pdf.tsx`

Simplified invoice — no tax breakdown columns.

**Same header and info block as Insurance copy.**

**Line item table columns:**
`S.No | Material Name | Qty | Unit | Rate | Amount`

**Totals block:**
```
Subtotal   ₹X  (only if discount > 0)
Discount  -₹X  (only if > 0)
Net Amount ₹X
```
Amount in words + Authorised Signatory block + page footer.

---

### Bulk Print (from List Page)
- Clicking `Insurance PDF (N)` or `Customer PDF (N)` generates a single multi-page PDF containing all currently filtered invoices, one invoice per page.

### Single Invoice Print (from Form)
- View mode and Cancelled mode: `Insurance PDF` and `Customer PDF` buttons in the action bar print just that one invoice.

---

## 11. Company Settings

**Route:** `/settings`

Company name, address, and GSTIN are editable through the Settings page and stored in the `company_settings` table (single row). All invoice PDFs fetch these values server-side and pass them as props to the PDF components.

**What the Settings page allows:**
- Company Name (text input, required)
- Address (textarea)
- GSTIN (text input, auto-uppercased, validated to 15 characters)
- Save button with success/error toast

**Fallback:** If the DB row is missing, PDFs fall back to hardcoded constants in `src/components/pdf/pdf-styles.ts`.

> **Note:** PO Register and MI Register PDFs (`po-register-pdf.tsx`, `mi-register-pdf.tsx`) currently still use the hardcoded constants — not yet connected to `company_settings`.

---

## 12. Database Schema

### `invoices` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `bill_number` | text | e.g., `D-00001`; unique per financial year |
| `bill_date` | timestamptz | |
| `rate_date` | timestamptz | nullable; optional rate reference date |
| `financial_year` | text | e.g., `2026-2027` |
| `status` | text | `"Draft"` \| `"Finalized"` \| `"Cancelled"` |
| `tax_percentage` | numeric(5,2) | header-level; always 0 (item-level is used) |
| `material_margin` | numeric(5,2) | nullable; pending client business rule |
| `discount` | numeric(14,2) | flat rupee discount |
| `net_amount` | numeric(14,2) | stored at save time |
| `rev_charge_status` | boolean | reverse charge applicable flag |
| `issue_id` | UUID FK nullable | **Deprecated** — always null since multi-slip design |
| `vehicle_id` | UUID FK | required |
| `customer_name` | text | frozen snapshot |
| `customer_gstin` | text | frozen snapshot |
| `customer_state` | text | frozen snapshot |
| `customer_address` | text | frozen snapshot |
| `created_at`, `updated_at` | timestamptz | auto-managed |

**Unique constraint:** `(bill_number, financial_year)`

---

### `invoice_items` table

| Column | Notes |
|--------|-------|
| `invoice_id` | FK → invoices (cascade delete) |
| `material_id` | FK → materials |
| `hsn_code` | frozen at save time |
| `qty`, `rate` | numeric |
| `tax_percentage` | frozen at save (survives future tax rate master changes) |
| `cgst_amount`, `sgst_amount`, `igst_amount`, `amount` | computed and stored |
| `gst_type` | `"CGST_SGST"` or `"IGST"` — frozen at save |
| `unit_id` | FK → units (nullable) |

---

### `invoice_slip_links` table

| Column | Notes |
|--------|-------|
| `invoice_id` | FK → invoices (cascade delete on invoice delete/cancel) |
| `slip_id` | FK → material_issues |

**Unique constraint:** `(invoice_id, slip_id)` — one link per invoice-slip pair

---

## 13. All Server Actions

**File:** `src/lib/actions/invoices.actions.ts`

| Function | Purpose |
|----------|---------|
| `peekNextBillNumber(prefix, fy)` | Returns the next bill number for preview without reserving it |
| `getActiveVehiclesForInvoice()` | Vehicle dropdown — includes customer name, GSTIN, state |
| `getIssuedMIsForVehicle(vehicleId, currentInvoiceId?)` | MI slip checklist — excludes slips used in OTHER invoices |
| `getAllIssuedMIItemsForVehicle(vehicleId, currentInvoiceId?)` | All MI items grouped by slip for auto-populate |
| `getActiveTaxRatesWithPrefix()` | Bill series dropdown |
| `getActiveInvoiceMaterials()` | Material dropdown for manual line item entry |
| `getInvoices(financialYear)` | Invoice list — flat rows (one row per line item) |
| `getInvoiceById(id)` | Full invoice with nested items array |
| `createInvoice(data)` | Creates invoice + items + slip links; race condition guard on bill_number |
| `updateInvoice(id, data)` | Replaces all items + slip links |
| `finalizeInvoice(id)` | Draft → Finalized |
| `revertInvoiceToDraft(id)` | Finalized → Draft |
| `deleteInvoice(id)` | Hard delete — Draft only; rejected for Finalized/Cancelled |
| `cancelInvoice(id)` | Any status → Cancelled; deletes all slip links (frees MI slips) |
| `getLinkedSlipsForInvoice(invoiceId)` | Returns linked MI slips for view-mode slip checklist display |

---

## 14. Key Files

| File | What it does |
|------|-------------|
| [invoice/page.tsx](src/app/(dashboard)/invoice/page.tsx) | SSR: fetches invoice list + company settings → renders list |
| [invoice-list-client.tsx](src/app/(dashboard)/invoice/invoice-list-client.tsx) | Client: status tabs, date filter, search, table, delete confirm, bulk PDF |
| [invoice-form.tsx](src/app/(dashboard)/invoice/invoice-form.tsx) | Client: full create/edit/view form (~1060 lines) |
| [new/page.tsx](src/app/(dashboard)/invoice/new/page.tsx) | SSR wrapper — loads dropdowns + company settings for new invoice |
| [[id]/edit/page.tsx](src/app/(dashboard)/invoice/[id]/edit/page.tsx) | SSR wrapper — loads invoice + dropdowns + company settings |
| [[id]/view/page.tsx](src/app/(dashboard)/invoice/[id]/view/page.tsx) | SSR wrapper — same as edit, mode="view" |
| [invoices.actions.ts](src/lib/actions/invoices.actions.ts) | All DB operations for invoices |
| [insurance-invoice-pdf.tsx](src/components/pdf/insurance-invoice-pdf.tsx) | Insurance copy PDF component |
| [customer-invoice-pdf.tsx](src/components/pdf/customer-invoice-pdf.tsx) | Customer copy PDF component |
| [pdf-styles.ts](src/components/pdf/pdf-styles.ts) | Shared PDF stylesheet + hardcoded company fallbacks |
| [number-to-words.ts](src/lib/utils/number-to-words.ts) | Indian number system for "Rupees X Only" in PDFs |
| [schema.ts](src/lib/db/schema.ts) | `invoices`, `invoiceItems`, `invoiceSlipLinks`, `companySettings` tables |

---

## 15. What Was Built in Each Phase

| Phase | Key Deliverables |
|-------|----------------|
| **Phase 4** (foundation) | Invoice CRUD, finalize, revert to draft, delete, bill number generation with FY prefix, Insurance + Customer PDFs, TransactionGrid integration, basic MI slip auto-populate |
| **Phase 5** (Issues 1–8) | Customer data snapshot (4 columns on invoices table), MI double-billing guard (`invoice_slip_links` junction table), customer address in PDFs, amount in words (Indian number system), vehicle deactivation blocked when Finalized invoice exists, PDF net_amount consistency fix, Print buttons in view mode |
| **Phase 6** (A–G) | Cancelled invoice status (permanent void), slip checklist in view mode (read-only audit trail), auto-merge duplicate material+rate rows on auto-populate, bill series read-only display in edit mode, company details from DB (Settings page + `company_settings` table), Place of Supply label in PDFs, Authorised Signatory block in PDFs, bill number race condition friendly error |

---

## 16. Business Rules (All Enforced in Code)

1. Only Draft invoices can be deleted
2. Cancelled invoices are permanent — cannot edit, delete, or cancel again
3. Cancelling an invoice deletes all `invoice_slip_links` rows (frees MI slips for corrective invoice)
4. Finalized invoices can be edited or cancelled (no stock impact — invoices never affect inventory)
5. The same MI slip cannot be linked to two different invoices simultaneously
6. A vehicle with a Finalized invoice cannot be deactivated
7. An Issued MI slip cannot be deleted if it's linked to any invoice
8. GST type (CGST+SGST vs IGST) is auto-determined from the customer's GSTIN state code
9. Zero-rate line items require explicit user confirmation before saving
10. Discount cannot exceed the gross total
11. Bill number prefix is locked at invoice creation and cannot be changed
12. Bill numbers are unique per financial year (DB constraint)
13. Customer details (name, GSTIN, state, address) are frozen at invoice creation — changes to the customer master don't affect historical invoices

---

## 17. Known Gaps and Deliberately Skipped Items

| Item | Status | Reason |
|------|--------|--------|
| Material Margin % | Pending | Client hasn't decided: does it add to rates, to totals, or is it informational only? |
| Rate Date semantics | Pending | Pending client clarification on what this date means |
| PO/MI PDFs using company settings | Not done | Only invoice PDFs were updated; PO and MI register PDFs still use hardcoded constants |
| `issue_id` column | Deprecated | Always null since multi-slip design was adopted. Should be removed in a future DB migration. |
| FY persistence | Tolerated | `useFY()` is React state — resets on page load. Acceptable for a shop that always works in the current FY. |
| e-invoice / IRN | Future | Only mandatory above ₹5 Cr turnover |
| GSTR-1 export | Future | For GST portal filing — not yet requested |
| Reports / Dashboard | Entire module is TODO | Stock levels, invoice summaries, material usage — completely unimplemented |
