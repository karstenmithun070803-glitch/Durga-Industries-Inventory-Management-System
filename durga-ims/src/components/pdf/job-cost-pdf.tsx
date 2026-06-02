import React from "react";
import { Document, Page, View, Text } from "@react-pdf/renderer";
import {
  styles,
  COMPANY_NAME,
  COMPANY_ADDRESS,
  COMPANY_GSTIN,
} from "./pdf-styles";
import type { CompanySetting } from "@/lib/actions/settings.actions";
import type { JobCostResult } from "@/lib/actions/stock.actions";

interface Props {
  result: JobCostResult;
  companySetting?: CompanySetting;
}

function fmtAmt(v: number): string {
  return "Rs. " + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQty(v: number): string {
  return v.toLocaleString("en-IN", { maximumFractionDigits: 4 });
}

export function JobCostDocument({ result, companySetting }: Props) {
  const coName    = companySetting?.company_name ?? COMPANY_NAME;
  const coAddress = companySetting?.address      ?? COMPANY_ADDRESS;
  const coGstin   = companySetting?.gstin        ?? COMPANY_GSTIN;

  const jobLabel = result.vehicle.job_ref_no;

  return (
    <Document title={`Job Cost — ${result.vehicle.vehicle_name}`}>
      <Page size="A4" style={styles.page}>
        {/* Company header */}
        <View>
          <Text style={styles.companyNameCentered}>{coName}</Text>
          <Text style={styles.companyDetailCentered}>{coAddress}</Text>
          <Text style={styles.companyDetailCentered}>GSTIN: {coGstin}</Text>
        </View>

        <Text style={[styles.docTypeCentered, { marginTop: 8 }]}>JOB COST SUMMARY</Text>

        {/* Vehicle info */}
        <View style={{ marginTop: 10, marginBottom: 6 }}>
          <View style={styles.infoLine}>
            <Text style={styles.infoLineLabel}>VEHICLE</Text>
            <Text style={styles.infoLineValue}>: {result.vehicle.vehicle_name}  ({jobLabel})</Text>
          </View>
          <View style={styles.infoLine}>
            <Text style={styles.infoLineLabel}>TYPE</Text>
            <Text style={styles.infoLineValue}>: {result.vehicle.vehicle_type === "New" ? "New Build" : "Repair"}</Text>
          </View>
          {result.vehicle.customer_name && (
            <View style={styles.infoLine}>
              <Text style={styles.infoLineLabel}>CUSTOMER</Text>
              <Text style={styles.infoLineValue}>: {result.vehicle.customer_name}</Text>
            </View>
          )}
        </View>

        {/* Table */}
        <View style={styles.table}>
          <View style={styles.separator} />
          <View style={styles.plainTableHead}>
            <Text style={[styles.plainTableHeadCell, { flex: 1 }]}>Material Name</Text>
            <Text style={[styles.plainTableHeadCell, { width: "16%" }]}>Contractor</Text>
            <Text style={[styles.plainTableHeadCell, { width: "10%", textAlign: "right" }]}>Qty</Text>
            <Text style={[styles.plainTableHeadCell, { width: "8%", marginLeft: 4 }]}>Unit</Text>
            <Text style={[styles.plainTableHeadCell, { width: "12%", textAlign: "right" }]}>Rate</Text>
            <Text style={[styles.plainTableHeadCell, { width: "14%", textAlign: "right" }]}>Total</Text>
          </View>
          <View style={styles.separator} />

          {result.rows.map((r, i) => (
            <View key={i} style={styles.plainTableRow}>
              <Text style={[styles.plainTableCell, { flex: 1 }]}>{r.material_name}</Text>
              <Text style={[styles.plainTableCell, { width: "16%" }]}>{r.contractor_name ?? "—"}</Text>
              <Text style={[styles.plainTableCell, { width: "10%", textAlign: "right" }]}>{fmtQty(r.total_qty)}</Text>
              <Text style={[styles.plainTableCell, { width: "8%", marginLeft: 4 }]}>{r.unit_name ?? "—"}</Text>
              <Text style={[styles.plainTableCell, { width: "12%", textAlign: "right" }]}>{fmtAmt(r.rate)}</Text>
              <Text style={[styles.plainTableCellBold, { width: "14%", textAlign: "right" }]}>{fmtAmt(r.total_amount)}</Text>
            </View>
          ))}

          <View style={styles.separator} />

          {/* Totals */}
          <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 4, gap: 16 }}>
            <Text style={styles.plainTableCellBold}>Total Cost: {fmtAmt(result.totals.total_cost)}</Text>
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
