import React from "react";
import { Document, Page, View, Text } from "@react-pdf/renderer";
import {
  styles,
  COMPANY_NAME,
  COMPANY_ADDRESS,
  COMPANY_GSTIN,
  fmtAmt,
} from "./pdf-styles";
import type { MonthlyStockRow } from "@/lib/actions/reports.actions";
import type { CompanySetting } from "@/lib/actions/settings.actions";

interface Props {
  rows: MonthlyStockRow[];
  fromMonth: string;
  toMonth: string;
  showDetails: boolean;
  showPrices: boolean;
  materialName?: string;
  companySetting?: CompanySetting;
}

function fmtQ(v: number) {
  return v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function fmtSigned(v: number) {
  if (v === 0) return "—";
  const abs = Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  return v > 0 ? `+${abs}` : `-${abs}`;
}

function monthToLabel(m: string) {
  const [year, month] = m.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

export function MonthlyStockReportDocument({ rows, fromMonth, toMonth, showDetails, showPrices, materialName, companySetting }: Props) {
  const coName    = companySetting?.company_name ?? COMPANY_NAME;
  const coAddress = companySetting?.address      ?? COMPANY_ADDRESS;
  const coGstin   = companySetting?.gstin        ?? COMPANY_GSTIN;

  const fromLabel = monthToLabel(fromMonth);
  const toLabel   = monthToLabel(toMonth);
  const periodLabel = fromMonth === toMonth ? fromLabel : `${fromLabel} – ${toLabel}`;

  const filterParts: string[] = [periodLabel];
  if (materialName) filterParts.push(`Material: ${materialName}`);
  if (showDetails)  filterParts.push("Detail view");
  if (showPrices)   filterParts.push("Including prices");

  const totals = {
    opening:     rows.reduce((s, r) => s + r.opening_stock, 0),
    inward:      rows.reduce((s, r) => s + r.po_inward, 0),
    issues:      rows.reduce((s, r) => s + r.issues, 0),
    reversals:   rows.reduce((s, r) => s + r.reversals, 0),
    adjustments: rows.reduce((s, r) => s + r.adjustments, 0),
    closing:     rows.reduce((s, r) => s + r.closing_stock, 0),
  };

  const hasMultipleUnits = new Set(rows.map((r) => r.unit_name ?? "—")).size > 1;

  return (
    <Document title={`Monthly Stock Report — ${periodLabel}`}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Company header */}
        <View>
          <Text style={styles.companyNameCentered}>{coName}</Text>
          <Text style={styles.companyDetailCentered}>{coAddress}</Text>
          <Text style={styles.companyDetailCentered}>GSTIN: {coGstin}</Text>
        </View>

        <Text style={[styles.docTypeCentered, { fontSize: 10.5, marginTop: 4 }]}>MONTHLY STOCK REPORT</Text>
        <Text style={{ fontSize: 8, color: "#6B7280", textAlign: "center", marginBottom: 6 }}>
          {filterParts.join("   |   ")}
        </Text>

        {hasMultipleUnits && (
          <Text style={{ fontSize: 9, color: "#B45309", textAlign: "center", marginBottom: 4 }}>
            ⚠ Multiple units in this report — totals span different units and may not be meaningful.
          </Text>
        )}

        <View style={styles.separator} />

        {/* Table header */}
        <View style={[styles.plainTableHead, { marginTop: 4 }]}>
          <Text style={[styles.plainTableHeadCell, { width: "4%" }]}>S.No</Text>
          <Text style={[styles.plainTableHeadCell, { width: "28%" }]}>Material</Text>
          <Text style={[styles.plainTableHeadCell, { width: "5%" }]}>Unit</Text>
          <Text style={[styles.plainTableHeadCell, { width: "10%", textAlign: "right" }]}>Opening</Text>
          <Text style={[styles.plainTableHeadCell, { width: "10%", textAlign: "right" }]}>PO Inward</Text>
          <Text style={[styles.plainTableHeadCell, { width: "9%", textAlign: "right" }]}>Issues</Text>
          {showDetails && <Text style={[styles.plainTableHeadCell, { width: "9%", textAlign: "right" }]}>Reversals</Text>}
          {showDetails && <Text style={[styles.plainTableHeadCell, { width: "9%", textAlign: "right" }]}>Adjustments</Text>}
          <Text style={[styles.plainTableHeadCell, { width: "10%", textAlign: "right" }]}>Closing</Text>
          {showPrices && <Text style={[styles.plainTableHeadCell, { width: "8%", textAlign: "right" }]}>Rate</Text>}
          {showPrices && <Text style={[styles.plainTableHeadCell, { width: "8%", textAlign: "right" }]}>Value</Text>}
        </View>
        <View style={styles.separator} />

        {/* Rows */}
        {rows.map((r, i) => {
          const effectiveRate = r.last_po_rate ?? r.standard_cost;
          const closingValue = effectiveRate !== null ? r.closing_stock * effectiveRate : null;
          return (
            <View key={r.material_id} style={styles.plainTableRow}>
              <Text style={[styles.plainTableCell, { width: "4%" }]}>{i + 1}</Text>
              <Text style={[styles.plainTableCell, { width: "28%" }]}>
                M-{String(r.material_no).padStart(4, "0")} {r.material_name}
              </Text>
              <Text style={[styles.plainTableCell, { width: "5%" }]}>{r.unit_name ?? "—"}</Text>
              <Text style={[styles.plainTableCell, { width: "10%", textAlign: "right" }]}>{fmtQ(r.opening_stock)}</Text>
              <Text style={[styles.plainTableCell, { width: "10%", textAlign: "right", color: r.po_inward > 0 ? "#15803D" : undefined }]}>
                {r.po_inward > 0 ? `+${fmtQ(r.po_inward)}` : "—"}
              </Text>
              <Text style={[styles.plainTableCell, { width: "9%", textAlign: "right", color: r.issues > 0 ? "#B45309" : undefined }]}>
                {r.issues > 0 ? `-${fmtQ(r.issues)}` : "—"}
              </Text>
              {showDetails && (
                <Text style={[styles.plainTableCell, { width: "9%", textAlign: "right" }]}>
                  {r.reversals !== 0 ? fmtSigned(r.reversals) : "—"}
                </Text>
              )}
              {showDetails && (
                <Text style={[styles.plainTableCell, { width: "9%", textAlign: "right" }]}>
                  {r.adjustments !== 0 ? fmtSigned(r.adjustments) : "—"}
                </Text>
              )}
              <Text style={[styles.plainTableCellBold, { width: "10%", textAlign: "right", color: r.closing_stock < 0 ? "#DC2626" : undefined }]}>{fmtQ(r.closing_stock)}</Text>
              {showPrices && (
                <Text style={[styles.plainTableCell, { width: "8%", textAlign: "right" }]}>
                  {effectiveRate !== null ? fmtAmt(String(effectiveRate)) : "—"}
                </Text>
              )}
              {showPrices && (
                <Text style={[styles.plainTableCellBold, { width: "8%", textAlign: "right" }]}>
                  {closingValue != null ? fmtAmt(closingValue.toFixed(2)) : "—"}
                </Text>
              )}
            </View>
          );
        })}

        <View style={[styles.separator, { marginTop: 2 }]} />

        {/* Totals row */}
        <View style={[styles.plainTableRow, { backgroundColor: "#F8FAFC" }]}>
          <Text style={[styles.plainTableCellBold, { width: "4%" }]} />
          <Text style={[styles.plainTableCellBold, { width: "28%", textAlign: "right" }]}>
            {hasMultipleUnits ? "TOTAL (mixed units)" : "TOTAL"}
          </Text>
          <Text style={[styles.plainTableCellBold, { width: "5%" }]} />
          <Text style={[styles.plainTableCellBold, { width: "10%", textAlign: "right" }]}>{fmtQ(totals.opening)}</Text>
          <Text style={[styles.plainTableCellBold, { width: "10%", textAlign: "right" }]}>{totals.inward > 0 ? `+${fmtQ(totals.inward)}` : "—"}</Text>
          <Text style={[styles.plainTableCellBold, { width: "9%", textAlign: "right" }]}>{totals.issues > 0 ? `-${fmtQ(totals.issues)}` : "—"}</Text>
          {showDetails && <Text style={[styles.plainTableCellBold, { width: "9%", textAlign: "right" }]}>{totals.reversals !== 0 ? fmtSigned(totals.reversals) : "—"}</Text>}
          {showDetails && <Text style={[styles.plainTableCellBold, { width: "9%", textAlign: "right" }]}>{totals.adjustments !== 0 ? fmtSigned(totals.adjustments) : "—"}</Text>}
          <Text style={[styles.plainTableCellBold, { width: "10%", textAlign: "right" }]}>{fmtQ(totals.closing)}</Text>
          {showPrices && <Text style={[styles.plainTableCellBold, { width: "8%" }]} />}
          {showPrices && <Text style={[styles.plainTableCellBold, { width: "8%" }]} />}
        </View>

        {/* Footer */}
        <View style={styles.pageFooter} fixed>
          <View style={styles.footerLine} />
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `Pg.No.:${pageNumber}${totalPages > 1 ? ` of ${totalPages}` : ""}          Monthly Stock Report — ${periodLabel}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
