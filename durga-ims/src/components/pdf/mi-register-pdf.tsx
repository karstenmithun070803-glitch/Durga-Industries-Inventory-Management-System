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
import type { CompanySetting } from "@/lib/actions/settings.actions";

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
    <Document title="Material Issue Slip">
      {slipGroups.map(([slipId, items]) => {
        const first = items[0];
        const slipLabel = formatCode("MI-", first.slip_number, 4);
        const jobLabel = formatCode("J", first.job_ref_no, 5);
        const slipTotal = items.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);

        return (
          <Page key={slipId} size="A4" style={styles.page}>

            {/* ── Centered company block ── */}
            <View>
              <Text style={styles.companyNameCentered}>{coName}</Text>
              <Text style={styles.companyDetailCentered}>{coAddress}</Text>
              <Text style={styles.companyDetailCentered}>GSTIN: {coGstin}</Text>
            </View>

            {/* ── Document type ── */}
            <Text style={styles.docTypeCentered}>MATERIAL ISSUE SLIP</Text>

            {/* ── Info block ── */}
            <View style={styles.infoLine}>
              <Text style={styles.infoLineLabel}>SLIP NO.</Text>
              <Text style={styles.infoLineValue}>: {slipLabel}</Text>
            </View>
            <View style={styles.infoLine}>
              <Text style={styles.infoLineLabel}>DATE</Text>
              <Text style={styles.infoLineValue}>: {fmtDate(first.issue_date)}</Text>
            </View>
            <View style={styles.infoLine}>
              <Text style={styles.infoLineLabel}>VEHICLE / JOB</Text>
              <Text style={styles.infoLineValue}>: {first.vehicle_name}  ({jobLabel})</Text>
            </View>
            {first.customer_name && (
              <View style={styles.infoLine}>
                <Text style={styles.infoLineLabel}>CUSTOMER</Text>
                <Text style={styles.infoLineValue}>: {first.customer_name}</Text>
              </View>
            )}

            {/* ── Table ── */}
            <View style={styles.table}>
              <View style={styles.separator} />

              {/* Column headers */}
              <View style={styles.plainTableHead}>
                <Text style={[styles.plainTableHeadCell, { width: "7%" }]}>S No.</Text>
                <Text style={[styles.plainTableHeadCell, { flex: 1 }]}>Material Name</Text>
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
                  <Text style={[styles.plainTableCell, { flex: 1 }]}>{r.material_name}</Text>
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

              {/* Total — only when showRates */}
              {showRates && (
                <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 2 }}>
                  <Text style={styles.plainTableCellBold}>
                    Total : Rs. {fmtAmt(String(slipTotal))}
                  </Text>
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
