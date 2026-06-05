import React from "react";
import { Document, Page, View, Text } from "@react-pdf/renderer";
import {
  styles,
  COMPANY_NAME,
  COMPANY_ADDRESS,
  COMPANY_GSTIN,
  fmtAmt,
} from "./pdf-styles";
import type { InvoiceSummaryRow } from "@/lib/actions/reports.actions";
import type { CompanySetting } from "@/lib/actions/settings.actions";

interface Props {
  rows: InvoiceSummaryRow[];
  fy: string;
  statusFilter?: string;
  dateFrom?: string;
  dateTo?: string;
  companySetting?: CompanySetting;
}

function fmt(v: number) {
  return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function InvoiceSummaryReportDocument({ rows, fy, statusFilter, dateFrom, dateTo, companySetting }: Props) {
  const coName    = companySetting?.company_name ?? COMPANY_NAME;
  const coAddress = companySetting?.address      ?? COMPANY_ADDRESS;
  const coGstin   = companySetting?.gstin        ?? COMPANY_GSTIN;

  const isCancelledOnly = statusFilter === "Cancelled";
  const forTotals = isCancelledOnly ? rows : rows.filter((r) => r.status !== "Cancelled");
  const totals = {
    taxable: forTotals.reduce((s, r) => s + r.taxable_value, 0),
    cgst:    forTotals.reduce((s, r) => s + r.total_cgst,    0),
    sgst:    forTotals.reduce((s, r) => s + r.total_sgst,    0),
    igst:    forTotals.reduce((s, r) => s + r.total_igst,    0),
    gross:   forTotals.reduce((s, r) => s + r.gross_total,   0),
    discount:forTotals.reduce((s, r) => s + r.discount,      0),
    net:     forTotals.reduce((s, r) => s + r.net_amount,    0),
  };

  const filterParts: string[] = [`FY ${fy}`];
  if (statusFilter && statusFilter !== "Finalized") filterParts.push(`Status: ${statusFilter}`);
  if (dateFrom) filterParts.push(`From: ${dateFrom}`);
  if (dateTo)   filterParts.push(`To: ${dateTo}`);

  const hasCgst = totals.cgst > 0;
  const hasSgst = totals.sgst > 0;
  const hasIgst = totals.igst > 0;
  const hasDiscount = totals.discount > 0;

  // Column widths
  const W = {
    sno:      "4%",
    bill:     "8%",
    date:     "9%",
    vehicle:  "12%",
    customer: "14%",
    taxable:  "9%",
    tax:      "8%",
    gross:    "9%",
    discount: "8%",
    net:      "10%",
    status:   "9%",
  };

  return (
    <Document title={`Invoice Summary — FY ${fy}`}>
      <Page size="A4" orientation="landscape" style={styles.page}>

        {/* Company header */}
        <View>
          <Text style={styles.companyNameCentered}>{coName}</Text>
          <Text style={styles.companyDetailCentered}>{coAddress}</Text>
          <Text style={styles.companyDetailCentered}>GSTIN: {coGstin}</Text>
        </View>

        <Text style={[styles.docTypeCentered, { fontSize: 10, marginTop: 4 }]}>INVOICE SUMMARY REPORT</Text>
        <Text style={{ fontSize: 8, color: "#6B7280", textAlign: "center", marginBottom: 6 }}>
          {filterParts.join("   |   ")}
        </Text>

        <View style={styles.separator} />

        {/* Table header */}
        <View style={[styles.plainTableHead, { marginTop: 4 }]}>
          <Text style={[styles.plainTableHeadCell, { width: W.sno }]}>S.No</Text>
          <Text style={[styles.plainTableHeadCell, { width: W.bill }]}>Bill #</Text>
          <Text style={[styles.plainTableHeadCell, { width: W.date }]}>Date</Text>
          <Text style={[styles.plainTableHeadCell, { width: W.vehicle }]}>Vehicle</Text>
          <Text style={[styles.plainTableHeadCell, { width: W.customer }]}>Customer</Text>
          <Text style={[styles.plainTableHeadCell, { width: W.taxable, textAlign: "right" }]}>Taxable</Text>
          {hasCgst && <Text style={[styles.plainTableHeadCell, { width: W.tax, textAlign: "right" }]}>CGST</Text>}
          {hasSgst && <Text style={[styles.plainTableHeadCell, { width: W.tax, textAlign: "right" }]}>SGST</Text>}
          {hasIgst && <Text style={[styles.plainTableHeadCell, { width: W.tax, textAlign: "right" }]}>IGST</Text>}
          <Text style={[styles.plainTableHeadCell, { width: W.gross, textAlign: "right" }]}>Gross</Text>
          {hasDiscount && <Text style={[styles.plainTableHeadCell, { width: W.discount, textAlign: "right" }]}>Discount</Text>}
          <Text style={[styles.plainTableHeadCell, { width: W.net, textAlign: "right" }]}>Net Amount</Text>
          <Text style={[styles.plainTableHeadCell, { width: W.status }]}>Status</Text>
        </View>

        <View style={styles.separator} />

        {/* Rows */}
        {rows.map((r, i) => {
          const cancelled = r.status === "Cancelled";
          const cellStyle = cancelled
            ? { ...styles.plainTableCell, color: "#9CA3AF", textDecoration: "line-through" as const }
            : styles.plainTableCell;
          return (
            <View key={r.id} style={styles.plainTableRow}>
              <Text style={[cellStyle, { width: W.sno }]}>{i + 1}</Text>
              <Text style={[cellStyle, { width: W.bill, fontFamily: "Helvetica-Bold" }]}>{r.bill_number}</Text>
              <Text style={[cellStyle, { width: W.date }]}>{r.bill_date}</Text>
              <Text style={[cellStyle, { width: W.vehicle }]}>{r.vehicle_name ?? "—"}</Text>
              <Text style={[cellStyle, { width: W.customer }]}>{r.customer_name ?? "—"}</Text>
              <Text style={[cellStyle, { width: W.taxable, textAlign: "right" }]}>{fmt(r.taxable_value)}</Text>
              {hasCgst && <Text style={[cellStyle, { width: W.tax, textAlign: "right" }]}>{r.total_cgst > 0 ? fmt(r.total_cgst) : "—"}</Text>}
              {hasSgst && <Text style={[cellStyle, { width: W.tax, textAlign: "right" }]}>{r.total_sgst > 0 ? fmt(r.total_sgst) : "—"}</Text>}
              {hasIgst && <Text style={[cellStyle, { width: W.tax, textAlign: "right" }]}>{r.total_igst > 0 ? fmt(r.total_igst) : "—"}</Text>}
              <Text style={[cellStyle, { width: W.gross, textAlign: "right" }]}>{fmt(r.gross_total)}</Text>
              {hasDiscount && <Text style={[cellStyle, { width: W.discount, textAlign: "right" }]}>{r.discount > 0 ? fmt(r.discount) : "—"}</Text>}
              <Text style={[styles.plainTableCellBold, { width: W.net, textAlign: "right", color: cancelled ? "#9CA3AF" : undefined }]}>{fmt(r.net_amount)}</Text>
              <Text style={[cellStyle, { width: W.status }]}>{r.status}</Text>
            </View>
          );
        })}

        <View style={[styles.separator, { marginTop: 2 }]} />

        {/* Totals row */}
        <View style={[styles.plainTableRow, { backgroundColor: "#F8FAFC" }]}>
          <Text style={[styles.plainTableCellBold, { width: W.sno }]} />
          <Text style={[styles.plainTableCellBold, { width: W.bill }]} />
          <Text style={[styles.plainTableCellBold, { width: W.date }]} />
          <Text style={[styles.plainTableCellBold, { width: W.vehicle }]} />
          <Text style={[styles.plainTableCellBold, { width: W.customer, textAlign: "right" }]}>
            {isCancelledOnly ? "REF. TOTAL" : rows.some((r) => r.status === "Cancelled") ? "TOTAL (excl. Cancelled)" : "TOTAL"}
          </Text>
          <Text style={[styles.plainTableCellBold, { width: W.taxable, textAlign: "right" }]}>{fmt(totals.taxable)}</Text>
          {hasCgst && <Text style={[styles.plainTableCellBold, { width: W.tax, textAlign: "right" }]}>{totals.cgst > 0 ? fmt(totals.cgst) : "—"}</Text>}
          {hasSgst && <Text style={[styles.plainTableCellBold, { width: W.tax, textAlign: "right" }]}>{totals.sgst > 0 ? fmt(totals.sgst) : "—"}</Text>}
          {hasIgst && <Text style={[styles.plainTableCellBold, { width: W.tax, textAlign: "right" }]}>{totals.igst > 0 ? fmt(totals.igst) : "—"}</Text>}
          <Text style={[styles.plainTableCellBold, { width: W.gross, textAlign: "right" }]}>{fmt(totals.gross)}</Text>
          {hasDiscount && <Text style={[styles.plainTableCellBold, { width: W.discount, textAlign: "right" }]}>{totals.discount > 0 ? fmt(totals.discount) : "—"}</Text>}
          <Text style={[styles.plainTableCellBold, { width: W.net, textAlign: "right" }]}>{fmt(totals.net)}</Text>
          <Text style={[styles.plainTableCellBold, { width: W.status }]} />
        </View>

        {/* Footer */}
        <View style={styles.pageFooter} fixed>
          <View style={styles.footerLine} />
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `Pg.No.:${pageNumber}${totalPages > 1 ? ` of ${totalPages}` : ""}          Invoice Summary — FY ${fy}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
