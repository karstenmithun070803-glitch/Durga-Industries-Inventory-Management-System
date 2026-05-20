# Product Requirements Document (PRD): Sabari Steels ERP & Inventory System
**Target Audience:** AI Coding Assistant (Claude Code)
**Project Type:** Next.js + Tailwind CSS + Supabase/Neon (PostgreSQL)

## 1. Project Overview
We are modernizing a legacy desktop ERP system into a real-time, cloud-synced web application. The core requirement is an **Automated Inventory Engine**. The old software lacked proper stock tracking; the new system must mathematically track every material (e.g., bolt, wood, glass) entering the warehouse via Purchase Orders and exiting the warehouse via Vehicle Job Allocations.

**Key Technical Requirements:**
- **Real-Time Sync:** Data must update instantly across devices.
- **Global Financial Year Filter:** The app must have a global setting to filter all transactions and reports by a selected Financial Year date range.
- **Modern UI:** Replace redundant legacy tabs with clean, unified dashboards.

---

## 2. Database Schema (The "Masters" Module)
These tables form the foundation of the app. All primary keys should be UUIDs, but we need human-readable auto-incrementing IDs for UI display.

### 2.1 Customer Master
- **Fields:** `id`, `customer_name`, `address_1`, `address_2`, `street`, `city`, `state`, `gstin`.
- **UI:** A searchable, scrollable data table.

### 2.2 Vehicle/Job Master
- **Fields:** `id`, `job_reference_no`, `type` (Enum: New/Old), `vehicle_name`, `customer_id` (Foreign Key).

### 2.3 Supplier Master
- **Fields:** `id`, `supplier_code` (Auto), `supplier_name`, `tin_no`, `cst_no`, `gstin`, `address`, `state`.

### 2.4 TAX Master
- **Fields:** `id`, `vat_code` (Auto), `tax_percentage` (e.g., 12, 18, 28), `description`, `inv_prefix`.
- **Logic:** Used to populate dropdowns in the Material Master.

### 2.5 Unit Master
- **Fields:** `id`, `unit_code` (Auto), `unit_name` (e.g., KG, PCS, ROLL).

### 2.6 Material Master (Crucial)
- **Fields:** `id`, `material_no` (Auto), `material_name`, `tax_id` (FK to TAX), `purchase_unit_id` (FK to Unit), `sales_unit_id` (FK to Unit), `conversion_value`, `opening_stock`, `min_level`, `max_level`, `hsn_code`, `current_stock` (Calculated/Updated by triggers).

---

## 3. Transactional Workflows & Inventory Engine
This is where the legacy app was clunky. We need to streamline this into logical workflows.

### 3.1 Purchase Orders (PO) & Inwarding (Stock INCREASES)
*Legacy issue: The old app had separate "PO Gen" and "PO" tabs. We will unify this.*
- **Action:** User creates a PO for a specific Supplier.
- **Header:** `po_number`, `po_date`, `supplier_id`, `total_amount`.
- **Line Items:** `material_id`, `qty`, `unit_id`, `rate`, `tax_percentage`, `amount`.
- **Inventory Trigger:** When a PO is marked as "Received" (Purchase Inward), the system must **ADD** the `qty` to the `Material Master.current_stock`.

### 3.2 Vehicle Material Allocation (Stock DECREASES)
*Legacy structure: "Delivery Challan" for New Vehicles, "Estimate" for Old Vehicles.*
- **Action:** Materials are issued from the warehouse to a specific bus building job.
- **Header:** `slip_number` (Auto), `date`, `vehicle_id` (Job No), `margin_percentage`, `total_amount`.
- **Line Items:** `material_id`, `qty`, `unit_id`, `rate`, `amount`, `tax_percentage`, `hsn_code`.
- **Inventory Trigger:** When a Challan/Estimate is saved, the system must **SUBTRACT** the `qty` from the `Material Master.current_stock`. If edited or deleted, the stock must be reverted.

---

## 4. Invoicing & Financials
- **Header:** `bill_number`, `bill_date`, `rate_date`, `tax_percentage` (Global override), `material_margin`, `discount`, `vehicle_id`, `net_amount`.
- **Line Items:** `material_id`, `hsn_code`, `qty`, `rate`, `amount`.
- **Logic:** Must support dual-rate generation (calculating final totals with GST for insurance claims, and without GST for direct billing).

---

## 5. Reports & Dashboards
The client requires a comprehensive real-time dashboard and specific reports.

### 5.1 Main Warehouse Dashboard
- **Display:** Total count of all materials, current `current_stock`, `rate_per_unit`, total stock value.
- **Feature:** A search bar to enter a `job_reference_no` (Vehicle Master). It must return a list of all materials used for that specific vehicle over any date range, and the total cost of those materials.

### 5.2 Material-Wise Costing Report
- **Filters:** Vehicle Name, Date Range.
- **Output:** S.no, Material Code, Material Name, Total Amount used.

### 5.3 Monthly Stock Report
- **Filters:** From Date, To Date, HSN Code, Material Name.
- **Toggles:** "With Price" / "Without Price" checkboxes to hide financial data if printing for warehouse floor workers.

---
## 6. AI Implementation Instructions (Rules for Claude)
1. **Database First:** Begin by scaffolding the PostgreSQL schema using Prisma or Drizzle ORM. Ensure all foreign key constraints are strict.
2. **Double-Entry Logic:** Do NOT rely on frontend math for inventory. Use backend database transactions or triggers so that if a Purchase Inward happens, the stock updates atomically.
3. **Component Reusability:** The grids used for POs, Challans, and Invoices share 80% of the same columns (Material, Qty, Rate, Tax). Build a reusable `<TransactionGrid />` component.
