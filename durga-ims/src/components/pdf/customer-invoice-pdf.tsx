import React from "react";
import { Document, Page, View, Text } from "@react-pdf/renderer";
import {
  styles,
  COMPANY_NAME,
  COMPANY_ADDRESS,
  COMPANY_GSTIN,
  fmtAmt,
  fmtQty,
  fmtDate,
} from "./pdf-styles";
import type { InvoiceRow } from "@/types";

interface Props {
  groups: InvoiceRow[][];
  fy: string;
}

function formatJobCode(num: number): string {
  return `J${String(num).padStart(5, "0")}`;
}

export function CustomerInvoiceDocument({ groups }: Props) {
  return (
    <Document title="Invoice — Customer Copy">
      {groups.map((items) => {
        const first = items[0];

        const subtotal = items.reduce((s, r) => s + parseFloat(r.amount || "0"), 0);
        const cgst = items.reduce((s, r) => s + parseFloat(r.cgst_amount || "0"), 0);
        const sgst = items.reduce((s, r) => s + parseFloat(r.sgst_amount || "0"), 0);
        const igst = items.reduce((s, r) => s + parseFloat(r.igst_amount || "0"), 0);
        const discount = parseFloat(first.discount || "0");
        const gross = subtotal + cgst + sgst + igst;
        const net = gross - discount;

        return (
          <Page key={first.id} size="A4" style={styles.page}>

            {/* ── Company block ── */}
            <View>
              <Text style={styles.companyNameCentered}>{COMPANY_NAME}</Text>
              <Text style={styles.companyDetailCentered}>{COMPANY_ADDRESS}</Text>
              <Text style={styles.companyDetailCentered}>GSTIN: {COMPANY_GSTIN}</Text>
            </View>

            <Text style={styles.docTypeCentered}>INVOICE</Text>

            {/* ── Header info ── */}
            <View style={styles.infoLine}>
              <Text style={styles.infoLineLabel}>BILL NO.</Text>
              <Text style={styles.infoLineValue}>: {first.bill_number}</Text>
            </View>
            <View style={styles.infoLine}>
              <Text style={styles.infoLineLabel}>BILL DATE</Text>
              <Text style={styles.infoLineValue}>: {fmtDate(first.bill_date)}</Text>
            </View>
            <View style={styles.infoLine}>
              <Text style={styles.infoLineLabel}>VEHICLE</Text>
              <Text style={styles.infoLineValue}>: {first.vehicle_name}</Text>
            </View>
            <View style={styles.infoLine}>
              <Text style={styles.infoLineLabel}>JOB NO.</Text>
              <Text style={styles.infoLineValue}>: {formatJobCode(first.job_ref_no)}</Text>
            </View>
            {first.customer_name && (
              <View style={styles.infoLine}>
                <Text style={styles.infoLineLabel}>CUSTOMER</Text>
                <Text style={styles.infoLineValue}>: {first.customer_name}</Text>
              </View>
            )}
            {first.rev_charge_status && (
              <View style={[styles.infoLine, { marginTop: 3 }]}>
                <Text style={[styles.infoLineValue, { fontFamily: "Helvetica-Oblique", fontSize: 8 }]}>
                  * Tax to be paid on reverse charge basis
                </Text>
              </View>
            )}

            {/* ── Table — simplified (no tax columns) ── */}
            <View style={[styles.table, { marginTop: 8 }]}>
              <View style={styles.separator} />

              <View style={styles.plainTableHead}>
                <Text style={[styles.plainTableHeadCell, { width: "8%" }]}>S No.</Text>
                <Text style={[styles.plainTableHeadCell, { flex: 1 }]}>Material Name</Text>
                <Text style={[styles.plainTableHeadCell, { width: "12%", textAlign: "right" }]}>Qty</Text>
                <Text style={[styles.plainTableHeadCell, { width: "9%", marginLeft: 4 }]}>Unit</Text>
                <Text style={[styles.plainTableHeadCell, { width: "13%", textAlign: "right" }]}>Rate</Text>
                <Text style={[styles.plainTableHeadCell, { width: "14%", textAlign: "right" }]}>Amount</Text>
              </View>

              <View style={styles.separator} />

              {items.map((r, idx) => (
                <View key={r.item_id} style={styles.plainTableRow}>
                  <Text style={[styles.plainTableCell, { width: "8%" }]}>{idx + 1}</Text>
                  <Text style={[styles.plainTableCell, { flex: 1 }]}>{r.material_name}</Text>
                  <Text style={[styles.plainTableCell, { width: "12%", textAlign: "right" }]}>{fmtQty(r.qty)}</Text>
                  <Text style={[styles.plainTableCell, { width: "9%", marginLeft: 4 }]}>{r.unit_name ?? "—"}</Text>
                  <Text style={[styles.plainTableCell, { width: "13%", textAlign: "right" }]}>{fmtAmt(r.rate)}</Text>
                  <Text style={[styles.plainTableCellBold, { width: "14%", textAlign: "right" }]}>{fmtAmt(r.amount)}</Text>
                </View>
              ))}

              <View style={styles.separator} />

              {/* Simplified totals — Net Amount only */}
              <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 2, gap: 8 }}>
                <View style={{ alignItems: "flex-end", gap: 3 }}>
                  {discount > 0 && <Text style={styles.plainTableCell}>Subtotal</Text>}
                  {discount > 0 && <Text style={styles.plainTableCell}>Discount</Text>}
                  <Text style={styles.plainTableCellBold}>Net Amount</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 3, minWidth: 90 }}>
                  {discount > 0 && <Text style={styles.plainTableCell}>{fmtAmt(String(gross))}</Text>}
                  {discount > 0 && <Text style={styles.plainTableCell}>- {fmtAmt(String(discount))}</Text>}
                  <Text style={styles.plainTableCellBold}>Rs. {fmtAmt(String(net))}</Text>
                </View>
              </View>
            </View>

            {/* ── Page footer ── */}
            <View style={styles.pageFooter} fixed>
              <View style={styles.footerLine} />
              <Text
                style={styles.footerText}
                render={({ pageNumber, totalPages }) =>
                  `Pg.No.:${pageNumber}${totalPages > 1 ? ` of ${totalPages}` : ""}          For ${COMPANY_NAME}`
                }
              />
            </View>
          </Page>
        );
      })}
    </Document>
  );
}
