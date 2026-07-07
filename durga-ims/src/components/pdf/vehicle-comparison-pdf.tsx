import React from "react";
import { Document, Page, View, Text } from "@react-pdf/renderer";
import { styles, COMPANY_NAME, COMPANY_ADDRESS, COMPANY_GSTIN } from "./pdf-styles";
import type { VehicleComparisonRow } from "@/lib/actions/reports.actions";
import type { CompanySetting } from "@/lib/actions/settings.actions";

interface Props {
  rows: VehicleComparisonRow[];
  v1Name: string;
  v2Name: string;
  fy: string;
  stageName: string;
  hideAmounts: boolean;
  showDiffOnly: boolean;
  companySetting?: CompanySetting;
}

function fmt(v: number) {
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQty(v: number) {
  return v.toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

// Truncate long vehicle names for column headers
function short(label: string, max = 18) {
  return label.length > max ? label.slice(0, max - 1) + "…" : label;
}

export function VehicleComparisonDocument({
  rows,
  v1Name,
  v2Name,
  fy,
  stageName,
  hideAmounts,
  showDiffOnly,
  companySetting,
}: Props) {
  const coName    = companySetting?.company_name ?? COMPANY_NAME;
  const coAddress = companySetting?.address      ?? COMPANY_ADDRESS;
  const coGstin   = companySetting?.gstin        ?? COMPANY_GSTIN;

  const v1Short = short(v1Name);
  const v2Short = short(v2Name);

  // Column widths — landscape A4
  const W = hideAmounts
    ? { sno: "4%", mat: "38%", stage: "18%", qty1: "12%", qty2: "12%", diff: "16%" }
    : { sno: "4%", mat: "26%", stage: "13%", qty1: "9%", amt1: "12%", qty2: "9%", amt2: "12%", diff: "15%" };

  const filterParts = [`FY ${fy}`, `Stage: ${stageName}`];
  if (showDiffOnly) filterParts.push("Diff. Materials Only");

  return (
    <Document title={`Vehicle Comparison — ${v1Name} vs ${v2Name} — FY ${fy}`}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Company header */}
        <View>
          <Text style={styles.companyNameCentered}>{coName}</Text>
          <Text style={styles.companyDetailCentered}>{coAddress}</Text>
          <Text style={styles.companyDetailCentered}>GSTIN: {coGstin}</Text>
        </View>

        <Text style={[styles.docTypeCentered, { fontSize: 10.5, marginTop: 4 }]}>VEHICLE COMPARISON REPORT</Text>
        <Text style={{ fontSize: 8, color: "#6B7280", textAlign: "center", marginBottom: 2 }}>
          {v1Name}  vs  {v2Name}
        </Text>
        <Text style={{ fontSize: 8, color: "#9CA3AF", textAlign: "center", marginBottom: 6 }}>
          {filterParts.join("   |   ")}
        </Text>

        <View style={styles.separator} />

        {/* Table header */}
        <View style={[styles.plainTableHead, { marginTop: 4 }]}>
          <Text style={[styles.plainTableHeadCell, { width: W.sno }]}>S.No</Text>
          <Text style={[styles.plainTableHeadCell, { width: W.mat }]}>Material Name</Text>
          <Text style={[styles.plainTableHeadCell, { width: W.stage }]}>Stage</Text>
          <Text style={[styles.plainTableHeadCell, { width: W.qty1, textAlign: "right" }]}>Qty ({v1Short})</Text>
          {!hideAmounts && <Text style={[styles.plainTableHeadCell, { width: (W as { amt1: string }).amt1, textAlign: "right" }]}>Amt ({v1Short})</Text>}
          <Text style={[styles.plainTableHeadCell, { width: W.qty2, textAlign: "right" }]}>Qty ({v2Short})</Text>
          {!hideAmounts && <Text style={[styles.plainTableHeadCell, { width: (W as { amt2: string }).amt2, textAlign: "right" }]}>Amt ({v2Short})</Text>}
          <Text style={[styles.plainTableHeadCell, { width: W.diff, textAlign: "right" }]}>Diff (Qty)</Text>
        </View>

        <View style={styles.separator} />

        {/* Rows */}
        {rows.map((r, i) => {
          const diffColor = r.diff !== 0 ? "#92400E" : "#6B7280";
          return (
            <View key={`${r.code}-${r.stage_name}`} style={styles.plainTableRow}>
              <Text style={[styles.plainTableCell, { width: W.sno }]}>{i + 1}</Text>
              <Text style={[styles.plainTableCell, { width: W.mat }]}>{r.material_name}</Text>
              <Text style={[styles.plainTableCell, { width: W.stage, color: "#6B7280" }]}>{r.stage_name}</Text>
              <Text style={[styles.plainTableCell, { width: W.qty1, textAlign: "right" }]}>{fmtQty(r.qty1)}</Text>
              {!hideAmounts && (
                <Text style={[styles.plainTableCell, { width: (W as { amt1: string }).amt1, textAlign: "right" }]}>
                  {r.amt1 > 0 ? fmt(r.amt1) : "—"}
                </Text>
              )}
              <Text style={[styles.plainTableCell, { width: W.qty2, textAlign: "right" }]}>{fmtQty(r.qty2)}</Text>
              {!hideAmounts && (
                <Text style={[styles.plainTableCell, { width: (W as { amt2: string }).amt2, textAlign: "right" }]}>
                  {r.amt2 > 0 ? fmt(r.amt2) : "—"}
                </Text>
              )}
              <Text style={[styles.plainTableCellBold, { width: W.diff, textAlign: "right", color: diffColor }]}>
                {r.diff !== 0 ? (r.diff > 0 ? "+" : "") + fmtQty(r.diff) : "—"}
              </Text>
            </View>
          );
        })}

        <View style={[styles.separator, { marginTop: 2 }]} />
        <Text style={{ fontSize: 9, color: "#9CA3AF", marginTop: 4 }}>
          {rows.length} material{rows.length !== 1 ? "s" : ""} shown
          {showDiffOnly ? " (differences only)" : ""}
          {hideAmounts ? " · amounts hidden" : ""}
        </Text>

        {/* Footer */}
        <View style={styles.pageFooter} fixed>
          <View style={styles.footerLine} />
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `Pg.No.:${pageNumber}${totalPages > 1 ? ` of ${totalPages}` : ""}          Vehicle Comparison — ${v1Name} vs ${v2Name} — FY ${fy}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
