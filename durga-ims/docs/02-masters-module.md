# Phase 2 — Masters Module

> Masters are the **reference data layer** of the IMS. Every transaction module (Purchase Orders, Material Issues, Invoicing) depends on masters being populated first. You cannot create a PO without the supplier existing in Suppliers master. You cannot add a material to a PO without it existing in Materials master.

---

## Table of Contents

1. [What Are Masters?](#1-what-are-masters)
2. [Shared Features (All 7 Masters)](#2-shared-features-all-7-masters)
3. [The 7 Masters — Overview](#3-the-7-masters--overview)
4. [Customer Master (C001)](#4-customer-master-c001)
5. [Supplier Master (S001)](#5-supplier-master-s001)
6. [Material Master (M001)](#6-material-master-m001)
7. [Unit Master (U01)](#7-unit-master-u01)
8. [Tax Rate Master (T01)](#8-tax-rate-master-t01)
9. [Contractor Master (CON01)](#9-contractor-master-con01)
10. [Vehicle / Job Master (J00001)](#10-vehicle--job-master-j00001)
11. [Deactivation Guards — Design Pattern](#11-deactivation-guards--design-pattern)
12. [Code Numbering System](#12-code-numbering-system)
13. [Phase 2 Gap Fixes Applied](#13-phase-2-gap-fixes-applied)
14. [Key Files](#14-key-files)

---

## 1. What Are Masters?

Masters are the central reference tables. They define the **entities** that all transactions reference. Before any business activity can be recorded:

- The **customer** being invoiced must exist in Customer Master
- The **supplier** being paid must exist in Supplier Master
- The **material** being bought or issued must exist in Material Master
- The **unit** of measurement must exist in Unit Master
- The **tax rate** applied to a material must exist in Tax Rate Master

Masters are populated once (when setting up the system or onboarding a new entity) and maintained over time as the business changes. They are never hard-deleted — see [Section 11](#11-deactivation-guards--design-pattern).

---

## 2. Shared Features (All 7 Masters)

Every master page is built on the same `MasterLayout` component and supports the same set of operations:

### Operations
| Operation | What it does |
|-----------|-------------|
| **Add** | Form on the left panel. Fill fields, click Add. |
| **Edit** | Click the pencil icon on a row. Form pre-fills. Click Update. |
| **Deactivate** | Click the amber UserX icon. Confirmation dialog appears. Deactivated records get `is_active = false`. |
| **Reactivate** | Toggle "Show Inactive" to reveal deactivated rows. Click the green Reactivate button. |

There is no permanent delete. See [Section 11](#11-deactivation-guards--design-pattern) for why, and what checks run before deactivation is allowed.

### Search
Every master table has a search box that matches on:
- **Name** (substring, case-insensitive)
- **Code** (smart: `"5"`, `"M5"`, and `"M005"` all find Material #5)
- Other fields specific to each master (GSTIN, city, etc.)

The smart code search is implemented by `matchesCode(search, prefix, num)` in `src/lib/utils.ts`.

### Show Inactive Toggle
When there are deactivated records, a "Show Inactive (N)" button appears. Clicking it reveals deactivated rows (shown at 50% opacity with a grey background). The count in the button label updates live.

### Two-Panel Layout
All master pages use `MasterLayout`:
- **Left panel** (320px fixed): the Add/Edit form
- **Right panel** (flexible): search bar + scrollable table

Tables use `min-w-max` so all columns are always visible. Horizontal scroll is table-level (not page-level). The first 3 columns (S.No, Code, Name) are sticky so they remain visible during scroll.

---

## 3. The 7 Masters — Overview

| Master | Code Format | Phase Used In | Deactivation Guard |
|--------|------------|--------------|-------------------|
| Customers | C001 | Phase 5 (Invoicing) | None yet (Phase 5 will add guard for open invoices) |
| Suppliers | S001 | Phase 3 (Purchase Orders) | Blocked if referenced in any Draft PO |
| Materials | M001 | Phase 3, 4, 5 | Blocked if `current_stock > 0` |
| Units | U01 | Phase 3 (PO line items) | Blocked if assigned to any material |
| Tax Rates | T01 | Phase 3, 5 | Blocked if assigned to any material |
| Contractors | CON01 | Phase 4 (Material Issues) | None yet (Phase 4 will add guard) |
| Vehicles/Jobs | J00001 | Phase 4 (Material Issues) | None yet (Phase 4 will add guard) |

---

## 4. Customer Master (C001)

### Purpose
Customers are the companies or individuals to whom Durga Industries issues invoices. Every vehicle job is linked to a customer. Every invoice is billed to a customer.

### Fields
| Field | Required | Notes |
|-------|----------|-------|
| Customer Name | ✅ | Stored as entered (mixed case) |
| Address Line 1 | — | |
| Address Line 2 | — | |
| Street | — | |
| City | — | |
| State | — | Combobox with all 28 Indian states + UTs |
| GSTIN | — | Used in Phase 5 to determine CGST+SGST vs IGST on outgoing invoices. See [domain-rules.md](./domain-rules.md). |

### Code Assignment
`customer_no` is a SERIAL column. Auto-increments on each insert. Display: `formatCode("C", customer_no)` → `C001`, `C002`, etc.

### Table Columns
S.No | Customer Code | Customer Name | Address | City | State | GSTIN | Actions

Sticky columns: S.No (left-0), Customer Code (left-12), Customer Name (left-40).

### Notes
- No deactivation guard in Phase 2. Phase 5 will add a guard to prevent deactivating a customer with open (unpaid) invoices.

---

## 5. Supplier Master (S001)

### Purpose
Suppliers are vendors from whom Durga Industries buys materials. Every Purchase Order line item references a supplier.

### Fields
| Field | Required | Notes |
|-------|----------|-------|
| Supplier Name | ✅ | |
| TIN No | — | Legacy pre-GST identifier (Tax Identification Number). Stored for historical reference only. No business logic uses it. |
| CST No | — | Legacy Central Sales Tax number. Same as above — display only. |
| GSTIN | — | 15-character GST identifier. **Critical for tax type determination** in Purchase Orders. Soft-validated on blur. |
| Address | — | Single address field |
| State | — | Combobox with Indian states. Used as fallback when GSTIN is absent. |

### GSTIN Validation
GSTIN is **soft-validated** when the field loses focus (on blur):
- Pattern: `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$`
- If the entered value doesn't match: an amber warning toast is shown
- **Save is not blocked** — legacy records may have unknown GSTINs or the format may vary. The user is informed but can proceed.
- Server stores GSTIN trimmed and uppercased regardless

### Why GSTIN Matters
When this supplier is selected on a Purchase Order line item, the system reads the first 2 digits of their GSTIN. `"33"` = Tamil Nadu = same state as Durga Industries = CGST + SGST split. Any other code = cross-state = IGST. Falls back to the `state` field if GSTIN is blank. See [domain-rules.md](./domain-rules.md) for full GST explanation.

### Deactivation Guard
Before deactivating a supplier, the server checks:
```sql
SELECT po.po_number
FROM purchase_order_items poi
JOIN purchase_orders po ON poi.po_id = po.id
WHERE poi.supplier_id = $id AND po.status = 'Draft'
LIMIT 1
```
If a Draft PO references this supplier: throws error naming the specific PO number (e.g. `"Cannot deactivate 'ABC Steels': they are referenced in Draft PO-0003. Complete or delete that PO first."`).

Received POs are not a blocker — the supplier is already historical data at that point.

### Table Columns
S.No | Supplier Code | Supplier Name | Address | State | GSTIN | TIN No. | Actions

---

## 6. Material Master (M001)

### Purpose
Materials are the physical stock items tracked by the warehouse. Every purchase, issue, and invoice line item references a material. The system tracks current stock levels per material.

### Fields
| Field | Required | Notes |
|-------|----------|-------|
| Material Name | ✅ | Stored uppercase. E.g. `"25*3MM ANGLE"` |
| HSN Code | — | 8-digit government commodity code. Required on GST invoices but not enforced here — fill gradually. |
| Tax Rate | — | FK to Tax Rate master. Auto-fills tax % on PO and invoice line items. |
| Purchase Unit | ✅* | FK to Unit master. The unit used when buying this material (e.g. BOX, KG). *Required since Phase 2 gap fix — see [Section 13](#13-phase-2-gap-fixes-applied). |
| Sales Unit | — | FK to Unit master. The unit used when issuing/invoicing this material (e.g. PCS, LTR). |
| Conversion Value | — | How many sales units = 1 purchase unit. E.g. `100` if 1 BOX = 100 PCS. Default: `1`. |
| Opening Stock | — | Stock on hand when this material was first entered. Entered once, never editable after creation. |
| Min Level | — | Minimum stock threshold. Row turns red in the table when `current_stock < min_level`. |
| Max Level | — | Maximum stock advisory. No automated action — for planning reference. |

### Purchase Unit vs Sales Unit

This distinction matters starting in Phase 3:

| Unit Type | When Used | Example |
|-----------|----------|---------|
| Purchase Unit | Purchase Order line items | Buy bolts in BOX |
| Sales Unit | Material Issue / Invoice line items (Phase 4/5) | Issue bolts as NO (pieces) |
| Conversion Value | Bridges the two | 1 BOX = 100 NO → Conversion = 100 |

For most materials both units are the same (e.g. MS Paint bought in LTR, issued in LTR → both = LTR, conversion = 1).

### Opening Stock vs Current Stock

| Column | Meaning | Editable? |
|--------|---------|-----------|
| `opening_stock` | Stock declared when material was created. Historical baseline. | Write-once (creation only) |
| `current_stock` | Live stock. Changes with every PO receipt and material issue. | Never — only server actions modify it |

`current_stock` is initialised to `opening_stock` on creation. It is never directly editable in any UI or server action parameter — it is always derived from transactions.

### Stock Constraints
- DB-level: `CHECK (current_stock >= 0)` — stock can never go negative
- Deactivation guard: `current_stock > 0` blocks deactivation (you can't "lose" stock by deactivating a material)

### Deactivation Guard
Before deactivating a material, the server checks `current_stock`:
```ts
if (parseFloat(mat.current_stock) > 0) {
  throw new Error(
    `Cannot deactivate "${mat.name}": current stock is ${value}. Bring stock to zero before deactivating.`
  );
}
```
To bring stock to zero: create a PO to receive 0 (not applicable), or use a stock Adjustment (Phase 4). In practice, deactivate only discontinued materials with no remaining stock.

### Table Columns
S.No | Material Code | Material Name | HSN | Tax Rate | Pur. Unit | Sal. Unit | Conv. | Min | Max | Stock | Actions

Sticky: S.No, Material Code, Material Name. Stock column shows in red when below Min Level.

---

## 7. Unit Master (U01)

### Purpose
Units of measurement attached to materials and transaction line items. Examples: KG (kilogram), PCS (pieces), MTR (metre), LTR (litre), BOX, SET, NO.

### Fields
| Field | Required | Notes |
|-------|----------|-------|
| Unit Name | ✅ | Stored uppercase. E.g. `"KG"`, `"PCS"` |

Unit Code (`unit_code`) is auto-assigned as a 2-digit SERIAL: U01, U02, etc.

### Deactivation Guard
Before deactivating a unit, the server checks both unit FK columns on materials:
```sql
SELECT id FROM materials
WHERE purchase_unit_id = $id OR sales_unit_id = $id
LIMIT 1
```
If any material (active or inactive) uses this unit in either capacity → throws: `"Cannot deactivate unit 'KG': it is assigned to one or more materials. Reassign those materials first."`

Reassigning materials first is the correct resolution — edit each material and change its purchase/sales unit to an alternative.

### Table Columns
S.No | Unit Code | Unit Name | Actions

---

## 8. Tax Rate Master (T01)

### Purpose
Tax rate tiers for Indian GST. Each material is assigned one tax rate. The rate is used to calculate CGST/SGST/IGST on PO line items and invoices.

### Fields
| Field | Required | Notes |
|-------|----------|-------|
| Tax % | ✅ | Numeric. E.g. `18` for GST 18%. Displayed as plain number in tables (never `18.00%` or `18.00`). |
| Description | ✅ | Human label shown in dropdowns. E.g. `"GST 18%"`, `"GST 5%"` |
| Invoice Prefix | — | For Phase 5 invoice number series. See below. |

### Invoice Prefix — How It Works
In Phase 5, each invoice gets an auto-generated number like `D-00001/2025-26`. The prefix (`D` in this example) comes from the tax rate assigned to that invoice. This allows separate sequential series per tax rate tier if needed.

**Uniqueness rule**: Two tax rates cannot share the same prefix (their invoice sequences would collide). The server enforces this via `checkInvPrefixUnique()` on both create and update:
```ts
// Checks: same prefix already exists, excluding current record, excluding NULLs
WHERE inv_prefix = $prefix AND id != $currentId AND inv_prefix IS NOT NULL
```
Multiple tax rates may have no prefix (NULL is not unique-constrained — a rate with no prefix simply won't be used for invoice number generation).

**Recommended setup for Durga Industries**: Assign prefix `"D"` to the 18% GST rate. Leave other rates without a prefix unless separate invoice series are needed.

### Deactivation Guard
Before deactivating a tax rate, the server checks:
```sql
SELECT id FROM materials WHERE tax_rate_id = $id LIMIT 1
```
If any material has this rate assigned → throws: `"Cannot deactivate 'GST 18%': it is assigned to one or more materials. Reassign those materials first."`

### Table Columns
S.No | Tax Code | Description | Tax % | Invoice Prefix | Actions

---

## 9. Contractor Master (CON01)

### Purpose
Workers or subcontractors who are assigned to job-related material issues in Phase 4. Example: a fabricator or welder who draws materials from the warehouse for a specific customer job.

### Fields
| Field | Required | Notes |
|-------|----------|-------|
| Name | ✅ | |
| Role | — | E.g. `"Fabricator"`, `"Welder"`, `"Painter"` |

Contractor Code (`contractor_no`) is auto-assigned: CON01, CON02, etc.

### No Deactivation Guard (Phase 2)
No deactivation guard exists yet. Phase 4 (Material Issues) will add a guard to prevent deactivating a contractor who is assigned to open issue slips.

### Table Columns
S.No | Contractor Code | Contractor Name | Role | Actions

---

## 10. Vehicle / Job Master (J00001)

### Purpose
Each customer vehicle or job order being worked on. A job record ties a vehicle to a customer and gives it a reference number (J00001) used on material issue slips.

### Fields
| Field | Required | Notes |
|-------|----------|-------|
| Vehicle Name | ✅ | E.g. `"TN 01 AB 1234"`, `"Customer Lorry #3"` |
| Customer | ✅ | FK to Customer master. Every vehicle belongs to a customer. |

Job Reference No (`job_ref_no`) is auto-assigned: J00001, J00002, etc. (5-digit zero-padded).

### No Deactivation Guard (Phase 2)
No deactivation guard exists yet. Phase 4 will add a guard for open material issues referencing this job.

### Table Columns
S.No | Job Ref | Vehicle Name | Customer | Actions

---

## 11. Deactivation Guards — Design Pattern

Before any master record is deactivated, the server action checks whether it is still referenced by active data. If it is, the action throws a descriptive error — the client catches it and shows it as a toast.

### Pattern (same for all guards)

```ts
// 1. Query for active references
const inUse = await db
  .select({ id: dependentTable.id })
  .from(dependentTable)
  .where(eq(dependentTable.fkColumn, id))
  .limit(1);

// 2. If found: throw with context
if (inUse.length > 0) {
  const [record] = await db.select({ name: ... }).from(...).where(eq(..., id));
  throw new Error(`Cannot deactivate "${record.name}": [reason]. [Resolution instruction].`);
}

// 3. If safe: soft delete
await db.update(table).set({ is_active: false }).where(eq(table.id, id));
revalidatePath("/masters/...");
```

### Guards Summary

| Master | Guard Query | Error Message Pattern |
|--------|------------|----------------------|
| Material | `current_stock > 0` on the material itself | `Cannot deactivate "X": current stock is N. Bring stock to zero first.` |
| Unit | `materials WHERE purchase_unit_id = id OR sales_unit_id = id` | `Cannot deactivate unit "X": it is assigned to one or more materials.` |
| Tax Rate | `materials WHERE tax_rate_id = id` | `Cannot deactivate "X": it is assigned to one or more materials.` |
| Supplier | `purchase_order_items JOIN purchase_orders WHERE supplier_id = id AND status = 'Draft'` | `Cannot deactivate "X": referenced in Draft PO-YYYY.` |

**Why these specific guards?**

- **Material stock guard**: Deactivating a material with stock would make that stock invisible — it would no longer appear in any list, but the warehouse would still physically have it. The stock must be cleared first.
- **Unit guard**: A material without a valid unit would show no unit in PO line items, making documents meaningless.
- **Tax rate guard**: A material without a valid tax rate would produce incorrect or zero tax calculations on POs and invoices.
- **Supplier guard** (Draft POs only): A Draft PO is still editable — if its supplier is deactivated, the supplier combobox on that PO would show no selection, making the PO impossible to complete. Received POs are historical and don't need editing.

---

## 12. Code Numbering System

### How Codes Are Generated

Codes are stored as **plain integers** (SERIAL columns) in the database. The formatted display code is assembled only in the UI via `formatCode()`. They are never stored as formatted strings.

```
DB stores:  material_no = 5
UI shows:   formatCode("M", 5) → "M005"
```

### Rules

1. Codes are **never reused** — once a record is created and gets code 5, that integer is permanently retired even after deactivation
2. The SERIAL counter only increments — it never decrements when records are deactivated
3. Gap in sequence is fine (e.g. M001, M002, M005 with M003 and M004 deactivated) — it is not an error

### Code Format Reference

| Master | Format | Example | DB Column | Pad |
|--------|--------|---------|-----------|-----|
| Customer | C + 3 digits | C001 | `customer_no` SERIAL | 3 |
| Supplier | S + 3 digits | S001 | `code_no` SERIAL | 3 |
| Material | M + 3 digits | M001 | `material_no` SERIAL | 3 |
| Unit | U + 2 digits | U01 | `unit_code` SERIAL | 2 |
| Tax Rate | T + 2 digits | T01 | `vat_code` SERIAL | 2 |
| Contractor | CON + 2 digits | CON01 | `contractor_no` SERIAL | 2 |
| Vehicle/Job | J + 5 digits | J00001 | `job_ref_no` SERIAL | 5 |

Note: Purchase Orders use `PO-` prefix with 4-digit padding, but the counter resets each financial year — it is not a SERIAL.

---

## 13. Phase 2 Gap Fixes Applied

After the initial Phase 2 build, six gaps were identified and resolved. These are documented here so future developers understand why these checks exist.

---

### Gap Fix 1 — Material Deactivation Guard

**Problem**: `deleteMaterial()` would soft-delete a material even if it had active stock. The stock would then be invisible (material hidden) but physically still exist in the warehouse.

**Fix** (`materials.actions.ts`): Query `current_stock` before deactivating. If `> 0`, throw with the exact stock value.

**Why the guard uses `> 0` not `!= 0`**: Stock can never be negative (DB constraint), so checking `> 0` is equivalent to `!= 0` here. The message is more user-friendly: it tells the user the exact quantity to resolve.

---

### Gap Fix 2 — Unit Deactivation Guard

**Problem**: `deleteUnit()` would soft-delete a unit even if materials were still assigned to it. Those materials would then show blank unit on PO line items.

**Fix** (`units.actions.ts`): Query `materials` for `purchase_unit_id = id OR sales_unit_id = id`. Block if found. The `OR` is important — a unit used only as a sales unit (not purchase) is still blocked.

---

### Gap Fix 3 — Tax Rate Deactivation Guard + `inv_prefix` Uniqueness

**Problem 1**: `deleteTaxRate()` had no reference check. Deactivating a rate assigned to materials would cause those materials to have no valid tax rate, producing wrong calculations on future POs.

**Problem 2**: `inv_prefix` had no uniqueness enforcement. Two tax rates with the same prefix (e.g. both using `"D"`) would generate colliding invoice number sequences in Phase 5 (D-00001 created twice).

**Fix** (`tax.actions.ts`):
- Added `checkInvPrefixUnique(prefix, excludeId?)` helper called in both `createTaxRate` and `updateTaxRate`
- Added material reference check in `deleteTaxRate`

**Why NULL is allowed for multiple rates**: Not every tax rate needs an invoice prefix. The uniqueness rule is `WHERE inv_prefix = $prefix AND inv_prefix IS NOT NULL` — NULL is excluded from the uniqueness check.

---

### Gap Fix 4 — Supplier Deactivation Guard

**Problem**: `deleteSupplier()` had no reference check. Deactivating a supplier referenced in a Draft PO would leave that PO's supplier selection blank, making it impossible to complete.

**Fix** (`suppliers.actions.ts`): Join `purchase_order_items` → `purchase_orders` to find Draft POs referencing this supplier. Throw with the specific PO number.

**Why only Draft POs?**: Received POs are historical. The supplier on a Received PO is frozen into the document — it doesn't need to be selectable or editable. Only Draft POs are still being actively worked on.

---

### Gap Fix 5 — GSTIN Soft Validation

**Problem**: Suppliers could be saved with any value in the GSTIN field, including obviously wrong formats. A malformed GSTIN would cause `determineGstType()` to fall back to the state field, which may also be wrong — silently producing incorrect GST calculations on POs.

**Fix** (`suppliers-client.tsx`): On blur of the GSTIN input, validate against the regex pattern. Show an amber warning toast if invalid. **Save is not blocked** — legacy records may have non-standard formats, and blocking would prevent data entry for older suppliers.

---

### Gap Fix 6 — Purchase Unit Required

**Problem**: A material could be saved without a purchase unit. When that material was added to a PO, the Unit column would show blank. The PO could still be saved, but the document would be incomplete and confusing.

**Fix** (`materials.actions.ts`): Both `createMaterial()` and `updateMaterial()` throw `"Purchase unit is required."` if `purchase_unit_id` is falsy. The form label was updated to show `"Purchase Unit *"`.

**Why only purchase unit (not sales unit)?**: Sales unit is used in Phase 4/5. Until those phases ship, not all materials will have a sales unit. Purchase unit is immediately required (Phase 3 is already live).

---

## 14. Key Files

```
src/lib/actions/
  customers.actions.ts        ← getCustomers, getAllCustomers, createCustomer, updateCustomer, deleteCustomer, reactivateCustomer
  suppliers.actions.ts        ← getSuppliers, getAllSuppliers, createSupplier, updateSupplier, deleteSupplier, reactivateSupplier
  materials.actions.ts        ← getMaterials, getAllMaterials, createMaterial, updateMaterial, deleteMaterial, reactivateMaterial
  units.actions.ts            ← getUnits, getAllUnits, createUnit, updateUnit, deleteUnit, reactivateUnit
  tax.actions.ts              ← getTaxRates, getAllTaxRates, createTaxRate, updateTaxRate, deleteTaxRate, reactivateTaxRate
  contractors.actions.ts      ← getContractors, getAllContractors, ...
  vehicles.actions.ts         ← getVehicles, getAllVehicles, ...

src/app/(dashboard)/masters/
  customers/
    page.tsx                  ← Server: fetches all customers, renders CustomersClient
    customers-client.tsx      ← Client: form + table UI
  suppliers/
    page.tsx
    suppliers-client.tsx      ← includes GSTIN blur validation
  materials/
    page.tsx                  ← fetches materials + tax rates + units (all needed for form dropdowns)
    materials-client.tsx
  units/ tax/ contractors/ vehicles/
    (same pattern)

src/components/masters/
  master-layout.tsx           ← shared two-panel layout component
```
