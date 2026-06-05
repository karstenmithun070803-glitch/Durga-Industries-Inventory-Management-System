# Phase 1 — Inventory

> Read-only audit of Durga Industries IMS. All claims cite file:line from the actual source.

---

## a. Project Structure

Root: `durga-ims/`

```
durga-ims/
├── CORE_RULES.md              — authoritative business rules document
├── drizzle.config.ts          — Drizzle Kit config (schema + migration paths)
├── next.config.mjs            — Next.js config (ESLint disabled on build)
├── package.json               — dependencies
├── tsconfig.json              — TypeScript config (strict: true)
├── tailwind.config.ts
├── components.json            — shadcn config
├── .env.local.example         — env var template
├── .env.local                 — live credentials (NOT committed; present on disk)
├── drizzle/
│   └── migrations/
│       ├── 0000_clumsy_jubilee.sql   — only migration file (232 lines)
│       └── meta/
│           ├── 0000_snapshot.json
│           └── _journal.json
├── docs/
│   ├── 01-architecture.md
│   ├── 02-masters-module.md
│   ├── 03-purchase-orders-module.md
│   ├── 04-material-issues-module.md
│   ├── 05-invoice-module.md
│   ├── 06-stock-dashboard-reports-module.md
│   ├── 09-uat-guide.md
│   ├── archive/               — deprecated docs
│   └── domain-notes/
└── src/
    ├── app/
    │   ├── layout.tsx
    │   ├── (auth)/login/page.tsx
    │   └── (dashboard)/
    │       ├── layout.tsx
    │       ├── page.tsx                           — dashboard home
    │       ├── invoice/                           — invoice CRUD (4 pages)
    │       ├── masters/                           — 7 master screens
    │       ├── reports/                           — report hub + 3 sub-reports
    │       ├── settings/
    │       ├── stock/
    │       └── transactions/
    │           ├── material-issues/               — 4 pages
    │           └── purchase-orders/               — 4 pages
    ├── components/
    │   ├── ui/                — 15 shadcn primitives
    │   ├── forms/TransactionGrid.tsx
    │   ├── masters/master-layout.tsx
    │   ├── pdf/               — 9 React-PDF templates
    │   ├── auth-session-guard.tsx
    │   ├── fy-banner.tsx
    │   ├── job-cost-panel.tsx
    │   └── sidebar.tsx
    ├── lib/
    │   ├── actions/           — 15 "use server" action files (~80 exported functions)
    │   ├── db/
    │   │   ├── schema.ts      — Drizzle schema, 481 lines, 17 tables + relations
    │   │   └── index.ts
    │   ├── supabase/
    │   │   ├── client.ts
    │   │   └── server.ts
    │   ├── utils/number-to-words.ts
    │   ├── constants.ts
    │   ├── financial-year.tsx
    │   ├── fy.ts              — pure FY utility functions
    │   └── utils.ts
    ├── types/index.ts
    └── middleware.ts
```

**Counts:** 107 files in `src/`, 15 server action files, 9 PDF components, 22 pages, 15 shadcn UI primitives.

---

## b. Tech Stack (from `package.json` and config files)

| Layer | Technology | Version | Source |
|-------|-----------|---------|--------|
| Framework | Next.js (App Router) | 14.2.35 | `package.json` |
| Language | TypeScript | ^5 | `package.json`, `tsconfig.json:7` (`strict: true`) |
| Runtime | React | ^18 | `package.json` |
| Database engine | PostgreSQL (via Supabase) | managed | `drizzle.config.ts:7` |
| ORM | Drizzle ORM | ^0.45.2 | `package.json` |
| DB client | postgres | ^3.4.9 | `package.json` |
| Auth | @supabase/ssr + @supabase/supabase-js | 0.10.3 / 2.106.0 | `package.json` |
| Styling | Tailwind CSS | ^3.4.1 | `package.json` |
| UI components | shadcn / @base-ui/react | 4.7.0 / ^1.5.0 | `package.json`, `components.json` |
| Icons | lucide-react | ^1.16.0 | `package.json` |
| PDF export | @react-pdf/renderer | ^4.5.1 | `package.json` |
| Toasts | sonner | ^2.0.7 | `package.json` |
| Theming | next-themes | ^0.4.6 | `package.json` |
| Command palette | cmdk | ^1.1.1 | `package.json` |
| Migration tool | drizzle-kit (dev) | ^0.31.10 | `package.json` |
| Build | Next.js build | — | `package.json:scripts` |
| Deployment target | Vercel / any Node host (unspecified) | — | `README.md` |

**Testing libraries installed:** None. No jest, vitest, playwright, @testing-library, or similar in `package.json`.

**ESLint note:** `next.config.mjs:3–5` sets `eslint.ignoreDuringBuilds: true`. Linting is silently skipped on production builds.

---

## c. Database Schema

**Source of truth:** `src/lib/db/schema.ts` (481 lines).
**Migration file:** `drizzle/migrations/0000_clumsy_jubilee.sql` (232 lines).
**Discrepancy:** The migration predates Phase 7 additions. `schema.ts` has ~21 columns and 2 tables not in the migration. See `questions.md` for the full diff.

### Shared column helpers (`schema.ts:20–32`)

`timestamps` — `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()` (auto-updated via `$onUpdate`)
`softDelete` — `is_active boolean NOT NULL DEFAULT true`

---

### Table 1: `customers` (`schema.ts:38–50`)

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `customer_no` | serial | NO | auto-increment | UNIQUE |
| `customer_name` | text | NO | — | NOT NULL |
| `address_1` | text | YES | — | — |
| `address_2` | text | YES | — | — |
| `street` | text | YES | — | — |
| `city` | text | YES | — | — |
| `state` | text | YES | — | — |
| `gstin` | text | YES | — | — |
| `is_active` | boolean | NO | `true` | NOT NULL |
| `created_at` | timestamptz | NO | `now()` | NOT NULL |
| `updated_at` | timestamptz | NO | `now()` | NOT NULL |

FK referencing: `vehicles.customer_id`, `material_issues` (via vehicles join).

---

### Table 2: `contractors` (`schema.ts:52–60`)

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `code_no` | serial | NO | auto | UNIQUE |
| `name` | text | NO | — | NOT NULL |
| `role` | text | YES | — | — |
| `contact` | text | YES | — | — |
| `is_active` | boolean | NO | `true` | NOT NULL |
| `created_at` | timestamptz | NO | `now()` | NOT NULL |
| `updated_at` | timestamptz | NO | `now()` | NOT NULL |

FK referencing: `material_issue_items.contractor_id`.

---

### Table 3: `suppliers` (`schema.ts:62–73`)

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `code_no` | serial | NO | auto | UNIQUE |
| `name` | text | NO | — | NOT NULL |
| `tin_no` | text | YES | — | — |
| `cst_no` | text | YES | — | — |
| `gstin` | text | YES | — | — |
| `address` | text | YES | — | — |
| `state` | text | YES | — | — |
| `is_active` | boolean | NO | `true` | NOT NULL |
| `created_at` | timestamptz | NO | `now()` | NOT NULL |
| `updated_at` | timestamptz | NO | `now()` | NOT NULL |

FK referencing: `purchase_orders.supplier_id`, `purchase_order_items.supplier_id`.

---

### Table 4: `tax_rates` (`schema.ts:75–83`)

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `vat_code` | serial | NO | auto | UNIQUE |
| `tax_percentage` | numeric(5,2) | NO | — | NOT NULL |
| `description` | text | NO | — | NOT NULL |
| `inv_prefix` | text | YES | — | — |
| `is_active` | boolean | NO | `true` | NOT NULL |
| `created_at` | timestamptz | NO | `now()` | NOT NULL |
| `updated_at` | timestamptz | NO | `now()` | NOT NULL |

`inv_prefix` drives bill number format (e.g. "D" → "D-00001"). FK referencing: `materials.tax_rate_id`.

---

### Table 5: `units` (`schema.ts:85–91`)

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `unit_code` | serial | NO | auto | UNIQUE |
| `unit_name` | text | NO | — | NOT NULL |
| `is_active` | boolean | NO | `true` | NOT NULL |
| `created_at` | timestamptz | NO | `now()` | NOT NULL |
| `updated_at` | timestamptz | NO | `now()` | NOT NULL |

FK referencing: `materials.purchase_unit_id`, `materials.sales_unit_id`, `purchase_order_items.unit_id`, `material_issue_items.unit_id`, `invoice_items.unit_id`.

---

### Table 6: `materials` (`schema.ts:93–114`)

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `material_no` | serial | NO | auto | UNIQUE |
| `name` | text | NO | — | NOT NULL |
| `hsn_code` | text | YES | — | — |
| `tax_rate_id` | uuid | YES | — | FK → `tax_rates.id` |
| `purchase_unit_id` | uuid | YES | — | FK → `units.id` |
| `sales_unit_id` | uuid | YES | — | FK → `units.id` |
| `conversion_value` | numeric(10,4) | YES | `1` | — |
| `opening_stock` | numeric(12,4) | NO | `0` | NOT NULL |
| `current_stock` | numeric(12,4) | NO | `0` | NOT NULL, CHECK `current_stock >= 0` |
| `min_level` | numeric(12,4) | YES | `0` | — |
| `max_level` | numeric(12,4) | YES | — | — |
| `is_active` | boolean | NO | `true` | NOT NULL |
| `created_at` | timestamptz | NO | `now()` | NOT NULL |
| `updated_at` | timestamptz | NO | `now()` | NOT NULL |

**CHECK constraint** (`schema.ts:112`): `current_stock_non_negative` — `current_stock >= 0`.

---

### Table 7: `vehicles` (`schema.ts:116–125`)

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `job_ref_no` | text | NO | — | UNIQUE, NOT NULL |
| `vehicle_name` | text | NO | — | NOT NULL |
| `type` | text | NO | `'New'` | NOT NULL |
| `customer_id` | uuid | YES | — | FK → `customers.id` |
| `is_active` | boolean | NO | `true` | NOT NULL |
| `created_at` | timestamptz | NO | `now()` | NOT NULL |
| `updated_at` | timestamptz | NO | `now()` | NOT NULL |

`type` comment (`schema.ts:120`): `'New'` = new chassis + new body; `'Old'` = old chassis + new body.
**Note:** Migration SQL defines `job_ref_no` as `serial`; `schema.ts:118` defines it as `text`. See `questions.md`.

---

### Table 8: `app_users` (`schema.ts:128–135`)

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `username` | text | NO | — | UNIQUE, NOT NULL |
| `supabase_auth_id` | uuid | YES | — | UNIQUE |
| `display_name` | text | YES | — | — |
| `created_at` | timestamptz | NO | `now()` | NOT NULL |
| `updated_at` | timestamptz | NO | `now()` | NOT NULL |

Comment (`schema.ts:127`): maps a username to a Supabase auth email (`username@durgaindustries.internal`).
No `is_active` / soft delete on this table.

---

### Table 9: `purchase_orders` (`schema.ts:141–160`)

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `po_number` | integer | NO | — | NOT NULL; part of UNIQUE `po_number_fy_unique` |
| `po_date` | timestamptz | NO | `now()` | NOT NULL |
| `supplier_id` | uuid | YES | — | FK → `suppliers.id` |
| `total_amount` | numeric(14,2) | NO | `0` | NOT NULL |
| `status` | text | NO | `'Draft'` | NOT NULL |
| `financial_year` | text | NO | — | NOT NULL; part of UNIQUE `po_number_fy_unique` |
| `affects_stock` | boolean | NO | `true` | NOT NULL |
| `supplier_bill_no` | text | YES | — | — |
| `supplier_bill_date` | date | YES | — | — |
| `created_at` | timestamptz | NO | `now()` | NOT NULL |
| `updated_at` | timestamptz | NO | `now()` | NOT NULL |

UNIQUE (`schema.ts:159`): `po_number_fy_unique` on `(po_number, financial_year)` — PO numbers reset per FY.
Comment (`schema.ts:143`): `po_number` is `integer` not `serial`; backend calculates next number via `MAX + 1`.
`affects_stock=false` (`schema.ts:152`): receiving does not update warehouse stock.

---

### Table 10: `purchase_order_items` (`schema.ts:162–184`)

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `po_id` | uuid | NO | — | NOT NULL, FK → `purchase_orders.id` ON DELETE CASCADE |
| `material_id` | uuid | NO | — | NOT NULL, FK → `materials.id` |
| `qty` | numeric(12,4) | NO | — | NOT NULL |
| `unit_id` | uuid | YES | — | FK → `units.id` |
| `rate` | numeric(12,4) | NO | `0` | NOT NULL |
| `tax_percentage` | numeric(5,2) | NO | `0` | NOT NULL |
| `cgst_amount` | numeric(12,2) | NO | `0` | NOT NULL |
| `sgst_amount` | numeric(12,2) | NO | `0` | NOT NULL |
| `igst_amount` | numeric(12,2) | NO | `0` | NOT NULL |
| `amount` | numeric(14,2) | NO | `0` | NOT NULL |
| `supplier_id` | uuid | YES | — | FK → `suppliers.id` |
| `gst_type` | text | YES | — | — (`"CGST_SGST"` or `"IGST"`) |
| `created_at` | timestamptz | NO | `now()` | NOT NULL |
| `updated_at` | timestamptz | NO | `now()` | NOT NULL |

Comment (`schema.ts:173`): `tax_percentage` frozen at entry time — survives future tax rate changes.
Comment (`schema.ts:181`): `gst_type` frozen at entry time for historical integrity.

---

### Table 11: `material_issues` (`schema.ts:186–202`)

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `slip_number` | integer | NO | — | NOT NULL; part of UNIQUE `slip_number_fy_unique` |
| `issue_date` | timestamptz | NO | `now()` | NOT NULL |
| `vehicle_id` | uuid | NO | — | NOT NULL, FK → `vehicles.id` |
| `margin_percentage` | numeric(5,2) | YES | `0` | — |
| `total_amount` | numeric(14,2) | NO | `0` | NOT NULL |
| `financial_year` | text | NO | — | NOT NULL; part of UNIQUE `slip_number_fy_unique` |
| `status` | text | NO | `'Draft'` | NOT NULL |
| `created_at` | timestamptz | NO | `now()` | NOT NULL |
| `updated_at` | timestamptz | NO | `now()` | NOT NULL |

UNIQUE (`schema.ts:201`): `slip_number_fy_unique` on `(slip_number, financial_year)`.

---

### Table 12: `material_issue_items` (`schema.ts:204–228`)

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `issue_id` | uuid | NO | — | NOT NULL, FK → `material_issues.id` ON DELETE CASCADE |
| `material_id` | uuid | NO | — | NOT NULL, FK → `materials.id` |
| `hsn_code` | text | YES | — | — |
| `qty` | numeric(12,4) | NO | — | NOT NULL |
| `unit_id` | uuid | YES | — | FK → `units.id` |
| `rate` | numeric(12,4) | NO | `0` | NOT NULL |
| `tax_percentage` | numeric(5,2) | NO | `0` | NOT NULL |
| `cgst_amount` | numeric(12,2) | NO | `0` | NOT NULL |
| `sgst_amount` | numeric(12,2) | NO | `0` | NOT NULL |
| `igst_amount` | numeric(12,2) | NO | `0` | NOT NULL |
| `amount` | numeric(14,2) | NO | `0` | NOT NULL |
| `contractor_id` | uuid | YES | — | FK → `contractors.id` (optional per-line) |
| `affects_inventory` | boolean | NO | `true` | NOT NULL |
| `gst_type` | text | YES | — | — (`"CGST_SGST"` or `"IGST"`) |
| `created_at` | timestamptz | NO | `now()` | NOT NULL |
| `updated_at` | timestamptz | NO | `now()` | NOT NULL |

Comment (`schema.ts:223`): `affects_inventory = false` → pass-through / service item, no stock movement.

---

### Table 13: `invoices` (`schema.ts:230–262`)

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `bill_number` | text | NO | — | NOT NULL; part of UNIQUE `bill_number_fy_unique` |
| `bill_date` | timestamptz | NO | `now()` | NOT NULL |
| `rate_date` | timestamptz | YES | — | — |
| `tax_percentage` | numeric(5,2) | YES | `0` | — |
| `material_margin` | numeric(5,2) | YES | `0` | — |
| `discount` | numeric(14,2) | YES | `0` | — |
| `vehicle_id` | uuid | NO | — | NOT NULL, FK → `vehicles.id` |
| `net_amount` | numeric(14,2) | NO | `0` | NOT NULL |
| `rev_charge_status` | boolean | NO | `false` | NOT NULL |
| `financial_year` | text | NO | — | NOT NULL; part of UNIQUE `bill_number_fy_unique` |
| `status` | text | NO | `'Draft'` | NOT NULL |
| `customer_name` | text | YES | — | snapshot |
| `customer_gstin` | text | YES | — | snapshot |
| `customer_state` | text | YES | — | snapshot |
| `customer_address` | text | YES | — | snapshot |
| `payment_status` | text | NO | `'Unpaid'` | NOT NULL |
| `payment_date` | date | YES | — | — |
| `payment_notes` | text | YES | — | — |
| `cancelled_by` | text | YES | — | username of canceller |
| `cancelled_at` | timestamptz | YES | — | — |
| `created_at` | timestamptz | NO | `now()` | NOT NULL |
| `updated_at` | timestamptz | NO | `now()` | NOT NULL |

UNIQUE (`schema.ts:261`): `bill_number_fy_unique` on `(bill_number, financial_year)`.
Comment (`schema.ts:247`): customer snapshot fields frozen at invoice creation — survives master data changes.

---

### Table 14: `invoice_slip_links` (`schema.ts:264–271`)

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `invoice_id` | uuid | NO | — | NOT NULL, FK → `invoices.id` ON DELETE CASCADE |
| `slip_id` | uuid | NO | — | NOT NULL, FK → `material_issues.id` ON DELETE CASCADE |
| `created_at` | timestamptz | NO | `now()` | NOT NULL |

UNIQUE (`schema.ts:270`): `(invoice_id, slip_id)` — each slip linked to an invoice only once.
**Not in migration SQL** — added in a later phase; exists only in `schema.ts`.

---

### Table 15: `invoice_items` (`schema.ts:273–294`)

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `invoice_id` | uuid | NO | — | NOT NULL, FK → `invoices.id` ON DELETE CASCADE |
| `material_id` | uuid | NO | — | NOT NULL, FK → `materials.id` |
| `hsn_code` | text | YES | — | — |
| `qty` | numeric(12,4) | NO | — | NOT NULL |
| `unit_id` | uuid | YES | — | FK → `units.id` |
| `rate` | numeric(12,4) | NO | `0` | NOT NULL |
| `tax_percentage` | numeric(5,2) | NO | `0` | NOT NULL |
| `cgst_amount` | numeric(12,2) | NO | `0` | NOT NULL |
| `sgst_amount` | numeric(12,2) | NO | `0` | NOT NULL |
| `igst_amount` | numeric(12,2) | NO | `0` | NOT NULL |
| `amount` | numeric(14,2) | NO | `0` | NOT NULL |
| `gst_type` | text | YES | — | — |
| `created_at` | timestamptz | NO | `now()` | NOT NULL |
| `updated_at` | timestamptz | NO | `now()` | NOT NULL |

Comment (`schema.ts:285`): `tax_percentage` frozen — historical lock, survives future rate changes.

---

### Table 16: `company_settings` (`schema.ts:299–312`)

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `company_name` | text | NO | — | NOT NULL |
| `address` | text | YES | — | — |
| `gstin` | text | YES | — | — |
| `pan_no` | text | YES | — | — |
| `tan_no` | text | YES | — | — |
| `bank_name` | text | YES | — | — |
| `bank_account_no` | text | YES | — | — |
| `bank_ifsc` | text | YES | — | — |
| `bank_branch` | text | YES | — | — |
| `invoice_terms` | text | YES | — | — |
| `updated_at` | timestamptz | NO | `now()` | NOT NULL |

Singleton table — no `created_at`, no `is_active`. Upsert pattern: app reads existing ID, UPDATE if found, INSERT if not.
**Not in original migration SQL.**

---

### Table 17: `stock_ledger` (`schema.ts:323–337`)

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `material_id` | uuid | NO | — | NOT NULL, FK → `materials.id` |
| `transaction_type` | text | NO | — | NOT NULL (app-layer validated: `PO_INWARD`, `ISSUE`, `REVERSAL`, `ADJUSTMENT`) |
| `reference_id` | uuid | YES | — | FK to source document |
| `reference_type` | text | YES | — | `"purchase_order"` or `"material_issue"` |
| `qty_change` | numeric(12,4) | NO | — | NOT NULL (positive = added, negative = deducted) |
| `stock_after` | numeric(12,4) | NO | — | NOT NULL (running balance) |
| `reason` | text | YES | — | Required for ADJUSTMENT entries |
| `adjusted_by` | text | YES | — | Username; required for ADJUSTMENT |
| `created_at` | timestamptz | NO | `now()` | NOT NULL |

**No `updated_at`** — immutable by design (`schema.ts:336` comment: "this table is append-only").
Transaction types validated only in app layer, not a DB CHECK constraint (`schema.ts:317–322`).

---

### Constraint Summary

| Type | Count | Notable |
|------|-------|---------|
| Primary keys | 17 | All uuid + `gen_random_uuid()` |
| Unique constraints | 13 | Including 3 composite: `(po_number, fy)`, `(slip_number, fy)`, `(bill_number, fy)` |
| Foreign keys | ~20 | 3 with ON DELETE CASCADE (items → header) |
| CHECK | 1 | `current_stock >= 0` on `materials` |
| No DB-level enum/domain | — | Status fields are unconstrained `text` |

---

## d. API Surface

**There are no HTTP API routes** (`/api/` folder does not exist). All mutations and reads use **Next.js Server Actions** (`"use server"` directive). Client components call server functions directly over the React Server Components protocol.

### Auth actions — `src/lib/actions/auth.actions.ts`

| Function | Description | Auth required |
|----------|-------------|---------------|
| `login(formData)` | Maps username → `username@durgaindustries.internal`, signs in via Supabase | No |
| `logout()` | Signs out from Supabase | Yes |

### Purchase Order actions — `src/lib/actions/purchase-orders.actions.ts`

| Function | Description | Writes |
|----------|-------------|--------|
| `getPurchaseOrders(fy)` | List all PO line items for FY | — |
| `getPurchaseOrderById(id)` | Single PO with items | — |
| `getActiveSuppliers()` | Dropdown data | — |
| `getActiveMaterials()` | Dropdown data | — |
| `getActiveUnits()` | Dropdown data | — |
| `getLastMaterialRate(materialId)` | Last rate from received POs | — |
| `createPurchaseOrder(data)` | Create Draft PO | `purchase_orders`, `purchase_order_items` |
| `updatePurchaseOrder(id, data)` | Update Draft PO | `purchase_orders`, `purchase_order_items` |
| `receivePurchaseOrder(id)` | Draft → Received; stock + ledger | `purchase_orders`, `materials`, `stock_ledger` |
| `updateReceivedPurchaseOrder(id, data)` | Edit received PO; reverse + reapply | `purchase_orders`, `purchase_order_items`, `materials`, `stock_ledger` |
| `deletePurchaseOrder(id)` | Delete PO; reverse stock if received | `purchase_orders`, `materials`, `stock_ledger` |

### Material Issue actions — `src/lib/actions/material-issues.actions.ts`

| Function | Description | Writes |
|----------|-------------|--------|
| `getMaterialIssues(fy)` | List all MI slips for FY | — |
| `getMaterialIssueById(id)` | Single MI with items | — |
| `getActiveVehicles()` | Dropdown with customer snapshot | — |
| `getActiveContractors()` | Dropdown | — |
| `getActiveIssueMaterials()` | Materials with stock + tax% | — |
| `getActiveSalesUnits()` | Unit dropdown | — |
| `getLastMaterialRate(materialId)` | Last PO rate | — |
| `peekNextSlipNumber(fy)` | Next slip number without saving | — |
| `createMaterialIssue(data)` | Create Draft MI | `material_issues`, `material_issue_items` |
| `updateMaterialIssue(id, data)` | Update Draft MI | `material_issues`, `material_issue_items` |
| `issueMaterialIssue(id)` | Draft → Issued; stock deduction | `material_issues`, `materials`, `stock_ledger` |
| `updateIssuedMaterialIssue(id, data)` | Edit issued MI; reverse + reapply | `material_issues`, `material_issue_items`, `materials`, `stock_ledger` |
| `deleteMaterialIssue(id)` | Delete MI; stock reversal if issued | `material_issues`, `materials`, `stock_ledger` |

### Invoice actions — `src/lib/actions/invoices.actions.ts`

| Function | Description | Writes |
|----------|-------------|--------|
| `getInvoices(fy)` | List invoices (non-cancelled) | — |
| `getInvoiceById(id)` | Single invoice with items | — |
| `getActiveVehiclesForInvoice()` | Dropdown | — |
| `getIssuedMIsForVehicle(vehicleId, ?)` | Available MI slips for linking | — |
| `getMIItemsForInvoice(issueId)` | Items from a specific MI | — |
| `getAllIssuedMIItemsForVehicle(...)` | Grouped MI items for preview | — |
| `getActiveTaxRatesWithPrefix()` | Tax rates with prefixes | — |
| `getActiveInvoiceMaterials()` | Materials with HSN + tax | — |
| `peekNextBillNumber(prefix, fy)` | Next bill number preview | — |
| `createInvoice(data)` | Create Draft invoice | `invoices`, `invoice_items`, `invoice_slip_links` |
| `updateInvoice(id, data)` | Update Draft invoice | `invoices`, `invoice_items`, `invoice_slip_links` |
| `finalizeInvoice(id)` | Draft → Finalized | `invoices`, `invoice_slip_links` |
| `updateFinalizedInvoice(id, data)` | Update payment fields only | `invoices` |
| `cancelInvoice(id, reason)` | → Cancelled; records username + timestamp | `invoices` |
| `deleteInvoice(id)` | Delete Draft invoice | `invoices`, `invoice_items`, `invoice_slip_links` |

### Stock actions — `src/lib/actions/stock.actions.ts`

| Function | Description | Writes |
|----------|-------------|--------|
| `getStockDashboardMaterials()` | All active materials + PO rates + summary | — |
| `getStockMovementHistory(materialId, limit)` | Ledger entries with labels | — |
| `adjustStock(materialId, newQty, reason)` | Manual stock correction | `materials`, `stock_ledger` |
| `getStockForMaterial(materialId)` | Lightweight single-row fetch | — |
| `getVehiclesForJobSearch()` | Vehicle dropdown | — |
| `getJobCostData(vehicleId)` | Aggregate issued MI items for job | — |

### Report actions — `src/lib/actions/reports.actions.ts`

| Function | Description |
|----------|-------------|
| `getInvoiceSummaryReport(fy, dateFrom, dateTo, customerFilter)` | Invoice aggregations by status/payment/tax type; IST date range |
| `getPurchaseReport(fy, dateFrom, dateTo, supplierFilter)` | PO aggregations by supplier/material |
| `getMonthlyStockReport(fromDate, toDate)` | Stock beginning/ending by month |

### Other master actions (CRUD pattern, `src/lib/actions/`)

`customers.actions.ts`, `suppliers.actions.ts`, `contractors.actions.ts`, `materials.actions.ts`, `units.actions.ts`, `tax.actions.ts`, `vehicles.actions.ts`, `settings.actions.ts`, `dashboard.actions.ts` — standard list/create/update/soft-delete/reactivate patterns.

**Authentication required:** All server actions run server-side; Supabase session is implicitly required via `middleware.ts` (unauthenticated requests are redirected before reaching the page). No per-action explicit session check except `adjustStock` and `cancelInvoice` which also extract the username from the session.

---

## e. User-Facing Screens

All pages are Next.js App Router Server Components under `src/app/`.

| Route | File | Purpose |
|-------|------|---------|
| `/login` | `(auth)/login/page.tsx` | Username / password login |
| `/` | `(dashboard)/page.tsx` | Dashboard: recent POs, MIs, invoices, low-stock summary |
| `/masters/customers` | `masters/customers/page.tsx` | Customer master CRUD |
| `/masters/suppliers` | `masters/suppliers/page.tsx` | Supplier master CRUD |
| `/masters/contractors` | `masters/contractors/page.tsx` | Contractor master CRUD |
| `/masters/materials` | `masters/materials/page.tsx` | Material master; stock levels, HSN, tax rate |
| `/masters/units` | `masters/units/page.tsx` | Unit of measure CRUD |
| `/masters/tax` | `masters/tax/page.tsx` | Tax rate CRUD (VAT code, %, invoice prefix) |
| `/masters/vehicles` | `masters/vehicles/page.tsx` | Vehicle/job register CRUD |
| `/transactions/purchase-orders` | `transactions/purchase-orders/page.tsx` | PO list by FY |
| `/transactions/purchase-orders/new` | `transactions/purchase-orders/new/page.tsx` | Create PO |
| `/transactions/purchase-orders/[id]/view` | `…/[id]/view/page.tsx` | View received PO (read-only) |
| `/transactions/purchase-orders/[id]/edit` | `…/[id]/edit/page.tsx` | Edit draft or received PO |
| `/transactions/material-issues` | `transactions/material-issues/page.tsx` | MI slip list by FY |
| `/transactions/material-issues/new` | `…/new/page.tsx` | Create MI slip |
| `/transactions/material-issues/[id]/view` | `…/[id]/view/page.tsx` | View issued slip (read-only) |
| `/transactions/material-issues/[id]/edit` | `…/[id]/edit/page.tsx` | Edit draft or issued slip |
| `/invoice` | `invoice/page.tsx` | Invoice list by FY |
| `/invoice/new` | `invoice/new/page.tsx` | Create invoice, link MI slips |
| `/invoice/[id]/view` | `invoice/[id]/view/page.tsx` | View finalized invoice |
| `/invoice/[id]/edit` | `invoice/[id]/edit/page.tsx` | Edit draft invoice or update payment |
| `/stock` | `stock/page.tsx` | Stock dashboard, manual adjustment, job cost panel |
| `/reports` | `reports/page.tsx` | Invoice summary, purchase report, monthly stock report |
| `/settings` | `settings/page.tsx` | Company info (name, GSTIN, PAN, bank details, invoice terms) |

**Total:** 24 distinct routes (1 auth + 23 dashboard).

---

## f. Business Rules (from code)

All rules cite their enforcement location(s).

### Stock triggers (from `CORE_RULES.md:12–23`, enforced in action files)

| # | Rule | Enforcement |
|---|------|-------------|
| BR-1 | `current_stock += qty` per line item when PO `Draft → Received` (only if `affects_stock = true`) | `purchase-orders.actions.ts:359–383` |
| BR-2 | `current_stock -= qty` per line item when MI `Draft → Issued` (only if `affects_inventory = true` per item) | `material-issues.actions.ts:503–521` |
| BR-3 | Manual ADJUSTMENT via Stock Dashboard; requires `reason ≥ 10 chars` and records username | `stock.actions.ts:257–309` |
| BR-4 | Every stock change writes an immutable `stock_ledger` row | All stock-touching action functions |
| BR-5 | Stock ledger rows are never updated or deleted (no `updated_at`, append-only design) | `schema.ts:336` comment |

### Edit & delete rollback rules (`CORE_RULES.md:26–31`, `purchase-orders.actions.ts:392–480`, `material-issues.actions.ts:531–634`)

| # | Rule | Enforcement |
|---|------|-------------|
| BR-6 | Editing a Received PO: reverse old stock (REVERSAL ledger rows), then reapply new stock (PO_INWARD rows), inside a single DB transaction | `purchase-orders.actions.ts:394` (`db.transaction`) |
| BR-7 | Editing an Issued MI slip: reverse old stock, replace items, check availability, reapply new stock, all in one transaction | `material-issues.actions.ts:548` (`db.transaction`) |
| BR-8 | Deleting a Received PO: pre-check that reversal won't go negative; then atomic reversal + delete | `purchase-orders.actions.ts:501–555` |
| BR-9 | Deleting an Issued MI slip: blocked if slip is already linked to any finalized invoice | `material-issues.actions.ts:653–663` |

### Hard blocks (`CORE_RULES.md:35–40`)

| # | Rule | Enforcement |
|---|------|-------------|
| BR-10 | `current_stock` cannot go below 0 | DB CHECK `schema.ts:112`; app pre-check in `issueMaterialIssue` at line 495 |
| BR-11 | Stock adjustment cannot set negative quantity | `stock.actions.ts:257` |
| BR-12 | Document dates must fall within the active financial year | `material-issues.actions.ts:403`, `invoices.actions.ts` |
| BR-13 | Deleting a received PO is blocked if stock reversal would go negative | `purchase-orders.actions.ts:512–519` |
| BR-14 | Deleting an issued MI is blocked if used in a finalized invoice | `material-issues.actions.ts:653–663` |

### Validation rules (from action files)

| # | Rule | Enforcement |
|---|------|-------------|
| BR-15 | PO must have ≥1 item; all items must have a supplier | `purchase-orders.actions.ts:225–228` |
| BR-16 | PO duplicate check: same `(material_id, supplier_id, rate)` blocked | `purchase-orders.actions.ts:229–235` |
| BR-17 | Zero-rate items require explicit checkbox confirmation | `purchase-orders.actions.ts:237–240` |
| BR-18 | MI slip: vehicle required, ≥1 item, qty > 0 | `material-issues.actions.ts:398–404` |
| BR-19 | MI slip duplicate check: same `(material_id, contractor_id, rate)` blocked | `material-issues.actions.ts:79–84` |
| BR-20 | Material deactivation blocked if `current_stock > 0` | `materials.actions.ts` |
| BR-21 | Material deactivation blocked if used in any Draft MI slip | `materials.actions.ts` |

### Financial year rules (`src/lib/fy.ts:3–6`)

| # | Rule | Enforcement |
|---|------|-------------|
| BR-22 | FY = April 1 to March 31; `getMonth() >= 3` means current calendar year is FY start | `fy.ts:5` |
| BR-23 | FY date range uses explicit IST offset `+05:30` | `fy.ts:12–15` |
| BR-24 | Transaction numbers (PO, MI, invoice) reset to 1 each FY; `MAX + 1` pattern | `purchase-orders.actions.ts:200–205`, `material-issues.actions.ts:57–63` |

### GST rules (`CORE_RULES.md:43–52`)

| # | Rule | Enforcement |
|---|------|-------------|
| BR-25 | GST type determined by GSTIN first 2 digits: `"33"` → intra-state (CGST+SGST); else → inter-state (IGST) | Frontend forms (calculation); `gst_type` frozen in DB at save |
| BR-26 | Tax amounts (cgst/sgst/igst) are pre-calculated on frontend, stored frozen; survive future rate changes | `schema.ts:173–177`, `schema.ts:285–290` comments |
| BR-27 | Round GST at line-item level; grand total = sum of rounded line totals; never round the grand total | `CORE_RULES.md:49–52` (enforced by frontend calculation) |

### Invoice state machine

| Status | Transitions | Enforcement |
|--------|-------------|-------------|
| `Draft` | → `Finalized` via `finalizeInvoice` | `invoices.actions.ts` |
| `Finalized` | → `Cancelled` via `cancelInvoice`; payment fields updatable | `invoices.actions.ts` |
| `Cancelled` | Terminal state; `cancelled_by` and `cancelled_at` recorded | `schema.ts:257–258` |

**Rule enforced only on frontend (risk):** GST type calculation (CGST/SGST vs IGST) is computed in the form UI and passed as pre-calculated amounts to the server action. The server action stores the values as-is without re-validating the split. See `questions.md`.

---

## g. Existing Tests

**Result: None.**

| Check | Result |
|-------|--------|
| Test files (`*.test.ts`, `*.spec.ts`, `*.test.tsx`, `*.spec.tsx`) | 0 found |
| Test runner config (`jest.config.*`, `vitest.config.*`, `playwright.config.*`) | 0 found |
| Test dependencies in `package.json` | 0 (no jest, vitest, playwright, @testing-library, etc.) |
| `/tests/` or `__tests__/` folder | Not present before this audit |
| Test scripts in `package.json:scripts` | Only `dev`, `build`, `start`, `lint` |
| UAT guide | `docs/09-uat-guide.md` exists — manual testing checklist only |

**Test coverage: 0%.** All quality assurance to date has been manual.
