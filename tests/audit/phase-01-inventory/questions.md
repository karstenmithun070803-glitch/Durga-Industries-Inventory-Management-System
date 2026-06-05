# Phase 1 — Open Questions, Ambiguities, and Findings

---

## Section A: Schema / Migration Discrepancies

These are factual mismatches between `src/lib/db/schema.ts` and `drizzle/migrations/0000_clumsy_jubilee.sql`. They must be resolved before Phase 4 (database integrity).

### Q-1: Schema/migration out of sync — 21 columns and 2 tables missing from migration

`schema.ts` defines 21 columns and 2 whole tables that do not appear in the single migration file. The migration represents the initial schema; the additions appear to have been applied directly to the live database without a recorded migration file.

**Columns in schema.ts but not in migration:**

| Table | Column | Type |
|-------|--------|------|
| `customers` | `customer_no` | serial, unique |
| `purchase_orders` | `affects_stock` | boolean |
| `purchase_orders` | `supplier_bill_no` | text |
| `purchase_orders` | `supplier_bill_date` | date |
| `purchase_order_items` | `supplier_id` | uuid FK |
| `purchase_order_items` | `gst_type` | text |
| `material_issues` | `status` | text |
| `material_issue_items` | `gst_type` | text |
| `invoices` | `status` | text |
| `invoices` | `customer_name` | text |
| `invoices` | `customer_gstin` | text |
| `invoices` | `customer_state` | text |
| `invoices` | `customer_address` | text |
| `invoices` | `payment_status` | text |
| `invoices` | `payment_date` | date |
| `invoices` | `payment_notes` | text |
| `invoices` | `cancelled_by` | text |
| `invoices` | `cancelled_at` | timestamptz |
| `invoice_items` | `gst_type` | text |

**Tables in schema.ts but not in migration:**
- `invoice_slip_links` (`schema.ts:264–271`)
- `company_settings` (`schema.ts:299–312`)

**Column in migration but not in schema.ts:**
- `invoices.issue_id` — present in migration SQL; removed in `schema.ts` (replaced by `invoice_slip_links` many-to-many table)

**Type mismatch:**
- `vehicles.job_ref_no`: migration defines as `serial`; `schema.ts:118` defines as `text`

**Question for the user:** Were these schema additions applied to the live Supabase database manually (via SQL editor) or via Drizzle Kit? Can we verify the live schema against `schema.ts`?

---

## Section B: Business Rule Intent Questions

These require a domain answer before writing correct tests.

### Q-2: When is `affects_stock = false` used on a Purchase Order?

`purchase_orders.affects_stock` (`schema.ts:153`, comment: "false = PO is for accounting only; receiving does not update warehouse stock").

**Question:** Is this feature actively used in the current production data? What is the business case — is it used for service invoices, or for POs that track cost but where goods are not received into the main warehouse?

---

### Q-3: When is `affects_inventory = false` used on a Material Issue item?

`material_issue_items.affects_inventory` (`schema.ts:224`, comment: "FALSE = pass-through / service item — no stock movement on save").

**Question:** What types of items get `affects_inventory = false`? Are these services rendered by contractors, or consumables that bypass the warehouse? Is there a list of such items?

---

### Q-4: Is `payment_status` on invoices actively tracked and updated?

`invoices.payment_status` defaults to `'Unpaid'`. The schema supports `'Partial'` and `'Paid'`. `updateFinalizedInvoice` can update payment fields.

**Question:** Does the client currently use this to track which invoices have been paid? Or was it added as a feature that is not yet in active daily use?

---

### Q-5: Is `rev_charge_status` on invoices purely informational?

`invoices.rev_charge_status` (`schema.ts:243`, default `false`). No downstream logic was found in the code that changes tax calculation based on this flag — it is stored but not acted upon.

**Question:** Is the reverse charge flag used for printing on the PDF only, or is it expected to change the GST calculation? If it should change the calculation, that is a bug.

---

### Q-6: What is `rate_date` on invoices used for?

`invoices.rate_date` (`schema.ts:235`, nullable). No business logic using this field was found in the action files.

**Question:** Under what conditions is `rate_date` set? Is it used on the PDF invoice, or is it a legacy field?

---

## Section C: Code-Level Risks and Anomalies

These are findings from reading the code. They do not require a domain answer but should be acknowledged.

### Q-7: GST split calculation is frontend-only — no server-side re-validation

Business rule BR-25 (`CORE_RULES.md:43–50`): the GST type (CGST+SGST vs IGST) is determined from the supplier/customer GSTIN's first 2 digits, and the tax split is calculated on the frontend form. The server action (`purchase-orders.actions.ts`, `material-issues.actions.ts`) stores the pre-calculated `cgst_amount`, `sgst_amount`, `igst_amount`, and `gst_type` as-is without re-deriving them from GSTIN.

**Risk:** A client-side bug, browser manipulation, or a future frontend refactor could store incorrect GST splits without any server-side rejection.

**Severity:** High (financial impact).

---

### Q-8: PO deletion pre-check and atomic deletion are not a single transaction

`deletePurchaseOrder` (`purchase-orders.actions.ts:486`): the negative-stock pre-check (lines 501–519) runs **outside** the `db.transaction()` block (lines 523–555). Between the check and the deletion, another operation could reduce stock further, allowing the deletion to proceed when it should have been blocked.

**Severity:** Medium (requires concurrent use of the same material to trigger; low probability in a single-workshop deployment, but not zero).

---

### Q-9: Stock adjustment is not fully atomic — ledger insert is outside the UPDATE transaction

`adjustStock` (`stock.actions.ts:283–308`): the `UPDATE materials` (line 283) and the `INSERT stock_ledger` (line 301) are separate SQL statements with no wrapping `db.transaction()`. If the server crashes or the DB connection drops between them, the stock value changes but no ledger entry is written.

**Severity:** Medium (rare crash scenario; would create a stock/ledger divergence that is hard to detect).

---

### Q-10: `transaction_type` in `stock_ledger` is not a DB CHECK constraint

`schema.ts:317–322` (comment): "transaction_type validated in app layer (not DB CHECK) so new types can be added without migrations."

Valid values — `PO_INWARD`, `ISSUE`, `REVERSAL`, `ADJUSTMENT` — are enforced by the insert calls in action files, not by the database. A direct DB INSERT (e.g., via Supabase SQL editor, or a future action with a typo) would store an invalid type silently.

**Severity:** Low (no automated tool is needed to trigger this; typo risk only).

---

### Q-11: Environment variable name mismatch between example and source

`.env.local.example` names the anon key `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
`src/middleware.ts:9` reads `process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

These are different variable names. A developer following the `.env.local.example` exactly would fail to set the correct variable, causing `middleware.ts` to crash on every request.

**Severity:** High (breaks app setup for new developers; low risk for the running production instance since `.env.local` is presumably correct).

---

### Q-12: ESLint disabled on production builds

`next.config.mjs:3–5`: `eslint: { ignoreDuringBuilds: true }`. Linting errors never fail a `next build`.

**Severity:** Low (existing code compiles without issues; risk is that future regressions won't be caught by CI).

---

### Q-13: No error boundaries in React components

No `<ErrorBoundary>` components were found in the component tree. An unhandled exception in a PDF render (e.g., a material with a null name) could crash the entire page rather than showing a graceful error.

**Severity:** Low (UX impact; no data loss).

---

### Q-14: `number-to-words.ts` is used on invoices but not tested

`src/lib/utils/number-to-words.ts` converts a numeric amount (e.g., 12345.50) to words (e.g., "Twelve Thousand Three Hundred Forty-Five and Fifty Paise Only") for the invoice PDF. Errors here print the wrong text on a legally submitted invoice.

**Severity:** Medium (printed on customer-facing document; edge cases like large numbers, zero paise, lakhs/crores formatting may have bugs).

---

## Section D: TODO / FIXME / HACK Comments

**None found.** A grep of the entire `src/` directory for `TODO`, `FIXME`, `HACK`, `XXX`, and `DEPRECATED` returned zero results.

---

## Section E: Duplicated Logic

| Logic | Locations | Risk |
|-------|-----------|------|
| Duplicate item validation (same material+supplier+rate) | `purchase-orders.actions.ts:229–235` AND same pattern in `material-issues.actions.ts:79–84` | Two separate implementations; a change to the rule in one place may not be applied to the other |
| `getLastMaterialRate` function | Defined identically in `purchase-orders.actions.ts:179` AND `material-issues.actions.ts:194` | Pure duplication; both query the same table with the same logic |
| IST date offset string `+05:30` | `src/lib/fy.ts:12–15` AND `src/lib/actions/reports.actions.ts` | Same constant in two places; a future timezone handling change would need to be updated in both |
| FY date range validation | `material-issues.actions.ts:403` AND `invoices.actions.ts` (date-in-FY check) | Both use `fyDateRange` from `fy.ts`, which is correct, but the error messages and call sites are separate |
