import type { Column, TablePdfSpec, TableRow } from "../table-pdf";
import { companyHeader, fmt2, type CompanyInfo } from "./common";

export interface VehicleComparisonPrintRow {
  code: string;
  material_name: string;
  stage_name: string;
  qty1: number;
  amt1: number;
  qty2: number;
  amt2: number;
  diff: number;
}

export interface VehicleComparisonProps {
  rows: VehicleComparisonPrintRow[];
  v1Name: string;
  v2Name: string;
  fy: string;
  stageName: string;
  hideAmounts: boolean;
  showDiffOnly: boolean;
  companySetting?: CompanyInfo;
}

const nf3 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const short = (label: string, max = 18) => (label.length > max ? label.slice(0, max - 1) + "…" : label);

export function buildVehicleComparisonSpec(p: VehicleComparisonProps): TablePdfSpec {
  const s1 = short(p.v1Name);
  const s2 = short(p.v2Name);
  const hide = p.hideAmounts;

  const columns: Column[] = hide
    ? [
        { header: "S.No", width: 4 },
        { header: "Material Name", width: 38 },
        { header: "Stage", width: 18 },
        { header: `Qty (${s1})`, width: 12, align: "right" },
        { header: `Qty (${s2})`, width: 12, align: "right" },
        { header: "Diff (Qty)", width: 16, align: "right" },
      ]
    : [
        { header: "S.No", width: 4 },
        { header: "Material Name", width: 26 },
        { header: "Stage", width: 13 },
        { header: `Qty (${s1})`, width: 9, align: "right" },
        { header: `Amt (${s1})`, width: 12, align: "right" },
        { header: `Qty (${s2})`, width: 9, align: "right" },
        { header: `Amt (${s2})`, width: 12, align: "right" },
        { header: "Diff (Qty)", width: 15, align: "right" },
      ];

  const rows: TableRow[] = new Array(p.rows.length);
  for (let i = 0; i < p.rows.length; i++) {
    const r = p.rows[i];
    const diff = r.diff !== 0 ? (r.diff > 0 ? "+" : "") + nf3.format(r.diff) : "—";
    const cells = hide
      ? [String(i + 1), r.material_name, r.stage_name, nf3.format(r.qty1), nf3.format(r.qty2), diff]
      : [
          String(i + 1), r.material_name, r.stage_name, nf3.format(r.qty1), r.amt1 > 0 ? fmt2(r.amt1) : "—",
          nf3.format(r.qty2), r.amt2 > 0 ? fmt2(r.amt2) : "—", diff,
        ];
    const last = cells.length - 1;
    rows[i] = {
      cells,
      boldCols: [last],
      cellColors: { 2: "#6B7280", [last]: r.diff !== 0 ? "#92400E" : "#6B7280" },
    };
  }

  const header = companyHeader(p.companySetting, "VEHICLE COMPARISON REPORT", `${p.v1Name}  vs  ${p.v2Name}`);
  header[header.length - 1].marginBottom = 2;
  const filterParts = [`FY ${p.fy}`, `Stage: ${p.stageName}`];
  if (p.showDiffOnly) filterParts.push("Diff. Materials Only");
  header.push({ text: filterParts.join("   |   "), size: 8.5, align: "center", color: "#9CA3AF", marginBottom: 4 });

  const n = p.rows.length;
  return {
    orientation: "landscape",
    headerLines: header,
    columns,
    rows,
    trailer: [{
      text: `${n} material${n !== 1 ? "s" : ""} shown${p.showDiffOnly ? " (differences only)" : ""}${hide ? " · amounts hidden" : ""}`,
      size: 9, color: "#9CA3AF", marginTop: 4,
    }],
    footerText: `Vehicle Comparison — ${p.v1Name} vs ${p.v2Name} — FY ${p.fy}`,
  };
}
