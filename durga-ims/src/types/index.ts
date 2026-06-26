import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type {
  customers,
  contractors,
  suppliers,
  taxRates,
  units,
  materials,
  vehicles,
  appUsers,
  purchaseOrders,
  purchaseOrderItems,
  materialIssues,
  materialIssueItems,
  invoices,
  invoiceItems,
  stockLedger,
} from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Select types (reading from DB)
// ---------------------------------------------------------------------------
export type Customer = InferSelectModel<typeof customers>;
export type Contractor = InferSelectModel<typeof contractors>;
export type Supplier = InferSelectModel<typeof suppliers>;
export type TaxRate = InferSelectModel<typeof taxRates>;
export type Unit = InferSelectModel<typeof units>;
export type Material = InferSelectModel<typeof materials>;
export type Vehicle = InferSelectModel<typeof vehicles>;
export type AppUser = InferSelectModel<typeof appUsers>;
export type PurchaseOrder = InferSelectModel<typeof purchaseOrders>;
export type PurchaseOrderItem = InferSelectModel<typeof purchaseOrderItems>;
export type MaterialIssue = InferSelectModel<typeof materialIssues>;
export type MaterialIssueItem = InferSelectModel<typeof materialIssueItems>;
export type Invoice = InferSelectModel<typeof invoices>;
export type InvoiceItem = InferSelectModel<typeof invoiceItems>;
export type StockLedgerEntry = InferSelectModel<typeof stockLedger>;

// ---------------------------------------------------------------------------
// Insert types (writing to DB)
// ---------------------------------------------------------------------------
export type NewCustomer = InferInsertModel<typeof customers>;
export type NewContractor = InferInsertModel<typeof contractors>;
export type NewSupplier = InferInsertModel<typeof suppliers>;
export type NewTaxRate = InferInsertModel<typeof taxRates>;
export type NewUnit = InferInsertModel<typeof units>;
export type NewMaterial = InferInsertModel<typeof materials>;
export type NewVehicle = InferInsertModel<typeof vehicles>;
export type NewPurchaseOrder = InferInsertModel<typeof purchaseOrders>;
export type NewPurchaseOrderItem = InferInsertModel<typeof purchaseOrderItems>;
export type NewMaterialIssue = InferInsertModel<typeof materialIssues>;
export type NewMaterialIssueItem = InferInsertModel<typeof materialIssueItems>;
export type NewInvoice = InferInsertModel<typeof invoices>;
export type NewInvoiceItem = InferInsertModel<typeof invoiceItems>;

// ---------------------------------------------------------------------------
// Stock ledger transaction types (validated in app layer, not DB)
// ---------------------------------------------------------------------------
export type StockLedgerType =
  | "PO_INWARD"   // stock added when PO marked Received
  | "ISSUE"       // stock deducted when Material Issue saved
  | "REVERSAL"    // stock restored on edit/delete of PO or Issue
  | "ADJUSTMENT"; // manual correction via Stock Dashboard (requires CONFIRM)

// ---------------------------------------------------------------------------
// Rich joined types (used by PO form and list)
// ---------------------------------------------------------------------------

export interface PurchaseOrderWithDetails {
  id: string;
  po_number: number;
  po_date: Date | string;
  supplier_id: string | null;
  total_amount: string;
  status: string;
  financial_year: string;
  affects_stock: boolean;
  supplier_bill_no: string | null;
  supplier_bill_date: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  items: PurchaseOrderItemWithDetails[];
}

export interface PurchaseOrderItemWithDetails {
  id: string;
  po_id: string;
  material_id: string;
  material_name: string;
  material_no: number;
  hsn_code: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  qty: string;
  unit_id: string | null;
  unit_name: string | null;
  rate: string;
  tax_percentage: string;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  amount: string;
  gst_type: string | null;
}

// Client-only: unsaved row state in the TransactionGrid
export interface LineItemDraft {
  _key: string; // unique row key (uuid v4, client-only)
  material_id: string;
  material_name: string;
  material_no: number;
  hsn_code: string;
  supplier_id: string;
  supplier_name: string;
  gst_type: string; // "CGST_SGST" | "IGST"
  qty: string;
  unit_id: string;
  unit_name: string;
  rate: string;
  tax_percentage: string;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  amount: string;
  baseRate?: string;           // original PO rate before margin applied (invoice form only, never sent to server)
  rateBlank: boolean;         // true when no purchase history exists
  zeroRateConfirmed: boolean; // user must check this when rate = 0
  // Material Issue fields (ignored in purchase-order mode)
  contractor_id: string;
  contractor_name: string;
  affects_inventory: boolean;
  // Invoice mode: tracks which MI slip this row came from (client-only, not sent to server)
  _slip_id?: string;
  // NEW VMI multi-stage: which stage this row belongs to (client-only display; stage_id sent to server via buildItemsPayload)
  stage_id?: string;
  stage_name?: string;
}

// ---------------------------------------------------------------------------
// Material Issue rich joined types
// ---------------------------------------------------------------------------

// Flat row returned by getMaterialIssues() list query — one row per line item
export interface MaterialIssueRow {
  // header
  id: string;
  slip_number: number | null;
  issue_date: string;
  financial_year: string;
  status: string;
  issue_type: string;
  margin_percentage: string;
  total_amount: string;
  vehicle_id: string;
  vehicle_name: string | null;
  job_ref_no: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_gstin: string | null;
  customer_state: string | null;
  customer_address: string | null;
  // item
  item_id: string;
  material_id: string;
  material_name: string;
  material_no: number;
  hsn_code: string | null;
  contractor_id: string | null;
  contractor_name: string | null;
  qty: string;
  unit_id: string | null;
  unit_name: string | null;
  rate: string;
  tax_percentage: string;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  amount: string;
  gst_type: string | null;
  affects_inventory: boolean;
}

// Per-item type used in the detail fetch (getMaterialIssueById)
export interface MaterialIssueItemWithDetails {
  id: string;
  issue_id: string;
  material_id: string;
  material_name: string;
  material_no: number;
  hsn_code: string | null;
  contractor_id: string | null;
  contractor_name: string | null;
  qty: string;
  unit_id: string | null;
  unit_name: string | null;
  rate: string;
  tax_percentage: string;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  amount: string;
  gst_type: string | null;
  affects_inventory: boolean;
  // NEW VMI multi-stage: which stage this item belongs to
  stage_id?: string | null;
  stage_name?: string | null;
}

// Full detail type returned by getMaterialIssueById
export interface MaterialIssueWithDetails {
  id: string;
  slip_number: number | null;
  issue_date: string;
  financial_year: string;
  status: string;
  issue_type: string;
  stage_id: string | null;
  margin_percentage: string;
  total_amount: string;
  vehicle_id: string;
  vehicle_name: string | null;
  job_ref_no: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_gstin: string | null;
  customer_state: string | null;
  customer_address: string | null;
  items: MaterialIssueItemWithDetails[];
}

// ---------------------------------------------------------------------------
// INVOICE TYPES
// ---------------------------------------------------------------------------

// Flat row returned by getInvoices() — one row per line item (for list view)
export interface InvoiceRow {
  // header fields
  id: string;
  bill_number: string;
  bill_date: string;
  rate_date: string | null;
  financial_year: string;
  status: string;
  tax_percentage: string | null;
  material_margin: string | null;
  discount: string | null;
  net_amount: string;
  rev_charge_status: boolean;
  payment_status: string;
  payment_date: string | null;
  payment_notes: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  // vehicle + customer (via JOIN)
  vehicle_id: string;
  vehicle_name: string | null;
  job_ref_no: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_gstin: string | null;
  customer_state: string | null;
  customer_address: string | null;
  // item fields
  item_id: string;
  material_id: string;
  material_name: string;
  material_no: number;
  hsn_code: string | null;
  qty: string;
  unit_id: string | null;
  unit_name: string | null;
  rate: string;
  tax_percentage_item: string;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  amount: string;
  gst_type: string | null;
}

// Per-item type used in the edit form
export interface InvoiceItemWithDetails {
  id: string;
  invoice_id: string;
  material_id: string;
  material_name: string;
  material_no: number;
  hsn_code: string | null;
  qty: string;
  unit_id: string | null;
  unit_name: string | null;
  rate: string;
  tax_percentage: string;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  amount: string;
  gst_type: string | null;
}

// Full detail returned by getInvoiceById()
export interface InvoiceWithDetails {
  id: string;
  bill_number: string;
  bill_date: string;
  rate_date: string | null;
  financial_year: string;
  status: string;
  tax_percentage: string | null;
  material_margin: string | null;
  discount: string | null;
  net_amount: string;
  include_tax: boolean;
  rev_charge_status: boolean;
  payment_status: string;
  payment_date: string | null;
  payment_notes: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  vehicle_id: string;
  vehicle_name: string | null;
  job_ref_no: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_gstin: string | null;
  customer_state: string | null;
  customer_address: string | null;
  items: InvoiceItemWithDetails[];
}

// ---------------------------------------------------------------------------
// Insurance Bill Types
// ---------------------------------------------------------------------------

export interface InvoiceInsuranceHeader {
  id: string;
  invoice_id: string;
  bill_date: string;
  tax_percentage: string;
  material_margin: string;
  discount: string;
  net_amount: string;
  gst_type: string;
  include_tax: boolean;
  status: string; // 'Draft' | 'Finalized'
  created_at: string | null;
  updated_at: string | null;
}

export interface InvoiceInsuranceItem {
  id: string;
  insurance_id: string;
  material_id: string | null;
  material_name_override: string | null;
  hsn_code: string | null;
  qty: string;
  unit_id: string | null;
  unit_name: string | null;
  rate: string;
  amount: string;
  tax_percentage: string;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  gst_type: string;
  sort_order: number;
  // for display — resolved from material_id or override
  material_name: string | null;
  material_no: number | null;
}

export interface InsuranceBillWithItems {
  header: InvoiceInsuranceHeader;
  items: InvoiceInsuranceItem[];
}

// Lightweight dropdown item for identifier combobox
export interface InvoiceDropdownItem {
  id: string;
  billNumber: string;
  date: string;
  status: string;
  vehicleName: string | null;
  customerName: string | null;
  netAmount: string;
}

// ---------------------------------------------------------------------------
// GST determination
// ---------------------------------------------------------------------------
export type GstType = "CGST_SGST" | "IGST";

// Company is in Tamil Nadu — state code 33
// Determined by first 2 digits of GSTIN; fallback to state dropdown
export function determineGstType(gstin: string | null | undefined, state: string | null | undefined): GstType {
  if (gstin && gstin.length >= 2) {
    return gstin.startsWith("33") ? "CGST_SGST" : "IGST";
  }
  // Default to CGST_SGST when state is unknown — company is TN-based, most customers are local
  return (state === "Tamil Nadu" || state == null || state === "") ? "CGST_SGST" : "IGST";
}

// Financial year helpers live in src/lib/fy.ts — import from there.
