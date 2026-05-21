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
  rateBlank: boolean;       // true when no purchase history exists
  zeroRateConfirmed: boolean; // user must check this when rate = 0
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
  return state === "Tamil Nadu" ? "CGST_SGST" : "IGST";
}

// ---------------------------------------------------------------------------
// Financial year helpers
// ---------------------------------------------------------------------------
export function getCurrentFinancialYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-indexed
  // Indian FY: April 1 → March 31
  return month >= 4 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

export function getFinancialYearRange(fy: string): { start: Date; end: Date } {
  const [startYear] = fy.split("-").map(Number);
  return {
    start: new Date(startYear, 3, 1),       // April 1
    end: new Date(startYear + 1, 2, 31, 23, 59, 59), // March 31
  };
}
