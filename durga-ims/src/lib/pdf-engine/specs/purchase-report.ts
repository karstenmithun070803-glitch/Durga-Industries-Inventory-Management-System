import type { Column, TablePdfSpec, TableRow } from "../table-pdf";
import { companyHeader, fmt2, fmtQ, type CompanyInfo } from "./common";

// Row shape of getPurchaseReport (src/lib/actions/reports.actions.ts) — only the fields printed.
export interface PurchaseRow {
  id: string;
  item_id: string;
  po_number: number;
  po_date: string;
  status: string;
  supplier_name: string | null;
  supplier_bill_no?: string | null;
  material_name: string;
  unit_name: string | null;
  qty: number;
  rate: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
}

export interface MonthlyGroup {
  key: string;
  monthLabel: string;
  supplier: string;
  material: string;
  qty: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface PurchaseReportProps {
  rows: PurchaseRow[];
  monthlyRows: MonthlyGroup[];
  groupByMonth: boolean;
  fy: string;
  statusFilter?: string;
  supplierName?: string;
  materialName?: string;
  dateFrom?: string;
  dateTo?: string;
  companySetting?: CompanyInfo;
  showBill?: boolean;
  showTaxAmt?: boolean;
}

const TOTAL_ROW_SHADE = "#F8FAFC";

function detailSpec(p: PurchaseReportProps): TablePdfSpec {
  const showBill = !!p.showBill;
  const showTax = !!p.showTaxAmt;

  // Column weights = the percentage widths used by the react-pdf layout (4 configurations).
  const w =
    showBill && showTax
      ? { sno: 4, po: 6, date: 8, bill: 8, sup: 14, mat: 14, qty: 5, unit: 4, rate: 7, taxable: 12, tax: 7, total: 11 }
      : showTax
      ? { sno: 4, po: 7, date: 9, bill: 0, sup: 16, mat: 16, qty: 5, unit: 4, rate: 8, taxable: 12, tax: 8, total: 11 }
      : showBill
      ? { sno: 4, po: 7, date: 9, bill: 9, sup: 15, mat: 15, qty: 5, unit: 4, rate: 8, taxable: 13, tax: 0, total: 11 }
      : { sno: 4, po: 8, date: 10, bill: 0, sup: 17, mat: 16, qty: 5, unit: 5, rate: 8, taxable: 14, tax: 0, total: 13 };

  const columns: Column[] = [];
  const keys: string[] = [];
  const add = (k: string, header: string, width: number, align?: Column["align"]) => {
    if (width > 0) { columns.push({ header, width, align }); keys.push(k); }
  };
  add("sno", "S.No", w.sno);
  add("po", "PO #", w.po);
  add("date", "Date", w.date);
  add("bill", "Bill No.", w.bill);
  add("sup", "Supplier", w.sup);
  add("mat", "Material", w.mat);
  add("qty", "Qty", w.qty, "right");
  add("unit", "Unit", w.unit);
  add("rate", "Rate", w.rate, "right");
  add("taxable", "Taxable", w.taxable, "right");
  add("tax", "Tax Amt", w.tax, "right");
  add("total", "Total", w.total, "right");

  const filterParts: string[] = [`FY ${p.fy}`];
  if (p.statusFilter && p.statusFilter !== "Received") filterParts.push(`Status: ${p.statusFilter}`);
  if (p.supplierName) filterParts.push(`Supplier: ${p.supplierName}`);
  if (p.materialName) filterParts.push(`Material: ${p.materialName}`);
  if (p.dateFrom) filterParts.push(`From: ${p.dateFrom}`);
  if (p.dateTo) filterParts.push(`To: ${p.dateTo}`);

  const boldCols = [keys.indexOf("po"), keys.indexOf("total")];
  const out: TableRow[] = [];
  let prevId: string | null = null;
  let gIdx = -1;
  let tTaxable = 0, tTax = 0, tTotal = 0;
  let anyNotReceived = false;

  for (const r of p.rows) {
    const first = r.id !== prevId;
    if (first) { gIdx++; prevId = r.id; }
    const taxAmt = r.cgst_amount + r.sgst_amount + r.igst_amount;
    if (r.status === "Received") {
      tTaxable += r.taxable_amount; tTax += taxAmt; tTotal += r.total_amount;
    } else anyNotReceived = true;

    const cells: string[] = [];
    for (const k of keys) {
      switch (k) {
        case "sno": cells.push(first ? String(gIdx + 1) : ""); break;
        case "po": cells.push(first ? `D-${String(r.po_number).padStart(4, "0")}` : ""); break;
        case "date": cells.push(first ? r.po_date : ""); break;
        case "bill": cells.push(first ? r.supplier_bill_no ?? "—" : ""); break;
        case "sup": cells.push(first ? r.supplier_name ?? "—" : ""); break;
        case "mat": cells.push(r.material_name); break;
        case "qty": cells.push(fmtQ(r.qty)); break;
        case "unit": cells.push(r.unit_name ?? "—"); break;
        case "rate": cells.push(fmt2(r.rate)); break;
        case "taxable": cells.push(fmt2(r.taxable_amount)); break;
        case "tax": cells.push(taxAmt > 0 ? fmt2(taxAmt) : "—"); break;
        case "total": cells.push(fmt2(r.total_amount)); break;
      }
    }
    out.push({
      cells,
      boldCols,
      ruleAbove: first && gIdx > 0 ? { color: "#94A3B8", width: 0.75 } : undefined,
    });
  }

  // Grand total row
  const tot: string[] = keys.map((k) => {
    switch (k) {
      case "mat": return anyNotReceived ? "TOTAL (Received)" : "TOTAL";
      case "taxable": return fmt2(tTaxable);
      case "tax": return tTax > 0 ? fmt2(tTax) : "—";
      case "total": return fmt2(tTotal);
      default: return "";
    }
  });
  const matIdx = keys.indexOf("mat");
  // "TOTAL" label is right-aligned in the Material column in the react-pdf layout.
  out.push({
    cells: tot, bold: true, shade: TOTAL_ROW_SHADE, align: { [matIdx]: "right" },
    ruleAbove: { color: "#000000", width: 0.75 },
  });
  return {
    headerLines: companyHeader(p.companySetting, "PURCHASE REPORT", filterParts.join("   |   ")),
    columns,
    rows: out,
    footerText: `Purchase Report — FY ${p.fy}`,
  };
}

function monthlySpec(p: PurchaseReportProps): TablePdfSpec {
  const showTax = !!p.showTaxAmt;
  const mw = showTax
    ? { sno: 5, month: 11, sup: 18, mat: 23, qty: 8, taxable: 14, tax: 9, total: 12 }
    : { sno: 5, month: 12, sup: 20, mat: 26, qty: 8, taxable: 16, tax: 0, total: 13 };

  const columns: Column[] = [
    { header: "S.No", width: mw.sno },
    { header: "Month", width: mw.month },
    { header: "Supplier", width: mw.sup },
    { header: "Material", width: mw.mat },
    { header: "Qty", width: mw.qty, align: "right" },
    { header: "Taxable", width: mw.taxable, align: "right" },
    ...(showTax ? [{ header: "Tax Amt", width: mw.tax, align: "right" as const }] : []),
    { header: "Total", width: mw.total, align: "right" },
  ];

  const rows: TableRow[] = [];
  let tTaxable = 0, tTax = 0, tTotal = 0;
  p.monthlyRows.forEach((r, i) => {
    const taxAmt = r.cgst + r.sgst + r.igst;
    tTaxable += r.taxable; tTax += taxAmt; tTotal += r.total;
    const cells = [String(i + 1), r.monthLabel, r.supplier, r.material, fmtQ(r.qty), fmt2(r.taxable)];
    if (showTax) cells.push(taxAmt > 0 ? fmt2(taxAmt) : "—");
    cells.push(fmt2(r.total));
    rows.push({ cells, boldCols: [1, columns.length - 1] });
  });
  const totCells = ["", "", "", "TOTAL", "", fmt2(tTaxable)];
  if (showTax) totCells.push(tTax > 0 ? fmt2(tTax) : "—");
  totCells.push(fmt2(tTotal));
  rows.push({ cells: totCells, bold: true, shade: TOTAL_ROW_SHADE, align: { 3: "right" }, ruleAbove: { color: "#000000", width: 0.75 } });

  const filterParts: string[] = [`FY ${p.fy}`, "Monthly View"];
  if (p.supplierName) filterParts.push(`Supplier: ${p.supplierName}`);
  if (p.materialName) filterParts.push(`Material: ${p.materialName}`);

  return {
    headerLines: companyHeader(p.companySetting, "PURCHASE REPORT — MONTHLY VIEW", filterParts.join("   |   ")),
    columns,
    rows,
    footerText: `Purchase Report (Monthly) — FY ${p.fy}`,
  };
}

export function buildPurchaseReportSpec(p: PurchaseReportProps): TablePdfSpec {
  return p.groupByMonth ? monthlySpec(p) : detailSpec(p);
}
