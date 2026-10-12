import type { Column, TablePdfSpec, TableRow } from "../table-pdf";
import { companyHeader, fmt2, type CompanyInfo } from "./common";

export interface InvoiceSummaryPrintRow {
  id: string;
  bill_number: string | number;
  bill_date: string;
  job_ref_no: string | null;
  customer_name: string | null;
  status: string;
  taxable_value: number;
  total_cgst: number;
  total_sgst: number;
  total_igst: number;
  discount: number;
  net_amount: number;
}

export interface InvoiceSummaryProps {
  rows: InvoiceSummaryPrintRow[];
  fy: string;
  statusFilter?: string;
  dateFrom?: string;
  dateTo?: string;
  companySetting?: CompanyInfo;
}

export function buildInvoiceSummarySpec(p: InvoiceSummaryProps): TablePdfSpec {
  const cancelledOnly = p.statusFilter === "Cancelled";
  let tTaxable = 0, tTax = 0, tDiscount = 0, tNet = 0, anyCancelled = false;
  for (const r of p.rows) {
    if (r.status === "Cancelled") {
      anyCancelled = true;
      if (!cancelledOnly) continue;
    }
    tTaxable += r.taxable_value;
    tTax += r.total_cgst + r.total_sgst + r.total_igst;
    tDiscount += r.discount;
    tNet += r.net_amount;
  }
  const hasDiscount = tDiscount > 0;

  const columns: Column[] = [
    { header: "S.No", width: 5 },
    { header: "Bill #", width: 9 },
    { header: "Date", width: 11 },
    { header: "Job No / Reg No", width: 18 },
    { header: "Customer", width: 17 },
    { header: "Taxable", width: 12, align: "right" },
    { header: "Tax Amt", width: 11, align: "right" },
    ...(hasDiscount ? [{ header: "Discount", width: 10, align: "right" as const }] : []),
    { header: "Net Amount", width: 13, align: "right" },
  ];

  const rows: TableRow[] = p.rows.map((r, i) => {
    const tax = r.total_cgst + r.total_sgst + r.total_igst;
    const cells = [
      String(i + 1), String(r.bill_number), r.bill_date, r.job_ref_no ?? "—", r.customer_name ?? "—",
      fmt2(r.taxable_value), tax > 0 ? fmt2(tax) : "—",
    ];
    if (hasDiscount) cells.push(r.discount > 0 ? fmt2(r.discount) : "—");
    cells.push(fmt2(r.net_amount));
    const cancelled = r.status === "Cancelled";
    return {
      cells,
      boldCols: [1, columns.length - 1],
      color: cancelled ? "#9CA3AF" : undefined,
      strike: cancelled || undefined,
    };
  });

  const tot = ["", "", "", "", cancelledOnly ? "REF. TOTAL" : anyCancelled ? "TOTAL (excl. Cancelled)" : "TOTAL",
    fmt2(tTaxable), tTax > 0 ? fmt2(tTax) : "—"];
  if (hasDiscount) tot.push(tDiscount > 0 ? fmt2(tDiscount) : "—");
  tot.push(fmt2(tNet));
  rows.push({
    cells: tot, bold: true, shade: "#F8FAFC", align: { 4: "right" },
    ruleAbove: { color: "#000000", width: 0.75 },
  });

  const filterParts: string[] = [`FY ${p.fy}`];
  if (p.statusFilter && p.statusFilter !== "Finalized") filterParts.push(`Status: ${p.statusFilter}`);
  if (p.dateFrom) filterParts.push(`From: ${p.dateFrom}`);
  if (p.dateTo) filterParts.push(`To: ${p.dateTo}`);

  return {
    headerLines: companyHeader(p.companySetting, "INVOICE SUMMARY REPORT", filterParts.join("   |   ")),
    columns,
    rows,
    footerText: `Invoice Summary — FY ${p.fy}`,
  };
}
