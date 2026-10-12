import type { Column, TablePdfSpec, TableRow } from "../table-pdf";
import { companyHeader, fmt2, type CompanyInfo } from "./common";

export interface StageCostPrintRow { code: string; name: string; is_direct: boolean; amount: number }
export interface MaterialCostPrintRow { code: string; name: string; stages: string | null; amount: number }

export interface StageWiseProps {
  stageRows: StageCostPrintRow[];
  materialRows: MaterialCostPrintRow[];
  rptType: "stage" | "material";
  jobLabel: string;
  fy: string;
  marginPct: number;
  companySetting?: CompanyInfo;
  asOfDate?: string;
}

export function buildStageWiseSpec(p: StageWiseProps): TablePdfSpec {
  const isStage = p.rptType === "stage";
  const title = isStage ? "STAGE WISE COSTING REPORT" : "MATERIAL WISE COSTING REPORT";
  const grand = (isStage ? p.stageRows : p.materialRows).reduce((s, r) => s + r.amount, 0);

  const columns: Column[] = isStage
    ? [
        { header: "Code", width: 14 },
        { header: "Stage Name", width: 68 },
        { header: "Amount (Rs.)", width: 18, align: "right" },
      ]
    : [
        { header: "S.No", width: 5 },
        { header: "Mat. No", width: 10 },
        { header: "Material Name", width: 40 },
        { header: "Stages", width: 27 },
        { header: "Amount (Rs.)", width: 18, align: "right" },
      ];

  const rows: TableRow[] = [];
  if (isStage) {
    for (const r of p.stageRows) {
      rows.push({
        cells: [r.code, r.name, fmt2(r.amount)],
        boldCols: [2],
        italicCols: r.is_direct ? [0, 1] : [0],
        shade: r.is_direct ? "#FFFBEB" : undefined,
      });
    }
    rows.push({ cells: ["", "TOTAL", fmt2(grand)], bold: true, shade: "#F8FAFC", align: { 1: "right" },
      ruleAbove: { color: "#000000", width: 0.75 } });
  } else {
    p.materialRows.forEach((r, i) => {
      rows.push({
        cells: [String(i + 1), r.code, r.name, r.stages || "—", fmt2(r.amount)],
        boldCols: [4],
        cellColors: { 3: "#6B7280" },
      });
    });
    rows.push({ cells: ["", "", "TOTAL", "", fmt2(grand)], bold: true, shade: "#F8FAFC", align: { 2: "right" },
      ruleAbove: { color: "#000000", width: 0.75 } });
  }

  const header = companyHeader(
    p.companySetting,
    title,
    `Job No / Reg No: ${p.jobLabel}   |   FY ${p.fy}${p.marginPct !== 0 ? `   |   Margin: ${p.marginPct}%` : ""}${
      p.asOfDate ? `   |   As Of: ${p.asOfDate.split("-").reverse().join("/")}` : ""
    }`
  );
  header[header.length - 1].marginBottom = 0;
  header.push({ text: "Amounts include tax (GST included)", size: 9, align: "center", color: "#9CA3AF", marginBottom: 4 });

  return { headerLines: header, columns, rows, footerText: `${title} — ${p.jobLabel} — FY ${p.fy}` };
}
