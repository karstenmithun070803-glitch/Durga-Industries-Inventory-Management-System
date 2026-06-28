# Durga Industries IMS — Complete Engineering Knowledge Base

> **Purpose:** Reverse-engineered architecture document. Foundation for all future engineering, testing, debugging, and optimisation work. No code was modified to produce this document.

---

## 1. Executive Summary

**durga-ims** is a production inventory management system built for Durga Industries, a heavy vehicle / construction business in Tamil Nadu, India. The system manages the full procurement-to-invoicing cycle: purchasing raw materials, issuing them against vehicle jobs, and generating GST-compliant customer invoices and insurance bills.

The application is a **Next.js 14 (App Router)** full-stack web app backed by **Supabase PostgreSQL**, using **Drizzle ORM** for type-safe database access and **Server Actions** as the exclusive API layer. There is no REST or GraphQL API — all data mutations flow through Next.js server actions. PDF generation uses `@react-pdf/renderer` client-side. Spreadsheet exports use `xlsx`.

The codebase is a single monorepo app (`durga-ims`). There is no separate backend service.

---

## 2. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 14.2.35 |
| Language | TypeScript | 5.x |
| Database | PostgreSQL via Supabase | — |
| ORM | Drizzle ORM | 0.45.2 |
| Auth | Supabase Auth + SSR | 0.10.3 |
| UI Components | shadcn/ui + @base-ui/react | custom |
| Styling | Tailwind CSS | 3.4.x |
| PDF | @react-pdf/renderer | 4.5.1 |
| Toast | sonner | 2.0.7 |
| Keyboard | react-hotkeys-hook | 5.3.2 |
| Spreadsheet Export | xlsx | 0.18.5 |
| Command Palette | cmdk | 1.1.1 |
| Theme | next-themes | 0.4.6 |

---

## 3. Project Structure Overview

```
src/
├── app/
│   ├── (auth)/login/                   # Unauthenticated route group
│   ├── (dashboard)/                    # Protected route group
│   │   ├── layout.tsx                  # Dashboard shell (FYProvider, AuthGuard, KeepAlive)
│   │   ├── page.tsx                    # Home / dashboard KPIs
│   │   ├── invoice/                    # Invoice management
│   │   ├── masters/                    # 8 master data modules
│   │   │   ├── customers/
│   │   │   ├── suppliers/
│   │   │   ├── materials/
│   │   │   ├── vehicles/
│   │   │   ├── contractors/
│   │   │   ├── stages/
│   │   │   ├── units/
│   │   │   └── tax/
│   │   ├── transactions/
│   │   │   ├── purchase-orders/
│   │   │   └── material-issues/
│   │   ├── stock/
│   │   ├── reports/
│   │   └── settings/
│   ├── api/ping/                       # Keep-alive health check
│   └── layout.tsx                      # Root layout (font, toaster, web vitals)
├── components/
│   ├── auth-session-guard.tsx          # Supabase auth state listener
│   ├── keep-alive-heartbeat.tsx        # Pings /api/ping every 25s
│   ├── fy-banner.tsx                   # Historical FY warning banner
│   ├── sidebar.tsx                     # Main nav with keyboard shortcuts
│   ├── job-cost-panel.tsx              # Job cost analytics widget
│   ├── forms/
│   │   ├── TransactionGrid.tsx         # Shared line-item grid (PO/MI/Invoice)
│   │   └── CloneVehicleDialog.tsx      # Clone vehicle + issue slip
│   ├── masters/
│   │   ├── master-layout.tsx           # Two-column master form+table layout
│   │   ├── bulk-import-dialog.tsx      # Excel import (legacy)
│   │   └── generic-bulk-import-dialog.tsx
│   ├── pdf/                            # 11 PDF document components + styles
│   ├── skeletons/                      # Loading skeleton variants (6)
│   └── ui/                             # Base UI primitives
├── hooks/
│   ├── use-debounce.ts
│   ├── use-form-section-nav.ts         # Section-level keyboard nav for forms
│   ├── use-keyboard-grid.ts            # Cell-level nav for TransactionGrid
│   ├── use-list-keyboard-nav.ts        # Row-level nav for tables/stock
│   └── use-master-keyboard-nav.ts      # Hotkeys for master pages
├── lib/
│   ├── actions/                        # 15 server action files (all mutations + reads)
│   ├── db/
│   │   ├── schema.ts                   # Full Drizzle schema (21 tables)
│   │   └── index.ts                    # DB connection (postgres + drizzle)
│   ├── supabase/
│   │   ├── client.ts                   # Browser Supabase client
│   │   └── server.ts                   # Server Supabase client (cookie-based)
│   ├── utils/
│   │   ├── row-calc.ts                 # Tax/amount calculation per line item
│   │   ├── rows-reducer.ts             # useReducer for line items
│   │   ├── number-to-words.ts          # Amount in words (Indian locale)
│   │   └── insurance-pdf-adapter.ts    # Converts insurance bill to invoice row shape
│   ├── cache.ts                        # CACHE_TAGS constants
│   ├── constants.ts                    # Status enums, INDIAN_STATES, etc.
│   ├── fy.ts                           # FY date utilities (pure functions)
│   ├── financial-year.tsx              # React context + FYBanner component
│   └── utils.ts                        # cn(), formatCode(), validateGstinFormat(), etc.
├── middleware.ts                        # Route protection + session refresh
└── types/index.ts                      # All TypeScript types (DB + rich joined types)
```

---

## 4. Routing Architecture

### Route Groups
- `(auth)` — unauthenticated, only `/login`
- `(dashboard)` — all protected routes; wrapped in `AuthSessionGuard + FYProvider + KeepAliveHeartbeat`

### Full Route Inventory

| URL | Component | Data Fetched |
|---|---|---|
| `/login` | login/page.tsx | none (form POST) |
| `/` | (dashboard)/page.tsx | getDashboardStats, getActiveVehicles |
| `/masters/customers` | customers/page.tsx | getAllCustomers |
| `/masters/suppliers` | suppliers/page.tsx | getAllSuppliers |
| `/masters/materials` | materials/page.tsx | getAllMaterials, getAllTaxRates, getAllUnits |
| `/masters/vehicles` | vehicles/page.tsx | getAllVehicles, getCustomers |
| `/masters/contractors` | contractors/page.tsx | getAllContractors |
| `/masters/stages` | stages/page.tsx | getStagesWithMaterials, getActiveMaterials, getActiveUnits |
| `/masters/units` | units/page.tsx | getAllUnits |
| `/masters/tax` | tax/page.tsx | getAllTaxRates |
| `/transactions/purchase-orders` | purchase-orders/page.tsx | getPOs, getSuppliers, getMaterials, getUnits, getCompanySettings |
| `/transactions/material-issues` | material-issues/page.tsx | getMIs (OLD type), getVehicles, getMaterials, getUnits, getContractors |
| `/transactions/material-issues/new` | new/page.tsx | getMIs (NEW type), getStages, getStageMaterials |
| `/invoice` | invoice/page.tsx | getInvoices, getVehicles, getTaxRates, getMaterials, getUnits, getCompanySettings |
| `/invoice/[id]/view` | view/page.tsx | getInvoiceById |
| `/invoice/[id]/edit` | edit/page.tsx | getInvoiceById (editable) |
| `/stock` | stock/page.tsx | getStockDashboardMaterials |
| `/reports` | reports/page.tsx | all dropdowns (vehicles, suppliers, materials, customers, stages) |
| `/settings` | settings/page.tsx | getCompanySettings |

---

## 5. Authentication & Authorization

### Model
- **Provider:** Supabase Auth (email + password)
- **Username mapping:** Login accepts a short username (e.g., "mithun"); server maps it to an internal email `username@durgaindustries.internal` before calling `supabase.auth.signInWithPassword()`
- **Session:** Stored as HTTP-only cookies; refreshed by middleware on every request
- **No RBAC:** All authenticated users have identical access — no roles, no row-level permissions in the app layer

### Middleware (`src/middleware.ts`)
- Runs on every request (matches `/:path*`)
- Calls `supabase.auth.getUser()` to validate + refresh session
- Unauthenticated → redirect `/login`; expired session → redirect `/login?reason=session_expired`
- Authenticated + visiting `/login` → redirect `/`

### Session Freshness
- **KeepAliveHeartbeat** pings `GET /api/ping` every 25 seconds to keep the Supabase connection alive; also pings on tab focus
- **AuthSessionGuard** subscribes to `supabase.auth.onAuthStateChange`; on `SIGNED_OUT`, shows toast and redirects to `/login` after 3s

---

## 6. Database Schema (21 Tables)

### Master Tables

#### `customers`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| customer_no | SERIAL UNIQUE | Auto-assigned display code |
| customer_name | text NOT NULL | |
| address_1, address_2, street, city, state, gstin | text nullable | |
| is_active | boolean DEFAULT true | Soft delete |
| created_at, updated_at | timestamptz | Auto-managed |

Index: `idx_customers_is_active`

#### `contractors`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| code_no | SERIAL UNIQUE | |
| name | text NOT NULL | |
| role, contact | text nullable | |
| is_active | boolean DEFAULT true | |

#### `suppliers`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| code_no | SERIAL UNIQUE | |
| name | text NOT NULL | |
| tin_no, cst_no, gstin, address, state | text nullable | |
| is_active | boolean DEFAULT true | |

#### `tax_rates`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| vat_code | SERIAL UNIQUE | |
| tax_percentage | numeric(5,2) NOT NULL | |
| description | text NOT NULL | Auto-generated: "GST 18%", "Exempt (0%)" |
| inv_prefix | text nullable UNIQUE | e.g., "D" → generates "D-00001" |
| is_active | boolean DEFAULT true | |

#### `units`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| unit_code | SERIAL UNIQUE | |
| unit_name | text NOT NULL | Stored uppercase |
| is_active | boolean DEFAULT true | |

#### `materials`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| material_no | SERIAL UNIQUE | |
| name | text NOT NULL | |
| hsn_code | text nullable | GST Harmonized System Code |
| tax_rate_id | UUID FK → tax_rates.id nullable | |
| purchase_unit_id | UUID FK → units.id | |
| sales_unit_id | UUID FK → units.id nullable | |
| conversion_value | numeric(10,4) DEFAULT 1 | Purchase-to-sales unit conversion |
| opening_stock | numeric(12,4) DEFAULT 0 | Set once at creation |
| current_stock | numeric(12,4) DEFAULT 0 | Live balance (CHECK ≥ 0) |
| min_level | numeric(12,4) DEFAULT 0 | Alert threshold |
| max_level | numeric(12,4) nullable | |
| standard_cost | numeric(14,4) nullable | Fallback for stock valuation |
| is_active | boolean DEFAULT true | |

Constraint: `current_stock >= 0`

#### `vehicles`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| job_ref_no | text UNIQUE NOT NULL | Customer project identifier |
| vehicle_name | text nullable | |
| type | text DEFAULT 'New' | 'New' or 'Old' |
| customer_id | UUID FK → customers.id nullable | |
| is_active | boolean DEFAULT true | |

Index: `idx_vehicles_is_active`, `idx_vehicles_customer_id`

#### `app_users`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| username | text UNIQUE NOT NULL | Short login username |
| supabase_auth_id | UUID UNIQUE nullable | Maps to Supabase Auth |
| display_name | text nullable | |

#### `stages`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| stage_code | text UNIQUE NOT NULL | Auto-generated: S001…S1000 |
| stage_name | text NOT NULL | |
| is_active | boolean DEFAULT true | |

#### `stage_materials` (Stage Bill of Materials)
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| stage_id | UUID FK → stages.id CASCADE | |
| material_id | UUID FK → materials.id RESTRICT | |
| default_qty | numeric(12,3) NOT NULL | |
| unit_id | UUID FK → units.id NOT NULL | |

Constraint: UNIQUE (stage_id, material_id)

#### `company_settings` (single-row table)
| Column | Type |
|---|---|
| id | UUID PK |
| company_name | text NOT NULL |
| address, gstin, pan_no, tan_no | text nullable |
| bank_name, bank_account_no, bank_ifsc, bank_branch | text nullable |
| invoice_terms | text nullable |

Defaults: Company name = "DURGA INDUSTRIES", GSTIN = "33AALPU5476B1ZJ", Address = Karur, TN.

---

### Transaction Tables

#### `purchase_orders`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| po_number | integer NOT NULL | Resets per FY |
| po_date | timestamptz DEFAULT NOW | |
| supplier_id | UUID FK → suppliers.id nullable | NULL if multi-supplier PO |
| total_amount | numeric(14,2) DEFAULT 0 | |
| status | text DEFAULT 'Draft' | 'Draft' \| 'Received' |
| financial_year | text NOT NULL | e.g., "2026-2027" |
| affects_stock | boolean DEFAULT true | false = accounting-only, no warehouse update |
| supplier_bill_no | text nullable | AP reconciliation |
| supplier_bill_date | date nullable | |
| reverted_at | timestamptz nullable | Audit: when reverted to Draft |
| reverted_by | text nullable | Audit: who reverted |

Constraint: UNIQUE (po_number, financial_year)
Indexes: `idx_po_financial_year`, `idx_po_fy_status`, `idx_po_supplier_id`

#### `purchase_order_items`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| po_id | UUID FK → purchase_orders.id CASCADE | |
| material_id | UUID FK → materials.id NOT NULL | |
| qty | numeric(12,4) NOT NULL | |
| unit_id | UUID FK → units.id nullable | |
| rate | numeric(12,4) DEFAULT 0 | Base rate excl. tax |
| tax_percentage | numeric(5,2) DEFAULT 0 | **Frozen at entry** |
| cgst_amount, sgst_amount, igst_amount | numeric(12,2) DEFAULT 0 | |
| amount | numeric(14,2) DEFAULT 0 | qty × rate |
| supplier_id | UUID FK → suppliers.id nullable | Per-item supplier override |
| gst_type | text nullable | 'CGST_SGST' \| 'IGST' — **Frozen at entry** |

#### `material_issues`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| slip_number | integer nullable | Legacy field; new records = NULL |
| issue_date | timestamptz DEFAULT NOW | |
| vehicle_id | UUID FK → vehicles.id NOT NULL | |
| margin_percentage | numeric(5,2) DEFAULT 0 | Markup applied at invoice |
| total_amount | numeric(14,2) DEFAULT 0 | |
| financial_year | text NOT NULL | |
| status | text DEFAULT 'Draft' | 'Draft' \| 'Issued' |
| issue_type | text DEFAULT 'OLD' | 'OLD' (standard) \| 'NEW' (stage-based) |
| stage_id | UUID FK → stages.id nullable | NULL for OLD; set for NEW |

Constraint: UNIQUE (vehicle_id, issue_type, financial_year) — one issue per vehicle per type per FY
Indexes: `idx_mi_financial_year`, `idx_mi_vehicle_id`, `idx_mi_fy_status`, `idx_mi_issue_type`, `idx_mi_stage_id`

#### `material_issue_items`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| issue_id | UUID FK → material_issues.id CASCADE | |
| material_id | UUID FK → materials.id NOT NULL | |
| hsn_code | text nullable | |
| qty | numeric(12,4) NOT NULL | |
| unit_id | UUID FK → units.id nullable | |
| rate | numeric(12,4) DEFAULT 0 | |
| tax_percentage | numeric(5,2) DEFAULT 0 | Frozen |
| cgst_amount, sgst_amount, igst_amount | numeric(12,2) | |
| amount | numeric(14,2) DEFAULT 0 | |
| contractor_id | UUID FK → contractors.id nullable | Optional per-line assignment |
| affects_inventory | boolean DEFAULT true | false = service/pass-through, no stock deduction |
| gst_type | text nullable | Frozen |
| stage_id | UUID FK → stages.id nullable | Which stage (NEW VMI) |

#### `invoices`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| bill_number | text NOT NULL | e.g., "D-00001" |
| bill_date | timestamptz DEFAULT NOW | |
| rate_date | timestamptz nullable | |
| tax_percentage | numeric(5,2) DEFAULT 0 | |
| material_margin | numeric(5,2) DEFAULT 0 | |
| discount | numeric(14,2) DEFAULT 0 | |
| vehicle_id | UUID FK → vehicles.id NOT NULL | |
| net_amount | numeric(14,2) DEFAULT 0 | |
| rev_charge_status | boolean DEFAULT false | Reverse charge GST |
| financial_year | text NOT NULL | |
| status | text DEFAULT 'Draft' | 'Draft' \| 'Finalized' \| 'Cancelled' |
| customer_name, customer_gstin, customer_state, customer_address | text nullable | **Snapshot frozen at creation** |
| payment_status | text DEFAULT 'Unpaid' | 'Unpaid' \| 'Partial' \| 'Paid' |
| payment_date | date nullable | |
| payment_notes | text nullable | |
| cancelled_by | text nullable | Audit |
| cancelled_at | timestamptz nullable | Audit |
| include_tax | boolean DEFAULT false | Show tax breakdown in grid |

Constraint: UNIQUE (bill_number, financial_year)
Indexes: `idx_inv_financial_year`, `idx_inv_fy_status`, `idx_inv_vehicle_id`

#### `invoice_items`
Same structure as purchase_order_items (qty, rate, frozen tax_percentage, gst_type, tax amounts).
FK → `invoices.id CASCADE`, FK → `materials.id`

#### `invoice_slip_links` (Invoice ↔ Material Issue M2M)
| Column | Type |
|---|---|
| id | UUID PK |
| invoice_id | UUID FK → invoices.id CASCADE |
| slip_id | UUID FK → material_issues.id CASCADE |

Constraint: UNIQUE (invoice_id, slip_id) — allows invoices to cover multiple MI slips

#### `invoice_insurance`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| invoice_id | UUID UNIQUE NOT NULL | One insurance bill per invoice; **NO CASCADE** (intentional block) |
| bill_date | date NOT NULL | |
| tax_percentage | numeric(5,2) DEFAULT 18 | |
| material_margin | numeric(5,2) DEFAULT 0 | |
| discount | numeric(14,2) DEFAULT 0 | |
| net_amount | numeric(14,2) DEFAULT 0 | |
| gst_type | text NOT NULL | Frozen |
| include_tax | boolean DEFAULT false | |
| status | text DEFAULT 'Draft' | 'Draft' \| 'Finalized' |

No CASCADE: `cancelInvoice()` is blocked if insurance bill is Finalized.

#### `invoice_insurance_items`
FK → `invoice_insurance.id CASCADE`; `material_id` nullable (NULL = free-text item via `material_name_override`); includes `sort_order`.

#### `stock_ledger` (Append-Only Audit Log)
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| material_id | UUID FK → materials.id NOT NULL | |
| transaction_type | text NOT NULL | 'PO_INWARD' \| 'ISSUE' \| 'REVERSAL' \| 'ADJUSTMENT' |
| reference_id | UUID nullable | FK to PO or MI (no DB FK, app-level) |
| reference_type | text nullable | 'purchase_order' \| 'material_issue' |
| qty_change | numeric(12,4) NOT NULL | Signed delta |
| stock_after | numeric(12,4) NOT NULL | Balance after this entry |
| reason | text nullable | Required for ADJUSTMENT |
| adjusted_by | text nullable | Username, required for ADJUSTMENT |
| rate_at_time | numeric(14,4) nullable | For value impact transparency |
| created_at | timestamptz | **No updated_at — append-only** |

---

## 7. Entity Relationship Overview

```
customers ──< vehicles ──< material_issues ──< material_issue_items >── materials
                    │                │                      └── contractors
                    │                └── (issue_type=NEW) ── stages ──< stage_materials >── materials
                    │
                    └──< invoices ──< invoice_items >── materials
                              │
                              └── invoice_slip_links >── material_issues
                              │
                              └── invoice_insurance ──< invoice_insurance_items >── materials

suppliers ──< purchase_orders ──< purchase_order_items >── materials
                                              └── suppliers (per-item override)

materials ──< stock_ledger
materials >── tax_rates
materials >── units (purchase_unit, sales_unit)
stage_materials >── units
```

**Central tables:** `materials` (referenced by 6 tables), `vehicles` (hub between customers, MIs, and invoices), `material_issues` (bridge between stock and billing).

---

## 8. Server Actions Inventory

All server actions live in `src/lib/actions/`. They use `unstable_cache()` for reads and `revalidateTag()` for invalidation. Mutations use Drizzle transactions.

### Master Actions

| File | Key Functions |
|---|---|
| customers.actions.ts | getCustomers, getAllCustomers, createCustomer, updateCustomer, deleteCustomer, reactivateCustomer, bulkImportCustomers |
| contractors.actions.ts | getContractors, getAllContractors, createContractor, updateContractor, deleteContractor, reactivateContractor, bulkImportContractors |
| suppliers.actions.ts | getSuppliers, getAllSuppliers, createSupplier, updateSupplier, deleteSupplier, reactivateSupplier, bulkImportSuppliers |
| tax.actions.ts | getTaxRates, getAllTaxRates, createTaxRate, updateTaxRate, deleteTaxRate, reactivateTaxRate, checkInvPrefixUnique |
| units.actions.ts | getUnits, getAllUnits, createUnit, updateUnit, deleteUnit, reactivateUnit |
| materials.actions.ts | getMaterials, getAllMaterials, createMaterial, updateMaterial, deleteMaterial, reactivateMaterial, bulkImportMaterials |
| vehicles.actions.ts | getVehicles, getAllVehicles, createVehicle, updateVehicle, deleteVehicle, reactivateVehicle, bulkImportVehicles, createVehicleWithCustomer |
| stages.actions.ts | getStagesWithMaterials, getStagesForDropdown, getStageMaterials, getAllStageMaterials, createStage, addStageMaterial, removeFromStage, deleteStage |

### Transaction Actions

| File | Key Functions |
|---|---|
| purchase-orders.actions.ts | getPurchaseOrders, getPurchaseOrderById, getPurchaseOrdersByIds, getPOsForDropdown, getNextPONumber, createPurchaseOrder, updatePurchaseOrder, receivePurchaseOrder, updateReceivedPurchaseOrder, deletePurchaseOrder |
| material-issues.actions.ts | getMaterialIssues, getMaterialIssueById, getSlipsForDropdown, peekNextSlipNumber, createMaterialIssue†, updateMaterialIssue, issueMaterialIssue†, updateIssuedMaterialIssue, saveVehicleMaterialIssue, cloneVehicleMaterialIssue, updateVehicleMargin |
| invoices.actions.ts | getInvoices, getInvoiceById, getInvoiceCounts, peekNextBillNumber, getIssuedMIsForVehicle, getMIItemsForInvoice, getAllIssuedMIItemsForVehicle, createInvoice, updateInvoice, finalizeInvoice, revertInvoiceToDraft, cancelInvoice, deleteInvoice, createInsuranceBill |
| stock.actions.ts | getStockDashboardMaterials, getStockMovementHistory, getDraftCommitmentsForMaterial, adjustStock, getStockForMaterial |
| settings.actions.ts | getCompanySettings, upsertCompanySettings |
| dashboard.actions.ts | getDashboardStats |
| reports.actions.ts | getInvoiceSummaryReport, getPurchaseReport, getStageWiseCostingData, getMaterialWiseCostingData |
| reports.queries.ts | getActiveVehiclesForReports, getActiveSuppliersForReports, getActiveMaterialsForReports, getActiveCustomersForReports |

† `@deprecated` — no longer called from any UI

---

## 9. Cache Strategy

**Cache tags** (`src/lib/cache.ts`):
`materials`, `suppliers`, `customers`, `vehicles`, `contractors`, `units`, `taxRates`, `settings`, `stages`, `dashboard`

- Master reads: `unstable_cache()` tagged per entity type
- Dashboard: cached with 120s TTL
- Company settings: additionally wrapped in `React.cache()` to dedupe within a single request
- Transaction reads (POs, MIs, Invoices): NOT cached — always fresh via `force-dynamic` on pages
- Report queries: `unstable_cache()()` double-invocation pattern with 120s TTL, tagged with `dashboard`
- On any mutation: `revalidateTag(CACHE_TAGS.x)` called before return

---

## 10. Business Workflow Documentation

### Workflow 1: Purchase Order Lifecycle

```
1. User opens /transactions/purchase-orders
2. Enters PO date + affectsStock flag
3. Adds materials (with supplier, qty, rate, tax%)
4. "Save" → client groupBySupplier() → createPurchaseOrder() once per supplier group
5. "Mark Received" → receivePurchaseOrder()
   - If affectsStock=true: batchUpdateMaterials() + PO_INWARD ledger entries
   - Status: Draft → Received
6. "Revert to Draft" → updateReceivedPurchaseOrder() with reversal
   - Stock reversal (REVERSAL ledger entries)
   - Status: Received → Draft
   - BLOCKED if any material in the PO has ever been issued (see §25)
7. "Delete"
   - Draft: CASCADE delete
   - Received: Reverse stock → delete
```

**Key business rules:**
- `po_number` is per-FY sequential; resets every April 1
- `affects_stock=false` creates an accounting-only PO (no warehouse movement)
- Tax rates are frozen at item level — master changes don't affect historical POs
- Multi-supplier PO: materials split into separate PO records by supplier (client-side grouping)

### Workflow 2: Material Issue Lifecycle (OLD — Standard)

```
1. User opens /transactions/material-issues
2. Selects vehicle
3. Adds materials manually or from dropdown
4. "Issue" → saveVehicleMaterialIssue(vehicleId, "OLD", payload)
   - If no existing OLD MI for this vehicle+FY: creates + issues atomically
   - If existing: updateIssuedMaterialIssue() (reverse + reapply)
   - Stock deducted for affects_inventory=true items
   - ISSUE ledger entries inserted
5. "Delete" → reverses all stock (REVERSAL entries)
6. "Clone" → CloneVehicleDialog → new vehicle + copy of issue
```

### Workflow 3: Material Issue Lifecycle (NEW — Stage-Based VMI)

```
1. User opens /transactions/material-issues/new
2. Selects vehicle (type=New)
3. System auto-loads all stages + materials via getAllStageMaterials() (single batch call)
4. User toggles stages ON/OFF; each stage's materials append to the rows array tagged with stage_id
5. Can navigate Prev/Next between active stages (active stage highlights its rows)
6. Items are tagged with stage_id in the payload
7. "Issue" → saveVehicleMaterialIssue(vehicleId, "NEW", payload)
   - Creates single material_issues record (issue_type="NEW")
   - All items stored in material_issue_items with stage_id
   - Stock deducted for affects_inventory=true items
8. Margin % in the Stage Wise Costing report → updateVehicleMargin() → recalculates all rates
```

### Workflow 4: Invoice Lifecycle

```
1. User opens /invoice
2. Selects vehicle → getAllIssuedMIItemsForVehicle() fetches all issued MI items
3. Items merged by (material_id|rate|tax_percentage) via mergeSlipRows() — contractor lost
4. Bill number auto-generated: peekNextBillNumber(prefix, fy)
5. GST type determined from customer GSTIN + state
6. Material margin % applied uniformly to all rates (debounced 300ms)
7. "Save Draft" → createInvoice() or updateInvoice()
   - Stores customer snapshot (name, GSTIN, state, address) — frozen at creation
   - slip_ids: [] always sent — invoice_slip_links never populated
8. "Finalize" → finalizeInvoice() → status: Draft → Finalized
9. "Create Insurance Bill" → createInsuranceBill()
   - Copies items from invoice_items; 18% tax default; gst_type from first item
   - Separate entity; editable and finalizeable independently
10. "Cancel" → cancelInvoice() (TOCTOU-safe via transaction)
    - Blocked if insurance bill is Finalized
    - Draft insurance bills auto-deleted atomically
    - Records cancelled_by + cancelled_at
11. "Revert" → Finalized → Draft (re-editable)
```

**Bill number format:** `{inv_prefix}-{5-digit-sequence}` (e.g., "D-00001")
If no prefix on tax rate: pure numeric sequence.

### Workflow 5: Stock Adjustment

```
1. User opens /stock → views all materials
2. "Adjust" → opens StockAdjustDialog
3. Selects new quantity + adjustment type + reason (≥10 chars)
4. System checks draft MI commitments
   - If reduction would undercut draft commitments → red warning + acknowledgment checkbox
5. System warns on >50% reduction or ≥10 unit reduction
6. System warns if new qty < min_level
7. "Save" → adjustStock()
   - Optimistic concurrency: UPDATE WHERE (id, current_stock) = (id, old_stock)
   - Verifies update landed (re-reads stock)
   - Inserts ADJUSTMENT ledger entry with reason, adjusted_by, rate_at_time
```

---

## 11. Business Rules (Explicit & Implicit)

### Stock Rules
- `materials.current_stock` cannot go negative (DB CHECK constraint)
- Deleting a material blocked if `current_stock > 0`
- Stock Adjustment uses optimistic concurrency to prevent race conditions
- Adjusting stock downward requires acknowledging draft MI commitments

### Status Rules
- **PO:** Draft → Received (one-way, revert available) → Deleted
- **MI:** Draft → Issued (one-way, revert via delete or reapply)
- **Invoice:** Draft → Finalized ↔ (revert to Draft) → Cancelled
- **Insurance:** Draft → Finalized (independent of parent invoice)

### Deletion Rules
- POs in Received status: stock is reversed on deletion
- Delete customer blocked if active vehicles exist
- Delete supplier blocked if referenced in Draft POs
- Delete material blocked if current_stock > 0 OR referenced in Draft MIs/POs
- Delete unit blocked if assigned as purchase_unit_id or sales_unit_id on any material
- Delete tax rate blocked if assigned to materials

### Uniqueness Rules
- Customer: unique name (case-insensitive)
- Supplier: unique name
- Material: unique name
- Vehicle: unique job_ref_no
- PO: unique (po_number, financial_year)
- MI: unique (vehicle_id, issue_type, financial_year)
- Invoice: unique (bill_number, financial_year)
- Stage material: unique (stage_id, material_id)
- tax_rates.inv_prefix: unique when set

### GST Rules (Tamil Nadu-based company)
- If customer GSTIN starts with "33" (TN state code) → `CGST_SGST` (split 50/50)
- If inter-state or no GSTIN → `IGST` (full amount)
- Tax values frozen at transaction time (changes to master don't affect history)
- `rev_charge_status` flag on invoices for reverse charge mechanism

### Financial Year Rules
- India FY: April 1 – March 31
- All transactional records carry `financial_year` string ("2026-2027")
- Dates validated to be within active FY before saving
- `po_number` sequence resets each FY
- `bill_number` sequence resets each FY (per prefix)
- FY selection stored in sessionStorage (tab-scoped); resets on new tab

### Calculation Rules
- Amount = qty × rate
- CGST = SGST = `Math.round((Amount × tax_pct / 100 / 2) * 100) / 100`
- IGST = `Math.round((Amount × tax_pct / 100) * 100) / 100`
- Net Amount on invoice = sum(amounts) + sum(taxes) − discount
- Stock Value (dashboard) = current_stock × (tax-inclusive last PO rate OR standard_cost)
- Tax-inclusive last PO rate = `(amount + cgst + sgst + igst) / qty` from most recent Received PO

---

## 12. State Management Analysis

### Pattern: No global state library (no Redux, Zustand, etc.)

**Three patterns coexist:**

1. **useReducer** (transaction forms — PO, MI, Invoice)
   - `rowsReducer` in `src/lib/utils/rows-reducer.ts`
   - Actions: UPDATE (patch + recalc), DELETE (if last row → resets to [newRow()]), APPEND, SET_ALL, RECALC_GST
   - UPDATE patches then recalculates using `action.gstForCalc ?? updated.gst_type`
   - RECALC_GST recalculates all rows with a new gst_type

2. **useState** (master forms, filters, dialog open/close)
   - Simple fields: vehicleId, billDate, status, search term, tab state

3. **React Context** (Financial Year)
   - `FYProvider` wraps the dashboard layout
   - Provides `activeFY`, `setActiveFY`, `isCurrentFY`
   - Persists to sessionStorage; tab-scoped

**Dirty tracking pattern (all transaction pages):**
```
isDirty = true on any form change (except SET_ALL dispatches)
On navigation/record-switch: if isDirty → open DiscardDialog
  pendingAction stored as closure → executed after user confirms
```

---

## 13. Component Inventory

### TransactionGrid (`src/components/forms/TransactionGrid.tsx`)
Shared line-item grid used across PO, MI, and Invoice. Mode prop controls columns and column indices.

| Mode | Columns | Column Config |
|---|---|---|
| `purchase-order` | Material, Supplier, Qty, Unit, Rate, Tax%, Amounts, Delete | 6 cols, qty=2, lastDataCol=4 |
| `material-issue` | Material, Contractor, Affects Inventory, Qty, Unit, Rate, Tax%, Amounts, Delete | 7 cols, qty=3, lastDataCol=5 |
| `invoice` | Material, HSN, Qty, Unit, Rate, Tax%*, CGST*, SGST*, Amount, Delete | 4 cols, qty=1, lastDataCol=2 |

Cell navigation via `useKeyboardGrid` — uses `data-grid-row` / `data-grid-col` DOM attributes. Arrow keys navigate; Enter from last data column creates new row (only if current row has data). TransactionRow is `React.memo` for performance.

On material select: auto-fills unit, tax_percentage, rate (from pre-fetched `lastRate`), baseRate, hsn_code.

### MasterLayout (`src/components/masters/master-layout.tsx`)
Two-column layout used by all 8 master pages.
- Left (320px): form panel with auto-focus
- Right (flex): searchable table with sticky header
- Keyboard: Search → Arrow keys highlight row → Enter edits → Escape discards

### PDF Components (`src/components/pdf/`)
All use `@react-pdf/renderer`. Triggered via `PrintButton` which calls an async function returning a React PDF document, opens in new tab via blob URL, revokes URL after 60s.

| Document | Used By |
|---|---|
| customer-invoice-pdf | Invoice → Print Customer Invoice |
| insurance-invoice-pdf | Invoice → Print Insurance Bill |
| mi-slip-pdf | MI → Print Slip |
| mi-register-pdf | MI → Print Register |
| po-register-pdf | PO → Batch Print |
| job-cost-pdf | Job Cost Panel |
| invoice-summary-report-pdf | Reports → Invoice Summary |
| purchase-report-pdf | Reports → Purchase Report |
| monthly-stock-report-pdf | Reports → Monthly Stock |
| stage-wise-costing-pdf | Reports → Stage Wise Costing |
| vehicle-comparison-pdf | Reports → Vehicle Comparison |

---

## 14. Reports Module

Six report types under `/reports` (tabbed left-nav interface):

| Report | Primary Use Case | Key Filters |
|---|---|---|
| Invoice Summary | GST filing, billing review | FY, status, customer, vehicle, date range |
| Purchase Report | Input tax credit, supplier spend | FY, status, supplier, material, date range |
| Monthly Stock | Warehouse movement tracking | Month range, material, show prices/details |
| Stage Wise Costing | Job cost breakdown per stage | FY, vehicle (required), as-of-date, report type |
| Vehicle Comparison | Side-by-side material comparison | FY, two vehicles, stage filter |
| Job Cost Panel | Individual job cost lookup | Vehicle search |

All reports: auto-run on filter change (300ms debounce), support CSV export, support PDF print.

Stage Wise Costing is the only report with write capability — the editable margin % field calls `updateVehicleMargin()` to batch-rescale all MI item rates.

---

## 15. Keyboard Navigation Architecture

The application is designed for keyboard-first power users (warehouse data entry). Four custom hooks cover all scenarios:

| Hook | Scope | Key Bindings |
|---|---|---|
| useFormSectionNav | Multi-section forms (Invoice, MI, PO) | ArrowDown/Up between sections; Escape deactivates; Tab trapped |
| useKeyboardGrid | TransactionGrid cells | Arrow keys, Enter → next row (new row if last+has data) |
| useListKeyboardNav | Stock table, list views | Arrow up/down highlight, Enter activate, / for search |
| useMasterKeyboardNav | All master pages | /, Ctrl+S, Alt+N |

### `useFormSectionNav` Behavior
- Tab is **fully trapped** — `e.preventDefault()` on all Tab events; browser chrome unreachable
- Dialog open → all keys pass through unmodified (`[role="dialog"]` check)
- cmdk open → all keys pass through unmodified (`[cmdk-root]` check)
- `autoActivate: true` sections fire `onActivate()` synchronously via `useLayoutEffect` (margin % input)
- `goToSection(index)` exposed for async callbacks (e.g., auto-advance to date section after vehicle load)

### Global Sidebar Hotkeys (react-hotkeys-hook)
Alt+M (Masters), Alt+T (Transactions), Alt+I (Invoice), Alt+K (Stock), Alt+R (Reports), Alt+G (Settings)

### Form-level Hotkeys
Ctrl+S (save), Alt+N (new), Escape (cancel/close)

---

## 16. Shared Utilities

| Utility | Location | Purpose |
|---|---|---|
| `cn()` | utils.ts | Merge class names (clsx + tailwind-merge) |
| `formatCode(prefix, num, pad)` | utils.ts | "M-0001" style codes |
| `matchesCode(search, prefix, num)` | utils.ts | Search code or raw number |
| `formatActionError(error, fallback)` | utils.ts | Clean server action error messages |
| `validateGstinFormat(value)` | utils.ts | 15-char GST ID regex validation |
| `calcAmountsForRow(qty, rate, taxPct, gstType)` | row-calc.ts | Tax + amount per line item |
| `newRow()` | row-calc.ts | Empty LineItemDraft with random UUID; defaults gst_type: "IGST" |
| `rowsReducer(state, action)` | rows-reducer.ts | useReducer for line items (5 action types) |
| `numberToWords(amount)` | number-to-words.ts | Indian locale amount in words for PDFs |
| `insuranceBillToInvoiceRows()` | insurance-pdf-adapter.ts | Transform insurance bill for PDF |
| `getCurrentFY()` | fy.ts | Current financial year string |
| `fyDateRange(fy)` | fy.ts | Start/end Date for a FY (IST offset +05:30) |
| `isDateInFY(dateStr, fy)` | fy.ts | Pure string comparison (ISO dates are lexicographically ordered) |
| `getFYOptions(n)` | fy.ts | Array of last N FYs for dropdowns |
| `determineGstType(gstin, state)` | types/index.ts | CGST_SGST vs IGST logic |

---

## 17. Data Flow Diagrams (Text)

### Purchase → Stock → Invoice Flow

```
Supplier → Purchase Order (Draft)
         → [Receive PO] → materials.current_stock ↑ (batchUpdateMaterials)
                        → stock_ledger (PO_INWARD entries)

materials.current_stock → [saveVehicleMaterialIssue]
                        → materials.current_stock ↓ (affects_inventory=true items)
                        → stock_ledger (ISSUE entries)
                        → material_issues + material_issue_items

material_issue_items → [vehicle selected in invoice form]
                     → getAllIssuedMIItemsForVehicle()
                     → mergeSlipRows() → LineItemDraft[] (contractor lost)
                     → [createInvoice] → invoices + invoice_items
                                       → (slip_ids: [] → invoice_slip_links NOT populated)
                     → [Finalize] → invoices.status = "Finalized"
                     → [Insurance] → invoice_insurance + invoice_insurance_items
```

### Stock Ledger as Single Source of Truth

```
Every stock change:
  materials.current_stock (live balance) ← incremental UPDATE
  stock_ledger (immutable history) ← append-only INSERT

On PO Receive: +qty entries (PO_INWARD)
On MI Issue: -qty entries (ISSUE)
On Edit/Update: REVERSAL (old) then ISSUE (new) in same transaction
On Adjust: direct UPDATE to materials.current_stock + ADJUSTMENT ledger entry
```

---

## 18. Dependency Map

### Which tables are touched by which modules

| Module | Tables Read | Tables Written |
|---|---|---|
| Purchase Orders | materials, suppliers, units | purchase_orders, purchase_order_items, materials (current_stock), stock_ledger |
| Material Issues | materials, vehicles, customers, units, contractors, stages | material_issues, material_issue_items, materials (current_stock), stock_ledger |
| Invoices | materials, vehicles, customers, tax_rates, units, material_issues, invoice_insurance | invoices, invoice_items, invoice_slip_links†, invoice_insurance, invoice_insurance_items |
| Stock | materials, stock_ledger, purchase_order_items, material_issue_items | materials (current_stock), stock_ledger |
| Reports | invoices, invoice_items, purchase_orders, purchase_order_items, material_issues, material_issue_items, stock_ledger, customers, suppliers, materials, vehicles, stages | material_issues (via updateVehicleMargin), material_issue_items (via updateVehicleMargin) |
| Masters | respective table | respective table + cascades |

† invoice_slip_links is written to in theory but never in practice (see §25)

### Cross-Feature Dependencies (what breaks if X changes)

| Change | Affected Areas |
|---|---|
| Delete material | Blocks if: current_stock > 0, OR in Draft MI, OR in Draft PO |
| Delete supplier | Blocks if: in Draft PO |
| Delete customer | Blocks if: active vehicles exist |
| Delete unit | Blocks if: assigned as purchase_unit or sales_unit on any material |
| Change tax rate % | Does NOT affect existing POs/MIs/Invoices (frozen at entry) |
| Change customer GSTIN/state | Does NOT affect existing invoices (snapshot frozen at creation) |
| Material stage assignment (stage_materials) | Affects VMI New auto-population ONLY; no stock impact |
| `affects_stock=false` on PO | PO received but no stock_ledger entry; materials.current_stock NOT updated |
| `affects_inventory=false` on MI item | Item appears on slip but stock NOT deducted |
| Finalize insurance bill | Blocks parent invoice cancellation until insurance is un-finalized (impossible — no revert for insurance) |

---

## 19. Error Handling Strategy

- **Server actions:** try/catch; errors surfaced via `formatActionError()` → toast (sonner)
- **Stock insufficiency:** Special error string "INSUFFICIENT_STOCK:materialName" → parsed to user-friendly message
- **Duplicate entity:** "DUPLICATE_JOB_REF:" prefix for vehicle job ref conflicts → actionable message
- **Optimistic concurrency failure** (stock adjustment): re-reads current_stock and reports actual vs expected
- **Bill number conflict:** Caught by UNIQUE constraint → "Bill number conflict — try saving again"
- **DB constraint violations:** Drizzle throws; caught and surfaced as toast
- **No retry logic:** User must retry manually
- **Loading states:** `useTransition` in client components; dialogs disable buttons during `isPending`
- **Error boundaries:** `error.tsx` files in dashboard and transactions routes
- **Race condition guard:** `loadGenRef` counter in invoice form; stale async results discarded

---

## 20. Security Overview

- **Authentication:** Supabase Auth handles password storage (bcrypt), session tokens, and refresh
- **Route protection:** Middleware blocks all `(dashboard)` routes for unauthenticated users
- **No RBAC:** Single user type; all authenticated users have full access
- **No SQL injection risk:** Drizzle ORM parameterises all queries
- **No XSS risk:** React's JSX escaping + no `dangerouslySetInnerHTML`
- **Session security:** HTTP-only cookies set by Supabase SSR; not accessible via JavaScript
- **No file upload:** Bulk import uses client-side XLSX parsing (no server file upload)
- **GSTIN validation:** Client-side regex + UI hint; no server-side re-validation
- **Supabase RLS:** App uses service-role or permissive anon key; auth is entirely application-level
- **Input validation:** Only present in report action functions (UUID, FY, date regex checks) — other actions trust TypeScript types

---

## 21. Performance Considerations

### Optimisations In Use
- **Batch SQL update:** `batchUpdateMaterials()` uses VALUES-join to update N material stocks in one query
- **Two-query pattern:** List queries fetch headers first, then items by IDs (avoids N+1 JOINs)
- **Combobox DOM limit:** `maxDisplay=150` prevents rendering too many options
- **Advisory locks:** `pg_advisory_xact_lock(hashtext(lockKey)::bigint)` used in deprecated slip_number path
- **DISTINCT ON queries:** Last rate per material fetched with PostgreSQL DISTINCT ON in single query
- **React.memo:** TransactionGrid rows memoized to prevent unnecessary re-renders
- **useMemo:** Dropdown option arrays computed only when source data changes
- **Debounce:** Margin % input (300ms), report filters (300ms)
- **Lazy loading:** Insurance bill items fetched on demand; `getAllStageMaterials()` batches all stage data
- **React.cache():** Company settings deduped within a single request
- **Supabase connection pool settings:** `idle_timeout=60s`, `max_lifetime=1800s`, `prepare=false` for Supabase transaction pooler compatibility

### Known Bottlenecks / Concerns
- `updateIssuedMaterialIssue()` uses a `for...of` loop for stock updates (not batched) — inconsistent with `receivePurchaseOrder`
- Stock ledger has no archival strategy — will grow indefinitely
- No pagination on stock history drawer (hardcoded limit=100)
- Reports fetch all rows without pagination (full-table scans on large FY datasets)
- `force-dynamic` on all dashboard pages prevents Next.js static optimisations

---

## 22. Technical Debt & Improvement Opportunities

1. **Dead deprecated MI functions:** `createMaterialIssue` and `issueMaterialIssue` are never called from any UI — safe to delete
2. **`invoice_slip_links` never populated:** Both MI query functions use `notExists(invoiceSlipLinks)` guard that is always a no-op; double-invoicing is possible and unsanctioned
3. **`updateIssuedMaterialIssue` stock loop:** Should use `batchUpdateMaterials` VALUES-join like `receivePurchaseOrder` does
4. **Margin change doesn't set isDirty:** `SET_ALL` dispatch bypasses dirty flag; user can lose margin changes without warning
5. **`revertPOToDraft` overly conservative:** Blocks revert if ANY material was ever issued anywhere, not just from this PO's stock
6. **No server-side GSTIN validation:** Only client-side regex; server should validate too
7. **No audit trail for invoice edits:** Only cancellation is audited; edits to Draft invoices are not logged
8. **`slip_number` field legacy:** `material_issues.slip_number` is nullable and legacy; always NULL for new records
9. **No pagination anywhere:** All list reads return full datasets; potential issue as data grows
10. **No environment variable validation:** No startup check for required env vars
11. **No tests:** No test files found in the codebase

---

## 23. High-Risk Areas

| Area | Risk | Why |
|---|---|---|
| `invoice_slip_links` never populated | Double-invoicing | All issued MIs always appear for vehicle selection; nothing blocks the same items appearing on Invoice A and Invoice B |
| `adjustStock` non-atomicity | Data integrity | Stock UPDATE and ledger INSERT are two statements; if ledger fails after stock update, balance and history diverge |
| Insurance bill + Invoice coupling | Business logic | `cancelInvoice` blocked if insurance is Finalized — and there's no revert for insurance bills. A finalized insurance bill permanently locks the parent invoice from cancellation |
| `revertPOToDraft` overly broad check | False block | Any PO containing a material that has ever been issued anywhere can never be reverted, even if stock levels are fine |
| `affects_stock=false` on POs | Misuse risk | User can receive a physical goods PO as accounting-only; stock won't update but PO shows as Received. No safety confirmation |
| `stock_ledger` vs `materials.current_stock` sync | Data integrity | Separate statements in same transaction; mitigated but not bulletproof |
| Bill number race | Duplicate conflict | Two concurrent saves can generate same bill number; UNIQUE constraint catches it but requires user retry |
| Margin change dirty-flag gap | Data loss | User changes only margin %, navigates away → no warning, change lost |

---

## 24. Module Inventory Summary

| Module | Pages | Server Actions | PDF Outputs |
|---|---|---|---|
| **Customers** | 1 | 7 | — |
| **Suppliers** | 1 | 7 | — |
| **Materials** | 1 | 7 | — |
| **Vehicles** | 1 | 8 | — |
| **Contractors** | 1 | 7 | — |
| **Stages** | 1 | 7 | — |
| **Units** | 1 | 6 | — |
| **Tax Rates** | 1 | 6 | — |
| **Purchase Orders** | 1 | 10 | PO Register |
| **Material Issues (Old)** | 1 | 8 | MI Slip, MI Register |
| **Material Issues (New)** | 1 | same as Old | MI Slip, MI Register |
| **Invoices** | 3 | 13 | Customer Invoice, Insurance Invoice |
| **Stock** | 1 | 5 | — |
| **Reports** | 1 (6 sub-reports) | 4 | Invoice Summary, Purchase, Monthly Stock, Stage Costing, Vehicle Comparison, Job Cost |
| **Settings** | 1 | 2 | — |
| **Dashboard** | 1 | 1 | — |
| **Auth** | 1 | 2 | — |

---

## 25. Deep Implementation Details (Source-Verified)

These are precise implementation details only knowable by reading the actual code — not inferred from structure.

### `saveVehicleMaterialIssue` — The Canonical Path for BOTH MI Forms
The old two-step flow (`createMaterialIssue` → `issueMaterialIssue`) is fully `@deprecated` — no UI calls them. Both MI forms use `saveVehicleMaterialIssue(vehicleId, issueType, data)`:
- **OLD MI form** calls `saveVehicleMaterialIssue(vehicleId, "OLD", payload)` — standard non-stage MI
- **NEW VMI form** calls `saveVehicleMaterialIssue(vehicleId, "NEW", payload)` — stage-based VMI with `stage_id` on items

In both cases:
- **If no existing record**: Creates with `status="Draft"`, inserts items, deducts stock, sets `status="Issued"` — all in one atomic transaction. The MI record never actually exists in Draft state from the user's perspective.
- **If existing record found** (same vehicle+type+FY — UNIQUE constraint enforced): Delegates to `updateIssuedMaterialIssue()` — reverse old stock + apply new stock.
- `slip_number` is `null` for all records created by this function (only the dead deprecated path assigned slip numbers).

The UNIQUE(vehicle_id, issue_type, financial_year) constraint means each vehicle can have at most one "OLD" MI and one "NEW" VMI per FY — but can have both simultaneously (one of each type).

### Bill Number Generation — Optimistic With Race Risk
`getNextBillNumber()` uses `ORDER BY bill_number DESC LIMIT 1` + `LIKE 'PREFIX-%'` pattern + string parse. No advisory lock. Two concurrent creates can read the same max and both try to insert the same bill number. Mitigated by UNIQUE(bill_number, financial_year) constraint — second writer gets caught with "Bill number conflict — try saving again." `peekNextBillNumber` and `getNextBillNumber` are the same function.

### `revertPOToDraft` — Overly Conservative Block
Pre-flight check: `materialIssueItems.material_id IN (SELECT material_id FROM purchaseOrderItems WHERE po_id = X)`. Blocks if ANY material in the PO has EVER been issued to ANY vehicle — even from a different PO's stock. Broader than necessary but safe.

### `adjustStock` — Optimistic Concurrency (Not Truly Atomic)
`UPDATE materials SET current_stock = newQty WHERE id = X AND current_stock = oldQty`. If another write landed between read and write, WHERE matches 0 rows. Code re-reads and throws "Stock was changed by another user". Application-level OCC, not database-native CAS.

### `cancelInvoice` — TOCTOU-Safe Via Transaction
Insurance status check runs INSIDE `db.transaction()`. Even if two cancel requests race, the check is serialized by the transaction. Draft insurance bills auto-deleted atomically in the same transaction. Most carefully written transaction in the codebase.

### `updateIssuedMaterialIssue` — Stock Loop (Known Performance Gap)
Uses `for...of` loop for stock updates. All other paths (`receivePurchaseOrder`, `cloneVehicleMaterialIssue`) use `batchUpdateMaterials` (VALUES-join). N round-trips instead of 1. Low priority for current data volumes.

### `updateVehicleMargin` — Hidden but Critical Function
Only called from the Stage Wise Costing report. Algorithm:
1. Fetches ALL issued NEW VMI records for the vehicle+FY
2. Reads old margin from first record
3. `factor = (1 + newMargin/100) / (1 + oldMargin/100)`
4. `newRate = oldRate * factor` for every item across all stages
5. Batch-updates `material_issue_items` AND `material_issues.total_amount` via VALUES-join

**Critical implication**: Stored rates are margin-adjusted. Base rates are not preserved after save. Back-calculation: `baseRate = rate / (1 + margin/100)`.

### `cloneVehicleMaterialIssue` — GST Recalculation on Clone
Calls `determineGstType(newVehicle.customer_gstin, newVehicle.customer_state)` and recalculates all tax amounts if GST type differs. Cross-state clones correctly switch CGST/SGST ↔ IGST. Uses `batchUpdateMaterials` (efficient path).

### `determineGstType` — Full Logic
```typescript
function determineGstType(gstin, state): GstType {
  if (gstin && gstin.length >= 2) {
    return gstin.startsWith("33") ? "CGST_SGST" : "IGST";
  }
  return (state === "Tamil Nadu" || state == null || state === "") ? "CGST_SGST" : "IGST";
}
```
Nuances: (1) Only checks first 2 chars of GSTIN — no full format validation. (2) No GSTIN + no state → defaults to CGST_SGST (TN assumption). (3) State check is exact string match: "Tamil Nadu" only.

### `newRow()` Default GST Type — Surprising Default
`newRow()` in `row-calc.ts` defaults `gst_type: "IGST"`. In practice overridden immediately when a vehicle is selected. Only matters if a user adds a row before selecting a vehicle.

### `getInvoices` List — Cancelled Invoices Excluded
Hardcodes `ne(invoices.status, INVOICE_STATUS.CANCELLED)`. Cancelled invoices never appear in the main list — only in reports.

### `createInsuranceBill` — 18% Hardcoded Default
`tax_percentage` defaults to `"18"` regardless of parent invoice tax. `gst_type` IS copied from first invoice item. Insurance items copied verbatim from `invoice_items` — user edits after creation.

### Drizzle Migrations — Direct Connection Required
`drizzle.config.ts` uses `DIRECT_URL` (not `DATABASE_URL` pooler). `prepare: false` in `db/index.ts` is critical for pooler compatibility. Using pooler URL for migrations → prepared statements fail.

### `invoice_slip_links` Table — Structurally Present, Never Populated
**Intended design**: `createInvoice` accepts `slip_ids: string[]` — if provided, inserts into `invoice_slip_links`. `getIssuedMIsForVehicle` and `getAllIssuedMIItemsForVehicle` use `notExists(SELECT 1 FROM invoiceSlipLinks WHERE slip_id = mi.id AND invoice_id != currentInvoiceId)` to exclude already-invoiced slips.

**What actually happens**: `buildPayload()` in invoice-client.tsx hardcodes `slip_ids: []`. `createInvoice` skips the insert (guarded by `if (data.slip_ids.length > 0)`). Table is always empty. `notExists()` guard always passes. `cancelInvoice` deletes from the table — always a no-op.

**Consequence**: No enforcement preventing double-invoicing. Same MI items can appear in multiple invoices without any system block. This is a live production risk.

### Invoice → MI Item Merge Key Excludes Contractor
`mergeSlipRows()` key: `material_id|rate|tax_percentage`. Same material at same rate from different contractors merges into one invoice line. Contractor attribution intentionally lost at invoice level (invoice is a customer document).

### Margin Recalculation — `SET_ALL` Bypasses Dirty Flag
The 300ms debounced margin effect calls `dispatch({ type: "SET_ALL" })` directly (not through `dispatchWithDirty`). `dispatchWithDirty` sets `isDirty=true` for all types except `SET_ALL`. **Result**: Changing margin % alone does NOT set isDirty. User navigating away loses the change with no warning.

### `lastRate` Pre-Fetch — Raw Base Rate, NOT Tax-Inclusive
Pages fetch `lastRate` for all materials at load time:
```sql
SELECT DISTINCT ON (poi.material_id) poi.material_id, poi.rate
FROM purchase_order_items poi
INNER JOIN purchase_orders po ON poi.po_id = po.id
WHERE po.status = 'Received'
ORDER BY poi.material_id, po.po_date DESC
```
This is the raw base rate (tax-excluded). The stock dashboard value uses `(amount + taxes) / qty` (tax-inclusive). These serve different purposes and must not be confused.

### Stage Material Loading — Rate is Raw PO Rate
When a stage is toggled ON in New VMI, `getStageMaterials(stageId)` returns `last_po_rate` from raw `rate` column of `purchase_order_items`. If null → `rateBlank = true` → red indicator in TransactionGrid requiring manual entry.

### New VMI `gridDispatch` — Prevents Empty Stages
Stable `useCallback` wrapper. When DELETE removes the last row of a stage, re-inserts a blank row tagged with `stage_id`/`stage_name`. Every selected stage always has ≥1 row. All stages' rows coexist in the same `rows` array; `activeStageId` controls which are highlighted.

### `populateForm` — Stage ID Recovery from Items
When loading an existing VMI, reconstructs selected stage IDs by iterating `record.items` in order, deduplicating with a `Set`. First stage ID becomes `activeStageId`. Order matches original insertion order.

### `getAllStageMaterials` — Single Batch at Page Load
Returns `Record<string, StageMaterialResult[]>` keyed by stage_id. Avoids N calls to `getStageMaterials()` when auto-populating all stages. Cached with `[stages, materials]` tags.

### Stage Code Generation — Numeric Cast Required
```sql
MAX(CAST(SUBSTRING(stage_code, 2) AS INTEGER))
```
String MAX would fail after S999 (`'9' > '1'` lexicographically). Comment in source documents this explicitly.

### Stage-Wise Costing — Tax-Inclusive + IST As-Of-Date
`getStageWiseCostingData` sums `amount + cgst_amount + sgst_amount + igst_amount` (tax-inclusive total cost per stage). `asOfDate` filter: `asOfDate + "T23:59:59+05:30"` — IST-aware end-of-day. Uses `unstable_cache()()` double-invocation; 120s TTL.

### Server-Side Input Validation — Only in Report Actions
`getStageWiseCostingData` and `getMaterialWiseCostingData` validate UUID, FY format, and date format via regex. All other server actions trust the TypeScript type layer. Asymmetry exists because report functions can receive raw URL params.

### `useFormSectionNav` — Tab Trapped, Dialog-Aware, cmdk-Aware
Tab: `e.preventDefault()` always. Dialog `[role="dialog"]`: pauses navigation. cmdk `[cmdk-root]`: passes keys through. `autoActivate: true`: fires via `useLayoutEffect` before paint. `goToSection(i)` exposed as ref for async callbacks.

### FY Context — SessionStorage Post-Hydration Flash
Initializes with `getCurrentFY()` synchronously, then overrides with sessionStorage value in `useEffect` after hydration. Brief flash of current FY before historical FY restores. FY is tab-scoped — new tabs always start with current FY.

### Multi-Supplier PO — Client-Side `groupBySupplier`
Groups line items by `supplier_id || "__none__"`. `handleSave()` calls `createPurchaseOrder()` once per group. Rows without a supplier → separate PO with `supplier_id=null`. Mixed supplier+no-supplier row set → two POs in one save.

### Insurance Bill Loaded Lazily
Invoice load: `Promise.all([getInvoiceById(id), getInsuranceBillStatusByInvoiceId(id)])`. Full items loaded on first insurance tab open (`ensureInsuranceBillLoaded(id)`). Keeps invoice load fast.

### Invoice Load Race Protection
`loadGenRef` counter incremented on each `loadInvoice(id)` call. Stale async results discarded: `if (gen !== loadGenRef.current) return`.
