# Phase 7 — Complete Documentation
**Durga Industries Inventory Management System**
**Completed: May 2026 | Audited & Shipped: May 2026**

---

## Table of Contents

1. [Overview](#1-overview)
2. [Database Schema Changes](#2-database-schema-changes)
3. [Security — Row Level Security](#3-security--row-level-security)
4. [Constants & Utilities](#4-constants--utilities)
5. [Updated Types](#5-updated-types)
6. [Feature: Payment Status Tracking](#6-feature-payment-status-tracking)
7. [Feature: Cancellation Audit Trail](#7-feature-cancellation-audit-trail)
8. [Feature: Supplier Bill Reference on POs](#8-feature-supplier-bill-reference-on-pos)
9. [Feature: Home Dashboard](#9-feature-home-dashboard)
10. [Feature: Vehicle Type in Reports & Job Cost](#10-feature-vehicle-type-in-reports--job-cost)
11. [Feature: Bank Details & Terms on Invoice PDFs](#11-feature-bank-details--terms-on-invoice-pdfs)
12. [Feature: Low-Stock PO Shortcut](#12-feature-low-stock-po-shortcut)
13. [Server Actions Reference](#13-server-actions-reference)
14. [Phase 7 Audit — Findings & Fixes](#14-phase-7-audit--findings--fixes)
15. [Additional Bug Fixes](#15-additional-bug-fixes)
16. [DB Verification Results](#16-db-verification-results)
17. [File Manifest](#17-file-manifest)
18. [Invoice Form — Complete Reference](#18-invoice-form--complete-reference)
19. [Stock Dashboard — Complete Reference](#19-stock-dashboard--complete-reference)
20. [Settings Form — Complete Reference](#20-settings-form--complete-reference)
21. [Invoice Helper Actions](#21-invoice-helper-actions)

---

## 1. Overview

Phase 7 was the largest post-launch release. It addressed three categories of work simultaneously:

**Schema & Security**
- Added 14 new columns across three tables
- Removed the vestigial `issue_id` column from `invoices`
- Enabled Row Level Security (RLS) on all 17 tables

**Five Feature Modules**
| ID | Feature | Business Value |
|----|---------|---------------|
| 7A | Supplier Bill Reference on POs | Accounts-payable reconciliation — link every received PO to the supplier's own invoice |
| 7B | Payment Status Tracking on Invoices | Track money collection state per invoice (Unpaid / Partial / Paid) |
| 7C | Home Dashboard | At-a-glance morning briefing — outstanding invoices, stock alerts, FY financials, recent activity |
| 7D | Vehicle Type in Job Cost & Reports | Distinguish New Build vs Repair jobs in cost analysis and invoice summaries |
| 7E | Bank Details & Terms on Invoice PDFs | Professional PDF invoices with payment details and terms printed automatically |

**Code Quality Foundation**
- `src/lib/constants.ts` — all status enums centralised
- `src/lib/fy.ts` — single source of truth for financial year logic
- Sidebar "Home" link added

**Phase 7 Audit**
After implementation, a full in-depth audit (matching the methodology of the Phase 1–6 audit in `07-phase1-6-audit-findings.md`) was run. It found 3 HIGH, 6 MEDIUM, and 4 LOW issues, all resolved before shipping.

**Commits that make up Phase 7:**
```
b4ee276  fix: update PO and MI link paths to point to view pages
0a077c9  refactor: remove redundant root page redirect
53d0dfb  refactor: centralize invoice constants, add supplier bill details to POs, enhance PDFs
826265c  feat: add supplier bill details to POs, bank info and terms to customer invoices
2891c99  fix: apply Phase 1-6 audit fixes — 12 issues resolved
```

---

## 2. Database Schema Changes

### 2.1 New columns on `invoices`

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `payment_status` | text | NO | `'Unpaid'` | Payment collection state |
| `payment_date` | date | YES | null | Date payment was received |
| `payment_notes` | text | YES | null | Free-text payment reference |
| `cancelled_by` | text | YES | null | Email of user who cancelled |
| `cancelled_at` | timestamptz | YES | null | Timestamp of cancellation (UTC stored, IST displayed) |

**Constraint added:**
```sql
CHECK (payment_status IN ('Unpaid', 'Partial', 'Paid'))
```

### 2.2 New columns on `purchase_orders`

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `supplier_bill_no` | text | YES | null | Supplier's own invoice number |
| `supplier_bill_date` | date | YES | null | Date on the supplier's invoice |

### 2.3 New columns on `company_settings`

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| `bank_name` | text | YES | Bank name for payment details on invoices |
| `bank_account_no` | text | YES | Account number |
| `bank_ifsc` | text | YES | IFSC code |
| `bank_branch` | text | YES | Branch name |
| `invoice_terms` | text | YES | Terms & conditions text |
| `pan_no` | text | YES | Company PAN for compliance |
| `tan_no` | text | YES | Company TAN for compliance |

### 2.4 Removed column

| Table | Column | Reason |
|-------|--------|--------|
| `invoices` | `issue_id` | Vestigial FK; the `invoice_slip_links` join table is the correct many-to-many link between invoices and MI slips |

---

## 3. Security — Row Level Security

RLS was enabled on all 17 tables. Every table has exactly one policy:

**Policy name:** `authenticated_full_access`
**Command:** `FOR ALL`
**Role:** `authenticated`
**Using:** `true` (all authenticated users have full access)

**Tables covered:**

| Table | RLS Enabled |
|-------|-------------|
| `customers` | ✅ |
| `contractors` | ✅ |
| `suppliers` | ✅ |
| `tax_rates` | ✅ |
| `units` | ✅ |
| `materials` | ✅ |
| `vehicles` | ✅ |
| `app_users` | ✅ |
| `purchase_orders` | ✅ |
| `purchase_order_items` | ✅ |
| `material_issues` | ✅ |
| `material_issue_items` | ✅ |
| `invoices` | ✅ |
| `invoice_items` | ✅ |
| `invoice_slip_links` | ✅ |
| `stock_ledger` | ✅ |
| `company_settings` | ✅ |

> Only authenticated Supabase users (those signed in via `supabase.auth`) can read or write any data. Anonymous or unauthenticated requests are blocked at the database level.

---

## 4. Constants & Utilities

### 4.1 `src/lib/constants.ts`

Central source of truth for all domain status strings. All Phase 7+ code uses these constants instead of raw string literals.

```typescript
export const INVOICE_STATUS = {
  DRAFT: "Draft",
  FINALIZED: "Finalized",
  CANCELLED: "Cancelled",
} as const;

export const PAYMENT_STATUS = {
  UNPAID: "Unpaid",
  PARTIAL: "Partial",
  PAID: "Paid",
} as const;

export const PO_STATUS = {
  DRAFT: "Draft",
  RECEIVED: "Received",
} as const;

export const MI_STATUS = {
  DRAFT: "Draft",
  ISSUED: "Issued",
} as const;

export const LEDGER_TYPE = {
  PO_INWARD: "PO_INWARD",
  ISSUE: "ISSUE",
  REVERSAL: "REVERSAL",
  ADJUSTMENT: "ADJUSTMENT",
} as const;
```

`INDIAN_STATES` is also exported — an array of 36 states/territories used in customer and invoice address forms.

**Usage rule:** All server actions and client components MUST import from this file rather than using inline strings. Raw string literals for statuses are a Phase 8 cleanup task for legacy files.

### 4.2 `src/lib/fy.ts`

Single source of truth for financial year logic. Previously duplicated across multiple files.

```typescript
// Returns "2026-2027" format — April-to-March Indian FY
export function getCurrentFY(): string

// Returns IST-aware date range: { start: "2026-04-01T00:00:00+05:30", end: "2027-03-31T23:59:59+05:30" }
export function fyDateRange(fy: string): { start: string; end: string }

// Returns array of FY strings for dropdown: ["2025-2026", "2026-2027", ...]
export function buildFYOptions(count?: number): string[]
```

**Key rule:** All date comparisons against FY boundaries use `fyDateRange()` with `+05:30` IST offsets, never bare UTC dates.

---

## 5. Updated Types

All types live in `src/types/index.ts`.

### 5.1 `InvoiceRow` — new fields

| Field | Type | Purpose |
|-------|------|---------|
| `payment_status` | `string` | "Unpaid" / "Partial" / "Paid" |
| `payment_date` | `string \| null` | ISO date string |
| `payment_notes` | `string \| null` | Free text |
| `cancelled_by` | `string \| null` | Email address |
| `cancelled_at` | `string \| null` | ISO timestamp |

### 5.2 `InvoiceWithDetails` — same 5 new fields as `InvoiceRow`

### 5.3 `PurchaseOrderWithDetails` — new fields

| Field | Type | Purpose |
|-------|------|---------|
| `supplier_bill_no` | `string \| null` | Supplier's invoice number |
| `supplier_bill_date` | `string \| null` | Date on supplier's invoice |

### 5.4 `JobCostResult` — updated vehicle sub-object

```typescript
vehicle: {
  job_ref_no: number;
  vehicle_name: string;
  vehicle_type: string;      // "New" or "Old"
  customer_name: string | null;
}
```

---

## 6. Feature: Payment Status Tracking

**Purpose:** Allow the business to record whether each finalized invoice has been paid, partially paid, or remains unpaid. Supports accounts-receivable follow-up.

### 6.1 Files

| File | Role |
|------|------|
| `src/lib/actions/invoices.actions.ts` | `markInvoicePayment()` server action |
| `src/app/(dashboard)/invoice/invoice-list-client.tsx` | Payment badge + dialog UI |
| `src/app/(dashboard)/page.tsx` | Outstanding KPI card |

### 6.2 How it works

1. The invoice list table shows a colored badge in the "Payment" column for every **Finalized** invoice:
   - 🔴 Red = Unpaid
   - 🟡 Amber = Partial
   - 🟢 Green = Paid

2. Clicking the badge (or the credit card icon in the Actions column) opens a modal dialog.

3. The dialog contains:
   - Radio group: Unpaid / Partial / Paid
   - Date picker: "Payment Date" (required when Paid is selected)
   - Textarea: "Notes" (optional)

4. On save, `markInvoicePayment(id, data)` is called:
   - Validates invoice exists
   - Validates `status === "Finalized"` (throws if Draft or Cancelled)
   - Validates `payment_status` is one of the three legal values
   - Runs a direct `UPDATE` (no transaction needed — single write)
   - Calls `revalidatePath("/invoice")` and `revalidatePath("/")`
   - Client calls `router.refresh()` so the badge updates without page reload

### 6.3 `markInvoicePayment` signature

```typescript
export async function markInvoicePayment(
  id: string,
  data: {
    payment_status: string;   // "Unpaid" | "Partial" | "Paid"
    payment_date: string | null;
    payment_notes: string | null;
  }
): Promise<void>
```

### 6.4 Business rules

- Only Finalized invoices can have their payment status changed
- Draft and Cancelled invoices show "—" in the Payment column (not clickable)
- Payment date is client-required when status = Paid, but not server-enforced (it's optional in the DB)
- Changing from Paid back to Unpaid is allowed (corrections)

### 6.5 payment_status lifecycle

`createInvoice()` does **not** explicitly set `payment_status` on insert — the database column has `DEFAULT 'Unpaid'` so it is always populated. However, `getInvoiceById()` applies an additional application-level fallback:

```typescript
payment_status: h.payment_status ?? PAYMENT_STATUS.UNPAID,
```

This protects against any pre-migration rows where the column may be null. The `getInvoices()` list query also selects all payment fields so the list page always has the full state without a second fetch.

---

## 7. Feature: Cancellation Audit Trail

**Purpose:** When an invoice is cancelled, permanently record who cancelled it and when, creating an immutable audit trail.

### 7.1 Files

| File | Role |
|------|------|
| `src/lib/actions/invoices.actions.ts` | `cancelInvoice()` server action |
| `src/app/(dashboard)/invoice/invoice-form.tsx` | Cancellation banner |

### 7.2 How it works

1. The Cancel button on the Invoice form calls `cancelInvoice(id)`.

2. `cancelInvoice()` runs an atomic transaction:
   - Deletes all rows from `invoice_slip_links` for this invoice (freeing the linked MI slips to be used in a corrective invoice)
   - Updates `invoices` to set `status = "Cancelled"`, `cancelled_by = user.email`, `cancelled_at = new Date()`
   - The user's email is read from the active Supabase session

3. The Invoice form detects `status === "Cancelled"` and renders a rose/red banner:
   ```
   ⚠ This invoice is Cancelled.
   It is a permanent record and cannot be edited or deleted.
   Cancelled by [email] at [DD MMM YYYY, HH:MM IST]
   ```

4. The freed MI slips become available again in the "Add Slip" dialog when creating a corrective invoice.

### 7.3 `cancelInvoice` signature

```typescript
export async function cancelInvoice(id: string): Promise<void>
```

**Throws if:** invoice not found, or invoice is already Cancelled.

---

## 8. Feature: Supplier Bill Reference on POs

**Purpose:** When a received PO corresponds to a supplier's own invoice, record that invoice number and date for accounts-payable reconciliation and auditing.

### 8.1 Files

| File | Role |
|------|------|
| `src/lib/db/schema.ts` | Two new columns on `purchase_orders` |
| `src/lib/actions/purchase-orders.actions.ts` | All CRUD functions updated |
| `src/app/(dashboard)/transactions/purchase-orders/po-form.tsx` | Two new optional form fields |
| `src/app/(dashboard)/transactions/purchase-orders/purchase-orders-client.tsx` | ItemRow type extended |
| `src/components/pdf/po-register-pdf.tsx` | Conditional info block in PDF |
| `src/app/(dashboard)/reports/purchase-report.tsx` | Two new table columns + CSV |

### 8.2 PO Form fields

Both fields are **optional**. They appear in a two-column row below the supplier dropdown:

- **Supplier Bill No.** — Text input, placeholder "e.g. INV-2024-001"
- **Supplier Bill Date** — Date picker

The fields are editable in both Draft and Received states (correction of a typo should always be allowed).

### 8.3 PO Register PDF

When `supplier_bill_no` is populated, the PDF info block shows:

```
PURCHASE ORDER NO.  : PO-0004
DATE                : 24 May 2026
SUPPLIER NAME       : Mithun
SUPPLIER BILL       : INV-2024-001 dated 20 May 2026
```

The block is completely absent if `supplier_bill_no` is null.

### 8.4 Purchase Report

Table column "Supplier Bill" shows:
- The bill number as text
- The bill date as a hover tooltip (`title` attribute)
- "—" if null

CSV export includes two dedicated columns: `"Supplier Bill No."` and `"Supplier Bill Date"` (columns 4–5 of 16 total).

### 8.5 PO Form modes

The PO form (`po-form.tsx`) operates in four distinct modes:

| Mode | Description |
|------|-------------|
| `"new"` | Creating a fresh PO; all fields editable |
| `"edit-draft"` | Editing a Draft PO; all fields editable |
| `"edit-received"` | Editing a Received PO; limited fields editable (stock reversal required) |
| `"view"` | Read-only display of any PO |

### 8.6 prefillMaterialId — state initializer detail

When a PO is created from the low-stock shortcut (`/new?prefill={material_id}`), the form's initial rows state is set via a function — **not a useEffect**. It runs once on mount:

```typescript
// If prefillMaterialId found in materials array:
const m = materials.find(mat => mat.id === prefillMaterialId);
if (m) {
  return [{ ...newRow(), material_id: m.id, material_name: m.name,
             material_no: m.material_no, hsn_code: m.hsn_code ?? "" }];
}
```

Only four fields are pre-filled: `material_id`, `material_name`, `material_no`, `hsn_code`. The user still manually enters supplier, quantity, rate, and tax rate.

### 8.7 Data flow through actions

All three write paths save the fields:

| Function | Behaviour |
|----------|-----------|
| `createPurchaseOrder()` | Saves both as nullable |
| `updatePurchaseOrder()` | Overwrites both |
| `updateReceivedPurchaseOrder()` | Overwrites both (within atomic stock-reversal transaction) |

`getPurchaseOrders()` (list query) and `getPurchaseOrderById()` (single query) both SELECT both fields.

---

## 9. Feature: Home Dashboard

**Purpose:** Provide a daily at-a-glance view for the owner/manager — outstanding money, stock alerts, FY financial summary, and recent activity — without requiring navigation to any other tab.

### 9.1 File

`src/app/(dashboard)/page.tsx` — Server Component, `force-dynamic`

Data fetched by: `src/lib/actions/dashboard.actions.ts` — `getDashboardStats()`

### 9.2 KPI Cards

| Card | Metric | Logic | Color | Clickable |
|------|--------|-------|-------|-----------|
| Outstanding | Count + total (₹) | Finalized invoices where `payment_status ≠ "Paid"` | Amber if count > 0 | → /invoice |
| Out of Stock | Count + below-min count | Materials with `current_stock ≤ 0` | Red if any; amber if only low | → /stock |
| FY Sales | Sum (₹) | Net amount of Finalized invoices this FY | Green | — |
| FY Purchases | Sum (₹) | Total amount of Received POs this FY | Blue | — |

### 9.3 Recent Activity Tables

Each table shows the last 5 records, ordered by date descending.

**Recent Purchase Orders**

| Column | Source | Notes |
|--------|--------|-------|
| PO # | `po_number` padded to 4 digits | Links to `/transactions/purchase-orders/{id}/view` |
| Date | `po_date` formatted dd MMM yyyy | — |
| Supplier | `suppliers.name` via LEFT JOIN | "—" if no supplier |
| Status | `status` | Green badge for Received, grey for Draft |

**Recent Material Issues**

| Column | Source | Notes |
|--------|--------|-------|
| Slip # | `slip_number` padded to 4 digits | Links to `/transactions/material-issues/{id}/view` |
| Date | `issue_date` formatted dd MMM yyyy | — |
| Vehicle | `vehicles.vehicle_name` via LEFT JOIN | "—" if no vehicle |
| Status | `status` | Blue badge for Issued, grey for Draft |

**Recent Invoices**

| Column | Source | Notes |
|--------|--------|-------|
| Bill # | `bill_number` | Links to `/invoice/{id}/view` |
| Date | `bill_date` formatted dd MMM yyyy | — |
| Customer | `customer_name` | "—" if null |
| Payment | `payment_status` | Green/Amber/Red badge |

### 9.4 `getDashboardStats()` query strategy

Seven queries run in parallel via `Promise.all()`. Supplier and vehicle names are fetched via LEFT JOINs (not correlated subqueries) to avoid N+1 performance issues.

```typescript
const [
  outstandingRows,   // COUNT + SUM of unpaid Finalized invoices
  salesRow,          // SUM of this FY Finalized invoices
  purchaseRow,       // SUM of this FY Received POs
  stockRows,         // All active materials with current_stock and min_level
  recentPORows,      // Last 5 POs with LEFT JOIN suppliers
  recentMIRows,      // Last 5 MIs with LEFT JOIN vehicles
  recentInvoiceRows, // Last 5 invoices
] = await Promise.all([...]);
```

---

## 10. Feature: Vehicle Type in Reports & Job Cost

**Purpose:** The `vehicles.type` field ("New" or "Old") distinguishes New Build jobs from Repair jobs. Phase 7 surfaces this classification wherever job cost is shown.

### 10.1 Files

| File | Role |
|------|------|
| `src/lib/actions/stock.actions.ts` | `vehicle_type` in `JobCostResult` |
| `src/lib/actions/reports.actions.ts` | `vehicle_type` in `InvoiceSummaryRow` |
| `src/app/(dashboard)/stock/stock-client.tsx` | Colored badge in Job Cost panel |
| `src/components/pdf/job-cost-pdf.tsx` | TYPE line in header |
| `src/app/(dashboard)/reports/invoice-summary.tsx` | Type column in report table |

### 10.2 Display logic

| `vehicle_type` value | Display label | Badge color |
|----------------------|---------------|-------------|
| `"New"` | New Build | Blue (`bg-blue-100 text-blue-700`) |
| Anything else (`"Old"` etc.) | Repair | Amber (`bg-amber-100 text-amber-700`) |

### 10.3 Job Cost panel (Stock tab)

The vehicle info row now shows:
```
[Vehicle Name]  [New Build]  Job #J00001  Customer Name
```

### 10.4 Job Cost PDF

The vehicle info block shows:
```
VEHICLE  : TN 33 AX 6869  (J00001)
TYPE     : New Build
CUSTOMER : Mithun M.M
```

### 10.5 Invoice Summary Report

A "Type" column appears after "Vehicle":
- New Build — blue pill badge
- Repair — amber pill badge
- "—" if vehicle type unavailable

CSV export maps: `"New" → "New Build"`, anything else → `"Repair"`.

---

## 11. Feature: Bank Details & Terms on Invoice PDFs

**Purpose:** Allow the admin to configure the company's bank account details and invoice terms once in Settings; these then automatically appear on every printed invoice PDF.

### 11.1 Files

| File | Role |
|------|------|
| `src/lib/actions/settings.actions.ts` | `CompanySetting` interface + `getCompanySettings()` + `upsertCompanySettings()` |
| `src/app/(dashboard)/settings/settings-client.tsx` | Settings form |
| `src/components/pdf/customer-invoice-pdf.tsx` | Bank + terms blocks |
| `src/components/pdf/insurance-invoice-pdf.tsx` | Same |

### 11.2 Settings form sections added

**Bank Details section:**
- Bank Name
- Account Number
- IFSC Code (uppercase, 11 characters)
- Branch

**Invoice Terms section:**
- Textarea — multi-line terms and conditions

Both sections are optional. Saving any blank value sets it to null in the database.

### 11.3 PDF rendering

**Bank block** (shown only when `bank_account_no` is populated):
```
Payment Details
[Bank Name]  |  A/C: [account_no]  |  IFSC: [ifsc]  |  Branch: [branch]
```

**Terms block** (shown only when `invoice_terms` is populated):
```
Terms: [terms text]
```
Rendered in italic below the bank block.

### 11.4 `CompanySetting` interface

```typescript
export interface CompanySetting {
  company_name: string;
  address: string | null;
  gstin: string | null;
  pan_no: string | null;
  tan_no: string | null;
  bank_name: string | null;
  bank_account_no: string | null;
  bank_ifsc: string | null;
  bank_branch: string | null;
  invoice_terms: string | null;
}
```

Default values (used when no settings row exists): company name, address, and GSTIN are hardcoded for Durga Industries. All bank fields default to `null` — PDFs will not show a bank section until the admin configures it.

### 11.5 PDF signatory block

Every invoice PDF ends with a right-aligned authorised signatory section:

```
[30pt signature space]
────────────────────────  (140pt wide line)
For {Company Name}
Authorised Signatory
```

This block appears on all invoices regardless of whether bank details are configured.

### 11.6 `upsertCompanySettings()`

Uses an upsert pattern: reads existing row ID, then UPDATE if found, INSERT if not. Ensures there is always exactly one settings row. Calls `revalidatePath("/settings")` after save.

---

## 12. Feature: Low-Stock PO Shortcut

**Purpose:** When viewing the Stock tab, a material that is out of stock or below minimum level shows a "Create PO" button that opens the PO form pre-populated with that material — eliminating manual lookup.

### 12.1 Files

| File | Role |
|------|------|
| `src/app/(dashboard)/stock/stock-client.tsx` | "Create PO" button with Link |
| `src/app/(dashboard)/transactions/purchase-orders/new/page.tsx` | Reads `searchParams.prefill` |
| `src/app/(dashboard)/transactions/purchase-orders/po-form.tsx` | `prefillMaterialId` prop |

### 12.2 How it works

1. For materials where `current_stock ≤ 0` or `current_stock < min_level`, a shopping cart icon button appears in the stock table row.

2. The button is a `<Link>` to:
   ```
   /transactions/purchase-orders/new?prefill={material_id}
   ```

3. The PO new page reads `searchParams.prefill` and passes it as `prefillMaterialId` to `<POForm>`.

4. `POForm` uses a **state initializer** (not a useEffect) to pre-populate the first line item with the material's ID, name, material number, and HSN code. Quantity, rate, and supplier are left blank for the user to fill in.

### 12.3 Stock table row actions

Each stock table row has three action icons:

| Icon | Action | Always shown |
|------|--------|-------------|
| History (clock) | Opens stock movement drawer for that material | ✅ |
| Sliders | Opens stock adjustment dialog | ✅ |
| ShoppingCart | Links to new PO with material prefilled | Only when `status === "low"` or `"out"` |

---

## 13. Server Actions Reference

### `src/lib/actions/invoices.actions.ts`

| Function | Purpose | Revalidates |
|----------|---------|-------------|
| `createInvoice(data)` | Creates Draft invoice with items and slip links | `/invoice` |
| `updateInvoice(id, data)` | Updates Draft invoice atomically | `/invoice` |
| `finalizeInvoice(id)` | Sets status = Finalized | `/invoice` |
| `revertInvoiceToDraft(id)` | Sets status = Draft (not allowed if Cancelled) | `/invoice` |
| `deleteInvoice(id)` | Deletes Draft invoice (CASCADE) | `/invoice` |
| `cancelInvoice(id)` | Atomically frees slips + sets Cancelled + records who/when | `/invoice` |
| `markInvoicePayment(id, data)` | Updates payment_status, payment_date, payment_notes | `/invoice`, `/` |
| `getNextBillNumber(prefix, fy)` | Internal — `ORDER BY bill_number DESC LIMIT 1` per prefix | — |
| `peekNextBillNumber(prefix, fy)` | Public wrapper for the above | — |
| `getLinkedSlipsForInvoice(id)` | Returns MI slips linked to an invoice | — |

### `src/lib/actions/purchase-orders.actions.ts`

| Function | Purpose |
|----------|---------|
| `getPurchaseOrders(fy)` | Flat join of all PO items for a FY; includes supplier_bill_no/date |
| `getPurchaseOrderById(id)` | Full PO with items array; includes supplier_bill_no/date |
| `createPurchaseOrder(data)` | Creates Draft PO with items; saves supplier bill fields |
| `updatePurchaseOrder(id, data)` | Updates Draft PO atomically; saves supplier bill fields |
| `receivePurchaseOrder(id)` | Sets status = Received; credits stock ledger |
| `updateReceivedPurchaseOrder(id, data)` | Reverses + re-applies stock; saves supplier bill fields |
| `deletePurchaseOrder(id)` | Deletes Draft PO |
| `getActiveSuppliers()` | Dropdown data |
| `getActiveMaterials()` | Dropdown data with current_stock |
| `getActiveUnits()` | Dropdown data |
| `getLastMaterialRate(materialId)` | Last received PO rate for a material |

### `src/lib/actions/dashboard.actions.ts`

| Function | Purpose |
|----------|---------|
| `getDashboardStats()` | 7-query Promise.all returning all KPI + recent activity data |

### `src/lib/actions/settings.actions.ts`

| Function | Purpose |
|----------|---------|
| `getCompanySettings()` | Returns single settings row or DEFAULTS |
| `upsertCompanySettings(data)` | Insert-or-update the single settings row |

### `src/lib/actions/stock.actions.ts`

| Function | Purpose |
|----------|---------|
| `getStockDashboardMaterials()` | All active materials with stock levels |
| `getStockLedger(materialId)` | Full ledger history for one material |
| `getJobCostData(vehicleId)` | Aggregated cost + billed/unbilled per material for a job; includes vehicle_type |
| `getVehiclesForJobCost()` | Vehicle dropdown for Job Cost search |

### `src/lib/actions/reports.actions.ts`

| Function | Purpose |
|----------|---------|
| `getInvoiceSummaryReport(filters)` | Invoice summary with vehicle_type, customer, GST breakdown |
| `getPurchaseReport(filters)` | PO line-item report with supplier_bill_no/date |
| `getMonthlyStockReport(fy)` | Monthly stock movement by ledger type |
| `getActiveVehiclesForReports()` | Filter dropdown |
| `getActiveSuppliersForReports()` | Filter dropdown |
| `getActiveMaterialsForReports()` | Filter dropdown |
| `getActiveCustomersForReports()` | Filter dropdown |

---

## 14. Phase 7 Audit — Findings & Fixes

A full in-depth audit was run after Phase 7 implementation using the same 13-lens methodology as the Phase 1–6 audit. All findings are documented below.

### 14.1 HIGH findings (A-series) — all fixed ✅

#### A-1 | PO Register PDF missing supplier bill fields
**File:** `src/components/pdf/po-register-pdf.tsx`

**Problem:** The schema migration added `supplier_bill_no`/`supplier_bill_date` and the PO form saved them, but the PDF renderer was never updated. Printed POs showed no supplier bill reference.

**Fix:** Added both fields to `ItemRow` type and to the PDF info block as a conditional row:
```tsx
{first.supplier_bill_no && (
  <View style={styles.infoLine}>
    <Text style={styles.infoLineLabel}>SUPPLIER BILL</Text>
    <Text style={styles.infoLineValue}>
      : {first.supplier_bill_no}
      {first.supplier_bill_date ? ` dated ${fmtDate(first.supplier_bill_date)}` : ""}
    </Text>
  </View>
)}
```
Also fixed `getPurchaseOrders()` to SELECT both fields (was omitting them — see B-4).

---

#### A-2 | vehicle_type missing from JobCostResult
**Files:** `src/lib/actions/stock.actions.ts`, `src/app/(dashboard)/stock/stock-client.tsx`, `src/components/pdf/job-cost-pdf.tsx`

**Problem:** Phase 7 plan required vehicle type in the Job Cost view. `JobCostResult.vehicle` had `job_ref_no`, `vehicle_name`, `customer_name` but not `vehicle_type`. The DB query didn't SELECT `vehicles.type`. Both return sites in `getJobCostData()` omitted it. The UI and PDF had no vehicle type display.

**Fix:**
1. Added `vehicle_type: string` to `JobCostResult.vehicle` interface
2. Added `vehicle_type: vehicles.type` to the SELECT in `getJobCostData()`
3. Added `vehicle_type: veh.vehicle_type` to both return sites (empty result and full result)
4. Added colored badge in the Job Cost panel UI
5. Added "TYPE" info line in `job-cost-pdf.tsx`

---

#### A-3 | `router.refresh()` missing after payment save
**File:** `src/app/(dashboard)/invoice/invoice-list-client.tsx`

**Problem:** `handleSavePayment()` closed the dialog with `setPaymentTarget(null)` but did not call `router.refresh()`. The `revalidatePath("/invoice")` in the server action invalidates the Next.js cache, but the mounted client component still holds old data in its `rows` prop. The badge continued to show the old payment status until manual navigation.

Compare with `handleDelete()` in the same file — it correctly calls `router.refresh()` after deletion.

**Fix:**
```typescript
toast.success(`${paymentTarget.bill_number} marked as ${paymentStatus}.`);
setPaymentTarget(null);
router.refresh();  // ← added
```

---

### 14.2 MEDIUM findings (B-series) — all resolved ✅

#### B-1 | Correlated subqueries (N+1-like) in getDashboardStats
**File:** `src/lib/actions/dashboard.actions.ts`

**Problem:** Recent POs and MIs queries used inline SQL correlated subqueries for supplier_name and vehicle_name. PostgreSQL executes a correlated subquery once per outer row — functionally identical to N+1.

**Fix:** Replaced with LEFT JOINs:
```typescript
.from(purchaseOrders)
.leftJoin(suppliers, eq(purchaseOrders.supplier_id, suppliers.id))

.from(materialIssues)
.leftJoin(vehicles, eq(materialIssues.vehicle_id, vehicles.id))
```

---

#### B-2 | No server-side enum guard on payment_status
**File:** `src/lib/actions/invoices.actions.ts`

**Status:** Was already present — confirmed. Line 758:
```typescript
if (!(Object.values(PAYMENT_STATUS) as string[]).includes(data.payment_status))
  throw new Error("Invalid payment status.");
```

---

#### B-3 | revalidatePath("/") missing from markInvoicePayment
**File:** `src/lib/actions/invoices.actions.ts`

**Problem:** When an invoice is marked Paid, the home dashboard "Outstanding" KPI card would remain stale (showing the paid invoice as still outstanding) until the home page cache naturally expired.

**Fix:** Added `revalidatePath("/")` alongside the existing `revalidatePath("/invoice")`.

---

#### B-4 | getPurchaseOrders() list query omitting supplier_bill fields
**File:** `src/lib/actions/purchase-orders.actions.ts`

**Problem:** `getPurchaseOrderById()` (single) and all write functions included `supplier_bill_no`/`supplier_bill_date`, but `getPurchaseOrders()` (list query, used for the PO list page and the PDF) did not SELECT them. The PDF (A-1 fix) cannot show these fields if the list query doesn't fetch them.

**Fix:** Added both fields to the SELECT in `getPurchaseOrders()`:
```typescript
supplier_bill_no: purchaseOrders.supplier_bill_no,
supplier_bill_date: purchaseOrders.supplier_bill_date,
```

---

#### B-5 | Phase 7 code using magic strings despite constants.ts
**Files:** `src/lib/actions/invoices.actions.ts`, `src/lib/actions/dashboard.actions.ts`, `src/app/(dashboard)/invoice/invoice-list-client.tsx`

**Problem:** `constants.ts` was created as part of Phase 7 but none of the Phase 7 code actually imported or used it. Status comparisons used raw string literals like `"Finalized"`, `"Paid"`, `"Received"`.

**Fix:** All three files updated to import `INVOICE_STATUS`, `PAYMENT_STATUS`, `PO_STATUS` and use constant references throughout.

---

#### B-6 | getNextBillNumber() ORDER BY fragility
**File:** `src/lib/actions/invoices.actions.ts`

**Problem:** Bill number generation used `ORDER BY created_at LIMIT 100`, then iterated all 100 rows to find the max sequence. This would silently miss the true maximum if volume exceeded 100 per prefix per FY, risking duplicate bill numbers.

**Fix:** Changed to `ORDER BY bill_number DESC LIMIT 1`:
```typescript
// Before: ORDER BY created_at, LIMIT 100, loop to find max
// After:
.orderBy(desc(invoices.bill_number))
.limit(1)
// Then extract sequence from result[0] only
```
This always gets the true maximum in one row, regardless of volume.

---

### 14.3 LOW findings (C-series)

#### C-1 | Duplicate CompanySetting interface in PDF files ✅ Fixed
**Files:** `src/components/pdf/customer-invoice-pdf.tsx`, `src/components/pdf/insurance-invoice-pdf.tsx`

Both PDFs defined an identical local `interface CompanySetting`. Removed both inline definitions; both now import:
```typescript
import type { CompanySetting } from "@/lib/actions/settings.actions";
```

---

#### C-2 | colSpan=15 wrong in invoice list empty-state ✅ Fixed
**File:** `src/app/(dashboard)/invoice/invoice-list-client.tsx`

Phase 7 added a "Payment" column, bringing the total to 16. The empty-state `<td>` still had `colSpan={15}`, causing the "No invoices found" cell to not span the full table width. Fixed to `colSpan={16}`.

---

#### C-3 | Unnecessary db.transaction() in markInvoicePayment ✅ Fixed
**File:** `src/lib/actions/invoices.actions.ts`

A `db.transaction()` wrapper around a single `UPDATE` statement was removed. Transactions are only needed when multiple writes must be atomic together. A single UPDATE is inherently atomic.

---

#### C-4 | Cancellation banner color ⚠️ Pending client decision
**File:** `src/app/(dashboard)/invoice/invoice-form.tsx`

The cancellation banner uses `rose/red` styling (`bg-rose-50 border-rose-200 text-rose-800`). The original plan specified `amber`. Red implies an error; amber conveys informational/read-only state. Defer to client preference before changing.

---

### 14.4 NOT A BUG (D-series) — 5 confirmed

| ID | Finding | Verdict |
|----|---------|---------|
| D-1 | FY format "2026-2027" — consistent across all layers | `getCurrentFY()` returns long format; DB stores long format; all queries match |
| D-2 | revalidatePath in cancelInvoice placement | Correctly placed AFTER `db.transaction()` closes |
| D-3 | Null bank fields in DEFAULTS | Correct — admin must configure; PDFs guard with `&&` |
| D-4 | `payment_status ?? "Unpaid"` fallback | Belt-and-suspenders for pre-migration rows; DB has NOT NULL default |
| D-5 | Promise.all() in getDashboardStats | Correctly parallelises all 7 queries |

---

## 15. Additional Bug Fixes

### 15.1 Vercel build ENOENT error

**Error:**
```
Error: ENOENT: no such file or directory,
lstat '.../app/(dashboard)/page_client-reference-manifest.js'
```

**Root cause:** `src/app/page.tsx` (legacy file that redirected to `/masters/materials`) and `src/app/(dashboard)/page.tsx` (Phase 7 home dashboard) both resolved to the `/` route. Next.js silently preferred the route group version at runtime but Vercel's build trace step looked for the root-level page's client reference manifest and failed with ENOENT.

**Fix:** Deleted `src/app/page.tsx`. The `(dashboard)/page.tsx` now exclusively serves `/`. No redirect is needed — authenticated users land on the home dashboard.

---

### 15.2 Home dashboard 404 links

**Symptom:** Clicking PO numbers, MI slip numbers in the dashboard home tab opened a 404 page.

**Root cause:** The dashboard links were:
- `/transactions/purchase-orders/{id}` — no such route
- `/transactions/material-issues/{id}` — no such route

The actual routes are at `.../[id]/view`.

**Fix:** Updated both links in `src/app/(dashboard)/page.tsx`:
```tsx
// Before
href={`/transactions/purchase-orders/${r.id}`}
href={`/transactions/material-issues/${r.id}`}

// After
href={`/transactions/purchase-orders/${r.id}/view`}
href={`/transactions/material-issues/${r.id}/view`}
```

Invoice links (`/invoice/{id}/view`) were already correct.

---

## 16. DB Verification Results

All checks were run against the live Supabase database during the Phase 7 audit.

| Check | Result |
|-------|--------|
| `invoices` — 5 new columns present | ✅ payment_status (text, default 'Unpaid'), payment_date (date), payment_notes (text), cancelled_by (text), cancelled_at (timestamptz) |
| `purchase_orders` — 2 new columns present | ✅ supplier_bill_no, supplier_bill_date |
| `company_settings` — 7 new columns present | ✅ bank_name, bank_account_no, bank_ifsc, bank_branch, invoice_terms, pan_no, tan_no |
| `invoices.issue_id` removed | ✅ Column absent (0 rows returned) |
| RLS enabled on all 17 tables | ✅ `rowsecurity = true` confirmed on all 17 |
| `authenticated_full_access` policy on all 17 tables | ✅ One policy per table, `FOR ALL TO authenticated` |
| 11 FK indexes from Phase 1–6 audit | ✅ All 11 present |
| `payment_status` CHECK constraint | ✅ `CHECK (payment_status = ANY (ARRAY['Unpaid'::text, 'Partial'::text, 'Paid'::text]))` |

---

## 17. File Manifest

### New files added in Phase 7

| File | Description |
|------|-------------|
| `src/app/(dashboard)/page.tsx` | Home dashboard — KPI cards + recent activity |
| `src/lib/actions/dashboard.actions.ts` | `getDashboardStats()` — 7-query dashboard data fetcher |
| `src/lib/constants.ts` | Central constants — INVOICE_STATUS, PAYMENT_STATUS, PO_STATUS, MI_STATUS, LEDGER_TYPE |

### Modified files in Phase 7

| File | What changed |
|------|-------------|
| `src/lib/db/schema.ts` | New columns: invoice payment fields, cancelled_by/at, supplier_bill_*, company_settings bank/tax fields; removed issue_id |
| `src/types/index.ts` | InvoiceRow/InvoiceWithDetails: 5 new fields; PurchaseOrderWithDetails: 2 new fields; JobCostResult.vehicle: vehicle_type added |
| `src/lib/fy.ts` | Deduplicated — removed `getCurrentFinancialYear()` duplicate; single `getCurrentFY()` now canonical |
| `src/lib/actions/invoices.actions.ts` | Added cancelInvoice, markInvoicePayment; fixed getNextBillNumber ORDER BY; uses INVOICE_STATUS/PAYMENT_STATUS constants |
| `src/lib/actions/purchase-orders.actions.ts` | All CRUD functions include supplier_bill_no/date; getPurchaseOrders SELECT updated |
| `src/lib/actions/reports.actions.ts` | InvoiceSummaryRow: vehicle_type added; PurchaseReportRow: supplier_bill fields added |
| `src/lib/actions/stock.actions.ts` | JobCostResult.vehicle: vehicle_type added; getJobCostData SELECT + return sites updated |
| `src/lib/actions/settings.actions.ts` | CompanySetting interface extended with 7 new fields; upsertCompanySettings updated |
| `src/components/sidebar.tsx` | "Home" nav item added (href="/"); FY displayed in footer |
| `src/middleware.ts` | Redirects to "/" instead of "/masters/materials" after login |
| `src/app/(dashboard)/invoice/invoice-list-client.tsx` | Payment dialog, payment badge, router.refresh() on payment save, colSpan fixed to 16, constants used |
| `src/app/(dashboard)/invoice/invoice-form.tsx` | Cancellation banner with audit trail; payment fields in buildPdfRows |
| `src/app/(dashboard)/transactions/purchase-orders/po-form.tsx` | supplier_bill_no/date fields; prefillMaterialId prop |
| `src/app/(dashboard)/transactions/purchase-orders/purchase-orders-client.tsx` | ItemRow type: supplier_bill_no/date added |
| `src/app/(dashboard)/reports/invoice-summary.tsx` | vehicle_type column + CSV |
| `src/app/(dashboard)/reports/purchase-report.tsx` | supplier_bill_no/date columns + CSV |
| `src/app/(dashboard)/settings/settings-client.tsx` | Bank details section + invoice terms section |
| `src/app/(dashboard)/stock/stock-client.tsx` | Create PO button for low-stock; vehicle_type badge in Job Cost panel |
| `src/components/pdf/po-register-pdf.tsx` | ItemRow type: supplier_bill fields; conditional SUPPLIER BILL info block |
| `src/components/pdf/customer-invoice-pdf.tsx` | Bank details block; terms block; imports CompanySetting from settings.actions |
| `src/components/pdf/insurance-invoice-pdf.tsx` | Same as customer-invoice-pdf |
| `src/components/pdf/job-cost-pdf.tsx` | TYPE info line added to vehicle block |

### Deleted files in Phase 7 audit

| File | Reason |
|------|--------|
| `src/app/page.tsx` | Legacy redirect to /masters/materials; conflicted with (dashboard)/page.tsx for the `/` route, causing Vercel build ENOENT |

---

---

## 18. Invoice Form — Complete Reference

`src/app/(dashboard)/invoice/invoice-form.tsx`

### 18.1 Form modes

| Mode | When used | Editable |
|------|-----------|----------|
| `"new"` | Creating a new invoice | Yes |
| `"edit"` | Modifying a saved invoice | Yes (with status warnings) |
| `"view"` | Read-only display | No |

### 18.2 Action buttons (context-dependent)

The visible buttons change based on invoice status:

| Status | Available actions |
|--------|------------------|
| Draft | Save Draft, Finalize Invoice, Cancel Invoice, Delete |
| Finalized | Save Changes (amber), Revert to Draft, Cancel Invoice |
| Cancelled | Insurance PDF, Customer PDF, Back to Invoices (no edits) |
| View mode | Edit, Insurance PDF, Customer PDF |

### 18.3 Confirmation dialogs

Every destructive action has a confirmation dialog with specific text:

- **Finalize:** "Mark this invoice as Finalized (Net Amount: ₹X)? …no stock impact either way." Adds conditional warning if reverse charge is enabled.
- **Delete:** "This will permanently delete the invoice and all its line items. This cannot be undone."
- **Cancel:** "This will permanently cancel the invoice. It cannot be edited or deleted after cancellation. The linked MI slips will be freed for use in a corrective invoice."

### 18.4 MI Slip auto-fill feature

When creating or editing an invoice, if a vehicle is selected the form shows an "Auto-fill from Issue Slips" section:

- Lists all **Issued** MI slips for the selected vehicle that are not yet linked to another **Finalized** invoice
- Each slip shows: checkbox, slip number (MI-xxxx), issue date, item count
- All available slips are **auto-checked** when the vehicle is changed
- Checking/unchecking a slip immediately adds/removes its items from the line item grid
- A toast notification confirms: "X item(s) auto-populated from Y slip(s)"
- A persistent warning shows: "⚠ Items from X slip(s) auto-populated. You can add, edit, or remove rows."

**Merging logic:** Items from multiple slips are merged by the key `material_id|rate|tax_percentage`. Items with the same material, rate, and tax are combined into one line with summed quantity.

**Manual rows:** Rows added manually (not from a slip) are identified by the absence of `_slip_id`. These are preserved when slips are toggled — they are never overwritten.

**View mode:** Linked slips are shown in a read-only "Sourced from Issue Slips" section with the same slip details as disabled checkboxes.

### 18.5 Finalized invoice warning

When editing a **Finalized** invoice, an amber banner appears above the form:

> "⚠ This invoice is Finalized. Editing will update the stored record. Since invoices do not affect stock, no stock reversal is needed."

This reassures the user that editing a finalized invoice carries no stock risk (unlike editing a received PO).

### 18.6 Tax rate / bill series section

- **New invoice:** Combobox shows tax rate descriptions with `(prefix)` suffix if an invoice prefix is configured. Selecting a rate calls `peekNextBillNumber(prefix, fy)` to preview the next bill number. Warning shown if no prefix: "⚠ No Invoice Prefix on this rate — bill number will be numeric only."
- **Existing invoice:** Shows locked bill series label "(locked at creation)" — cannot change the tax rate after creation.

### 18.7 Reverse charge

- Checkbox to enable reverse charge (shifts tax liability to recipient)
- When enabled: An amber alert shows "⚠ Reverse charge is ON. Tax liability shifts to the recipient. PDF will show 'Tax to be paid on reverse charge basis.'"
- The PDF automatically adds the reverse charge notice in the header when this flag is set

### 18.8 buildPdfRows — payment fields included

The `buildPdfRows()` function that prepares data for PDF generation includes all payment and cancellation fields in every row:

```typescript
payment_status: inv.payment_status ?? "Unpaid",
payment_date: inv.payment_date ?? null,
payment_notes: inv.payment_notes ?? null,
cancelled_by: inv.cancelled_by ?? null,
cancelled_at: inv.cancelled_at ?? null,
```

These fields are currently used by the PDF components for contextual rendering.

---

## 19. Stock Dashboard — Complete Reference

`src/app/(dashboard)/stock/stock-client.tsx`

### 19.1 Stock table columns

| # | Column | Description |
|---|--------|-------------|
| 1 | Code | Material code formatted as "M#####" |
| 2 | Material Name | Full material name |
| 3 | Unit | Unit of measurement |
| 4 | Current Stock | Current quantity — bold, right-aligned |
| 5 | Min Level | Minimum stock threshold — right-aligned |
| 6 | Last PO Rate | Rate from last received PO — right-aligned |
| 7 | Stock Value | `current_stock × last_po_rate` — right-aligned |
| 8 | Status | Colored badge |
| 9 | Actions | Icon buttons |

### 19.2 Row color coding

| Condition | Row background |
|-----------|---------------|
| `status === "out"` | `bg-red-50` (light red) |
| `status === "low"` | `bg-amber-50` (light amber) |
| `status === "inactive"` | `bg-slate-50` (light grey) |
| Normal (`"ok"`) | White |

### 19.3 Status badges

| Status | Badge color | Label |
|--------|-------------|-------|
| `"out"` | Red | "Out of Stock" |
| `"low"` | Amber | "Low Stock" |
| `"inactive"` | Slate | "Inactive" |
| `"ok"` | Green | "OK" |

**Status is derived from:**
- `"out"` → `current_stock ≤ 0`
- `"low"` → `current_stock > 0` AND `current_stock < min_level`
- `"inactive"` → `is_active === false`
- `"ok"` → everything else

### 19.4 Job Cost panel — full column reference

The Job Cost tab within the Stock page shows a searchable vehicle selector and a results table.

**Vehicle selector:** Combobox with format `"Job #J00001 — vehicle_name (customer_name) [Inactive]"`. Width fixed at w-96.

**Vehicle info row (after search result loads):**
```
[vehicle_name]  [New Build / Repair badge]  Job #J00001  Customer Name
```

**Result table columns:**

| Column | Notes |
|--------|-------|
| Material | Material name |
| Contractor | Contractor name or "—" |
| Qty | 4 decimal places |
| Unit | Unit name or "—" |
| Rate | Formatted as currency |
| Total Cost | Bold |
| Billed | Green text |
| Unbilled | Amber if > 0, grey if 0 |

**Totals row:**
- Spans first 5 columns with `colSpan={5}`, label "TOTAL"
- Shows: total_cost | total_billed (green) | total_unbilled (amber if > 0)
- Styling: `bg-slate-50`, `border-t-2 border-slate-300`, bold text

**Print button:** "Print Job Cost PDF" — bottom-right, generates `JobCostDocument` with `result` and `companySetting`.

---

## 20. Settings Form — Complete Reference

`src/app/(dashboard)/settings/settings-client.tsx`

### 20.1 All form fields

**Company Identity section:**

| Field | Type | Validation | Notes |
|-------|------|-----------|-------|
| Company Name | Text input | Required, non-empty | Displayed on all PDFs |
| Address | Textarea (3 rows) | Optional | Full address block |
| GSTIN | Text input | Optional; if provided, must be exactly 15 chars | Uppercase; shows "X/15" live counter |
| PAN No. | Text input | Optional; max 10 chars | Uppercase; placeholder "AAAAA0000A" |
| TAN No. | Text input | Optional; max 10 chars | Uppercase; placeholder "AAAA00000A" |

**Bank Details section** (shown on all invoice PDFs):

| Field | Type | Validation | Notes |
|-------|------|-----------|-------|
| Bank Name | Text input | Optional | e.g. "State Bank of India" |
| Account Number | Text input (mono) | Optional | e.g. "1234567890" |
| IFSC Code | Text input | Optional; max 11 chars | Uppercase on change AND on submit |
| Branch | Text input | Optional | e.g. "Karur Main Branch" |

**Invoice Terms section:**

| Field | Type | Notes |
|-------|------|-------|
| Terms | Textarea (3 rows) | Shown as italic footer on PDF; e.g. payment terms |

### 20.2 Submit behaviour

1. Validates company name is non-empty
2. Validates GSTIN length is exactly 15 if provided
3. Trims all text fields
4. Converts all empty strings → `null` for optional fields
5. Calls `upsertCompanySettings(data)`
6. Shows "Company settings saved." toast on success
7. Shows "Failed to save settings." toast on error
8. Save button shows "Saving…" while in progress

### 20.3 Footer note

> "These details appear on all generated PDFs (invoices, purchase orders)."

---

## 21. Invoice Helper Actions

These read-only server actions in `src/lib/actions/invoices.actions.ts` support the invoice form and are not covered elsewhere.

| Function | Purpose | Key behaviour |
|----------|---------|---------------|
| `getActiveVehiclesForInvoice()` | Vehicle combobox data | Returns `id, job_ref_no, vehicle_name, customer_name, customer_gstin, customer_state` |
| `getIssuedMIsForVehicle(vehicleId, currentInvoiceId?)` | Available slip checklist | Returns slips **not linked to any other Finalized invoice**; excludes slips already used; returns `id, slip_number, issue_date, item_count` |
| `getMIItemsForInvoice(issueId)` | Line items for a single slip | Returns all item fields including HSN, tax, GST breakdown |
| `getAllIssuedMIItemsForVehicle(vehicleId, currentInvoiceId?)` | Bulk load all slips + items | Returns `{ slip_id, slip_number, issue_date, items[] }` — used for auto-populate on vehicle change |
| `getActiveTaxRatesWithPrefix()` | Tax rate combobox | Returns `id, vat_code, tax_percentage, description, inv_prefix` |
| `getActiveInvoiceMaterials()` | Material combobox | Returns `id, material_no, name, hsn_code, tax_rate_id, tax_percentage, sales_unit_id, purchase_unit_id` |
| `getInvoices(financialYear)` | Invoice list | Full flat join of all invoices + items for a FY; includes all payment + cancellation fields |
| `getInvoiceById(id)` | Single invoice for edit/view | Full invoice with items; defaults `payment_status` to `"Unpaid"` if null |

**Slip link management pattern:**
- `createInvoice()` — inserts `invoice_slip_links` rows for each selected slip ID (skip if none selected)
- `updateInvoice()` — deletes all existing `invoice_slip_links` for the invoice, then re-inserts for the current selection (full replace, not diff)

---

*Documentation written: May 2026*
*Phase 7 audit completed: May 2026*
*Last updated: May 2026 — added Sections 18–21 after comprehensive gap audit*
*All TypeScript checks pass: `npx tsc --noEmit` → 0 errors*
