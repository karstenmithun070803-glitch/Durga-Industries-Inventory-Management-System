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

type ItemRow = {
  id: string;
  po_number: number;
  po_date: Date | string;
  status: string;
  affects_stock: boolean;
  item_id: string | null;
  material_id: string | null;
  material_name: string | null;
  material_no: number | null;
  supplier_id: string | null;
  supplier_name: string | null;
  qty: string | null;
  unit_name: string | null;
  rate: string | null;
  cgst_amount: string | null;
  sgst_amount: string | null;
  igst_amount: string | null;
  amount: string | null;
  gst_type: string | null;
};

interface Props {
  rows: ItemRow[];
  fy: string;
  dateFrom?: string;
  dateTo?: string;
  statusFilter?: string;
}

function formatCode(prefix: string, num: number, pad = 3): string {
  return `${prefix}${String(num).padStart(pad, "0")}`;
}

export function PORegisterDocument({ rows, fy, dateFrom, dateTo, statusFilter }: Props) {
  // Group rows by PO id (preserve display order)
  const poMap = new Map<string, ItemRow[]>();
  for (const r of rows) {
    const key = r.id;
    if (!poMap.has(key)) poMap.set(key, []);
    poMap.get(key)!.push(r);
  }
  const poGroups = Array.from(poMap.entries());

  // Grand totals
  let grandSubtotal = 0;
  let grandCgst = 0;
  let grandSgst = 0;
  let grandIgst = 0;
  let grandTotal = 0;
  for (const r of rows) {
    grandSubtotal += parseFloat(r.amount ?? "0");
    grandCgst += parseFloat(r.cgst_amount ?? "0");
    grandSgst += parseFloat(r.sgst_amount ?? "0");
    grandIgst += parseFloat(r.igst_amount ?? "0");
  }
  grandTotal = grandSubtotal + grandCgst + grandSgst + grandIgst;

  // Summary
  const uniquePOs = new Set(rows.map((r) => r.id)).size;
  const dateRange =
    dateFrom || dateTo
      ? `${dateFrom ? fmtDate(dateFrom) : "Start"} - ${dateTo ? fmtDate(dateTo) : "End"}`
      : `FY ${fy}`;

  const generatedAt = new Date().toLocaleDateString("en-IN", {
    day: "2-digit", month: "2-digit", year: "numeric",
  }) + " " + new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  return (
    <Document title={`PO Register - ${fy}`}>
      <Page size="A4" orientation="landscape" style={styles.page}>

        {/* Company header */}
        <View style={styles.companyHeader} fixed>
          <View>
            <Text style={styles.companyName}>{COMPANY_NAME}</Text>
            <Text style={styles.companyDetail}>{COMPANY_ADDRESS}</Text>
          </View>
          <View>
            <Text style={styles.docTitle}>Purchase Order Register</Text>
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
            <Text style={styles.summaryLabel}>Total POs:</Text>
            <Text style={styles.summaryValue}>{uniquePOs}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Line Items:</Text>
            <Text style={styles.summaryValue}>{rows.filter((r) => r.item_id).length}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Grand Total:</Text>
            <Text style={styles.summaryValue}>Rs. {fmtAmt(String(grandTotal))}</Text>
          </View>
        </View>

        {/* Table header */}
        <View style={styles.tableHead} fixed>
          <Text style={[styles.tableHeadCell, { width: "5%" }]}>#</Text>
          <Text style={[styles.tableHeadCell, { width: "12%" }]}>Mat. Code</Text>
          <Text style={[styles.tableHeadCell, { flex: 1 }]}>Material Name</Text>
          <Text style={[styles.tableHeadCell, { width: "15%" }]}>Supplier</Text>
          <Text style={[styles.tableHeadCell, { width: "7%", textAlign: "right" }]}>Qty</Text>
          <Text style={[styles.tableHeadCell, { width: "6%" }]}>Unit</Text>
          <Text style={[styles.tableHeadCell, { width: "9%", textAlign: "right" }]}>Rate</Text>
          <Text style={[styles.tableHeadCell, { width: "9%", textAlign: "right" }]}>Tax</Text>
          <Text style={[styles.tableHeadCell, { width: "10%", textAlign: "right" }]}>Amount</Text>
          <Text style={[styles.tableHeadCell, { width: "8%", textAlign: "center" }]}>Status</Text>
        </View>

        {/* PO groups */}
        {poGroups.map(([poId, items]) => {
          const first = items[0];
          const poLabel = formatCode("PO-", first.po_number, 4);
          const poSubtotal = items.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
          const poTax = items.reduce(
            (s, r) =>
              s +
              parseFloat(r.cgst_amount ?? "0") +
              parseFloat(r.sgst_amount ?? "0") +
              parseFloat(r.igst_amount ?? "0"),
            0
          );

          return (
            <View key={poId} wrap={false}>
              {/* Group header */}
              <View style={styles.groupHeader}>
                <Text style={styles.groupHeaderLabel}>
                  {poLabel}  —  {fmtDate(first.po_date)}
                  {!first.affects_stock ? "  (No Stock)" : ""}
                </Text>
                <Text style={styles.groupHeaderMeta}>
                  Subtotal: Rs. {fmtAmt(String(poSubtotal + poTax))}
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
                    key={r.item_id ?? idx}
                    style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}
                  >
                    <Text style={[styles.tableCellMono, { width: "5%" }]}>{idx + 1}</Text>
                    <Text style={[styles.tableCellMono, { width: "12%" }]}>
                      {r.material_no ? formatCode("M", r.material_no) : "—"}
                    </Text>
                    <Text style={[styles.tableCell, { flex: 1 }]}>
                      {r.material_name ?? "—"}
                    </Text>
                    <Text style={[styles.tableCell, { width: "15%" }]}>
                      {r.supplier_name ?? "—"}
                    </Text>
                    <Text style={[styles.tableCell, styles.tableCellRight, { width: "7%" }]}>
                      {r.qty ?? "—"}
                    </Text>
                    <Text style={[styles.tableCell, { width: "6%" }]}>
                      {r.unit_name ?? "—"}
                    </Text>
                    <Text style={[styles.tableCell, styles.tableCellRight, { width: "9%" }]}>
                      {r.rate ? fmtAmt(r.rate) : "—"}
                    </Text>
                    <Text style={[styles.tableCell, styles.tableCellRight, { width: "9%" }]}>
                      {fmtAmt(taxAmt)}
                    </Text>
                    <Text style={[styles.tableCellBold, styles.tableCellRight, { width: "10%" }]}>
                      {fmtAmt(r.amount)}
                    </Text>
                    <View style={{ width: "8%", alignItems: "center" }}>
                      <Text
                        style={
                          r.status === "Received" ? styles.badgeReceived : styles.badgeDraft
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
          <Text style={styles.footerText}>{COMPANY_NAME} — Purchase Order Register</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
