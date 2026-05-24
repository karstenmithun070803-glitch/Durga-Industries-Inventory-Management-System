# Architecture — Durga Industries IMS

> This file covers **Phase 1 deliverables** (everything built to establish the foundation) and serves as the **permanent technical reference** for the entire project. If something is project-wide infrastructure — auth, DB schema, patterns, folder layout — it lives here.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Phase 1 Deliverables](#2-phase-1-deliverables)
3. [Technology Stack](#3-technology-stack)
4. [Folder Structure](#4-folder-structure)
5. [Database Schema](#5-database-schema)
6. [Key Architectural Patterns](#6-key-architectural-patterns)
7. [Authentication](#7-authentication)
8. [Financial Year System](#8-financial-year-system)
9. [How to Run the Project](#9-how-to-run-the-project)

---

## 1. Project Overview

**Durga Industries** is a steel fabrication company based in Chennai. This IMS (Inventory Management System) is an internal, single-tenant web application that manages:

- **Master data**: customers, suppliers, materials, units, tax rates, contractors, vehicles
- **Purchase Orders**: record what was bought, from whom, at what price; update warehouse stock on receipt
- **Material Issues**: record materials issued from warehouse to jobs (Phase 4)
- **Invoicing**: generate GST-compliant invoices for customers (Phase 5)
- **Reports**: stock position, purchase history, issue history (Phase 6)

It replaces a legacy desktop software system. All users are internal employees. There is no public-facing interface.

---

## 2. Phase 1 Deliverables

Phase 1 built the foundation that every subsequent phase depends on:

| Deliverable | Description |
|------------|-------------|
| Supabase project | PostgreSQL database + Auth (email/password sessions) |
| Database schema | All 14 tables defined in `schema.ts` — see [Section 5](#5-database-schema) |
| Next.js 14 scaffold | App Router project structure, TypeScript config, Tailwind, shadcn/ui |
| Authentication | Login page, `auth.actions.ts`, `appUsers` bridge table (username → Supabase email) |
| Middleware | Session refresh on every request + route guard for all dashboard pages |
| Root redirect | Visiting `/` redirects to `/masters/materials` (default landing page after login) |
| Dashboard layout | Sidebar, FY banner, `FYProvider` context that wraps all dashboard routes |
| Utility functions | `formatCode()`, `matchesCode()`, `determineGstType()` — see [Section 6](#6-key-architectural-patterns) |
| Date helpers | `getCurrentFinancialYear()`, `getFinancialYearRange()` — see [Section 8](#8-financial-year-system) |
| `MasterLayout` component | Shared two-panel form+table layout used by all 7 master pages |

---

## 3. Technology Stack

| Tool | Version | Role |
|------|---------|------|
| **Next.js** | 14 (App Router) | Full-stack framework: routing, Server Components, Server Actions, API |
| **Supabase** | — | Managed PostgreSQL + Auth (email/password, cookie-based sessions) |
| **Drizzle ORM** | — | Type-safe SQL query builder. `schema.ts` is the single source of truth for all table definitions. |
| **TypeScript** | — | End-to-end type safety. All types inferred from Drizzle schema or hand-authored in `types/index.ts`. |
| **Tailwind CSS** | — | Utility-first CSS. No separate stylesheet files. |
| **shadcn/ui** | — | Accessible component primitives (Button, Input, Dialog, Select, etc.). Components live in `src/components/ui/`. |
| **Sonner** | — | Toast notification library. `toast.success()` / `toast.error()` used consistently across all mutations. |
| **@react-pdf/renderer** | — | PDF generation for Purchase Order documents (Phase 3+). |

---

## 4. Folder Structure

```
durga-ims/
└── src/
    ├── app/
    │   ├── (auth)/
    │   │   └── login/
    │   │       └── page.tsx            ← Login page (unauthenticated users land here)
    │   │
    │   └── (dashboard)/
    │       ├── layout.tsx              ← Wraps all dashboard pages: sidebar + FYProvider
    │       ├── masters/
    │       │   ├── customers/          ← Customer Master (C001)
    │       │   ├── suppliers/          ← Supplier Master (S001)
    │       │   ├── materials/          ← Material Master (M001) — default landing page
    │       │   ├── units/              ← Unit Master (U01)
    │       │   ├── tax/                ← Tax Rate Master (T01)
    │       │   ├── contractors/        ← Contractor Master (CON01)
    │       │   └── vehicles/           ← Vehicle/Job Master (J00001)
    │       ├── transactions/
    │       │   ├── purchase-orders/    ← Phase 3 ✅
    │       │   └── material-issues/    ← Phase 4 (not yet built)
    │       ├── reports/                ← Phase 6 (not yet built)
    │       └── settings/
    │
    ├── components/
    │   ├── ui/                         ← shadcn/ui primitives + custom components
    │   │   ├── button.tsx
    │   │   ├── input.tsx
    │   │   ├── combobox.tsx            ← Searchable dropdown (wraps Radix Popover + cmdk)
    │   │   ├── confirm-dialog.tsx      ← Reusable destructive-action confirmation modal
    │   │   └── ...
    │   ├── masters/
    │   │   └── master-layout.tsx       ← Two-panel layout: form left (320px) + table right (flex-1)
    │   ├── forms/
    │   │   └── TransactionGrid.tsx     ← Reusable inline-editable line-item grid (POs, issues, invoices)
    │   ├── sidebar.tsx
    │   └── fy-banner.tsx               ← Financial year selector shown in sidebar
    │
    ├── lib/
    │   ├── actions/                    ← All server actions ("use server"). One file per domain.
    │   │   ├── auth.actions.ts
    │   │   ├── customers.actions.ts
    │   │   ├── suppliers.actions.ts
    │   │   ├── materials.actions.ts
    │   │   ├── units.actions.ts
    │   │   ├── tax.actions.ts
    │   │   ├── contractors.actions.ts
    │   │   ├── vehicles.actions.ts
    │   │   └── purchase-orders.actions.ts
    │   ├── db/
    │   │   ├── schema.ts               ← Drizzle schema — SINGLE SOURCE OF TRUTH for all tables
    │   │   └── index.ts                ← Drizzle client (Supabase connection string)
    │   ├── constants.ts                ← INDIAN_STATES array (28 states + UTs)
    │   ├── utils.ts                    ← cn(), formatCode(), matchesCode()
    │   └── financial-year.ts           ← getCurrentFinancialYear(), getFinancialYearRange()
    │
    ├── types/
    │   └── index.ts                    ← All TypeScript types (schema-inferred + custom joined types)
    │
    └── middleware.ts                   ← Supabase session refresh + auth route guard
```

**Key convention:** Every master page folder contains two files:
- `page.tsx` — Server Component. Fetches data, passes to client component.
- `[module]-client.tsx` — Client Component (`"use client"`). Handles all UI state.

---

## 5. Database Schema

All 14 tables are defined in `src/lib/db/schema.ts`. Drizzle infers TypeScript types directly from this file — it is the single source of truth. Never add a column to Supabase without also adding it to `schema.ts`.

### Master Tables

All 7 master tables share these common columns: `id` (UUID PK), `is_active` (boolean, default `true`), `created_at`, `updated_at`.

| Table | Key Columns | Notes |
|-------|------------|-------|
| `customers` | `customer_no` SERIAL, `name`, `address_1/2`, `street`, `city`, `state`, `gstin` | `customer_no` drives C001 display code |
| `suppliers` | `code_no` SERIAL, `name`, `tin_no`, `cst_no`, `gstin`, `address`, `state` | TIN/CST are legacy pre-GST fields; GSTIN drives per-row tax type in POs |
| `materials` | `material_no` SERIAL, `name`, `hsn_code`, `tax_rate_id` FK, `purchase_unit_id` FK, `sales_unit_id` FK, `conversion_value`, `opening_stock`, `current_stock` CHECK(≥0), `min_level`, `max_level` | `current_stock` must never be manually updated — only via server actions; `opening_stock` is write-once |
| `units` | `unit_code` SERIAL, `unit_name` | Referenced by `materials.purchase_unit_id` and `sales_unit_id` |
| `taxRates` | `vat_code` SERIAL, `tax_percentage`, `description`, `inv_prefix` | `inv_prefix` must be unique across non-null values (enforced server-side) |
| `contractors` | `contractor_no` SERIAL, `name`, `role` | Referenced in Phase 4 material issue items |
| `vehicles` | `job_ref_no` SERIAL, `vehicle_name`, `customer_id` FK | Customer FK required — every vehicle belongs to a customer |

### Transaction Tables

| Table | Key Columns | Notes |
|-------|------------|-------|
| `purchaseOrders` | `po_number` integer, `po_date`, `financial_year`, `status` ('Draft'\|'Received'), `total_amount`, `supplier_id` FK (nullable), `affects_stock` boolean | `UNIQUE(po_number, financial_year)` — PO numbers reset each FY; `supplier_id` is derived (see Phase 3 docs) |
| `purchaseOrderItems` | `po_id` FK CASCADE, `material_id` FK, `supplier_id` FK, `qty`, `unit_id` FK, `rate`, `tax_percentage`, `cgst_amount`, `sgst_amount`, `igst_amount`, `amount`, `gst_type` | `supplier_id` is per-item (not per-PO header); `tax_percentage` and `gst_type` are frozen at entry time |
| `materialIssues` | — | Phase 4 (not yet in use) |
| `materialIssueItems` | — | Phase 4 (not yet in use) |
| `invoices` | — | Phase 5 (not yet in use) |
| `invoiceItems` | — | Phase 5 (not yet in use) |

### Stock Ledger

```
stock_ledger
  id             UUID PK
  material_id    UUID FK → materials
  transaction_type  TEXT: 'PO_INWARD' | 'ISSUE' | 'REVERSAL' | 'ADJUSTMENT'
  reference_id   UUID  (id of the source record: po_id, issue_id, etc.)
  reference_type TEXT  ('purchase_order', 'material_issue', etc.)
  qty_change     NUMERIC  (signed: +50 or -50)
  stock_after    NUMERIC  (balance immediately after this transaction)
  created_at     TIMESTAMPTZ
```

**This table is append-only. Rows are NEVER updated or deleted.** It is the permanent audit trail for all stock movements. Every server action that changes `current_stock` must also insert a row here.

### Auth Bridge

```
app_users
  id          UUID PK
  username    TEXT UNIQUE   (what the user types at login: "mithun")
  email       TEXT UNIQUE   (internal Supabase Auth email: "mithun@durgaindustries.internal")
  created_at  TIMESTAMPTZ
```

Supabase Auth requires email + password. The app presents a username field. `auth.actions.ts` looks up the username in `app_users`, retrieves the mapped email, and signs in via Supabase Auth with that email + the submitted password.

---

## 6. Key Architectural Patterns

These patterns are established in Phase 1 and used consistently in every subsequent phase. Understand these before touching any code.

---

### Soft Delete (`is_active`)

Nothing in this system is ever hard-deleted. Every master table has `is_active boolean DEFAULT true`.

- **Deactivate**: `UPDATE ... SET is_active = false` — record disappears from active dropdowns and default table views
- **Reactivate**: `UPDATE ... SET is_active = true` — record returns immediately

**Why**: All transaction records (POs, invoices, stock ledger) hold FK references to master data. Hard-deleting a supplier would leave all their PO history referencing a non-existent row. Soft delete preserves referential integrity permanently.

**Important**: Before deactivating a master record, the server action must check if it is still referenced anywhere active. See [Phase 2 docs](./phase-2-masters.md#deactivation-guards) for the full guard logic per master.

---

### Server Actions (`"use server"`)

All database writes (and complex reads) live in `src/lib/actions/*.actions.ts`. These files are marked `"use server"` at the top — Next.js compiles them as server-only code.

Rules:
- Every exported function in a server action file **must be `async`**
- Client components import and call these functions directly — Next.js handles the network boundary automatically
- Never write DB queries inside client components or `page.tsx` files (except simple server component data-fetching)

---

### `revalidatePath()` After Every Mutation

Every server action that writes to the DB ends with `revalidatePath('/path/to/page')`. This tells Next.js to invalidate its server-side cache for that route, so the next page load re-fetches fresh data.

If you add a new mutation and forget `revalidatePath`, the UI will show stale data after the action completes.

---

### `db.transaction()` For Stock Operations

Any operation that modifies `materials.current_stock` must use `db.transaction()`. This wraps multiple DB writes into a single atomic unit — if any step fails, all are rolled back.

```ts
// Pattern used in purchase-orders.actions.ts
await db.transaction(async (tx) => {
  await tx.update(purchaseOrders).set({ status: "Received" }).where(...);
  for (const item of items) {
    await tx.update(materials).set({ current_stock: newStock }).where(...);
    await tx.insert(stockLedger).values({ ... });
  }
  // If any of the above throws, ALL are rolled back
});
```

Never do partial stock updates. A PO is either fully received or not received at all.

---

### `formatCode(prefix, num, pad?)`

Converts a stored integer to a display code string. The integer is what lives in the DB — the formatted string is display-only.

```ts
formatCode("M", 5)         // → "M005"   (default pad = 3)
formatCode("C", 12)        // → "C012"
formatCode("PO-", 42, 4)   // → "PO-0042"
formatCode("J", 1, 5)      // → "J00001"
```

Located in `src/lib/utils.ts`.

---

### `matchesCode(search, prefix, num, pad?)`

Smart search for code columns. Supports three search forms — all find the same record:

```ts
matchesCode("5",    "M", 5)  // → true  (just the number)
matchesCode("M5",   "M", 5)  // → true  (prefix + number, no padding)
matchesCode("M005", "M", 5)  // → true  (full formatted code)
matchesCode("M006", "M", 5)  // → false
```

Used in every master table's filter function. Located in `src/lib/utils.ts`.

---

### `determineGstType(gstin, state)`

Returns `"CGST_SGST"` or `"IGST"`. Rules:
1. If `gstin` is non-empty: read the first 2 characters. `"33"` → Tamil Nadu → `"CGST_SGST"`. Any other code → `"IGST"`.
2. If `gstin` is empty or null: fall back to `state === "Tamil Nadu"` comparison.

This function is called per line item whenever a supplier is selected in the TransactionGrid. It determines how tax amounts are split for that row. See [domain-rules.md](./domain-rules.md#gst-cgstsgst-vs-igst) for full GST explanation.

Located in `src/types/index.ts`.

---

### `MasterLayout` Component

All 7 master pages share a two-panel layout:

```
┌─────────────────┬──────────────────────────────────────┐
│  Form Panel     │  Table Panel                         │
│  (320px fixed)  │  (flex-1, min-w-0)                   │
│                 │                                      │
│  Add / Edit     │  Search bar                          │
│  form here      │  ─────────────────────────────────── │
│                 │  Scrollable table (min-w-max)         │
└─────────────────┴──────────────────────────────────────┘
```

**Critical CSS detail**: The table panel has `min-w-0` (overrides flex default `min-width: auto`). Without this, the table's `min-w-max` would push the panel wider than its flex allocation, causing page-level horizontal scroll instead of table-level scroll.

---

## 7. Authentication

### Flow

1. User submits username + password on the login page
2. `login()` in `auth.actions.ts`:
   a. Queries `app_users` for a row where `username = submittedUsername`
   b. If not found → returns `{ error: "invalid" }`
   c. If found → calls `supabase.auth.signInWithPassword({ email: row.email, password })`
   d. If Supabase Auth rejects → returns `{ error: "invalid" }`
   e. On success → `redirect("/masters/materials")`
3. Supabase Auth writes the session to an HTTP-only cookie

### Middleware (`src/middleware.ts`)

Runs on every request before the page renders:

1. Creates a Supabase server client that reads and writes session cookies
2. Calls `supabase.auth.getUser()` to refresh the session (extends expiry)
3. If the user is **not authenticated** and is requesting a dashboard route → `redirect("/login")`
4. If the user **is authenticated** and is requesting `/login` → `redirect("/masters/materials")`

The matcher in `middleware.ts` explicitly excludes `/_next/`, `/static/`, and image files so middleware doesn't run on asset requests.

---

## 8. Financial Year System

Indian financial year runs **April 1 – March 31**. This affects PO numbering, invoice numbering, and all reporting.

### `getCurrentFinancialYear()`

Returns a string like `"2025-26"`:
- If today is between April 1, 2025 and March 31, 2026 → `"2025-26"`
- If today is between April 1, 2026 and March 31, 2027 → `"2026-27"`

### `getFinancialYearRange(fy: string)`

Returns `{ start: Date, end: Date }` for use in SQL `WHERE` clauses:
```ts
getFinancialYearRange("2025-26")
// → { start: 2025-04-01, end: 2026-03-31 }
```

### `FYProvider` Context

Wraps `(dashboard)/layout.tsx`. Provides the current FY string to all dashboard pages via `useFY()` hook. The FY banner in the sidebar allows switching to view historical data — this changes the FY in context without changing the system clock.

### PO Number Scoping

PO numbers are plain integers that reset to 1 at the start of each FY. The DB enforces `UNIQUE(po_number, financial_year)`. **Never use a global SERIAL for PO numbers** — that would never reset.

---

## 9. How to Run the Project

**Prerequisites**: Node.js 18+, a Supabase project with the schema applied.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.local.example .env.local
# Fill in:
#   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# 3. Start dev server
npm run dev
# → http://localhost:3000

# 4. Login
# Username: mithun
# Password: (set in Supabase Auth for the mapped email)
```

**After schema changes**: Always update `src/lib/db/schema.ts` to match the Supabase DB. Then run `npm run db:generate` (if using Drizzle migrations) or apply the SQL directly via Supabase MCP and update the schema file manually.
