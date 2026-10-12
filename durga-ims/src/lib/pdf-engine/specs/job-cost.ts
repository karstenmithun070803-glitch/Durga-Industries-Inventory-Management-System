import type { HeaderLine, TablePdfSpec, TableRow } from "../table-pdf";
import { COMPANY_ADDRESS, COMPANY_GSTIN, COMPANY_NAME, fmt2, type CompanyInfo } from "./common";

export interface JobCostPrintRow {
  material_name: string;
  contractor_name: string | null;
  unit_name: string | null;
  total_qty: number;
  rate: number;
  total_amount: number;
}
export interface JobCostProps {
  result: {
    vehicle: { job_ref_no: string; vehicle_type: string; customer_name: string | null };
    rows: JobCostPrintRow[];
    totals: { total_cost: number };
  };
  companySetting?: CompanyInfo;
}

const nfQty = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 });
const money = (v: number) => "Rs. " + fmt2(v);

export function buildJobCostSpec({ result, companySetting: co }: JobCostProps): TablePdfSpec {
  const v = result.vehicle;
  const header: HeaderLine[] = [
    { text: co?.company_name ?? COMPANY_NAME, size: 19, bold: true, align: "center" },
    { text: co?.address ?? COMPANY_ADDRESS, size: 10.5, align: "center", marginTop: 2 },
    { text: `GSTIN: ${co?.gstin ?? COMPANY_GSTIN}`, size: 10.5, align: "center", marginTop: 2 },
    { text: "JOB COST SUMMARY", size: 14, bold: true, align: "center", marginTop: 14, marginBottom: 10 },
    { text: "JOB NO / REG NO", value: v.job_ref_no, labelWidth: 145, size: 11, marginBottom: 3 },
    { text: "TYPE", value: v.vehicle_type === "New" ? "New Build" : "Old Build", labelWidth: 145, size: 11, marginBottom: 3 },
  ];
  if (v.customer_name) header.push({ text: "CUSTOMER", value: v.customer_name, labelWidth: 145, size: 11, marginBottom: 3 });

  const rows: TableRow[] = result.rows.map((r) => ({
    cells: [
      r.material_name, r.contractor_name ?? "—", nfQty.format(r.total_qty), r.unit_name ?? "—",
      money(r.rate), money(r.total_amount),
    ],
    boldCols: [5],
  }));

  return {
    fontSize: 11,
    rowPadY: 4,
    headerLines: header,
    columns: [
      { header: "Material Name", width: 40 },
      { header: "Contractor", width: 16 },
      { header: "Qty", width: 10, align: "right" },
      { header: "Unit", width: 8, padLeft: 4 },
      { header: "Rate", width: 12, align: "right" },
      { header: "Total", width: 14, align: "right" },
    ],
    rows,
    trailer: [{ text: `Total Cost: ${money(result.totals.total_cost)}`, size: 11, bold: true, align: "right", marginTop: 4 }],
    footerText: `For ${co?.company_name ?? COMPANY_NAME}`,
  };
}
