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
