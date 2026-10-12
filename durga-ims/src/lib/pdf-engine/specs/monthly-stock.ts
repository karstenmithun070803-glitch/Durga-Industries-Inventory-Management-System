import type { Column, TablePdfSpec, TableRow } from "../table-pdf";
import { companyHeader, fmt2, fmtQ, type CompanyInfo } from "./common";

export interface MonthlyStockPrintRow {
  material_id: string;
  material_no: number;
  material_name: string;
  unit_name: string | null;
  opening_stock: number;
  po_inward: number;
  issues: number;
  reversals: number;
  adjustments: number;
  closing_stock: number;
  last_po_rate: number | null;
  opening_rate: number | null;
  standard_cost: number | null;
}

export interface MonthlyStockProps {
  rows: MonthlyStockPrintRow[];
  fromMonth: string; // "YYYY-MM"
  toMonth: string;
  showDetails: boolean;
  showPrices: boolean;
  materialName?: string;
  companySetting?: CompanyInfo;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monthToLabel(m: string): string {
  const [year, month] = m.split("-").map(Number);
  return `${MONTHS[month - 1]} ${year}`;
}

function fmtSigned(v: number): string {
  if (v === 0) return "—";
  const abs = fmtQ(Math.abs(v));
  return v > 0 ? `+${abs}` : `-${abs}`;
}

const GREEN = "#15803D", AMBER = "#B45309", RED = "#DC2626";

export function buildMonthlyStockSpec(p: MonthlyStockProps): TablePdfSpec {
  const { rows, showDetails, showPrices } = p;
  const periodLabel =
    p.fromMonth === p.toMonth ? monthToLabel(p.fromMonth) : `${monthToLabel(p.fromMonth)} – ${monthToLabel(p.toMonth)}`;
  const filterParts: string[] = [periodLabel];
  if (p.materialName) filterParts.push(`Material: ${p.materialName}`);
  if (showDetails) filterParts.push("Detail view");
  if (showPrices) filterParts.push("Including prices");

  const units = new Set<string>();
  let tOpen = 0, tIn = 0, tIssues = 0, tRev = 0, tAdj = 0, tClose = 0;
  for (const r of rows) {
    units.add(r.unit_name ?? "—");
    tOpen += r.opening_stock; tIn += r.po_inward; tIssues += r.issues;
    tRev += r.reversals; tAdj += r.adjustments; tClose += r.closing_stock;
  }
  const multiUnit = units.size > 1;

  // Column keys drive both header and cells so they can never drift apart.
  type K = "sno" | "mat" | "unit" | "open" | "in" | "iss" | "rev" | "adj" | "close" | "rate" | "val";
  const defs: { k: K; header: string; width: number; align?: Column["align"]; on: boolean }[] = [
    { k: "sno", header: "S.No", width: 4, on: true },
    { k: "mat", header: "Material", width: showDetails ? 28 : 38, on: true },
    { k: "unit", header: "Unit", width: 5, on: true },
    { k: "open", header: "Opening", width: 10, align: "right", on: showDetails },
    { k: "in", header: "PO Inward", width: 10, align: "right", on: true },
    { k: "iss", header: "Issues", width: 9, align: "right", on: true },
    { k: "rev", header: "Reversals", width: 9, align: "right", on: showDetails },
    { k: "adj", header: "Adjustments", width: 9, align: "right", on: showDetails },
    { k: "close", header: "Closing", width: 10, align: "right", on: true },
    { k: "rate", header: "Rate", width: 8, align: "right", on: showPrices },
    { k: "val", header: "Value", width: 8, align: "right", on: showPrices },
  ];
  const active = defs.filter((d) => d.on);
  const columns: Column[] = active.map((d) => ({ header: d.header, width: d.width, align: d.align }));
  const idx = (k: K) => active.findIndex((d) => d.k === k);

  const out: TableRow[] = new Array(rows.length + 1);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rate = r.last_po_rate ?? r.opening_rate ?? r.standard_cost;
    const value = rate !== null ? r.closing_stock * rate : null;
    const cells: string[] = new Array(active.length);
    const cellColors: Record<number, string> = {};
    for (let c = 0; c < active.length; c++) {
      switch (active[c].k) {
        case "sno": cells[c] = String(i + 1); break;
        case "mat": cells[c] = `M-${String(r.material_no).padStart(3, "0")} ${r.material_name}`; break;
        case "unit": cells[c] = r.unit_name ?? "—"; break;
        case "open": cells[c] = fmtQ(r.opening_stock); break;
        case "in": cells[c] = r.po_inward > 0 ? `+${fmtQ(r.po_inward)}` : "—"; if (r.po_inward > 0) cellColors[c] = GREEN; break;
        case "iss": cells[c] = r.issues > 0 ? `-${fmtQ(r.issues)}` : "—"; if (r.issues > 0) cellColors[c] = AMBER; break;
        case "rev": cells[c] = r.reversals !== 0 ? fmtSigned(r.reversals) : "—"; break;
        case "adj": cells[c] = r.adjustments !== 0 ? fmtSigned(r.adjustments) : "—"; break;
        case "close": cells[c] = fmtQ(r.closing_stock); if (r.closing_stock < 0) cellColors[c] = RED; break;
        case "rate": cells[c] = rate !== null ? fmt2(rate) : "—"; break;
        case "val": cells[c] = value !== null ? fmt2(Number(value.toFixed(2))) : "—"; break;
      }
    }
    out[i] = { cells, boldCols: [idx("close"), idx("val")].filter((x) => x >= 0), cellColors };
  }

  const tot: string[] = active.map((d) => {
    switch (d.k) {
      case "mat": return multiUnit ? "TOTAL (mixed units)" : "TOTAL";
      case "open": return fmtQ(tOpen);
      case "in": return tIn > 0 ? `+${fmtQ(tIn)}` : "—";
      case "iss": return tIssues > 0 ? `-${fmtQ(tIssues)}` : "—";
      case "rev": return tRev !== 0 ? fmtSigned(tRev) : "—";
      case "adj": return tAdj !== 0 ? fmtSigned(tAdj) : "—";
      case "close": return fmtQ(tClose);
      default: return "";
    }
  });
  out[rows.length] = {
    cells: tot, bold: true, shade: "#F8FAFC", align: { [idx("mat")]: "right" },
    ruleAbove: { color: "#000000", width: 0.75 },
  };

  const header = companyHeader(p.companySetting, "MONTHLY STOCK REPORT", filterParts.join("   |   "));
  if (multiUnit) {
    header.push({
      text: "Note: Multiple units in this report — totals span different units and may not be meaningful.",
      size: 9, align: "center", color: AMBER, marginBottom: 2,
    });
  }

  return {
    orientation: "landscape",
    headerLines: header,
    columns,
    rows: out,
    footerText: `Monthly Stock Report — ${periodLabel}`,
    trailer: showDetails
      ? undefined
      : [{ text: "Opening balance, reversals & adjustments not shown. Enable Show Details for full reconciliation.",
           size: 8, align: "center", color: "#6B7280", marginTop: 4 }],
  };
}
