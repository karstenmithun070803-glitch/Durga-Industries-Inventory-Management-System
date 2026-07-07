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
  showBill?: boolean;
  showTaxAmt?: boolean;
}

function fmt(v: number) {
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQ(v: number) {
  return v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function PurchaseDetailDocument({
  rows, fy, statusFilter, supplierName, materialName, dateFrom, dateTo,
  coName, coAddress, coGstin, showBill = false, showTaxAmt = false,
}: {
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
  showBill?: boolean;
  showTaxAmt?: boolean;
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

  // Portrait A4 column widths — 4 configurations based on optional cols (all sum to 100%)
  // Date needs 10% (55pt) for "07/07/2026" at 8.5pt; Total needs 13% (72pt) for "1,69,930.62"
  const w = showBill && showTaxAmt
    ? { sno:"4%", po:"6%", date:"8%", bill:"8%", sup:"14%", mat:"14%", qty:"5%", unit:"4%", rate:"7%", taxable:"12%", tax:"7%", total:"11%" }
    : showTaxAmt
    ? { sno:"4%", po:"7%", date:"9%", bill:undefined, sup:"16%", mat:"16%", qty:"5%", unit:"4%", rate:"8%", taxable:"12%", tax:"8%", total:"11%" }
    : showBill
    ? { sno:"4%", po:"7%", date:"9%", bill:"9%", sup:"15%", mat:"15%", qty:"5%", unit:"4%", rate:"8%", taxable:"13%", tax:undefined, total:"11%" }
    : { sno:"4%", po:"8%", date:"10%", bill:undefined, sup:"17%", mat:"16%", qty:"5%", unit:"5%", rate:"8%", taxable:"14%", tax:undefined, total:"13%" };

  // Group rows by PO id — same Map approach as the screen
  const poGroups: PurchaseReportRow[][] = [];
  {
    const map = new Map<string, PurchaseReportRow[]>();
    for (const row of rows) {
      if (!map.has(row.id)) map.set(row.id, []);
      map.get(row.id)!.push(row);
    }
    poGroups.push(...Array.from(map.values()));
  }

  return (
    <Page size="A4" style={styles.page}>
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
        <Text style={[styles.plainTableHeadCell, { width: w.sno }]}>S.No</Text>
        <Text style={[styles.plainTableHeadCell, { width: w.po }]}>PO #</Text>
        <Text style={[styles.plainTableHeadCell, { width: w.date }]}>Date</Text>
        {showBill && <Text style={[styles.plainTableHeadCell, { width: w.bill! }]}>Bill No.</Text>}
        <Text style={[styles.plainTableHeadCell, { width: w.sup }]}>Supplier</Text>
        <Text style={[styles.plainTableHeadCell, { width: w.mat }]}>Material</Text>
        <Text style={[styles.plainTableHeadCell, { width: w.qty, textAlign: "right" }]}>Qty</Text>
        <Text style={[styles.plainTableHeadCell, { width: w.unit, paddingLeft: 4 }]}>Unit</Text>
        <Text style={[styles.plainTableHeadCell, { width: w.rate, textAlign: "right" }]}>Rate</Text>
        <Text style={[styles.plainTableHeadCell, { width: w.taxable, textAlign: "right" }]}>Taxable</Text>
        {showTaxAmt && <Text style={[styles.plainTableHeadCell, { width: w.tax!, textAlign: "right" }]}>Tax Amt</Text>}
        <Text style={[styles.plainTableHeadCell, { width: w.total, textAlign: "right" }]}>Total</Text>
      </View>
      <View style={styles.separator} />

      {poGroups.map((group, gIdx) =>
        group.map((r, itemIdx) => {
          const taxAmt = r.cgst_amount + r.sgst_amount + r.igst_amount;
          return (
            <View
              key={r.item_id}
              style={[
                styles.plainTableRow,
                itemIdx === 0 && gIdx > 0 ? { borderTopColor: "#94A3B8", borderTopWidth: 0.75 } : {},
              ]}
            >
              <Text style={[styles.plainTableCell, { width: w.sno }]}>{itemIdx === 0 ? String(gIdx + 1) : ""}</Text>
              <Text style={[styles.plainTableCell, { width: w.po, fontFamily: "Helvetica-Bold" }]}>{itemIdx === 0 ? `PO-${String(r.po_number).padStart(4, "0")}` : ""}</Text>
              <Text style={[styles.plainTableCell, { width: w.date }]}>{itemIdx === 0 ? r.po_date : ""}</Text>
              {showBill && <Text style={[styles.plainTableCell, { width: w.bill! }]}>{itemIdx === 0 ? (r.supplier_bill_no ?? "—") : ""}</Text>}
              <Text style={[styles.plainTableCell, { width: w.sup }]}>{itemIdx === 0 ? (r.supplier_name ?? "—") : ""}</Text>
              <Text style={[styles.plainTableCell, { width: w.mat }]}>{r.material_name}</Text>
              <Text style={[styles.plainTableCell, { width: w.qty, textAlign: "right" }]}>{fmtQ(r.qty)}</Text>
              <Text style={[styles.plainTableCell, { width: w.unit, paddingLeft: 4 }]}>{r.unit_name ?? "—"}</Text>
              <Text style={[styles.plainTableCell, { width: w.rate, textAlign: "right" }]}>{fmtAmt(String(r.rate))}</Text>
              <Text style={[styles.plainTableCell, { width: w.taxable, textAlign: "right" }]}>{fmt(r.taxable_amount)}</Text>
              {showTaxAmt && <Text style={[styles.plainTableCell, { width: w.tax!, textAlign: "right" }]}>{taxAmt > 0 ? fmt(taxAmt) : "—"}</Text>}
              <Text style={[styles.plainTableCellBold, { width: w.total, textAlign: "right" }]}>{fmt(r.total_amount)}</Text>
            </View>
          );
        })
      )}

      <View style={[styles.separator, { marginTop: 2 }]} />

      <View style={[styles.plainTableRow, { backgroundColor: "#F8FAFC" }]}>
        <Text style={[styles.plainTableCellBold, { width: w.sno }]} />
        <Text style={[styles.plainTableCellBold, { width: w.po }]} />
        <Text style={[styles.plainTableCellBold, { width: w.date }]} />
        {showBill && <Text style={[styles.plainTableCellBold, { width: w.bill! }]} />}
        <Text style={[styles.plainTableCellBold, { width: w.sup }]} />
        <Text style={[styles.plainTableCellBold, { width: w.mat, textAlign: "right" }]}>
          {rows.some((r) => r.status !== "Received") ? "TOTAL (Received)" : "TOTAL"}
        </Text>
        <Text style={[styles.plainTableCellBold, { width: w.qty }]} />
        <Text style={[styles.plainTableCellBold, { width: w.unit }]} />
        <Text style={[styles.plainTableCellBold, { width: w.rate }]} />
        <Text style={[styles.plainTableCellBold, { width: w.taxable, textAlign: "right" }]}>{fmt(totals.taxable)}</Text>
        {showTaxAmt && <Text style={[styles.plainTableCellBold, { width: w.tax!, textAlign: "right" }]}>{totals.tax > 0 ? fmt(totals.tax) : "—"}</Text>}
        <Text style={[styles.plainTableCellBold, { width: w.total, textAlign: "right" }]}>{fmt(totals.total)}</Text>
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

function PurchaseMonthlyDocument({
  monthlyRows, fy, supplierName, materialName, coName, coAddress, coGstin, showTaxAmt = false,
}: {
  monthlyRows: MonthlyGroup[];
  fy: string;
  supplierName?: string;
  materialName?: string;
  coName: string;
  coAddress: string;
  coGstin: string;
  showTaxAmt?: boolean;
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

  // Portrait A4 column widths — 2 configurations based on showTaxAmt (all sum to 100%)
  const mw = showTaxAmt
    ? { sno:"5%", month:"11%", sup:"18%", mat:"23%", qty:"8%", taxable:"14%", tax:"9%", total:"12%" }
    : { sno:"5%", month:"12%", sup:"20%", mat:"26%", qty:"8%", taxable:"16%", tax:undefined, total:"13%" };

  return (
    <Page size="A4" style={styles.page}>
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
        <Text style={[styles.plainTableHeadCell, { width: mw.sno }]}>S.No</Text>
        <Text style={[styles.plainTableHeadCell, { width: mw.month }]}>Month</Text>
        <Text style={[styles.plainTableHeadCell, { width: mw.sup }]}>Supplier</Text>
        <Text style={[styles.plainTableHeadCell, { width: mw.mat }]}>Material</Text>
        <Text style={[styles.plainTableHeadCell, { width: mw.qty, textAlign: "right" }]}>Qty</Text>
        <Text style={[styles.plainTableHeadCell, { width: mw.taxable, textAlign: "right" }]}>Taxable</Text>
        {showTaxAmt && <Text style={[styles.plainTableHeadCell, { width: mw.tax!, textAlign: "right" }]}>Tax Amt</Text>}
        <Text style={[styles.plainTableHeadCell, { width: mw.total, textAlign: "right" }]}>Total</Text>
      </View>
      <View style={styles.separator} />

      {monthlyRows.map((r, i) => {
        const taxAmt = r.cgst + r.sgst + r.igst;
        return (
          <View key={r.key} style={styles.plainTableRow}>
            <Text style={[styles.plainTableCell, { width: mw.sno }]}>{i + 1}</Text>
            <Text style={[styles.plainTableCell, { width: mw.month, fontFamily: "Helvetica-Bold" }]}>{r.monthLabel}</Text>
            <Text style={[styles.plainTableCell, { width: mw.sup }]}>{r.supplier}</Text>
            <Text style={[styles.plainTableCell, { width: mw.mat }]}>{r.material}</Text>
            <Text style={[styles.plainTableCell, { width: mw.qty, textAlign: "right" }]}>{fmtQ(r.qty)}</Text>
            <Text style={[styles.plainTableCell, { width: mw.taxable, textAlign: "right" }]}>{fmt(r.taxable)}</Text>
            {showTaxAmt && <Text style={[styles.plainTableCell, { width: mw.tax!, textAlign: "right" }]}>{taxAmt > 0 ? fmt(taxAmt) : "—"}</Text>}
            <Text style={[styles.plainTableCellBold, { width: mw.total, textAlign: "right" }]}>{fmt(r.total)}</Text>
          </View>
        );
      })}

      <View style={[styles.separator, { marginTop: 2 }]} />

      <View style={[styles.plainTableRow, { backgroundColor: "#F8FAFC" }]}>
        <Text style={[styles.plainTableCellBold, { width: mw.sno }]} />
        <Text style={[styles.plainTableCellBold, { width: mw.month }]} />
        <Text style={[styles.plainTableCellBold, { width: mw.sup }]} />
        <Text style={[styles.plainTableCellBold, { width: mw.mat, textAlign: "right" }]}>TOTAL</Text>
        <Text style={[styles.plainTableCellBold, { width: mw.qty }]} />
        <Text style={[styles.plainTableCellBold, { width: mw.taxable, textAlign: "right" }]}>{fmt(totals.taxable)}</Text>
        {showTaxAmt && <Text style={[styles.plainTableCellBold, { width: mw.tax!, textAlign: "right" }]}>{totals.tax > 0 ? fmt(totals.tax) : "—"}</Text>}
        <Text style={[styles.plainTableCellBold, { width: mw.total, textAlign: "right" }]}>{fmt(totals.total)}</Text>
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
  showBill = false, showTaxAmt = false,
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
          showTaxAmt={showTaxAmt}
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
          showBill={showBill}
          showTaxAmt={showTaxAmt}
        />
      )}
    </Document>
  );
}
