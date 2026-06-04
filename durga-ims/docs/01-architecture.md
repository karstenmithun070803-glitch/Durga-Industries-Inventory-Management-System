# Architecture — Durga Industries IMS

> This is the permanent technical reference for project-wide infrastructure: auth, DB schema, patterns, folder layout. If something applies across all modules, it lives here.

*Last reviewed: 2026-06-04*

---

## Project Overview

**Durga Industries** is a bus body fabrication company in Karur, Tamil Nadu. This IMS is an internal, single-tenant web application for:

- **Masters**: customers, suppliers, materials, units, tax rates, contractors, vehicles
- **Purchase Orders**: record what was bought; update warehouse stock on receipt
- **Material Issues**: record materials issued from warehouse to jobs
- **Invoicing**: generate GST-compliant invoices for customers
- **Stock Dashboard**: live inventory view, history, manual adjustments
- **Reports**: purchase report, invoice summary, monthly stock reconciliation

All users are internal employees. No public-facing interface.

---

## Technology Stack

| Tool | Role |
|------|------|
| **Next.js 14** (App Router) | Full-stack framework: routing, Server Components, Server Actions |
| **Supabase** | Managed PostgreSQL + Auth (email/password, cookie-based sessions) |
| **Drizzle ORM** | Type-safe SQL query builder. `schema.ts` is the single source of truth for all tables. |
| **TypeScript** | End-to-end type safety. Types inferred from Drizzle schema + hand-authored in `types/index.ts`. |
| **Tailwind CSS** | Utility-first CSS. No separate stylesheet files. |
| **shadcn/ui** | Accessible component primitives (Button, Input, Dialog, etc.). Live in `src/components/ui/`. |
| **Sonner** | Toast notifications. `toast.success()` / `toast.error()` used consistently across all mutations. |
| **@react-pdf/renderer** | Client-side PDF generation for PO, MI, and Invoice documents. |

---

## Folder Structure

```
src/
├── app/
│   ├── (auth)/login/                   — Login page (unauthenticated users land here)
│   └── (dashboard)/
│       ├── layout.tsx                  — Sidebar + FYProvider wrapping all dashboard routes
│       ├── masters/
│       │   ├── customers/              — Customer Master (C001)
│       │   ├── suppliers/              — Supplier Master (S001)
│       │   ├── materials/              — Material Master (M001) — default landing page after login
│       │   ├── units/                  — Unit Master (U01)
│       │   ├── tax/                    — Tax Rate Master (T01)
│       │   ├── contractors/            — Contractor Master (CON01)
│       │   └── vehicles/              — Vehicle/Job Master (J00001)
│       ├── transactions/
│       │   ├── purchase-orders/        — PO list, new PO, edit PO
│       │   └── material-issues/        — MI list, new slip, edit slip
│       ├── invoice/                    — Invoice list, new invoice, edit/view invoice
│       ├── stock/                      — Stock dashboard (table, history drawer, adjustment)
│       ├── reports/                    — Invoice summary, purchase report, monthly stock
│       └── settings/                  — Company name, address, GSTIN
│
├── components/
│   ├── ui/                             — shadcn/ui primitives + custom: combobox, confirm-dialog, sheet
│   ├── masters/master-layout.tsx       — Two-panel layout (form left + table right)
│   ├── forms/TransactionGrid.tsx       — Reusable line-item grid (POs, MIs, Invoices)
│   ├── pdf/                           — All PDF document components
│   └── sidebar.tsx                    — Navigation sidebar + custom FY dropdown
│
├── lib/
│   ├── actions/                        — All server actions ("use server"). One file per domain.
│   │   ├── auth.actions.ts
│   │   ├── customers/suppliers/materials/units/tax/contractors/vehicles.actions.ts
│   │   ├── purchase-orders.actions.ts
│   │   ├── material-issues.actions.ts
│   │   ├── invoices.actions.ts
│   │   ├── stock.actions.ts
│   │   ├── reports.actions.ts
│   │   └── settings.actions.ts
│   ├── db/
│   │   ├── schema.ts                   — Drizzle schema — SINGLE SOURCE OF TRUTH
│   │   └── index.ts                    — Drizzle client (Supabase connection)
│   ├── fy.ts                           — getCurrentFY(), fyDateRange() — pure sync, no "use server"
│   ├── financial-year.ts               — getCurrentFinancialYear(), getFinancialYearRange()
│   ├── utils.ts                        — cn(), formatCode(), matchesCode()
│   └── constants.ts                    — INDIAN_STATES array
│
├── types/index.ts                      — TypeScript types (schema-inferred + custom joined)
└── middleware.ts                       — Supabase session refresh + auth route guard
```

**Key convention:** Every page folder has `page.tsx` (Server Component — fetches data) and `[module]-client.tsx` (Client Component `"use client"` — handles UI state).

---

## Database Schema

All tables defined in `src/lib/db/schema.ts`. Never add a column to Supabase without updating `schema.ts`.

### Master Tables (all share `id` UUID PK, `is_active` boolean, `created_at`, `updated_at`)

| Table | Key Columns |
|-------|------------|
| `customers` | `customer_no` SERIAL → C001; `name`, `address_1/2`, `street`, `city`, `state`, `gstin` |
| `suppliers` | `code_no` SERIAL → S001; `name`, `gstin`, `state`, `address`, `tin_no`, `cst_no` (legacy) |
| `materials` | `material_no` SERIAL → M001; `name`, `hsn_code`, `tax_rate_id` FK, `purchase_unit_id` FK, `sales_unit_id` FK, `conversion_value`, `opening_stock` (write-once), `current_stock` CHECK(≥0), `min_level`, `max_level` |
| `units` | `unit_code` SERIAL → U01; `unit_name` |
| `taxRates` | `vat_code` SERIAL → T01; `tax_percentage`, `description`, `inv_prefix` (unique non-null) |
| `contractors` | `contractor_no` SERIAL → CON01; `name`, `role`, `contact` |
| `vehicles` | `job_ref_no` SERIAL → J00001; `vehicle_name`, `type` (`"New Build"` \| `"Old Build"`), `customer_id` FK |

### Transaction Tables

| Table | Key Columns |
|-------|------------|
| `purchaseOrders` | `po_number` int, `financial_year`, `status` (Draft\|Received), `affects_stock` bool, `supplier_id` FK (nullable, derived), `supplier_bill_no`, `supplier_bill_date` — `UNIQUE(po_number, financial_year)` |
| `purchaseOrderItems` | `po_id` FK CASCADE, `material_id`, `supplier_id` FK (per-item), `qty`, `rate`, `unit_id`, `tax_percentage`, `cgst/sgst/igst_amount`, `amount`, `gst_type` (frozen) |
| `materialIssues` | `slip_number` int, `financial_year`, `status` (Draft\|Issued), `vehicle_id` FK — `UNIQUE(slip_number, financial_year)` |
| `materialIssueItems` | `issue_id` FK CASCADE, `material_id`, `contractor_id` FK (nullable), `affects_inventory` bool, `qty`, `rate`, `unit_id`, `gst_type` (frozen), `hsn_code` (frozen) |
| `invoices` | `bill_number`, `financial_year`, `status` (Draft\|Finalized\|Cancelled), `vehicle_id` FK, `net_amount`, `discount`, `customer_name/gstin/state/address` (frozen snapshots) — `UNIQUE(bill_number, financial_year)` |
| `invoiceItems` | `invoice_id` FK CASCADE, `material_id`, `qty`, `rate`, `tax_percentage` (frozen), `gst_type` (frozen), `cgst/sgst/igst_amount`, `amount`, `hsn_code` (frozen) |
| `invoiceSlipLinks` | `invoice_id` FK, `slip_id` FK — junction table preventing MI double-billing |
| `companySettings` | Single row: company name, address, GSTIN for PDF headers |

### Stock Ledger (append-only, never updated or deleted)

```
stock_ledger
  material_id      UUID FK → materials
  transaction_type TEXT: 'PO_INWARD' | 'ISSUE' | 'REVERSAL' | 'ISSUE_REVERSAL' | 'ADJUSTMENT'
  qty_change       NUMERIC (signed: +50 or −50)
  stock_after      NUMERIC (snapshot of current_stock after this entry)
  reference_id     UUID  (id of the source PO or MI)
  reference_type   TEXT  ('purchase_order' | 'material_issue')
  reason           TEXT  (required for ADJUSTMENT — min 10 chars)
  adjusted_by      UUID  (Supabase user id, for ADJUSTMENT only)
```

### Auth Bridge

```
app_users
  username   TEXT UNIQUE   (what the user types at login)
  email      TEXT UNIQUE   (internal Supabase Auth email)
```

Supabase Auth requires email+password. The app shows a username field. `auth.actions.ts` looks up username → maps to email → signs in via Supabase Auth.

---

## Key Architectural Patterns

### Soft Delete (`is_active`)
Nothing is ever hard-deleted. All master tables have `is_active boolean DEFAULT true`. Deactivation = `SET is_active = false`. Before deactivating, server actions check for active references (see [02-masters-module.md](./02-masters-module.md) for guard logic per master).

### Server Actions (`"use server"`)
All DB writes live in `src/lib/actions/*.actions.ts`. Every exported function must be `async`. Client components import and call them directly — Next.js handles the network boundary. Never write DB queries in client components.

**Critical:** `fy.ts` exports synchronous helpers (`getCurrentFY`, `fyDateRange`) and must NOT have `"use server"`. Import from `@/lib/fy` directly in server components — never re-export from a `"use server"` file.

### `revalidatePath()` After Every Mutation
Every server action that writes to DB ends with `revalidatePath('/path')`. Without this, the UI shows stale data after the action completes.

### `db.transaction()` For Stock Operations
Any operation modifying `materials.current_stock` must use `db.transaction()` — wraps all related writes atomically. If any step fails, all are rolled back. A PO is either fully received or not received at all.

### `formatCode(prefix, num, pad?)`
Converts stored integers to display codes. Integers live in DB; formatted strings are display-only.
```ts
formatCode("M", 5)        // → "M005"  (default pad=3)
formatCode("PO-", 42, 4)  // → "PO-0042"
formatCode("J", 1, 5)     // → "J00001"
```

### `matchesCode(search, prefix, num)`
Smart code search: `"5"`, `"M5"`, `"M005"` all find material #5. Used in every master table filter.

### `determineGstType(gstin, state)`
Returns `"CGST_SGST"` or `"IGST"`. Reads first 2 chars of GSTIN — `"33"` = Tamil Nadu = CGST+SGST. Any other code or empty GSTIN → falls back to state comparison. Called per line item when supplier (PO) or vehicle/customer (MI, Invoice) is selected.

### `MasterLayout` Component
All 7 master pages share: 320px fixed left panel (form) + flex-1 right panel (search + table). Table panel has `min-w-0` to prevent flex from overriding and causing page-level horizontal scroll.

---

## Authentication

1. User submits username + password
2. `login()` in `auth.actions.ts`: looks up username in `app_users` → gets mapped email → calls `supabase.auth.signInWithPassword()`
3. On success → Supabase writes session to HTTP-only cookie → redirect to `/masters/materials`
4. **Middleware** (`middleware.ts`): runs on every request, refreshes session, redirects unauthenticated users away from dashboard routes

---

## Financial Year System

Indian FY runs April 1 – March 31. Affects PO numbers, invoice numbers, and all reports.

- `getCurrentFinancialYear()` → `"2025-26"` (in `src/lib/financial-year.ts`)
- `getFinancialYearRange("2025-26")` → `{ start: 2025-04-01, end: 2026-03-31 }`
- `fyDateRange(fy)` → same, in `src/lib/fy.ts` (sync, no "use server")
- **FY switching**: The sidebar has a custom div-based dropdown (not a native `<select>`) that allows switching to historical FYs. This updates the FY context (`FYProvider`) without changing the system clock. The dropdown opens upward since it's at the bottom of the sidebar.
- **PO and MI numbers** use `UNIQUE(number, financial_year)` — they reset to 1 each April 1. Never use a global SERIAL for these.

---

## How to Run

```bash
npm install
cp .env.local.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY

npm run dev    # → http://localhost:3000
```

After schema changes: update `src/lib/db/schema.ts` to match the Supabase DB. Apply SQL via Supabase dashboard or MCP, then update the schema file manually.
