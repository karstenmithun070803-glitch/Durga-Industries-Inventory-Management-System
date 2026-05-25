# Phase 1–6 End-to-End Audit — Findings Report
**13-Lens professional audit of the full Durga IMS codebase**
Date: 2026-05-25 | Auditor: Claude Sonnet 4.6

---

## Executive Summary

| Severity | Count | Action |
|---|---|---|
| **HIGH** | 7 | Fix before Phase 7 begins |
| **MEDIUM** | 9 | Address alongside Phase 7 work |
| **LOW** | 10 | Schedule for Phase 8 or document as known |
| **NOT A BUG** | 3 | Pre-identified issues confirmed correct by design |

The system is **functionally sound** for day-to-day operations. No data corruption has occurred. However, 3 HIGH findings represent real risks that grow as data volume increases — specifically, non-atomic invoice writes and missing FK indexes. These must be fixed before production data reaches scale.

---

## Pre-Identified Issues — Verdict

| ID | Finding | Verdict |
|---|---|---|
| P-7 | Invoice writes not in transaction | **CONFIRMED HIGH — see A-1, A-2, A-3** |
| P-9 | Monthly stock periodLedger no LIMIT | **CONFIRMED HIGH — see A-6** |
| P-10 | PO rates subquery no LIMIT in reports | **CONFIRMED HIGH — see A-7** |
| P-13 | FY filter doesn't filter data | **NOT A BUG** — `eq(invoices.financial_year, fy)` is in the WHERE clause of every report query. FY filters at DB level correctly. |
| P-4 | No home dashboard | **CONFIRMED LOW — see C-6** |
| P-3 | Sidebar Dashboard label misleading | **CONFIRMED LOW — see C-5** |
| P-5 | `invoices.issue_id` vestigial | **CONFIRMED MEDIUM — see B-3** |
| P-6 | `adjustStock` inconsistent return | **CONFIRMED MEDIUM — see B-8** |
| P-8 | Master soft-delete race condition | **NOT A BUG** — checked all soft-delete actions. They do a single `UPDATE WHERE is_active = true`. There's no check-then-act pattern — the update is atomic. The pre-delete *guard checks* (e.g. "has draft POs") are read-only checks and race conditions here would only result in a soft-delete happening despite an in-flight draft being created simultaneously — very low probability and not data-corrupting. |
| P-1 | Duplicate FY helpers | **CONFIRMED — see B-9 (timezone divergence is the real bug)** |
| P-14 | GST determination null GSTIN | **CONFIRMED MEDIUM — see B-6** |
| P-18 | No RLS | **CONFIRMED MEDIUM — see B-1** |
| P-19 | No cancellation audit trail | **CONFIRMED MEDIUM — see B-5** |

---

## HIGH Findings — Fix Before Phase 7

---

### A-1 | Transaction Safety | `createInvoice` not atomic

**File:** [src/lib/actions/invoices.actions.ts:491-579](src/lib/actions/invoices.actions.ts#L491-L579)

**Problem:** Three sequential DB writes with no `db.transaction()`:
```
1. db.insert(invoices)          ← invoice header created
2. db.insert(invoiceItems)      ← if this throws → orphaned invoice, no items
3. db.insert(invoiceSlipLinks)  ← if this throws → invoice exists, no slip links
```
If step 2 or 3 fails (Supabase timeout, constraint error, network blip), the invoice header exists in the DB but has no line items — an inconsistent record that can't be re-saved because the bill number is already taken, and can't be deleted because the user never sees the partial record.

**Fix:** Wrap all three inserts in `db.transaction()`. Move bill number generation inside the transaction so the unique constraint race is also handled atomically.

```ts
const invoice = await db.transaction(async (tx) => {
  const billNumber = await getNextBillNumber(data.inv_prefix, data.financial_year, tx);
  let newInvoice: { id: string };
  try {
    [newInvoice] = await tx.insert(invoices).values({ ... }).returning({ id: invoices.id });
  } catch (e) {
    if (e instanceof Error && e.message.includes("bill_number_fy_unique"))
      throw new Error("Bill number conflict — please try again.");
    throw e;
  }
  await tx.insert(invoiceItems).values(items.map(...));
  if (data.slip_ids.length > 0)
    await tx.insert(invoiceSlipLinks).values(slip_ids.map(...));
  return newInvoice;
});
```

---

### A-2 | Transaction Safety | `updateInvoice` not atomic

**File:** [src/lib/actions/invoices.actions.ts:582-659](src/lib/actions/invoices.actions.ts#L582-L659)

**Problem:** Five sequential DB writes with no transaction:
```
1. db.delete(invoiceItems WHERE invoice_id)     ← items deleted
2. db.update(invoices)                           ← if this throws → invoice has NO items
3. db.insert(invoiceItems)                       ← if this throws → items gone, header updated
4. db.delete(invoiceSlipLinks WHERE invoice_id) ← if this throws → old slip links still pointing
5. db.insert(invoiceSlipLinks)
```
A Supabase timeout between steps 1 and 3 leaves an invoice with zero line items — a permanent inconsistency since the user's form data is gone.

**Fix:** Wrap all five operations in `db.transaction()`.

---

### A-3 | Transaction Safety | `cancelInvoice` not atomic

**File:** [src/lib/actions/invoices.actions.ts:694-707](src/lib/actions/invoices.actions.ts#L694-L707)

**Problem:**
```
1. db.delete(invoiceSlipLinks WHERE invoice_id) ← slip links removed
2. db.update(invoices).set({ status: "Cancelled" }) ← if this throws → links gone, invoice still active
```
If step 2 fails, the MI slips appear "available" again (no invoice link), but the invoice is still Finalized/Draft — an accounting ghost. The freed slips could be linked to a new invoice, creating duplicate billing.

**Fix:** Wrap in `db.transaction()`.

---

### A-4 | Performance | 19 FK columns have no supporting index

**Database:** Confirmed via live DB introspection

**Problem:** PostgreSQL does not auto-create indexes on FK columns. Every JOIN on these columns is a sequential scan. At current data volumes this is invisible; at 1000+ invoice items it will degrade to seconds per page load.

**Missing indexes on high-frequency columns:**

| Table | Column | Used In |
|---|---|---|
| `invoice_items` | `invoice_id` | Every invoice fetch, every list view |
| `invoice_items` | `material_id` | Invoice detail |
| `material_issue_items` | `issue_id` | Every MI fetch, every list view |
| `material_issue_items` | `material_id` | MI detail |
| `material_issues` | `vehicle_id` | Invoice form (load MIs for a vehicle) |
| `purchase_order_items` | `po_id` | Every PO fetch, every list view |
| `purchase_order_items` | `material_id` | PO detail, reports |
| `invoices` | `vehicle_id` | Invoice joins |
| `invoices` | `financial_year` | Every invoice list load |
| `purchase_orders` | `financial_year` | Every PO list load |
| `purchase_orders` | `supplier_id` | PO joins |

**Fix (via Supabase migration):**
```sql
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_material_id ON invoice_items(material_id);
CREATE INDEX IF NOT EXISTS idx_material_issue_items_issue_id ON material_issue_items(issue_id);
CREATE INDEX IF NOT EXISTS idx_material_issue_items_material_id ON material_issue_items(material_id);
CREATE INDEX IF NOT EXISTS idx_material_issues_vehicle_id ON material_issues(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po_id ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_material_id ON purchase_order_items(material_id);
CREATE INDEX IF NOT EXISTS idx_invoices_vehicle_id ON invoices(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_invoices_financial_year ON invoices(financial_year);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_financial_year ON purchase_orders(financial_year);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id ON purchase_orders(supplier_id);
```

---

### A-5 | Business Rules | FY boundary validation uses wrong timezone

**File:** [src/lib/actions/invoices.actions.ts:18](src/lib/actions/invoices.actions.ts#L18)

**Problem:** `createInvoice` and `updateInvoice` import `getFinancialYearRange` from `@/types`, not from `@/lib/fy`:

```ts
// invoices.actions.ts line 18 — WRONG import
import { getFinancialYearRange } from "@/types";
```

The `@/types` version uses local JS time:
```ts
// src/types/index.ts — uses local server time (UTC on Vercel!)
start: new Date(startYear, 3, 1),        // April 1 LOCAL time = March 31 18:30 UTC
end: new Date(startYear + 1, 2, 31, 23, 59, 59), // March 31 LOCAL = March 31 18:29 UTC
```

The `@/lib/fy` version correctly uses IST:
```ts
// src/lib/fy.ts — CORRECT
start: new Date(`${startYear}-04-01T00:00:00+05:30`),
end: new Date(`${startYear + 1}-03-31T23:59:59+05:30`),
```

On a Vercel deployment (UTC server), `new Date(2026, 3, 1)` creates April 1 00:00 UTC = March 31 18:30 IST. A bill dated April 1 at 20:00 IST is valid but the server sees it as `> end` when doing FY 2025-26 validation. The first 5.5 hours of each Indian FY day could incorrectly fail validation.

**Fix:**
```ts
// invoices.actions.ts line 18 — change to:
import { fyDateRange } from "@/lib/fy";
// then update both usages: getFinancialYearRange(fy) → fyDateRange(fy)
```

---

### A-6 | Performance | `periodLedger` query has no LIMIT

**File:** [src/lib/actions/reports.actions.ts:312-325](src/lib/actions/reports.actions.ts#L312-L325)

**Problem:**
```ts
const periodLedger = await db
  .select({ material_id, transaction_type, qty_change })
  .from(stockLedger)
  .where(and(gte(created_at, from), lte(created_at, to), ...))
  // NO LIMIT
```
For a full-year report (12 months) with 200 materials and 50 transactions each, this returns 120,000 rows to the application layer for in-JS aggregation. At 3 years of data, that's 360,000 rows per report run.

**Fix:** Aggregate in SQL instead of JS:
```sql
SELECT material_id, transaction_type, SUM(qty_change) as total
FROM stock_ledger
WHERE created_at >= $from AND created_at <= $to
GROUP BY material_id, transaction_type
```
This returns one row per material per transaction type — maximum 200×4 = 800 rows regardless of history depth.

---

### A-7 | Performance | `poRates` in `getMonthlyStockReport` has no LIMIT

**File:** [src/lib/actions/reports.actions.ts:266-275](src/lib/actions/reports.actions.ts#L266-L275)

**Problem:** The `poRates` query fetches ALL received PO items with no limit to get the last rate per material. With 3 years of POs × 200 materials × 5 items each = 3000+ rows loaded just to get 200 "last rates."

Note: This was fixed for `getStockDashboardMaterials` (C-5 in Phase 6 audit) but was NOT fixed in `reports.actions.ts`.

**Fix:** Add `.limit(2000)` after the `orderBy`, identical to the Phase 6 fix pattern.

---

## MEDIUM Findings — Address During Phase 7

---

### B-1 | Security | No RLS on any table

**Database:** Confirmed — all 17 tables have `rowsecurity = false`

**Problem:** All data protection is application-layer only (Next.js middleware + auth checks in actions). Anyone who obtains a valid Supabase JWT (from a compromised device, XSS, or direct API call) can read and write all tables directly via the Supabase REST/PostgREST API, bypassing the application entirely.

For a single-company internal ERP this is lower risk than a multi-tenant SaaS, but it means:
- A logged-in user can query `invoices` directly from the browser devtools with their JWT
- No protection if Supabase connection string ever leaks

**Fix:** Enable RLS on sensitive tables and add a policy that only allows authenticated users:
```sql
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_access" ON invoices FOR ALL TO authenticated USING (true);
-- Repeat for all transaction tables
```
For Phase 7 and beyond, consider role-based policies (admin vs. read-only staff).

---

### B-2 | Business Logic | `revertInvoiceToDraft` has no guard against Cancelled invoices

**File:** [src/lib/actions/invoices.actions.ts:667-670](src/lib/actions/invoices.actions.ts#L667-L670)

**Problem:**
```ts
export async function revertInvoiceToDraft(id: string): Promise<void> {
  await db.update(invoices).set({ status: "Draft" }).where(eq(invoices.id, id));
  revalidatePath("/invoice");
}
```
No check on current status. A Cancelled invoice can be reverted to Draft and then re-Finalized — effectively "un-cancelling" an invoice. This violates GST rules where cancelled invoices are permanent records that cannot be reversed.

**Fix:** Add a status guard:
```ts
const [inv] = await db.select({ status: invoices.status }).from(invoices).where(eq(invoices.id, id));
if (!inv) throw new Error("Invoice not found.");
if (inv.status === "Cancelled") throw new Error("Cancelled invoices cannot be reverted to Draft.");
```

---

### B-3 | Integration | `invoices.issue_id` is vestigial for multi-slip invoices

**File:** [src/lib/db/schema.ts](src/lib/db/schema.ts) + [src/lib/actions/invoices.actions.ts](src/lib/actions/invoices.actions.ts)

**Problem:** The schema has both:
- `invoices.issue_id` — a direct FK to one MI slip (legacy single-slip reference)
- `invoice_slip_links` — a junction table supporting many-to-many (multi-slip invoices)

In `createInvoice` / `updateInvoice`, `issue_id` is populated with `data.issue_id || null`. If an invoice links multiple slips, `issue_id` holds only one (the one the user passed, or null), while `invoice_slip_links` holds all of them. This creates two sources of truth that can diverge.

Any code that queries `invoices.issue_id` to find linked slips will give wrong answers for multi-slip invoices. The field is read back in `getInvoiceById` and surfaced in `InvoiceWithDetails.issue_id` — if any component uses `issue_id` for slip lookup, it will miss the other slips.

**Fix:** Remove `issue_id` from the invoices table (Phase 7 migration). Use `invoiceSlipLinks` as the single source of truth. Update `createInvoice` and `updateInvoice` to not populate `issue_id`.

---

### B-4 | Integration | N+1 query pattern in `getIssuedMIsForVehicle`

**File:** [src/lib/actions/invoices.actions.ts:156-196](src/lib/actions/invoices.actions.ts#L156-L196)

**Problem:**
```ts
const withCounts = await Promise.all(
  rows.map(async (mi) => {
    const countResult = await db.select({ cnt: sql<number>`COUNT(*)` })
      .from(materialIssueItems)
      .where(eq(materialIssueItems.issue_id, mi.id));  // 1 query per MI
    ...
  })
);
```
For a vehicle with 20 MI slips, this fires 21 DB queries (1 list + 20 counts). This is called every time the vehicle dropdown changes on the Invoice form.

**Fix:** Use a single GROUP BY query:
```ts
const counts = await db
  .select({ issue_id: materialIssueItems.issue_id, cnt: sql<number>`COUNT(*)` })
  .from(materialIssueItems)
  .where(inArray(materialIssueItems.issue_id, rows.map(r => r.id)))
  .groupBy(materialIssueItems.issue_id);
const countMap = new Map(counts.map(c => [c.issue_id, Number(c.cnt)]));
```

---

### B-5 | Integration | No audit trail for invoice cancellation

**File:** [src/lib/actions/invoices.actions.ts:694-707](src/lib/actions/invoices.actions.ts#L694-L707)

**Problem:** `cancelInvoice` updates `status = "Cancelled"` and the `updated_at` timestamp changes, but there is no record of:
- Who cancelled the invoice
- Why it was cancelled
- When (beyond `updated_at` which can be overwritten by edits)

For GST compliance, cancelled invoices are permanent financial records. The cancellation event should be auditable.

**Fix (minimal):** Add `cancelled_by` (text) and `cancelled_at` (timestamp) columns to the `invoices` table. Populate them in `cancelInvoice` using the auth session user, similar to how `adjustStock` records `adjusted_by`.

---

### B-6 | Business Logic | `determineGstType` with null state returns IGST incorrectly

**File:** [src/types/index.ts](src/types/index.ts) — `determineGstType` function

**Problem:**
```ts
export function determineGstType(gstin, state): GstType {
  if (gstin && gstin.length >= 2) {
    return gstin.startsWith("33") ? "CGST_SGST" : "IGST";
  }
  return state === "Tamil Nadu" ? "CGST_SGST" : "IGST";  // null state → IGST
}
```

If a customer has no GSTIN and their state is `null` or `""` (not explicitly "Tamil Nadu"), they receive IGST treatment. For a Tamil Nadu manufacturer billing another Tamil Nadu party, wrong GST type means:
- Invoice shows IGST instead of CGST+SGST
- ITC claims fail for the customer
- GST return filing errors

**Fix:** Make the default explicit and discuss with the client. For a TN-based manufacturer, a reasonable default is CGST+SGST when state is unknown:
```ts
// If both GSTIN and state are unavailable, default to intra-state (safer for TN business)
return state === "Tamil Nadu" || state == null || state === "" ? "CGST_SGST" : "IGST";
```
But confirm with the client — the right answer depends on their typical customer base.

---

### B-7 | UX | Sidebar FY hardcoded — will be stale from April 2027

**File:** [src/components/sidebar.tsx](src/components/sidebar.tsx) — footer section

**Problem:**
```tsx
<p className="text-slate-500 text-xs">FY 2026-2027</p>
```
This is a hardcoded string. From April 1, 2027, the sidebar will display the wrong FY. Every year someone will need to remember to update this.

**Fix:** Import `getCurrentFY` from `@/lib/fy` and use it. Since this is a Client Component, call it at render time:
```tsx
import { getCurrentFY } from "@/lib/fy";
// in the footer:
<p className="text-slate-500 text-xs">FY {getCurrentFY()}</p>
```

---

### B-8 | Error Handling | `adjustStock` inconsistent return contract

**File:** [src/lib/actions/stock.actions.ts](src/lib/actions/stock.actions.ts)

**Problem:** `adjustStock()` returns `{ success: boolean; error?: string }` while every other action throws on failure. Any code that does:
```ts
try {
  await adjustStock(...);
  toast.success("Done");
} catch (e) {
  toast.error("Failed");
}
```
will show "Done" even on failure, because `adjustStock` never throws — it returns `{ success: false }` silently.

The stock-client.tsx currently checks the return value correctly, but the inconsistency is a trap for any future developer.

**Fix:** Change `adjustStock` to throw on error (matching all other actions), and update stock-client.tsx caller to use `try/catch` like every other mutation. OR add a JSDoc comment on `adjustStock` clearly documenting the return contract — but standardizing is cleaner.

---

### B-9 | Business Logic | Bill number generation is fragile at scale

**File:** [src/lib/actions/invoices.actions.ts:67-105](src/lib/actions/invoices.actions.ts#L67-L105)

**Problem:** `getNextBillNumber` fetches the last 100 invoices ordered by `created_at` and parses the sequence number from the bill string. Two issues:

1. **Not atomic**: Two simultaneous invoice creates both see max=42, both compute D-00043, one fails with a unique constraint error. The retry message is good, but the UX impact grows as invoice volume increases.

2. **Brittle at scale**: `LIMIT 100` means if bill numbers have gaps (e.g., someone created D-00200 then deleted it), the max sequence for the prefix might not be in the last 100 by `created_at`. The computed "next" number could collide.

**Fix:** Use a proper sequence query:
```ts
const result = await db
  .select({ bill_number: invoices.bill_number })
  .from(invoices)
  .where(and(eq(invoices.financial_year, financialYear), like(invoices.bill_number, pattern)))
  .orderBy(desc(invoices.bill_number));  // sort by bill_number, not created_at
// Parse max from result[0] only
```
Long-term: use a Postgres sequence per FY + prefix, reset annually via migration.

---

## LOW Findings — Phase 8 Backlog / Document

---

### C-1 | Schema | `materials.conversion_value` — unused column

**File:** [src/lib/db/schema.ts](src/lib/db/schema.ts)

`conversion_value numeric(10,4) DEFAULT 1` appears in the schema but is never selected, filtered, or written by any action. Likely intended for unit conversion (purchase unit → sales unit). If not planned for Phase 7, add a schema comment documenting its purpose or remove it.

---

### C-2 | Schema | `vehicles.type` ("New"/"Old") — dead data

**File:** [src/lib/db/schema.ts](src/lib/db/schema.ts)

`type text DEFAULT 'New'` — the schema comment explains: "New = new chassis + new body | Old = old chassis + new body." This is never displayed in the UI or included in any report. Add it to vehicle list/reports (Phase 7) or remove it.

---

### C-3 | Code Quality | ~50 magic string status literals

**Files:** All `src/lib/actions/*.ts`

`"Draft"` ×28, `"Issued"` ×15, `"Finalized"` ×9, `"Cancelled"` ×5, `"Received"` ×7 scattered across 14 action files. A typo creates a silent bug. Create:

```ts
// src/lib/constants.ts
export const STATUS = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  RECEIVED: "Received",
  FINALIZED: "Finalized",
  CANCELLED: "Cancelled",
} as const;

export const LEDGER_TYPE = {
  PO_INWARD: "PO_INWARD",
  ISSUE: "ISSUE",
  REVERSAL: "REVERSAL",
  ADJUSTMENT: "ADJUSTMENT",
} as const;
```

---

### C-4 | Code Quality | Duplicate FY helper implementations

**Files:** [src/lib/fy.ts](src/lib/fy.ts), [src/types/index.ts](src/types/index.ts)

`getCurrentFY()` in `fy.ts` vs `getCurrentFinancialYear()` in `types/index.ts` — same logic, two implementations. `getFinancialYearRange` in `types/index.ts` has the timezone bug (see A-5). Remove the FY functions from `types/index.ts`, keep only `fy.ts`. Update all imports.

**Callers of the wrong version:**
- `src/lib/actions/invoices.actions.ts` line 18 — imports `getFinancialYearRange` from `@/types` ← **this is the A-5 bug**

---

### C-5 | UX | Sidebar "Dashboard" label misleading

**File:** [src/components/sidebar.tsx](src/components/sidebar.tsx)

The top nav item labeled "Dashboard" links to `/` which redirects to `/masters/materials`. Operators clicking "Dashboard" expect a summary view, not a materials list. Rename to "Home" or remove if no dashboard is planned before Phase 8.

---

### C-6 | UX | No home/overview dashboard page

**File:** [src/app/page.tsx](src/app/page.tsx)

Root page immediately redirects to `/masters/materials`. On login, operators see raw master data rather than an operational overview. A Stock Dashboard summary or "Today's snapshot" (pending POs, low stock alerts, recent MI slips) would provide immediate value on login.

---

### C-7 | Document Output | Customer invoice PDF missing rate_date

**File:** Customer invoice PDF component

Insurance copy shows `rate_date` if present. Customer copy does not. For rate-sensitive contracts where the rate date determines pricing, the customer copy should also show it. Minor but worth noting for professional invoice presentation.

---

### C-8 | Document Output | Bank account details not on invoice

**Files:** Invoice PDF components, [src/lib/db/schema.ts](src/lib/db/schema.ts) (`companySettings`)

Indian invoices typically show bank name, account number, and IFSC for payment. `companySettings` has no bank detail fields. This is needed before the system is used for real customer invoicing. Add fields to `companySettings` and include them in invoice PDFs (Phase 7 scope).

---

### C-9 | UX | `StockLedgerType` union type not enforced at column level

**File:** [src/types/index.ts](src/types/index.ts)

`StockLedgerType` is defined as a union type but the actual DB column is `text` — any string can be inserted. The application layer is consistent, but a future developer calling `db.insert(stockLedger).values({ transaction_type: "WRONG" })` won't get a compile-time error.

**Fix:** Use the Drizzle `$type<>()` helper to constrain the column type at the ORM level.

---

### C-10 | UX | Form validation errors are toast-only

**Files:** Invoice form, PO form, MI form

Validation errors (e.g., "All quantities must be greater than zero") appear as toast notifications that auto-dismiss. Users may not see which field caused the error, especially on long forms. Inline error messages next to the failing field would significantly improve UX. Low priority since errors are at least shown; inline errors are a Phase 8 polish item.

---

## NOT A BUG — Confirmed Correct by Design

### P-13 | FY filter in reports actually filters data
The FY filter passes `fy` as a parameter to all report queries. `getInvoiceSummaryReport`, `getPurchaseReport`, and `getMonthlyStockReport` all use `eq(invoices.financial_year, fy)` or `eq(purchaseOrders.financial_year, fy)` in their WHERE clause. Data is filtered at the DB level, not just the display label. **No issue.**

### P-8 | Master soft-delete race condition is negligible
All soft-delete functions perform a single `UPDATE SET is_active = false` after a guard check. The guard checks (e.g., "does this supplier have draft POs?") are read-only and non-locking. A race condition would require: guard check passes → another user creates a draft PO for this supplier → soft-delete runs. This sequence is vanishingly unlikely for a single-company internal ERP. **Not worth a transaction wrapper.**

### P-17 | Stock CHECK constraint doesn't block legitimate corrections
The `current_stock >= 0` constraint prevents the DB from accepting negative stock. The `adjustStock` action and the Phase 6 D-1 fix (application-layer pre-check) ensure users get a clear error before the constraint is hit. An admin override path for negative stock would require a schema migration and deliberate business decision — this is by design. **Not a bug.**

---

## Post-Audit Triage

### Bucket A — Fix Before Phase 7 (HIGH)

| ID | Finding | Estimated Effort |
|---|---|---|
| A-1 | Wrap `createInvoice` in `db.transaction()` | 30 min |
| A-2 | Wrap `updateInvoice` in `db.transaction()` | 30 min |
| A-3 | Wrap `cancelInvoice` in `db.transaction()` | 15 min |
| A-4 | Add 11 missing FK indexes via migration | 30 min |
| A-5 | Fix FY import in `invoices.actions.ts` | 10 min |
| A-6 | Fix `periodLedger` — aggregate in SQL | 45 min |
| A-7 | Add `.limit(2000)` to `poRates` in reports | 10 min |

**Total estimated: ~3 hours**

### Bucket B — Fix During Phase 7 (MEDIUM)

| ID | Finding |
|---|---|
| B-1 | Enable RLS on all tables |
| B-2 | Guard `revertInvoiceToDraft` against Cancelled status |
| B-3 | Remove vestigial `invoices.issue_id` FK |
| B-4 | Fix N+1 query in `getIssuedMIsForVehicle` |
| B-5 | Add `cancelled_by` / `cancelled_at` audit fields |
| B-6 | Fix `determineGstType` null state handling |
| B-7 | Make sidebar FY dynamic |
| B-8 | Standardize `adjustStock` error contract |
| B-9 | Improve bill number generation robustness |

### Bucket C — Document as Known Limitation (LOW)

- C-1: `conversion_value` unused
- C-2: `vehicles.type` unused
- C-7: Customer PDF missing rate_date
- C-10: Toast-only form errors

### Bucket D — Phase 8 Backlog (LOW)

- C-3: Magic string constants
- C-4: Deduplicate FY helpers
- C-5: Sidebar label fix
- C-6: Home dashboard
- C-8: Bank details on invoice
- C-9: StockLedgerType column enforcement

---

## Appendix — Live DB State

**Project:** Durga Industries Inventory Management System (`ejroglodhobkupgywwcj`)

**RLS status:** Disabled on all 17 tables

**Indexes added in Phase 6 (confirmed present):**
- `idx_stock_ledger_material_date` ON `stock_ledger(material_id, created_at DESC)` ✓
- `idx_stock_ledger_date` ON `stock_ledger(created_at)` ✓
- `idx_invoice_slip_links_invoice_id` ON `invoice_slip_links(invoice_id)` ✓
- `idx_invoice_slip_links_slip_id` ON `invoice_slip_links(slip_id)` ✓

**Indexes missing (confirmed by live introspection):**
See A-4 above — 11 critical FK indexes absent.
