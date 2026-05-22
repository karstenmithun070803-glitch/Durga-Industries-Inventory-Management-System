import React from "react";
import {
  Document,
  Page,
  View,
  Text,
} from "@react-pdf/renderer";
import {
  styles,
  COMPANY_NAME,
  COMPANY_ADDRESS,
  fmtAmt,
  fmtDate,
} from "./pdf-styles";

type MaterialIssueRow = {
  id: string;
  slip_number: number;
  issue_date: string;
  financial_year: string;
  status: string;
  margin_percentage: string;
  total_amount: string;
  vehicle_id: string;
  vehicle_name: string;
  job_ref_no: number;
  customer_id: string | null;
  customer_name: string | null;
  customer_gstin: string | null;
  customer_state: string | null;
  item_id: string;
  material_id: string;
  material_name: string;
  material_no: number;
  hsn_code: string | null;
  contractor_id: string | null;
  contractor_name: string | null;
  qty: string;
  unit_id: string | null;
  unit_name: string | null;
  rate: string;
  tax_percentage: string;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  amount: string;
  gst_type: string | null;
  affects_inventory: boolean;
};

interface Props {
  rows: MaterialIssueRow[];
  fy: string;
  dateFrom?: string;
  dateTo?: string;
  statusFilter?: string;
}

function formatCode(prefix: string, num: number, pad = 3): string {
  return `${prefix}${String(num).padStart(pad, "0")}`;
}

export function MIRegisterDocument({ rows, fy, dateFrom, dateTo, statusFilter }: Props) {
  // Group rows by issue id (preserve display order)
  const slipMap = new Map<string, MaterialIssueRow[]>();
  for (const r of rows) {
    if (!slipMap.has(r.id)) slipMap.set(r.id, []);
    slipMap.get(r.id)!.push(r);
  }
  const slipGroups = Array.from(slipMap.entries());

  // Grand totals
  let grandSubtotal = 0;
  let grandCgst = 0;
  let grandSgst = 0;
  let grandIgst = 0;
  for (const r of rows) {
    grandSubtotal += parseFloat(r.amount ?? "0");
    grandCgst += parseFloat(r.cgst_amount ?? "0");
    grandSgst += parseFloat(r.sgst_amount ?? "0");
    grandIgst += parseFloat(r.igst_amount ?? "0");
  }
  const grandTotal = grandSubtotal + grandCgst + grandSgst + grandIgst;

  const uniqueSlips = slipGroups.length;
  const dateRange =
    dateFrom || dateTo
      ? `${dateFrom ? fmtDate(dateFrom) : "Start"} - ${dateTo ? fmtDate(dateTo) : "End"}`
      : `FY ${fy}`;

  const generatedAt =
    new Date().toLocaleDateString("en-IN", {
      day: "2-digit", month: "2-digit", year: "numeric",
    }) +
    " " +
    new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  return (
    <Document title={`MI Register - ${fy}`}>
      <Page size="A4" orientation="landscape" style={styles.page}>

        {/* Company header */}
        <View style={styles.companyHeader} fixed>
          <View>
            <Text style={styles.companyName}>{COMPANY_NAME}</Text>
            <Text style={styles.companyDetail}>{COMPANY_ADDRESS}</Text>
          </View>
          <View>
            <Text style={styles.docTitle}>Material Issue Register</Text>
            <Text style={styles.docMeta}>
              {dateRange}
              {statusFilter && statusFilter !== "All" ? `  |  Status: ${statusFilter}` : ""}
            </Text>
            <Text style={styles.docMeta}>Generated: {generatedAt}</Text>
          </View>
        </View>

        {/* Summary bar */}
        <View style={styles.summaryBar} fixed>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Total Slips:</Text>
            <Text style={styles.summaryValue}>{uniqueSlips}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Line Items:</Text>
            <Text style={styles.summaryValue}>{rows.length}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Grand Total:</Text>
            <Text style={styles.summaryValue}>Rs. {fmtAmt(String(grandTotal))}</Text>
          </View>
        </View>

        {/* Table header */}
        <View style={styles.tableHead} fixed>
          <Text style={[styles.tableHeadCell, { width: "4%" }]}>#</Text>
          <Text style={[styles.tableHeadCell, { width: "9%" }]}>Mat. Code</Text>
          <Text style={[styles.tableHeadCell, { flex: 1 }]}>Material Name</Text>
          <Text style={[styles.tableHeadCell, { width: "14%" }]}>Contractor</Text>
          <Text style={[styles.tableHeadCell, { width: "7%", textAlign: "right" }]}>Qty</Text>
          <Text style={[styles.tableHeadCell, { width: "6%" }]}>Unit</Text>
          <Text style={[styles.tableHeadCell, { width: "9%", textAlign: "right" }]}>Rate</Text>
          <Text style={[styles.tableHeadCell, { width: "9%", textAlign: "right" }]}>Tax</Text>
          <Text style={[styles.tableHeadCell, { width: "9%", textAlign: "right" }]}>Amount</Text>
          <Text style={[styles.tableHeadCell, { width: "5%", textAlign: "center" }]}>Stk</Text>
          <Text style={[styles.tableHeadCell, { width: "7%", textAlign: "center" }]}>Status</Text>
        </View>

        {/* Slip groups */}
        {slipGroups.map(([slipId, items]) => {
          const first = items[0];
          const slipLabel = formatCode("MI-", first.slip_number, 4);
          const slipSubtotal = items.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
          const slipTax = items.reduce(
            (s, r) =>
              s +
              parseFloat(r.cgst_amount ?? "0") +
              parseFloat(r.sgst_amount ?? "0") +
              parseFloat(r.igst_amount ?? "0"),
            0
          );

          return (
            <View key={slipId} wrap={false}>
              {/* Slip group header */}
              <View style={styles.groupHeader}>
                <Text style={styles.groupHeaderLabel}>
                  {slipLabel}  —  {fmtDate(first.issue_date)}  —  {first.vehicle_name}
                  {first.customer_name ? `  (${first.customer_name})` : ""}
                </Text>
                <Text style={styles.groupHeaderMeta}>
                  Total: Rs. {fmtAmt(String(slipSubtotal + slipTax))}
                </Text>
              </View>

              {/* Items */}
              {items.map((r, idx) => {
                const taxAmt =
                  parseFloat(r.igst_amount ?? "0") > 0
                    ? r.igst_amount
                    : String(
                        parseFloat(r.cgst_amount ?? "0") +
                          parseFloat(r.sgst_amount ?? "0")
                      );
                return (
                  <View
                    key={r.item_id}
                    style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}
                  >
                    <Text style={[styles.tableCellMono, { width: "4%" }]}>{idx + 1}</Text>
                    <Text style={[styles.tableCellMono, { width: "9%" }]}>
                      {formatCode("M", r.material_no)}
                    </Text>
                    <Text style={[styles.tableCell, { flex: 1 }]}>
                      {r.material_name}
                    </Text>
                    <Text style={[styles.tableCell, { width: "14%" }]}>
                      {r.contractor_name ?? "—"}
                    </Text>
                    <Text style={[styles.tableCell, styles.tableCellRight, { width: "7%" }]}>
                      {r.qty}
                    </Text>
                    <Text style={[styles.tableCell, { width: "6%" }]}>
                      {r.unit_name ?? "—"}
                    </Text>
                    <Text style={[styles.tableCell, styles.tableCellRight, { width: "9%" }]}>
                      {fmtAmt(r.rate)}
                    </Text>
                    <Text style={[styles.tableCell, styles.tableCellRight, { width: "9%" }]}>
                      {fmtAmt(taxAmt)}
                    </Text>
                    <Text style={[styles.tableCellBold, styles.tableCellRight, { width: "9%" }]}>
                      {fmtAmt(r.amount)}
                    </Text>
                    <Text style={[styles.tableCell, styles.tableCellCenter, { width: "5%" }]}>
                      {r.affects_inventory ? "Y" : "—"}
                    </Text>
                    <View style={{ width: "7%", alignItems: "center" }}>
                      <Text
                        style={
                          r.status === "Issued" ? styles.badgeIssued : styles.badgeDraft
                        }
                      >
                        {r.status}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalsBox}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal</Text>
              <Text style={styles.totalsValue}>Rs. {fmtAmt(String(grandSubtotal))}</Text>
            </View>
            {grandCgst > 0 && (
              <>
                <View style={styles.totalsRow}>
                  <Text style={styles.totalsLabel}>CGST</Text>
                  <Text style={styles.totalsValue}>Rs. {fmtAmt(String(grandCgst))}</Text>
                </View>
                <View style={styles.totalsRow}>
                  <Text style={styles.totalsLabel}>SGST</Text>
                  <Text style={styles.totalsValue}>Rs. {fmtAmt(String(grandSgst))}</Text>
                </View>
              </>
            )}
            {grandIgst > 0 && (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>IGST</Text>
                <Text style={styles.totalsValue}>Rs. {fmtAmt(String(grandIgst))}</Text>
              </View>
            )}
            <View style={styles.totalsDivider} />
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>Grand Total</Text>
              <Text style={styles.grandTotalValue}>Rs. {fmtAmt(String(grandTotal))}</Text>
            </View>
          </View>
        </View>

        {/* Page footer */}
        <View style={styles.pageFooter} fixed>
          <Text style={styles.footerText}>{COMPANY_NAME} — Material Issue Register</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
