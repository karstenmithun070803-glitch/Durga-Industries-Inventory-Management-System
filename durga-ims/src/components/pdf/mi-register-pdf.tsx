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
import type { MaterialIssueRow } from "@/types";
import type { CompanySetting } from "@/lib/actions/settings.actions";

interface Props {
  rows: MaterialIssueRow[];
  fy: string;
  dateFrom?: string;
  dateTo?: string;
  statusFilter?: string;
  showRates: boolean;
  companySetting?: CompanySetting;
}

function formatCode(prefix: string, num: number, pad = 3): string {
  return `${prefix}${String(num).padStart(pad, "0")}`;
}

export function MIRegisterDocument({ rows, showRates, companySetting }: Props) {
  const coName    = companySetting?.company_name ?? COMPANY_NAME;
  const coAddress = companySetting?.address      ?? COMPANY_ADDRESS;
  const coGstin   = companySetting?.gstin        ?? COMPANY_GSTIN;

  const slipMap = new Map<string, MaterialIssueRow[]>();
  for (const r of rows) {
    if (!slipMap.has(r.id)) slipMap.set(r.id, []);
    slipMap.get(r.id)!.push(r);
  }
  const slipGroups = Array.from(slipMap.entries());

  return (
    <Document title="Vehicle Material Issue Slip">
      {slipGroups.map(([slipId, items]) => {
        const first = items[0];
        const slipLabel = first.slip_number != null ? formatCode("MI-", first.slip_number, 4) : null;
        const jobLabel = first.job_ref_no;

        const slipTotal   = items.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
        const cgstTotal   = items.reduce((s, r) => s + parseFloat(r.cgst_amount ?? "0"), 0);
        const sgstTotal   = items.reduce((s, r) => s + parseFloat(r.sgst_amount ?? "0"), 0);
        const igstTotal   = items.reduce((s, r) => s + parseFloat(r.igst_amount ?? "0"), 0);
        const grandTotal  = slipTotal + cgstTotal + sgstTotal + igstTotal;

        return (
          <Page key={slipId} size="A4" style={styles.page}>

            {/* ── Centered company block ── */}
            <View>
              <Text style={styles.companyNameCentered}>{coName}</Text>
              <Text style={styles.companyDetailCentered}>{coAddress}</Text>
              <Text style={styles.companyDetailCentered}>GSTIN: {coGstin}</Text>
            </View>

            {/* ── Document type ── */}
            <Text style={styles.docTypeCentered}>VEHICLE MATERIAL ISSUE SLIP</Text>

            {/* ── Info block: two-column layout ── */}
            <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
              {/* Left — slip identifiers */}
              <View style={{ flex: 1 }}>
                {slipLabel && (
                  <View style={styles.infoLine}>
                    <Text style={styles.infoLineLabel}>SLIP NO.</Text>
                    <Text style={styles.infoLineValue}>: {slipLabel}</Text>
                  </View>
                )}
                <View style={styles.infoLine}>
                  <Text style={styles.infoLineLabel}>DATE</Text>
                  <Text style={styles.infoLineValue}>: {fmtDate(first.issue_date)}</Text>
                </View>
                <View style={styles.infoLine}>
                  <Text style={styles.infoLineLabel}>VEHICLE / JOB</Text>
                  <Text style={styles.infoLineValue}>: {first.vehicle_name ?? ""}  ({jobLabel})</Text>
                </View>
              </View>
              {/* Right — customer info */}
              <View style={{ flex: 1 }}>
                {first.customer_name && (
                  <View style={styles.infoLine}>
                    <Text style={styles.infoLineLabel}>CUSTOMER</Text>
                    <Text style={styles.infoLineValue}>: {first.customer_name}</Text>
                  </View>
                )}
                {first.customer_address && (
                  <View style={styles.infoLine}>
                    <Text style={styles.infoLineLabel}>ADDRESS</Text>
                    <Text style={styles.infoLineValue}>: {first.customer_address}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* ── Table ── */}
            <View style={styles.table}>
              <View style={styles.separator} />

              {/* Column headers */}
              <View style={styles.plainTableHead}>
                <Text style={[styles.plainTableHeadCell, { width: "7%" }]}>S No.</Text>
                <Text style={[styles.plainTableHeadCell, { flex: 1, marginLeft: 6 }]}>Material Name</Text>
                <Text style={[styles.plainTableHeadCell, { width: "16%" }]}>Contractor</Text>
                <Text style={[styles.plainTableHeadCell, { width: "12%", textAlign: "right" }]}>Qty</Text>
                <Text style={[styles.plainTableHeadCell, { width: "8%", marginLeft: 6 }]}>Unit</Text>
                {showRates && (
                  <>
                    <Text style={[styles.plainTableHeadCell, { width: "11%", textAlign: "right" }]}>Rate</Text>
                    <Text style={[styles.plainTableHeadCell, { width: "13%", textAlign: "right" }]}>Amount</Text>
                  </>
                )}
              </View>

              <View style={styles.separator} />

              {/* Data rows */}
              {items.map((r, idx) => (
                <View key={r.item_id} style={styles.plainTableRow}>
                  <Text style={[styles.plainTableCell, { width: "7%" }]}>{idx + 1}</Text>
                  <Text style={[styles.plainTableCell, { flex: 1, marginLeft: 6 }]}>{r.material_name}</Text>
                  <Text style={[styles.plainTableCell, { width: "16%" }]}>
                    {r.contractor_name ?? "—"}
                  </Text>
                  <Text style={[styles.plainTableCell, { width: "12%", textAlign: "right" }]}>
                    {fmtQty(r.qty)}
                  </Text>
                  <Text style={[styles.plainTableCell, { width: "8%", marginLeft: 6 }]}>
                    {r.unit_name ?? "—"}
                  </Text>
                  {showRates && (
                    <>
                      <Text style={[styles.plainTableCell, { width: "11%", textAlign: "right" }]}>
                        {fmtAmt(r.rate)}
                      </Text>
                      <Text style={[styles.plainTableCellBold, { width: "13%", textAlign: "right" }]}>
                        {fmtAmt(r.amount)}
                      </Text>
                    </>
                  )}
                </View>
              ))}

              <View style={styles.separator} />

              {/* Totals — only when showRates */}
              {showRates && (
                <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 2, gap: 8 }}>
                  <View style={{ alignItems: "flex-end", gap: 3 }}>
                    <Text style={styles.plainTableCell}>Subtotal</Text>
                    {cgstTotal > 0 && <Text style={styles.plainTableCell}>CGST</Text>}
                    {sgstTotal > 0 && <Text style={styles.plainTableCell}>SGST</Text>}
                    {igstTotal > 0 && <Text style={styles.plainTableCell}>IGST</Text>}
                    <Text style={styles.plainTableCellBold}>Grand Total</Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 3, minWidth: 90 }}>
                    <Text style={styles.plainTableCell}>Rs. {fmtAmt(String(slipTotal))}</Text>
                    {cgstTotal > 0 && <Text style={styles.plainTableCell}>{fmtAmt(String(cgstTotal))}</Text>}
                    {sgstTotal > 0 && <Text style={styles.plainTableCell}>{fmtAmt(String(sgstTotal))}</Text>}
                    {igstTotal > 0 && <Text style={styles.plainTableCell}>{fmtAmt(String(igstTotal))}</Text>}
                    <Text style={styles.plainTableCellBold}>Rs. {fmtAmt(String(grandTotal))}</Text>
                  </View>
                </View>
              )}
            </View>

            {/* ── Page footer ── */}
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
        );
      })}
    </Document>
  );
}
