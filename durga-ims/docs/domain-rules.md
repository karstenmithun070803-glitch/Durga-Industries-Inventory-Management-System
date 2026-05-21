# Domain Rules — Durga Industries IMS

> This file explains the **business and regulatory rules** that drive how the system behaves. Understanding these rules helps developers make the right decisions when extending the system, and explains why certain validations and constraints exist.

---

## Table of Contents

1. [Indian GST System](#1-indian-gst-system)
2. [CGST / SGST vs IGST — How the Split is Determined](#2-cgst--sgst-vs-igst--how-the-split-is-determined)
3. [GSTIN — Format and Usage](#3-gstin--format-and-usage)
4. [Financial Year](#4-financial-year)
5. [PO Number Scoping](#5-po-number-scoping)
6. [HSN Codes](#6-hsn-codes)
7. [Invoice Prefix](#7-invoice-prefix)
8. [Stock Rules](#8-stock-rules)
9. [Soft Delete — Why Nothing Is Ever Hard-Deleted](#9-soft-delete--why-nothing-is-ever-hard-deleted)
10. [Code Numbering Conventions](#10-code-numbering-conventions)
11. [Legacy Tax Fields (TIN / CST)](#11-legacy-tax-fields-tin--cst)

---

## 1. Indian GST System

**GST (Goods and Services Tax)** replaced India's earlier tax structure (VAT, CST, Service Tax, Excise) from 1 July 2017. It is a destination-based tax levied at each stage of supply.

### Three Tax Components

| Tax | Full Name | Collected By | When It Applies |
|-----|----------|-------------|----------------|
| CGST | Central GST | Central Government | Same-state transactions |
| SGST | State GST | State Government | Same-state transactions |
| IGST | Integrated GST | Central Government (split with state later) | Cross-state transactions |

**Same-state transaction** (supplier and buyer in the same state): CGST + SGST apply, each at **half the GST rate**.

**Cross-state transaction** (supplier and buyer in different states): Only IGST applies, at the **full GST rate**.

### Examples

| GST Rate | Same-State | Cross-State |
|----------|-----------|------------|
| 5% | CGST 2.5% + SGST 2.5% | IGST 5% |
| 12% | CGST 6% + SGST 6% | IGST 12% |
| 18% | CGST 9% + SGST 9% | IGST 18% |
| 28% | CGST 14% + SGST 14% | IGST 28% |

### Common GST Rates

- **0%**: Agricultural products, some food items
- **5%**: Transport services, some processed foods
- **12%**: Processed foods, textiles
- **18%**: Most manufactured goods, steel products (Durga Industries' primary rate), services
- **28%**: Luxury goods, automobiles, tobacco

---

## 2. CGST / SGST vs IGST — How the Split is Determined

Durga Industries is in **Tamil Nadu** (state code `33`). Whether a purchase is CGST+SGST or IGST depends on where the **supplier** is registered.

### The Rule

```
If supplier is in Tamil Nadu → same state as Durga → CGST + SGST (50/50 split)
If supplier is outside Tamil Nadu → cross-state → IGST (full rate)
```

### How the System Determines This (`determineGstType`)

Located in `src/types/index.ts`:

```ts
function determineGstType(gstin: string | null, state: string | null): GstType {
  if (gstin) {
    return gstin.startsWith("33") ? "CGST_SGST" : "IGST";
  }
  return state === "Tamil Nadu" ? "CGST_SGST" : "IGST";
}
```

**Priority**: GSTIN first, state as fallback.

1. If GSTIN is present: read the first 2 characters. `"33"` = Tamil Nadu = `CGST_SGST`. Any other value = `IGST`.
2. If GSTIN is absent or null: compare the `state` field against `"Tamil Nadu"`. Match = `CGST_SGST`, no match (or null) = `IGST`.

### Why GSTIN Takes Priority Over State

A supplier might have their registered office in one state but their GST registration in another (e.g. a supplier registered under Tamil Nadu GST but with a Gujarat mailing address). The GSTIN state code is the legally correct determinant for CGST/SGST vs IGST.

### When It's Applied

In Purchase Orders (Phase 3), `determineGstType` is called **per row** when a supplier is selected. This allows a single PO to have some rows as CGST+SGST (Tamil Nadu suppliers) and other rows as IGST (out-of-state suppliers). Both are valid in the same PO.

`gst_type` (`"CGST_SGST"` or `"IGST"`) is **frozen at save time** into `purchase_order_items.gst_type`. If a supplier's GSTIN or state changes later, historical POs retain the tax split that was applied at the time of purchase. This is correct — you cannot retroactively change issued invoices or received POs.

---

## 3. GSTIN — Format and Usage

### Format

GSTIN is a 15-character alphanumeric identifier assigned to every GST-registered business.

```
3  3  A  A  A  A  A  1  2  3  4  A  1  Z  5
│  │  └─────────┘  └──────┘  │  │  │  │
│  │    5-letter     4-digit  │  │  │  └─ Check digit (alphanumeric)
│  │    PAN prefix  sequence  │  │  └─── Literal 'Z'
│  └─ State code digit 2      │  └────── Check digit / entity code
└─── State code digit 1       └───────── Check character
     ("33" = Tamil Nadu)
```

- **Digits 1–2**: State code. `33` = Tamil Nadu. See Appendix for full list.
- **Digits 3–7**: First 5 characters of the entity's PAN (Permanent Account Number)
- **Digits 8–11**: 4-digit sequential entity number under that PAN
- **Digit 12**: Check letter
- **Digit 13**: Entity number (usually `1` for the first registration)
- **Digit 14**: Always the letter `Z`
- **Digit 15**: Check digit (alphanumeric)

### Validation Regex

```
^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$
```

Used in Suppliers master for soft validation on blur. **Important**: this only validates the format — it does not verify that the GSTIN is actually registered with the government.

### How It's Used in This System

| Context | How GSTIN Is Used |
|---------|------------------|
| Suppliers master | Stored for display and tax-type determination. Soft-validated on blur (warning shown, save not blocked). |
| Customers master | Stored for Phase 5 invoice generation (determines whether outgoing invoice is CGST+SGST or IGST). |
| Purchase Orders | Per line item: `determineGstType(supplier.gstin, supplier.state)` determines CGST/SGST vs IGST split. |
| Invoices (Phase 5) | Per line item: `determineGstType(customer.gstin, customer.state)` determines tax split on sales side. |

### Common State Codes

| Code | State |
|------|-------|
| 01 | Jammu & Kashmir |
| 07 | Delhi |
| 27 | Maharashtra |
| 29 | Karnataka |
| 32 | Kerala |
| **33** | **Tamil Nadu** ← Durga Industries |
| 36 | Telangana |
| 37 | Andhra Pradesh |

---

## 4. Financial Year

India's financial year (FY) runs from **April 1 to March 31**, not January–December.

### Display Format

FY is displayed as `"2025-26"` (not `"2025-2026"`). The year it starts is first, the last 2 digits of the year it ends are second.

| Dates | FY String |
|-------|----------|
| April 1 2024 – March 31 2025 | `"2024-25"` |
| April 1 2025 – March 31 2026 | `"2025-26"` |
| April 1 2026 – March 31 2027 | `"2026-27"` |

### Helper Functions (`src/lib/financial-year.ts`)

```ts
getCurrentFinancialYear(): string
// Returns the FY string for today's date.
// April 1 2025 → March 31 2026 = "2025-26"

getFinancialYearRange(fy: string): { start: Date, end: Date }
// Returns the exact start and end dates for a given FY string.
// "2025-26" → { start: 2025-04-01, end: 2026-03-31 }
```

### FY in the System

- All Purchase Orders have a `financial_year` column (e.g. `"2025-26"`) set at creation time
- PO numbers are unique **within** a financial year — the same PO number can exist in two different years
- The dashboard sidebar shows the active FY and lets users switch to view historical years
- Switching FY in the sidebar does **not** change which FY new POs are created in — that is always determined by `getCurrentFinancialYear()` from today's date

---

## 5. PO Number Scoping

### Why PO Numbers Reset Each Year

Indian business practice is to maintain separate sequential numbering per financial year. Invoice and PO numbers are commonly formatted as `PO-0001/2025-26`. Continuing from a prior year's sequence would be confusing for accounting and tax audits.

### Implementation

`po_number` is stored as a plain **integer** (not a SERIAL). The database enforces `UNIQUE(po_number, financial_year)` — the same integer can appear in two different years without conflict.

To get the next PO number:
```sql
SELECT COALESCE(MAX(po_number), 0) + 1
FROM purchase_orders
WHERE financial_year = '2025-26'
```

**Do not use a global SERIAL for PO numbers.** A SERIAL would never reset and would produce numbers like `PO-2847` in the first year instead of `PO-0001`.

### Display Format

`formatCode("PO-", po_number, 4)` → `"PO-0001"`, `"PO-0042"`, etc. The display string is never stored in the DB.

---

## 6. HSN Codes

**HSN** (Harmonised System of Nomenclature) is an 8-digit code assigned by the government to classify every type of goods. HSN codes must appear on GST invoices for each line item.

### In This System

- HSN codes are stored on the Material master as an optional field
- They are **not enforced as required** — the system works without them, and they can be filled in gradually
- When present, they are printed on PO documents and Phase 5 invoices

### How to Find HSN Codes

- The company's Chartered Accountant (CA) can provide the correct HSN codes for Durga Industries' materials
- The GST Council portal has a searchable HSN directory

### Examples

| Material | HSN Code |
|---------|---------|
| Angle Iron (MS) | 72162100 |
| MS Flat | 72131000 |
| MS Round Bar | 72141000 |
| MS Sheet | 72091500 |
| Paint (water-based) | 32091010 |
| Welding Electrodes | 83111000 |

---

## 7. Invoice Prefix

The `inv_prefix` field on Tax Rate master is used in Phase 5 (Invoicing) to generate sequential invoice numbers per tax rate tier.

### Format

```
[prefix]-[zero-padded sequence]/[FY]
```

Examples:
- `D-00001/2025-26`
- `D-00002/2025-26`
- `D-00001/2026-27` (resets each FY)

### Uniqueness Rule

Two tax rates **cannot share the same prefix**. If they did, both would generate `D-00001`, `D-00002`, etc. — creating duplicate invoice numbers, which is illegal under GST law.

**Server enforcement** (`checkInvPrefixUnique` in `tax.actions.ts`):

```ts
WHERE inv_prefix = $prefix
  AND inv_prefix IS NOT NULL   // exclude NULL — multiple rates can have no prefix
  AND id != $currentId         // exclude the record being edited
```

Multiple tax rates **can** have no prefix (NULL). A rate with no prefix simply won't be used for invoice number generation. This is fine for rates that appear on purchase-side only or are not used on customer invoices.

### Recommended Setup for Durga Industries

Assign prefix `"D"` to the **18% GST rate** (the primary rate for steel fabrication work). Leave 5%, 12%, and 28% rates without prefixes unless Durga Industries needs separate invoice series for different rate tiers.

---

## 8. Stock Rules

These rules govern how stock levels change in the system. They are enforced at multiple layers.

### Rule 1 — Stock Only Enters Via Purchase Orders

`PO_INWARD` is the only stock-increasing transaction type in Phase 3. Stock cannot be added through any other mechanism until Phase 4 adds `ADJUSTMENT` transactions.

### Rule 2 — Stock Only Leaves Via Issues or Adjustments

In Phase 3, stock can only decrease via:
- Deleting a received PO (REVERSAL)
- Editing a received PO downward (REVERSAL + PO_INWARD at new quantity)

Phase 4 adds `ISSUE` (material drawn from warehouse for a job) and `ADJUSTMENT` (manual correction).

### Rule 3 — `current_stock` Is Never Directly Modified

`materials.current_stock` must only be changed through server actions that also write a `stock_ledger` row. It is never updated directly in any form, API endpoint, or raw SQL outside of server actions. Any future developer adding stock-related features must follow this pattern.

### Rule 4 — Stock Cannot Go Below Zero (DB Constraint)

```sql
CHECK (current_stock >= 0)
```

This is enforced at the database level. Attempting to set `current_stock` to a negative value will throw a constraint violation. The server-side checks (e.g. delete PO safety check) pre-validate before attempting the update to provide a human-readable error message instead of a raw constraint error.

### Rule 5 — The Stock Ledger Is Append-Only

`stock_ledger` rows are never updated or deleted. This table is the permanent audit trail. If a correction needs to be made (e.g. a received PO was wrong), it is handled via REVERSAL + new PO_INWARD entries — the original entries stay in the ledger as historical fact.

### Rule 6 — All Stock Operations Are Atomic

Any operation that touches multiple materials' `current_stock` (e.g. receiving a PO with 5 line items) must use `db.transaction()`. Either all 5 materials are updated, or none are. There are no partial stock updates.

### Stock Ledger Columns

| Column | Type | Meaning |
|--------|------|---------|
| `material_id` | UUID FK | Which material's stock changed |
| `transaction_type` | TEXT | Why it changed: `PO_INWARD`, `ISSUE`, `REVERSAL`, `ADJUSTMENT` |
| `reference_id` | UUID | Source record (po_id, issue_id, etc.) |
| `reference_type` | TEXT | `'purchase_order'`, `'material_issue'`, etc. |
| `qty_change` | NUMERIC | Signed: `+200` = added, `-200` = removed |
| `stock_after` | NUMERIC | Balance after this transaction |
| `created_at` | TIMESTAMPTZ | When this event occurred |

`stock_after` is pre-computed and stored so stock-at-a-point-in-time queries are fast (single row lookup, not a full aggregate).

---

## 9. Soft Delete — Why Nothing Is Ever Hard-Deleted

Every master table in this system has `is_active boolean DEFAULT true`. When a record is "deleted" by the user, it is soft-deleted: `is_active = false`.

### Why Hard Delete Is Avoided

All transaction records hold FK references to master data:

- A `purchase_order_items` row has `supplier_id FK`, `material_id FK`, `unit_id FK`
- A future `invoice_items` row will have `customer_id FK`, `material_id FK`, `tax_rate_id FK`

If a supplier is hard-deleted, all their PO items now reference a non-existent row. This breaks JOIN queries, produces NULL supplier names on historical documents, and causes foreign key violations if ON DELETE RESTRICT is used.

Soft delete avoids this entirely: the supplier's data remains in the DB and is still joinable. It just doesn't show up in active dropdowns or default list views.

### What Deactivation Does

```
is_active = false
 → Hidden from all active dropdowns (getSuppliers(), getMaterials(), etc. filter WHERE is_active = true)
 → Hidden from default table view in the master page
 → Still visible when "Show Inactive" is toggled on
 → Still joinable from all transaction tables
 → All historical documents (POs, invoices) still show the correct name
```

### What Reactivation Does

```
is_active = true
 → Appears in active dropdowns immediately
 → Appears in default table view immediately
 → Does NOT restore any dependent relationships (e.g. reactivating a tax rate that was removed from materials doesn't re-assign it to those materials)
```

---

## 10. Code Numbering Conventions

All master records have a sequential display code. The integer is stored in the DB; the formatted string is assembled by `formatCode()` for display only.

### Code Format Reference

| Entity | Format | Example | DB Column | Digits |
|--------|--------|---------|-----------|--------|
| Customer | C + N digits | C001 | `customer_no` SERIAL | 3 |
| Supplier | S + N digits | S001 | `code_no` SERIAL | 3 |
| Material | M + N digits | M001 | `material_no` SERIAL | 3 |
| Unit | U + N digits | U01 | `unit_code` SERIAL | 2 |
| Tax Rate | T + N digits | T01 | `vat_code` SERIAL | 2 |
| Contractor | CON + N digits | CON01 | `contractor_no` SERIAL | 2 |
| Vehicle/Job | J + N digits | J00001 | `job_ref_no` SERIAL | 5 |
| Purchase Order | PO- + N digits | PO-0001 | `po_number` integer | 4 |

Note: PO `po_number` is **not** a SERIAL — it resets to 1 each financial year. All other codes use SERIAL columns and never reset.

### Why Prefix Codes

Without prefixes, "5" is ambiguous — it could be Customer 5, Supplier 5, or Material 5. With prefixes, "M005" unambiguously identifies Material #5. This matters especially when switching between screens or communicating codes verbally or in written correspondence.

### Smart Search

The `matchesCode(search, prefix, num)` helper (in `src/lib/utils.ts`) allows users to search by any reasonable representation of a code:

- `"5"` → finds Material #5 (just the number)
- `"M5"` → finds Material #5 (prefix + number, no padding)
- `"M005"` → finds Material #5 (full formatted code)
- `"M06"` → finds Material #6

This makes the search box forgiving — users don't need to know the exact zero-padded format.

---

## 11. Legacy Tax Fields (TIN / CST)

### What They Are

Before GST (pre-July 2017), India had a different tax system:
- **TIN** (Tax Identification Number): State-level identification for VAT-registered businesses
- **CST** (Central Sales Tax): Tax on inter-state sales, registered separately from VAT

Both were replaced by GSTIN when GST was introduced.

### In This System

TIN No and CST No are stored on the Supplier master. They have no business logic — they are **display-only reference fields** for older suppliers who registered under the pre-GST system.

No calculations, no validations, no deactivation guards depend on TIN or CST. They exist purely to preserve historical supplier registration data that Durga Industries may need for old records, tax audits, or dealing with government departments that still reference the old IDs.

New suppliers registered after July 2017 will only have a GSTIN, not TIN or CST.
