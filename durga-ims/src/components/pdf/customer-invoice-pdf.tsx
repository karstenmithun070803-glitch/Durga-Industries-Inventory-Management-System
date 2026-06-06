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
import { numberToWords } from "@/lib/utils/number-to-words";
import type { CompanySetting } from "@/lib/actions/settings.actions";

interface Props {
  groups: InvoiceRow[][];
  fy: string;
  companySetting?: CompanySetting;
}


export function CustomerInvoiceDocument({ groups, companySetting }: Props) {
  const coName = companySetting?.company_name ?? COMPANY_NAME;
  const coAddress = companySetting?.address ?? COMPANY_ADDRESS;
  const coGstin = companySetting?.gstin ?? COMPANY_GSTIN;

  return (
    <Document title="Invoice — Customer Copy">
      {groups.map((items) => {
        const first = items[0];


        const subtotal = items.reduce((s, r) => s + parseFloat(r.amount || "0"), 0);
        const cgst = items.reduce((s, r) => s + parseFloat(r.cgst_amount || "0"), 0);
        const sgst = items.reduce((s, r) => s + parseFloat(r.sgst_amount || "0"), 0);
        const igst = items.reduce((s, r) => s + parseFloat(r.igst_amount || "0"), 0);
        const hasCgstSgst = cgst > 0 || sgst > 0;
        const hasIgst = igst > 0;

        return (
          <Page key={first.id} size="A4" style={styles.page}>

            {/* ── Company block ── */}
            <View>
              <Text style={styles.companyNameCentered}>{coName}</Text>
              <Text style={styles.companyDetailCentered}>{coAddress}</Text>
              <Text style={styles.companyDetailCentered}>GSTIN: {coGstin}</Text>
            </View>

            <Text style={styles.docTypeCentered}>INVOICE</Text>

            {/* ── Two-column header: bill info left, customer info right ── */}
            <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
              {/* Left column — bill info */}
              <View style={{ flex: 1 }}>
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
                  <Text style={styles.infoLineValue}>: {first.job_ref_no}</Text>
                </View>
              </View>

              {/* Right column — customer info */}
              <View style={{ flex: 1 }}>
                {first.customer_name && (
                  <View style={styles.infoLine}>
                    <Text style={styles.infoLineLabel}>CUSTOMER</Text>
                    <Text style={styles.infoLineValue}>: {first.customer_name}</Text>
                  </View>
                )}
                {first.customer_gstin && (
                  <View style={styles.infoLine}>
                    <Text style={styles.infoLineLabel}>GSTIN</Text>
                    <Text style={styles.infoLineValue}>: {first.customer_gstin}</Text>
                  </View>
                )}
                {first.customer_address && (
                  <View style={styles.infoLine}>
                    <Text style={styles.infoLineLabel}>ADDRESS</Text>
                    <Text style={styles.infoLineValue}>: {first.customer_address}</Text>
                  </View>
                )}
                {first.customer_state && (
                  <View style={styles.infoLine}>
                    <Text style={styles.infoLineLabel}>PLACE OF SUPPLY</Text>
                    <Text style={styles.infoLineValue}>: {first.customer_state}</Text>
                  </View>
                )}
              </View>
            </View>
            {/* ── Table — simplified (no tax columns) ── */}
            <View style={[styles.table, { marginTop: 8 }]}>
              <View style={styles.separator} />

              <View style={styles.plainTableHead}>
                <Text style={[styles.plainTableHeadCell, { width: "7%" }]}>S No.</Text>
                <Text style={[styles.plainTableHeadCell, { flex: 1 }]}>Material Name</Text>
                <Text style={[styles.plainTableHeadCell, { width: "10%", textAlign: "right" }]}>Qty</Text>
                <Text style={[styles.plainTableHeadCell, { width: "7%", marginLeft: 4 }]}>Unit</Text>
                <Text style={[styles.plainTableHeadCell, { width: "11%", textAlign: "right" }]}>Rate</Text>
                <Text style={[styles.plainTableHeadCell, { width: "7%", textAlign: "right" }]}>Tax%</Text>
                <Text style={[styles.plainTableHeadCell, { width: "11%", textAlign: "right" }]}>Tax Amt</Text>
                <Text style={[styles.plainTableHeadCell, { width: "13%", textAlign: "right" }]}>Amount</Text>
              </View>

              <View style={styles.separator} />

              {items.map((r, idx) => {
                const taxAmt = parseFloat(r.cgst_amount || "0") + parseFloat(r.sgst_amount || "0") + parseFloat(r.igst_amount || "0");
                const grossAmt = parseFloat(r.amount || "0") + taxAmt;
                return (
                  <View key={r.item_id} style={styles.plainTableRow}>
                    <Text style={[styles.plainTableCell, { width: "7%" }]}>{idx + 1}</Text>
                    <Text style={[styles.plainTableCell, { flex: 1 }]}>{r.material_name}</Text>
                    <Text style={[styles.plainTableCell, { width: "10%", textAlign: "right" }]}>{fmtQty(r.qty)}</Text>
                    <Text style={[styles.plainTableCell, { width: "7%", marginLeft: 4 }]}>{r.unit_name ?? "—"}</Text>
                    <Text style={[styles.plainTableCell, { width: "11%", textAlign: "right" }]}>{fmtAmt(r.rate)}</Text>
                    <Text style={[styles.plainTableCell, { width: "7%", textAlign: "right" }]}>
                      {r.tax_percentage_item ? `${parseFloat(r.tax_percentage_item)}%` : "—"}
                    </Text>
                    <Text style={[styles.plainTableCell, { width: "11%", textAlign: "right" }]}>
                      {fmtAmt(taxAmt.toFixed(2))}
                    </Text>
                    <Text style={[styles.plainTableCellBold, { width: "13%", textAlign: "right" }]}>
                      {fmtAmt(grossAmt.toFixed(2))}
                    </Text>
                  </View>
                );
              })}

              <View style={styles.separator} />

              {/* Totals — Taxable Value → tax lines → Net Amount */}
              <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 2, gap: 8 }}>
                <View style={{ alignItems: "flex-end", gap: 3 }}>
                  <Text style={styles.plainTableCell}>Taxable Value</Text>
                  {hasCgstSgst && <Text style={styles.plainTableCell}>CGST</Text>}
                  {hasCgstSgst && <Text style={styles.plainTableCell}>SGST</Text>}
                  {hasIgst && <Text style={styles.plainTableCell}>IGST</Text>}
                  <Text style={styles.plainTableCellBold}>Net Amount</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 3, minWidth: 90 }}>
                  <Text style={styles.plainTableCell}>{fmtAmt(subtotal.toFixed(2))}</Text>
                  {hasCgstSgst && <Text style={styles.plainTableCell}>{fmtAmt(cgst.toFixed(2))}</Text>}
                  {hasCgstSgst && <Text style={styles.plainTableCell}>{fmtAmt(sgst.toFixed(2))}</Text>}
                  {hasIgst && <Text style={styles.plainTableCell}>{fmtAmt(igst.toFixed(2))}</Text>}
                  <Text style={styles.plainTableCellBold}>Rs. {fmtAmt(first.net_amount)}</Text>
                </View>
              </View>
              <Text style={{ marginTop: 6, fontSize: 8, fontFamily: "Helvetica-Oblique", color: "#374151" }}>
                {numberToWords(parseFloat(first.net_amount || "0"))}
              </Text>
            </View>

            {/* ── Bottom: bank + terms LEFT, signatory RIGHT ── */}
            <View style={{ marginTop: 10, flexDirection: "row", borderTopWidth: 0.5, borderTopColor: "#CBD5E1", paddingTop: 6 }}>

              {/* LEFT — payment details + terms */}
              <View style={{ flex: 1, paddingRight: 8 }}>
                {companySetting?.bank_account_no && (
                  <View>
                    <Text style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#374151", marginBottom: 2 }}>
                      Payment Details
                    </Text>
                    <Text style={{ fontSize: 7.5, color: "#374151" }}>
                      {[
                        companySetting.bank_name,
                        companySetting.bank_account_no ? `A/C: ${companySetting.bank_account_no}` : null,
                        companySetting.bank_ifsc ? `IFSC: ${companySetting.bank_ifsc}` : null,
                        companySetting.bank_branch ? `Branch: ${companySetting.bank_branch}` : null,
                      ].filter(Boolean).join("  |  ")}
                    </Text>
                  </View>
                )}
                {companySetting?.invoice_terms && (
                  <Text style={{ fontSize: 9, color: "#6B7280", fontFamily: "Helvetica-Oblique", marginTop: companySetting?.bank_account_no ? 6 : 0 }}>
                    Terms: {companySetting.invoice_terms}
                  </Text>
                )}
              </View>

              {/* RIGHT — authorised signatory */}
              <View style={{ alignItems: "center", justifyContent: "flex-end", minWidth: 140 }}>
                <View style={{ height: 30 }} />
                <View style={{ borderTopWidth: 0.5, borderTopColor: "#000", width: 140, marginBottom: 3 }} />
                <Text style={{ fontSize: 8 }}>For {coName}</Text>
                <Text style={{ fontSize: 8 }}>Authorised Signatory</Text>
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
