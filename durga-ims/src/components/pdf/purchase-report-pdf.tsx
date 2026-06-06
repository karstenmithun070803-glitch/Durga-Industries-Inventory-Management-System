import React from "react";
import { Document, Page, View, Text } from "@react-pdf/renderer";
import {
  styles,
  COMPANY_NAME,
  COMPANY_ADDRESS,
  COMPANY_GSTIN,
  fmtAmt,
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
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    tax:     receivedRows.reduce((s, r) => s + r.cgst_amount + r.sgst_amount + r.igst_amount, 0),
    total:   receivedRows.reduce((s, r) => s + r.total_amount, 0),
  };

  const filterParts: string[] = [`FY ${fy}`];
  if (statusFilter && statusFilter !== "Received") filterParts.push(`Status: ${statusFilter}`);
  if (supplierName) filterParts.push(`Supplier: ${supplierName}`);
  if (materialName) filterParts.push(`Material: ${materialName}`);
  if (dateFrom) filterParts.push(`From: ${dateFrom}`);
  if (dateTo)   filterParts.push(`To: ${dateTo}`);

  // Landscape column widths — 12 cols totalling 100%
  // S.No:4, PO#:8, Date:8, Bill:9, Supplier:14, Material:16, Qty:6, Unit:4, Rate:7, Taxable:8, Tax:8, Total:8 = 100
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
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

      <View style={[styles.plainTableHead, { marginTop: 4 }]}>
        <Text style={[styles.plainTableHeadCell, { width: "4%" }]}>S.No</Text>
        <Text style={[styles.plainTableHeadCell, { width: "8%" }]}>PO #</Text>
        <Text style={[styles.plainTableHeadCell, { width: "8%" }]}>Date</Text>
        <Text style={[styles.plainTableHeadCell, { width: "9%" }]}>Bill No.</Text>
        <Text style={[styles.plainTableHeadCell, { width: "14%" }]}>Supplier</Text>
        <Text style={[styles.plainTableHeadCell, { width: "16%" }]}>Material</Text>
        <Text style={[styles.plainTableHeadCell, { width: "6%", textAlign: "right" }]}>Qty</Text>
        <Text style={[styles.plainTableHeadCell, { width: "4%" }]}>Unit</Text>
        <Text style={[styles.plainTableHeadCell, { width: "7%", textAlign: "right" }]}>Rate</Text>
        <Text style={[styles.plainTableHeadCell, { width: "8%", textAlign: "right" }]}>Taxable</Text>
        <Text style={[styles.plainTableHeadCell, { width: "8%", textAlign: "right" }]}>Tax Amt</Text>
        <Text style={[styles.plainTableHeadCell, { width: "8%", textAlign: "right" }]}>Total</Text>
      </View>
      <View style={styles.separator} />

      {rows.map((r, i) => {
        const taxAmt = r.cgst_amount + r.sgst_amount + r.igst_amount;
        return (
          <View key={r.item_id} style={styles.plainTableRow}>
            <Text style={[styles.plainTableCell, { width: "4%" }]}>{i + 1}</Text>
            <Text style={[styles.plainTableCell, { width: "8%", fontFamily: "Helvetica-Bold" }]}>PO-{String(r.po_number).padStart(4, "0")}</Text>
            <Text style={[styles.plainTableCell, { width: "8%" }]}>{r.po_date}</Text>
            <Text style={[styles.plainTableCell, { width: "9%" }]}>{r.supplier_bill_no ?? "—"}</Text>
            <Text style={[styles.plainTableCell, { width: "14%" }]}>{r.supplier_name ?? "—"}</Text>
            <Text style={[styles.plainTableCell, { width: "16%" }]}>{r.material_name}</Text>
            <Text style={[styles.plainTableCell, { width: "6%", textAlign: "right" }]}>{fmtQ(r.qty)}</Text>
            <Text style={[styles.plainTableCell, { width: "4%" }]}>{r.unit_name ?? "—"}</Text>
            <Text style={[styles.plainTableCell, { width: "7%", textAlign: "right" }]}>{fmtAmt(String(r.rate))}</Text>
            <Text style={[styles.plainTableCell, { width: "8%", textAlign: "right" }]}>{fmt(r.taxable_amount)}</Text>
            <Text style={[styles.plainTableCell, { width: "8%", textAlign: "right" }]}>{taxAmt > 0 ? fmt(taxAmt) : "—"}</Text>
            <Text style={[styles.plainTableCellBold, { width: "8%", textAlign: "right" }]}>{fmt(r.total_amount)}</Text>
          </View>
        );
      })}

      <View style={[styles.separator, { marginTop: 2 }]} />

      <View style={[styles.plainTableRow, { backgroundColor: "#F8FAFC" }]}>
        <Text style={[styles.plainTableCellBold, { width: "4%" }]} />
        <Text style={[styles.plainTableCellBold, { width: "8%" }]} />
        <Text style={[styles.plainTableCellBold, { width: "8%" }]} />
        <Text style={[styles.plainTableCellBold, { width: "9%" }]} />
        <Text style={[styles.plainTableCellBold, { width: "14%" }]} />
        <Text style={[styles.plainTableCellBold, { width: "16%", textAlign: "right" }]}>
          {rows.some((r) => r.status !== "Received") ? "TOTAL (Received)" : "TOTAL"}
        </Text>
        <Text style={[styles.plainTableCellBold, { width: "6%", textAlign: "right" }]}>{fmtQ(totals.qty)}</Text>
        <Text style={[styles.plainTableCellBold, { width: "4%" }]} />
        <Text style={[styles.plainTableCellBold, { width: "7%" }]} />
        <Text style={[styles.plainTableCellBold, { width: "8%", textAlign: "right" }]}>{fmt(totals.taxable)}</Text>
        <Text style={[styles.plainTableCellBold, { width: "8%", textAlign: "right" }]}>{totals.tax > 0 ? fmt(totals.tax) : "—"}</Text>
        <Text style={[styles.plainTableCellBold, { width: "8%", textAlign: "right" }]}>{fmt(totals.total)}</Text>
      </View>

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
    tax:     monthlyRows.reduce((s, r) => s + r.cgst + r.sgst + r.igst, 0),
    total:   monthlyRows.reduce((s, r) => s + r.total, 0),
  };

  const filterParts: string[] = [`FY ${fy}`, "Monthly View"];
  if (supplierName) filterParts.push(`Supplier: ${supplierName}`);
  if (materialName) filterParts.push(`Material: ${materialName}`);

  // Landscape column widths — 8 cols totalling 100%
  // S.No:4, Month:10, Supplier:20, Material:24, Qty:8, Taxable:12, Tax:10, Total:12 = 100
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
        <Text style={[styles.plainTableHeadCell, { width: "20%" }]}>Supplier</Text>
        <Text style={[styles.plainTableHeadCell, { width: "24%" }]}>Material</Text>
        <Text style={[styles.plainTableHeadCell, { width: "8%", textAlign: "right" }]}>Qty</Text>
        <Text style={[styles.plainTableHeadCell, { width: "12%", textAlign: "right" }]}>Taxable</Text>
        <Text style={[styles.plainTableHeadCell, { width: "10%", textAlign: "right" }]}>Tax Amt</Text>
        <Text style={[styles.plainTableHeadCell, { width: "12%", textAlign: "right" }]}>Total</Text>
      </View>
      <View style={styles.separator} />

      {monthlyRows.map((r, i) => {
        const taxAmt = r.cgst + r.sgst + r.igst;
        return (
          <View key={r.key} style={styles.plainTableRow}>
            <Text style={[styles.plainTableCell, { width: "4%" }]}>{i + 1}</Text>
            <Text style={[styles.plainTableCell, { width: "10%", fontFamily: "Helvetica-Bold" }]}>{r.monthLabel}</Text>
            <Text style={[styles.plainTableCell, { width: "20%" }]}>{r.supplier}</Text>
            <Text style={[styles.plainTableCell, { width: "24%" }]}>{r.material}</Text>
            <Text style={[styles.plainTableCell, { width: "8%", textAlign: "right" }]}>{fmtQ(r.qty)}</Text>
            <Text style={[styles.plainTableCell, { width: "12%", textAlign: "right" }]}>{fmt(r.taxable)}</Text>
            <Text style={[styles.plainTableCell, { width: "10%", textAlign: "right" }]}>{taxAmt > 0 ? fmt(taxAmt) : "—"}</Text>
            <Text style={[styles.plainTableCellBold, { width: "12%", textAlign: "right" }]}>{fmt(r.total)}</Text>
          </View>
        );
      })}

      <View style={[styles.separator, { marginTop: 2 }]} />

      <View style={[styles.plainTableRow, { backgroundColor: "#F8FAFC" }]}>
        <Text style={[styles.plainTableCellBold, { width: "4%" }]} />
        <Text style={[styles.plainTableCellBold, { width: "10%" }]} />
        <Text style={[styles.plainTableCellBold, { width: "20%" }]} />
        <Text style={[styles.plainTableCellBold, { width: "24%", textAlign: "right" }]}>TOTAL</Text>
        <Text style={[styles.plainTableCellBold, { width: "8%", textAlign: "right" }]}>{fmtQ(totals.qty)}</Text>
        <Text style={[styles.plainTableCellBold, { width: "12%", textAlign: "right" }]}>{fmt(totals.taxable)}</Text>
        <Text style={[styles.plainTableCellBold, { width: "10%", textAlign: "right" }]}>{totals.tax > 0 ? fmt(totals.tax) : "—"}</Text>
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
