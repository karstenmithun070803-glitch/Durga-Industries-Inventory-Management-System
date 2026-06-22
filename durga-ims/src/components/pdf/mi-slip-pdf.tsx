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
import type { MaterialIssueWithDetails } from "@/types";
import type { CompanySetting } from "@/lib/actions/settings.actions";

interface Props {
  slip: MaterialIssueWithDetails;
  showAdvRate?: boolean;
  companySetting?: CompanySetting;
}

export function MISlipDocument({ slip, showAdvRate = false, companySetting }: Props) {
  const coName = companySetting?.company_name ?? COMPANY_NAME;
  const coAddress = companySetting?.address ?? COMPANY_ADDRESS;
  const coGstin = companySetting?.gstin ?? COMPANY_GSTIN;

  const margin = parseFloat(slip.margin_percentage || "0");
  const mf = showAdvRate ? 1 + margin / 100 : 1;

  const slipLabel = `MI-${String(slip.slip_number).padStart(4, "0")}`;

  const subtotal = slip.items.reduce((s, r) => s + parseFloat(r.amount || "0") * mf, 0);
  const cgstTotal = slip.items.reduce((s, r) => s + parseFloat(r.cgst_amount || "0") * mf, 0);
  const sgstTotal = slip.items.reduce((s, r) => s + parseFloat(r.sgst_amount || "0") * mf, 0);
  const igstTotal = slip.items.reduce((s, r) => s + parseFloat(r.igst_amount || "0") * mf, 0);
  const grandTotal = subtotal + cgstTotal + sgstTotal + igstTotal;

  return (
    <Document title={`${slipLabel} — Material Issue`}>
      <Page size="A4" style={styles.page}>
        {showAdvRate && (
          <Text style={{ fontSize: 8, color: "#555", textAlign: "right", marginBottom: 3 }}>
            INTERNAL COPY — ADVANCE RATES (incl. {margin}% margin)
          </Text>
        )}

        {/* Company header */}
        <View>
          <Text style={styles.companyNameCentered}>{coName}</Text>
          <Text style={styles.companyDetailCentered}>{coAddress}</Text>
          <Text style={styles.companyDetailCentered}>GSTIN: {coGstin}</Text>
        </View>

        <Text style={styles.docTypeCentered}>VEHICLE MATERIAL ISSUE SLIP</Text>

        {/* Slip info */}
        <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
          <View style={{ flex: 1 }}>
            <View style={styles.infoLine}>
              <Text style={styles.infoLineLabel}>SLIP NO.</Text>
              <Text style={styles.infoLineValue}>: {slipLabel}</Text>
            </View>
            <View style={styles.infoLine}>
              <Text style={styles.infoLineLabel}>DATE</Text>
              <Text style={styles.infoLineValue}>: {fmtDate(slip.issue_date)}</Text>
            </View>
            <View style={styles.infoLine}>
              <Text style={styles.infoLineLabel}>VEHICLE / JOB</Text>
              <Text style={styles.infoLineValue}>
                : {slip.vehicle_name ?? ""} ({slip.job_ref_no})
              </Text>
            </View>
            <View style={styles.infoLine}>
              <Text style={styles.infoLineLabel}>STATUS</Text>
              <Text style={styles.infoLineValue}>: {slip.status}</Text>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            {slip.customer_name && (
              <View style={styles.infoLine}>
                <Text style={styles.infoLineLabel}>CUSTOMER</Text>
                <Text style={styles.infoLineValue}>: {slip.customer_name}</Text>
              </View>
            )}
            {slip.customer_address && (
              <View style={styles.infoLine}>
                <Text style={styles.infoLineLabel}>ADDRESS</Text>
                <Text style={styles.infoLineValue}>: {slip.customer_address}</Text>
              </View>
            )}
            {slip.customer_gstin && (
              <View style={styles.infoLine}>
                <Text style={styles.infoLineLabel}>GSTIN</Text>
                <Text style={styles.infoLineValue}>: {slip.customer_gstin}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Table */}
        <View style={[styles.table, { marginTop: 8 }]}>
          <View style={styles.separator} />
          <View style={styles.plainTableHead}>
            <Text style={[styles.plainTableHeadCell, { width: "6%" }]}>No.</Text>
            <Text style={[styles.plainTableHeadCell, { flex: 1, marginLeft: 4 }]}>Material</Text>
            <Text style={[styles.plainTableHeadCell, { width: "15%" }]}>Contractor</Text>
            <Text style={[styles.plainTableHeadCell, { width: "11%", textAlign: "right" }]}>Qty</Text>
            <Text style={[styles.plainTableHeadCell, { width: "7%", marginLeft: 4 }]}>Unit</Text>
            <Text style={[styles.plainTableHeadCell, { width: "11%", textAlign: "right" }]}>Rate</Text>
            <Text style={[styles.plainTableHeadCell, { width: "13%", textAlign: "right" }]}>Amount</Text>
          </View>
          <View style={styles.separator} />

          {slip.items.map((item, idx) => {
            const rate = parseFloat(item.rate || "0") * mf;
            const lineBase = parseFloat(item.amount || "0") * mf;
            const lineTax =
              (parseFloat(item.cgst_amount || "0") +
                parseFloat(item.sgst_amount || "0") +
                parseFloat(item.igst_amount || "0")) *
              mf;
            const lineTotal = lineBase + lineTax;
            return (
              <View key={item.id} style={styles.plainTableRow}>
                <Text style={[styles.plainTableCell, { width: "6%" }]}>{idx + 1}</Text>
                <Text style={[styles.plainTableCell, { flex: 1, marginLeft: 4 }]}>
                  {item.material_name}
                </Text>
                <Text style={[styles.plainTableCell, { width: "15%" }]}>
                  {item.contractor_name ?? "—"}
                </Text>
                <Text style={[styles.plainTableCell, { width: "11%", textAlign: "right" }]}>
                  {fmtQty(item.qty)}
                </Text>
                <Text style={[styles.plainTableCell, { width: "7%", marginLeft: 4 }]}>
                  {item.unit_name ?? "—"}
                </Text>
                <Text style={[styles.plainTableCell, { width: "11%", textAlign: "right" }]}>
                  {fmtAmt(String(rate))}
                </Text>
                <Text style={[styles.plainTableCellBold, { width: "13%", textAlign: "right" }]}>
                  {fmtAmt(String(lineTotal))}
                </Text>
              </View>
            );
          })}

          <View style={styles.separator} />

          {/* Totals */}
          <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 2, gap: 8 }}>
            <View style={{ alignItems: "flex-end", gap: 3 }}>
              <Text style={styles.plainTableCell}>Subtotal</Text>
              {cgstTotal > 0 && <Text style={styles.plainTableCell}>CGST</Text>}
              {sgstTotal > 0 && <Text style={styles.plainTableCell}>SGST</Text>}
              {igstTotal > 0 && <Text style={styles.plainTableCell}>IGST</Text>}
              <Text style={styles.plainTableCellBold}>Grand Total</Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 3, minWidth: 90 }}>
              <Text style={styles.plainTableCell}>Rs. {fmtAmt(String(subtotal))}</Text>
              {cgstTotal > 0 && <Text style={styles.plainTableCell}>{fmtAmt(String(cgstTotal))}</Text>}
              {sgstTotal > 0 && <Text style={styles.plainTableCell}>{fmtAmt(String(sgstTotal))}</Text>}
              {igstTotal > 0 && <Text style={styles.plainTableCell}>{fmtAmt(String(igstTotal))}</Text>}
              <Text style={styles.plainTableCellBold}>Rs. {fmtAmt(String(grandTotal))}</Text>
            </View>
          </View>
        </View>

        {/* Signature strip */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 44 }}>
          <View
            style={{ width: "38%", borderTopWidth: 0.5, borderTopColor: "#000", paddingTop: 4 }}
          >
            <Text style={[styles.plainTableCell, { textAlign: "center" }]}>Received By</Text>
          </View>
          <View
            style={{ width: "38%", borderTopWidth: 0.5, borderTopColor: "#000", paddingTop: 4 }}
          >
            <Text style={[styles.plainTableCell, { textAlign: "center" }]}>
              Authorised Signatory
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.pageFooter} fixed>
          <View style={styles.footerLine} />
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `Pg.No.:${pageNumber}${totalPages > 1 ? ` of ${totalPages}` : ""}          For ${coName}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
