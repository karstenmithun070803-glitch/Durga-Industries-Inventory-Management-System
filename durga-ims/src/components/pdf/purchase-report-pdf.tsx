import React from "react";
import { Document, Page, View, Text } from "@react-pdf/renderer";
import {
  styles,
  COMPANY_NAME,
  COMPANY_ADDRESS,
  COMPANY_GSTIN,
  fmtAmt,
  fmtQty,
} from "./pdf-styles";
import type { PurchaseReportRow } from "@/lib/actions/reports.actions";
import type { CompanySetting } from "@/lib/actions/settings.actions";

type MonthlyGroup = {
  key: string;
  monthKey: string;
  monthLabel: string;
  supplier: string;
  material: string;
  qty: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
};

interface Props {
  rows: PurchaseReportRow[];
  monthlyRows: MonthlyGroup[];
  groupByMonth: boolean;
  fy: string;
  statusFilter?: string;
  supplierId?: string;
  supplierName?: string;
  materialId?: string;
  materialName?: string;
  dateFrom?: string;
  dateTo?: string;
  companySetting?: CompanySetting;
}

function fmt(v: number) {
  return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQ(v: number) {
  return v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function PurchaseDetailDocument({ rows, fy, statusFilter, supplierName, materialName, dateFrom, dateTo, coName, coAddress, coGstin }: {
  rows: PurchaseReportRow[];
  fy: string;
  statusFilter?: string;
  supplierName?: string;
  materialName?: string;
  dateFrom?: string;
  dateTo?: string;
  coName: string;
  coAddress: string;
  coGstin: string;
}) {
  const receivedRows = rows.filter((r) => r.status === "Received");
  const totals = {
    qty:     receivedRows.reduce((s, r) => s + r.qty, 0),
    taxable: receivedRows.reduce((s, r) => s + r.taxable_amount, 0),
    cgst:    receivedRows.reduce((s, r) => s + r.cgst_amount, 0),
    sgst:    receivedRows.reduce((s, r) => s + r.sgst_amount, 0),
    igst:    receivedRows.reduce((s, r) => s + r.igst_amount, 0),
    total:   receivedRows.reduce((s, r) => s + r.total_amount, 0),
  };
  const hasCgst = totals.cgst > 0;
  const hasSgst = totals.sgst > 0;
  const hasIgst = totals.igst > 0;

  const filterParts: string[] = [`FY ${fy}`];
  if (statusFilter && statusFilter !== "Received") filterParts.push(`Status: ${statusFilter}`);
  if (supplierName) filterParts.push(`Supplier: ${supplierName}`);
  if (materialName) filterParts.push(`Material: ${materialName}`);
  if (dateFrom) filterParts.push(`From: ${dateFrom}`);
  if (dateTo)   filterParts.push(`To: ${dateTo}`);

  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      {/* Company header */}
      <View>
        <Text style={styles.companyNameCentered}>{coName}</Text>
        <Text style={styles.companyDetailCentered}>{coAddress}</Text>
        <Text style={styles.companyDetailCentered}>GSTIN: {coGstin}</Text>
      </View>
      <Text style={[styles.docTypeCentered, { fontSize: 10, marginTop: 4 }]}>PURCHASE REPORT</Text>
      <Text style={{ fontSize: 8, color: "#6B7280", textAlign: "center", marginBottom: 6 }}>
        {filterParts.join("   |   ")}
      </Text>
      <View style={styles.separator} />

      {/* Header */}
      <View style={[styles.plainTableHead, { marginTop: 4 }]}>
        <Text style={[styles.plainTableHeadCell, { width: "4%" }]}>S.No</Text>
        <Text style={[styles.plainTableHeadCell, { width: "8%" }]}>PO #</Text>
        <Text style={[styles.plainTableHeadCell, { width: "8%" }]}>Date</Text>
        <Text style={[styles.plainTableHeadCell, { width: "9%" }]}>Bill No.</Text>
        <Text style={[styles.plainTableHeadCell, { width: "13%" }]}>Supplier</Text>
        <Text style={[styles.plainTableHeadCell, { width: "14%" }]}>Material</Text>
        <Text style={[styles.plainTableHeadCell, { width: "6%", textAlign: "right" }]}>Qty</Text>
        <Text style={[styles.plainTableHeadCell, { width: "4%" }]}>Unit</Text>
        <Text style={[styles.plainTableHeadCell, { width: "7%", textAlign: "right" }]}>Rate</Text>
        <Text style={[styles.plainTableHeadCell, { width: "8%", textAlign: "right" }]}>Taxable</Text>
        {hasCgst && <Text style={[styles.plainTableHeadCell, { width: "6%", textAlign: "right" }]}>CGST</Text>}
        {hasSgst && <Text style={[styles.plainTableHeadCell, { width: "6%", textAlign: "right" }]}>SGST</Text>}
        {hasIgst && <Text style={[styles.plainTableHeadCell, { width: "6%", textAlign: "right" }]}>IGST</Text>}
        <Text style={[styles.plainTableHeadCell, { width: "8%", textAlign: "right" }]}>Total</Text>
        <Text style={[styles.plainTableHeadCell, { width: "5%" }]}>Status</Text>
      </View>
      <View style={styles.separator} />

      {/* Rows */}
      {rows.map((r, i) => (
        <View key={r.item_id} style={styles.plainTableRow}>
          <Text style={[styles.plainTableCell, { width: "4%" }]}>{i + 1}</Text>
          <Text style={[styles.plainTableCell, { width: "8%", fontFamily: "Helvetica-Bold" }]}>PO-{String(r.po_number).padStart(4, "0")}</Text>
          <Text style={[styles.plainTableCell, { width: "8%" }]}>{r.po_date}</Text>
          <Text style={[styles.plainTableCell, { width: "9%" }]}>{r.supplier_bill_no ?? "—"}</Text>
          <Text style={[styles.plainTableCell, { width: "13%" }]}>{r.supplier_name ?? "—"}</Text>
          <Text style={[styles.plainTableCell, { width: "14%" }]}>{r.material_name}</Text>
          <Text style={[styles.plainTableCell, { width: "6%", textAlign: "right" }]}>{fmtQ(r.qty)}</Text>
          <Text style={[styles.plainTableCell, { width: "4%" }]}>{r.unit_name ?? "—"}</Text>
          <Text style={[styles.plainTableCell, { width: "7%", textAlign: "right" }]}>{fmtAmt(String(r.rate))}</Text>
          <Text style={[styles.plainTableCell, { width: "8%", textAlign: "right" }]}>{fmt(r.taxable_amount)}</Text>
          {hasCgst && <Text style={[styles.plainTableCell, { width: "6%", textAlign: "right" }]}>{r.cgst_amount > 0 ? fmt(r.cgst_amount) : "—"}</Text>}
          {hasSgst && <Text style={[styles.plainTableCell, { width: "6%", textAlign: "right" }]}>{r.sgst_amount > 0 ? fmt(r.sgst_amount) : "—"}</Text>}
          {hasIgst && <Text style={[styles.plainTableCell, { width: "6%", textAlign: "right" }]}>{r.igst_amount > 0 ? fmt(r.igst_amount) : "—"}</Text>}
          <Text style={[styles.plainTableCellBold, { width: "8%", textAlign: "right" }]}>{fmt(r.total_amount)}</Text>
          <Text style={[styles.plainTableCell, { width: "5%", color: r.status === "Received" ? "#15803D" : "#64748B" }]}>{r.status}</Text>
        </View>
      ))}

      <View style={[styles.separator, { marginTop: 2 }]} />

      {/* Totals */}
      <View style={[styles.plainTableRow, { backgroundColor: "#F8FAFC" }]}>
        <Text style={[styles.plainTableCellBold, { width: "4%" }]} />
        <Text style={[styles.plainTableCellBold, { width: "8%" }]} />
        <Text style={[styles.plainTableCellBold, { width: "8%" }]} />
        <Text style={[styles.plainTableCellBold, { width: "9%" }]} />
        <Text style={[styles.plainTableCellBold, { width: "13%" }]} />
        <Text style={[styles.plainTableCellBold, { width: "14%", textAlign: "right" }]}>
          {rows.some((r) => r.status !== "Received") ? "TOTAL (Received)" : "TOTAL"}
        </Text>
        <Text style={[styles.plainTableCellBold, { width: "6%", textAlign: "right" }]}>{fmtQty(String(totals.qty))}</Text>
        <Text style={[styles.plainTableCellBold, { width: "4%" }]} />
        <Text style={[styles.plainTableCellBold, { width: "7%" }]} />
        <Text style={[styles.plainTableCellBold, { width: "8%", textAlign: "right" }]}>{fmt(totals.taxable)}</Text>
        {hasCgst && <Text style={[styles.plainTableCellBold, { width: "6%", textAlign: "right" }]}>{fmt(totals.cgst)}</Text>}
        {hasSgst && <Text style={[styles.plainTableCellBold, { width: "6%", textAlign: "right" }]}>{fmt(totals.sgst)}</Text>}
        {hasIgst && <Text style={[styles.plainTableCellBold, { width: "6%", textAlign: "right" }]}>{fmt(totals.igst)}</Text>}
        <Text style={[styles.plainTableCellBold, { width: "8%", textAlign: "right" }]}>{fmt(totals.total)}</Text>
        <Text style={[styles.plainTableCellBold, { width: "5%" }]} />
      </View>

      {/* Footer */}
      <View style={styles.pageFooter} fixed>
        <View style={styles.footerLine} />
        <Text
          style={styles.footerText}
          render={({ pageNumber, totalPages }) =>
            `Pg.No.:${pageNumber}${totalPages > 1 ? ` of ${totalPages}` : ""}          Purchase Report — FY ${fy}`
          }
        />
      </View>
    </Page>
  );
}

function PurchaseMonthlyDocument({ monthlyRows, fy, supplierName, materialName, coName, coAddress, coGstin }: {
  monthlyRows: MonthlyGroup[];
  fy: string;
  supplierName?: string;
  materialName?: string;
  coName: string;
  coAddress: string;
  coGstin: string;
}) {
  const totals = {
    qty:     monthlyRows.reduce((s, r) => s + r.qty, 0),
    taxable: monthlyRows.reduce((s, r) => s + r.taxable, 0),
    cgst:    monthlyRows.reduce((s, r) => s + r.cgst, 0),
    sgst:    monthlyRows.reduce((s, r) => s + r.sgst, 0),
    igst:    monthlyRows.reduce((s, r) => s + r.igst, 0),
    total:   monthlyRows.reduce((s, r) => s + r.total, 0),
  };
  const hasCgst = totals.cgst > 0;
  const hasSgst = totals.sgst > 0;
  const hasIgst = totals.igst > 0;

  const filterParts: string[] = [`FY ${fy}`, "Monthly View"];
  if (supplierName) filterParts.push(`Supplier: ${supplierName}`);
  if (materialName) filterParts.push(`Material: ${materialName}`);

  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <View>
        <Text style={styles.companyNameCentered}>{coName}</Text>
        <Text style={styles.companyDetailCentered}>{coAddress}</Text>
        <Text style={styles.companyDetailCentered}>GSTIN: {coGstin}</Text>
      </View>
      <Text style={[styles.docTypeCentered, { fontSize: 10, marginTop: 4 }]}>PURCHASE REPORT — MONTHLY VIEW</Text>
      <Text style={{ fontSize: 8, color: "#6B7280", textAlign: "center", marginBottom: 6 }}>
        {filterParts.join("   |   ")}
      </Text>
      <View style={styles.separator} />

      <View style={[styles.plainTableHead, { marginTop: 4 }]}>
        <Text style={[styles.plainTableHeadCell, { width: "4%" }]}>S.No</Text>
        <Text style={[styles.plainTableHeadCell, { width: "10%" }]}>Month</Text>
        <Text style={[styles.plainTableHeadCell, { width: "18%" }]}>Supplier</Text>
        <Text style={[styles.plainTableHeadCell, { width: "22%" }]}>Material</Text>
        <Text style={[styles.plainTableHeadCell, { width: "8%", textAlign: "right" }]}>Qty</Text>
        <Text style={[styles.plainTableHeadCell, { width: "10%", textAlign: "right" }]}>Taxable</Text>
        {hasCgst && <Text style={[styles.plainTableHeadCell, { width: "8%", textAlign: "right" }]}>CGST</Text>}
        {hasSgst && <Text style={[styles.plainTableHeadCell, { width: "8%", textAlign: "right" }]}>SGST</Text>}
        {hasIgst && <Text style={[styles.plainTableHeadCell, { width: "8%", textAlign: "right" }]}>IGST</Text>}
        <Text style={[styles.plainTableHeadCell, { width: "12%", textAlign: "right" }]}>Total</Text>
      </View>
      <View style={styles.separator} />

      {monthlyRows.map((r, i) => (
        <View key={r.key} style={styles.plainTableRow}>
          <Text style={[styles.plainTableCell, { width: "4%" }]}>{i + 1}</Text>
          <Text style={[styles.plainTableCell, { width: "10%", fontFamily: "Helvetica-Bold" }]}>{r.monthLabel}</Text>
          <Text style={[styles.plainTableCell, { width: "18%" }]}>{r.supplier}</Text>
          <Text style={[styles.plainTableCell, { width: "22%" }]}>{r.material}</Text>
          <Text style={[styles.plainTableCell, { width: "8%", textAlign: "right" }]}>{fmtQ(r.qty)}</Text>
          <Text style={[styles.plainTableCell, { width: "10%", textAlign: "right" }]}>{fmt(r.taxable)}</Text>
          {hasCgst && <Text style={[styles.plainTableCell, { width: "8%", textAlign: "right" }]}>{r.cgst > 0 ? fmt(r.cgst) : "—"}</Text>}
          {hasSgst && <Text style={[styles.plainTableCell, { width: "8%", textAlign: "right" }]}>{r.sgst > 0 ? fmt(r.sgst) : "—"}</Text>}
          {hasIgst && <Text style={[styles.plainTableCell, { width: "8%", textAlign: "right" }]}>{r.igst > 0 ? fmt(r.igst) : "—"}</Text>}
          <Text style={[styles.plainTableCellBold, { width: "12%", textAlign: "right" }]}>{fmt(r.total)}</Text>
        </View>
      ))}

      <View style={[styles.separator, { marginTop: 2 }]} />

      <View style={[styles.plainTableRow, { backgroundColor: "#F8FAFC" }]}>
        <Text style={[styles.plainTableCellBold, { width: "4%" }]} />
        <Text style={[styles.plainTableCellBold, { width: "10%" }]} />
        <Text style={[styles.plainTableCellBold, { width: "18%" }]} />
        <Text style={[styles.plainTableCellBold, { width: "22%", textAlign: "right" }]}>TOTAL</Text>
        <Text style={[styles.plainTableCellBold, { width: "8%", textAlign: "right" }]}>{fmtQ(totals.qty)}</Text>
        <Text style={[styles.plainTableCellBold, { width: "10%", textAlign: "right" }]}>{fmt(totals.taxable)}</Text>
        {hasCgst && <Text style={[styles.plainTableCellBold, { width: "8%", textAlign: "right" }]}>{fmt(totals.cgst)}</Text>}
        {hasSgst && <Text style={[styles.plainTableCellBold, { width: "8%", textAlign: "right" }]}>{fmt(totals.sgst)}</Text>}
        {hasIgst && <Text style={[styles.plainTableCellBold, { width: "8%", textAlign: "right" }]}>{fmt(totals.igst)}</Text>}
        <Text style={[styles.plainTableCellBold, { width: "12%", textAlign: "right" }]}>{fmt(totals.total)}</Text>
      </View>

      <View style={styles.pageFooter} fixed>
        <View style={styles.footerLine} />
        <Text
          style={styles.footerText}
          render={({ pageNumber, totalPages }) =>
            `Pg.No.:${pageNumber}${totalPages > 1 ? ` of ${totalPages}` : ""}          Purchase Report (Monthly) — FY ${fy}`
          }
        />
      </View>
    </Page>
  );
}

export function PurchaseReportDocument({
  rows, monthlyRows, groupByMonth, fy, statusFilter,
  supplierName, materialName, dateFrom, dateTo, companySetting,
}: Props) {
  const coName    = companySetting?.company_name ?? COMPANY_NAME;
  const coAddress = companySetting?.address      ?? COMPANY_ADDRESS;
  const coGstin   = companySetting?.gstin        ?? COMPANY_GSTIN;

  return (
    <Document title={`Purchase Report — FY ${fy}`}>
      {groupByMonth ? (
        <PurchaseMonthlyDocument
          monthlyRows={monthlyRows}
          fy={fy}
          supplierName={supplierName}
          materialName={materialName}
          coName={coName}
          coAddress={coAddress}
          coGstin={coGstin}
        />
      ) : (
        <PurchaseDetailDocument
          rows={rows}
          fy={fy}
          statusFilter={statusFilter}
          supplierName={supplierName}
          materialName={materialName}
          dateFrom={dateFrom}
          dateTo={dateTo}
          coName={coName}
          coAddress={coAddress}
          coGstin={coGstin}
        />
      )}
    </Document>
  );
}
