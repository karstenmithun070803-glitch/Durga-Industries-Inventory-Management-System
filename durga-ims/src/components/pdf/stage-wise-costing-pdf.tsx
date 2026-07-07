import React from "react";
import { Document, Page, View, Text } from "@react-pdf/renderer";
import { styles, COMPANY_NAME, COMPANY_ADDRESS, COMPANY_GSTIN } from "./pdf-styles";
import type { StageWiseCostingRow, MaterialWiseCostingRow } from "@/lib/actions/reports.actions";
import type { CompanySetting } from "@/lib/actions/settings.actions";

interface Props {
  stageRows: (StageWiseCostingRow & { amount: number })[];
  materialRows: (MaterialWiseCostingRow & { amount: number })[];
  rptType: "stage" | "material";
  jobLabel: string;
  fy: string;
  marginPct: number;
  companySetting?: CompanySetting;
  asOfDate?: string;
}

function fmt(v: number) {
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function StageWiseCostingDocument({
  stageRows,
  materialRows,
  rptType,
  jobLabel,
  fy,
  marginPct,
  companySetting,
  asOfDate,
}: Props) {
  const coName    = companySetting?.company_name ?? COMPANY_NAME;
  const coAddress = companySetting?.address      ?? COMPANY_ADDRESS;
  const coGstin   = companySetting?.gstin        ?? COMPANY_GSTIN;

  const isStageWise = rptType === "stage";
  const rows = isStageWise ? stageRows : materialRows;
  const title = isStageWise ? "STAGE WISE COSTING REPORT" : "MATERIAL WISE COSTING REPORT";
  const grandTotal = rows.reduce((s, r) => s + r.amount, 0);

  const W = isStageWise
    ? { code: "14%", name: "68%", amount: "18%" }
    : { sno: "5%", code: "10%", name: "40%", stages: "27%", amount: "18%" };


  return (
    <Document title={`${isStageWise ? "Stage" : "Material"} Wise Costing — ${jobLabel} — FY ${fy}${asOfDate ? ` — As Of ${asOfDate}` : ""}`}>
      <Page size="A4" style={styles.page}>
        {/* Company header */}
        <View>
          <Text style={styles.companyNameCentered}>{coName}</Text>
          <Text style={styles.companyDetailCentered}>{coAddress}</Text>
          <Text style={styles.companyDetailCentered}>GSTIN: {coGstin}</Text>
        </View>

        <Text style={[styles.docTypeCentered, { fontSize: 12, marginTop: 4 }]}>{title}</Text>
        <Text style={{ fontSize: 9.5, color: "#6B7280", textAlign: "center", marginBottom: 6 }}>
          {`Job No.: ${jobLabel}   |   FY ${fy}${marginPct !== 0 ? `   |   Margin: ${marginPct}%` : ""}${asOfDate ? `   |   As Of: ${asOfDate.split("-").reverse().join("/")}` : ""}`}
        </Text>
        <Text style={{ fontSize: 9, color: "#9CA3AF", textAlign: "center", marginBottom: 4 }}>
          Amounts include tax (GST included)
        </Text>

        <View style={styles.separator} />

        {/* Table header */}
        {isStageWise ? (
          <View style={[styles.plainTableHead, { marginTop: 4 }]}>
            <Text style={[styles.plainTableHeadCell, { width: W.code }]}>Code</Text>
            <Text style={[styles.plainTableHeadCell, { width: W.name }]}>Stage Name</Text>
            <Text style={[styles.plainTableHeadCell, { width: W.amount, textAlign: "right" }]}>Amount (₹)</Text>
          </View>
        ) : (
          <View style={[styles.plainTableHead, { marginTop: 4 }]}>
            <Text style={[styles.plainTableHeadCell, { width: W.sno }]}>S.No</Text>
            <Text style={[styles.plainTableHeadCell, { width: W.code }]}>Mat. No</Text>
            <Text style={[styles.plainTableHeadCell, { width: W.name }]}>Material Name</Text>
            <Text style={[styles.plainTableHeadCell, { width: (W as { stages: string }).stages }]}>Stages</Text>
            <Text style={[styles.plainTableHeadCell, { width: W.amount, textAlign: "right" }]}>Amount (₹)</Text>
          </View>
        )}

        <View style={styles.separator} />

        {/* Rows */}
        {isStageWise
          ? stageRows.map((r) => (
              <View
                key={r.code}
                style={[styles.plainTableRow, r.is_direct ? { backgroundColor: "#FFFBEB" } : {}]}
              >
                <Text style={[styles.plainTableCell, { width: W.code, fontFamily: "Helvetica-Oblique" }]}>{r.code}</Text>
                <Text style={[styles.plainTableCell, { width: W.name, fontFamily: r.is_direct ? "Helvetica-Oblique" : "Helvetica" }]}>{r.name}</Text>
                <Text style={[styles.plainTableCellBold, { width: W.amount, textAlign: "right" }]}>{fmt(r.amount)}</Text>
              </View>
            ))
          : (materialRows as (MaterialWiseCostingRow & { amount: number })[]).map((r, i) => (
              <View key={r.code + i} style={styles.plainTableRow}>
                <Text style={[styles.plainTableCell, { width: (W as { sno: string }).sno }]}>{i + 1}</Text>
                <Text style={[styles.plainTableCell, { width: W.code }]}>{r.code}</Text>
                <Text style={[styles.plainTableCell, { width: W.name }]}>{r.name}</Text>
                <Text style={[styles.plainTableCell, { width: (W as { stages: string }).stages, color: "#6B7280" }]}>{r.stages || "—"}</Text>
                <Text style={[styles.plainTableCellBold, { width: W.amount, textAlign: "right" }]}>{fmt(r.amount)}</Text>
              </View>
            ))}

        <View style={[styles.separator, { marginTop: 2 }]} />

        {/* Totals row */}
        {isStageWise ? (
          <View style={[styles.plainTableRow, { backgroundColor: "#F8FAFC" }]}>
            <Text style={[styles.plainTableCellBold, { width: W.code }]} />
            <Text style={[styles.plainTableCellBold, { width: W.name, textAlign: "right" }]}>TOTAL</Text>
            <Text style={[styles.plainTableCellBold, { width: W.amount, textAlign: "right" }]}>{fmt(grandTotal)}</Text>
          </View>
        ) : (
          <View style={[styles.plainTableRow, { backgroundColor: "#F8FAFC" }]}>
            <Text style={[styles.plainTableCellBold, { width: (W as { sno: string }).sno }]} />
            <Text style={[styles.plainTableCellBold, { width: W.code }]} />
            <Text style={[styles.plainTableCellBold, { width: W.name, textAlign: "right" }]}>TOTAL</Text>
            <Text style={[styles.plainTableCellBold, { width: (W as { stages: string }).stages }]} />
            <Text style={[styles.plainTableCellBold, { width: W.amount, textAlign: "right" }]}>{fmt(grandTotal)}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.pageFooter} fixed>
          <View style={styles.footerLine} />
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `Pg.No.:${pageNumber}${totalPages > 1 ? ` of ${totalPages}` : ""}          ${title} — ${jobLabel} — FY ${fy}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
