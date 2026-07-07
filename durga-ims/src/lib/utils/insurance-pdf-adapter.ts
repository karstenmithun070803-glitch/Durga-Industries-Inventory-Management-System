import type { InsuranceBillWithItems } from "@/types";
import type { InvoiceRow } from "@/types";

interface ParentInvoiceInfo {
  id: string;
  billNumber: string;
  jobRefNo: string;
  customerName: string | null;
  customerGstin: string | null;
  customerState: string | null;
  customerAddress: string | null;
}

// Maps an insurance bill + parent invoice info → InvoiceRow[] for InsuranceInvoiceDocument
export function insuranceBillToInvoiceRows(
  insurance: InsuranceBillWithItems,
  parent: ParentInvoiceInfo
): InvoiceRow[] {
  const h = insurance.header;
  return insurance.items.map((item) => ({
    // Header-level fields (same for all rows)
    id: parent.id,
    bill_number: parent.billNumber,
    bill_date: h.bill_date,
    rate_date: null,
    financial_year: "",
    status: h.status,
    tax_percentage: h.tax_percentage,
    material_margin: h.material_margin,
    discount: h.discount,
    net_amount: h.net_amount,
    rev_charge_status: false,
    payment_status: "Unpaid",
    payment_date: null,
    payment_notes: null,
    cancelled_by: null,
    cancelled_at: null,
    vehicle_id: "",
    job_ref_no: parent.jobRefNo,
    customer_id: null,
    customer_name: parent.customerName,
    customer_gstin: parent.customerGstin,
    customer_state: parent.customerState,
    customer_address: parent.customerAddress,
    // Item-level fields
    item_id: item.id,
    material_id: item.material_id ?? "",
    material_name: item.material_name ?? item.material_name_override ?? "",
    material_no: item.material_no ?? 0,
    hsn_code: item.hsn_code,
    qty: item.qty,
    unit_id: item.unit_id,
    unit_name: item.unit_name,
    rate: item.rate,
    tax_percentage_item: item.tax_percentage,
    cgst_amount: item.cgst_amount,
    sgst_amount: item.sgst_amount,
    igst_amount: item.igst_amount,
    amount: item.amount,
    gst_type: item.gst_type,
  }));
}
