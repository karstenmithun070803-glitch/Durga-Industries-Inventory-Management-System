# Masters Module

> Masters are the reference data layer. Every transaction (Purchase Orders, Material Issues, Invoices) depends on master records existing first — you cannot create a PO without the supplier in Suppliers master, or issue a material that isn't in Materials master.

*Last reviewed: 2026-06-04*

---

## Shared Pattern (All 7 Masters)

All master pages use `MasterLayout`: left panel (form) + right panel (searchable table).

### Interaction
| Operation | How |
|-----------|-----|
| **Add** | Fill left panel form → click Add |
| **Edit** | Click any row in the table → form pre-fills with that record's data → click Update |
| **Deactivate** | Open edit form for an active record → Deactivate button appears at the bottom of the form panel → confirmation dialog |
| **Reactivate** | Toggle "Show Inactive" → click the inactive row → Reactivate button appears at the bottom of the form panel |

No record is ever hard-deleted. `is_active = false` is the only "deletion". Inactive rows show at 50% opacity with a grey background when the "Show Inactive" toggle is on.

### Search
Every master has a search box matching on name and code. The code search is smart: `"5"`, `"M5"`, and `"M005"` all find Material #5. Implemented by `matchesCode(search, prefix, num)` in `src/lib/utils.ts`.

---

## Code Numbering System

Codes are stored as plain SERIAL integers in the DB. The formatted display code is assembled only in the UI via `formatCode()` in `src/lib/utils.ts`. Never stored as formatted strings.

| Master | Format | Example | DB Column |
|--------|--------|---------|-----------|
| Customer | C + 3 digits | C001 | `customer_no` |
| Supplier | S + 3 digits | S001 | `code_no` |
| Material | M + 3 digits | M001 | `material_no` |
| Unit | U + 2 digits | U01 | `unit_code` |
| Tax Rate | T + 2 digits | T01 | `vat_code` |
| Contractor | CON + 2 digits | CON01 | `contractor_no` |
| Vehicle/Job | J + 5 digits | J00001 | `job_ref_no` |

Codes are never reused. Gaps in sequence (M001, M002, M005) are expected and not an error.

---

## The 7 Masters

### Customer (C001)
**Purpose:** Companies/individuals invoiced by Durga Industries. Every vehicle job links to a customer. Every invoice bills to a customer.

**Key fields:** Name, Address, City, State (combobox — all Indian states+UTs), GSTIN

**GSTIN matters for outgoing invoices:** If customer GSTIN starts with `"33"` (Tamil Nadu) → CGST+SGST split. Otherwise → IGST. Falls back to State field if GSTIN is blank.

**Deactivation guard:** Blocked if customer has any active vehicles linked (`vehicles WHERE customer_id = id AND is_active = true`). Deactivate the vehicles first.

---

### Supplier (S001)
**Purpose:** Vendors from whom Durga buys materials. Each PO line item references a supplier (not the PO header).

**Key fields:** Name, GSTIN, State, Address, TIN No (legacy, display only), CST No (legacy, display only)

**GSTIN matters for incoming POs:** First 2 digits of supplier GSTIN determine tax type on PO line items. `"33"` = Tamil Nadu = CGST+SGST. Other = IGST. Falls back to State field if GSTIN is blank.

**GSTIN validation:** Soft-validated on blur (pattern check). Amber warning shown if invalid format, but save is not blocked — legacy records may not conform.

**Deactivation guard:** Blocked if supplier is referenced in any **Draft** PO (`purchase_order_items JOIN purchase_orders WHERE supplier_id = id AND status = 'Draft'`). Received POs are historical — not a blocker.

---

### Material (M001)
**Purpose:** Physical stock items tracked by the warehouse. All purchases, issues, and invoice line items reference a material.

**Key fields:**
| Field | Notes |
|-------|-------|
| Material Name | Stored uppercase |
| HSN Code | 8-digit commodity code for GST invoices |
| Tax Rate | FK to Tax Rate master — auto-fills on PO/invoice line items |
| Purchase Unit | Unit used when buying (e.g. BOX, KG) |
| Sales Unit | Unit used when issuing/invoicing (e.g. PCS, LTR) |
| Conversion Value | How many sales units = 1 purchase unit (default: 1) |
| Opening Stock | Declared once on creation — never editable after that |
| Min Level / Max Level | Thresholds for low-stock badge in stock dashboard |

**`opening_stock` vs `current_stock`:** `opening_stock` is the declared baseline (write-once). `current_stock` is the live running total modified only by server actions — never directly settable in any UI.

**DB constraint:** `CHECK (current_stock >= 0)` — stock cannot go negative at the DB level.

**Deactivation guard:** Blocked if `current_stock > 0`. Bring stock to zero via a manual stock adjustment before deactivating.

---

### Unit (U01)
**Purpose:** Units of measurement attached to materials and transaction line items (KG, PCS, MTR, LTR, BOX, SET, NO, etc.)

**Deactivation guard:** Blocked if any material (active or inactive) has this unit assigned as either `purchase_unit_id` or `sales_unit_id`. Reassign those materials first.

---

### Tax Rate (T01)
**Purpose:** GST rate tiers. Each material gets one tax rate. Rate is used to compute CGST/SGST/IGST on PO line items and invoices.

**Invoice Prefix field:** Each tax rate can have a prefix string (e.g. `"D"`). Invoice numbers are generated as `D-00001/2025-26`. Two rates cannot share the same non-null prefix (uniqueness enforced by server). Multiple rates can have a null prefix.

**Deactivation guard:** Blocked if any material has this rate assigned (`materials WHERE tax_rate_id = id`). Reassign those materials first.

---

### Contractor (CON01)
**Purpose:** Workers/subcontractors assigned to material issue slips. A contractor draws materials from the warehouse for a specific job.

**Key fields:** Name, Role (e.g. Fabricator, Welder, Painter), Contact

**No deactivation guard** — historical MI records are preserved on deactivation.

---

### Vehicle / Job (J00001)
**Purpose:** Each customer vehicle or job order being worked on. Links a vehicle to a customer. Appears on material issue slips.

**Key fields:** Vehicle Name (e.g. "TN 01 AB 1234"), Customer (FK)

**Type field:** `"New Build"` or `"Old Build"`. Displayed on material issue slips and invoice summary report.

**No deactivation guard** — historical records are preserved on deactivation.

---

## Deactivation Guard Pattern

All guards follow the same server-side pattern:
1. Query for active references
2. If found → throw descriptive error (caught by client, shown as toast)
3. If safe → `UPDATE ... SET is_active = false`

Error messages name the blocking record. Example: `"Cannot deactivate 'ABC Steels': referenced in Draft PO-0003. Complete or delete that PO first."`

---

## Key Files

```
src/lib/actions/
  customers.actions.ts
  suppliers.actions.ts
  materials.actions.ts
  units.actions.ts
  tax.actions.ts
  contractors.actions.ts
  vehicles.actions.ts

src/app/(dashboard)/masters/
  customers/customers-client.tsx
  suppliers/suppliers-client.tsx
  materials/materials-client.tsx
  units/units-client.tsx
  tax/tax-client.tsx
  contractors/contractors-client.tsx
  vehicles/vehicles-client.tsx

src/components/masters/master-layout.tsx   — shared two-panel layout
src/lib/utils.ts                           — formatCode(), matchesCode()
```

---

## Gotchas

- **Per-item supplier (not per PO):** Suppliers are on `purchaseOrderItems`, not on `purchaseOrders`. This is intentional — a single buying trip can involve multiple vendors.
- **Deactivation guard on Supplier is Draft-only:** Received POs are historical data. Only Draft POs block deactivation because they are still editable and would become broken if the supplier disappeared from dropdowns.
- **Material stock guard is absolute:** Even 0.001 units of remaining stock blocks deactivation. Use a manual stock adjustment to clear to exactly zero.
- **Invoice prefix uniqueness:** NULL is not unique-constrained — multiple tax rates can have no prefix. Only non-null prefixes must be unique.
