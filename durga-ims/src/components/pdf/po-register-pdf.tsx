import React from "react";
import { Document, Page, View, Text } from "@react-pdf/renderer";
import {
  docStyles as styles,
  COMPANY_NAME,
  COMPANY_ADDRESS,
  COMPANY_GSTIN,
  fmtAmt,
  fmtQty,
  fmtDate,
} from "./pdf-styles";
import type { CompanySetting } from "@/lib/actions/settings.actions";

type ItemRow = {
  id: string;
  po_number: number;
  po_date: Date | string;
  status: string;
  affects_stock: boolean;
  supplier_bill_no: string | null;
  supplier_bill_date: string | null;
  item_id: string | null;
  material_id: string | null;
  material_name: string | null;
  material_no: number | null;
  supplier_id: string | null;
  supplier_name: string | null;
  qty: string | null;
  unit_name: string | null;
  rate: string | null;
  tax_percentage: string | null;
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
  showRates: boolean;
  companySetting?: CompanySetting;
}

function formatCode(prefix: string, num: number, pad = 3): string {
  return `${prefix}${String(num).padStart(pad, "0")}`;
}

export function PORegisterDocument({ rows, showRates, companySetting }: Props) {
  const coName    = companySetting?.company_name ?? COMPANY_NAME;
  const coAddress = companySetting?.address      ?? COMPANY_ADDRESS;
  const coGstin   = companySetting?.gstin        ?? COMPANY_GSTIN;
  const poMap = new Map<string, ItemRow[]>();
  for (const r of rows) {
    if (!poMap.has(r.id)) poMap.set(r.id, []);
    poMap.get(r.id)!.push(r);
  }
  const poGroups = Array.from(poMap.entries());

  return (
    <Document title="Purchase Order">
      {poGroups.map(([poId, items]) => {
        const first = items[0];
        const poLabel = formatCode("PO-", first.po_number, 4);
        const supplier = first.supplier_name ?? "—";

        // Per-PO totals breakdown
        const poSubtotal = items.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
        const poCgst     = items.reduce((s, r) => s + parseFloat(r.cgst_amount ?? "0"), 0);
        const poSgst     = items.reduce((s, r) => s + parseFloat(r.sgst_amount ?? "0"), 0);
        const poIgst     = items.reduce((s, r) => s + parseFloat(r.igst_amount ?? "0"), 0);
        const poGrand    = poSubtotal + poCgst + poSgst + poIgst;

        return (
          <Page key={poId} size="A4" style={styles.page}>

            {/* ── Centered company block ── */}
            <View>
              <Text style={styles.companyNameCentered}>{coName}</Text>
              <Text style={styles.companyDetailCentered}>{coAddress}</Text>
              <Text style={styles.companyDetailCentered}>GSTIN: {coGstin}</Text>
            </View>

            {/* ── Document type ── */}
            <Text style={styles.docTypeCentered}>PURCHASE ORDER</Text>

            {/* ── Info block ── */}
            <View style={styles.infoLine}>
              <Text style={styles.infoLineLabel}>PURCHASE ORDER NO.</Text>
              <Text style={styles.infoLineValue}>: {poLabel}</Text>
            </View>
            <View style={styles.infoLine}>
              <Text style={styles.infoLineLabel}>DATE</Text>
              <Text style={styles.infoLineValue}>: {fmtDate(first.po_date)}</Text>
            </View>
            <View style={styles.infoLine}>
              <Text style={styles.infoLineLabel}>SUPPLIER NAME</Text>
              <Text style={styles.infoLineValue}>: {supplier}</Text>
            </View>
            {first.supplier_bill_no && (
              <View style={styles.infoLine}>
                <Text style={styles.infoLineLabel}>SUPPLIER BILL</Text>
                <Text style={styles.infoLineValue}>
                  : {first.supplier_bill_no}{first.supplier_bill_date ? ` dated ${fmtDate(first.supplier_bill_date)}` : ""}
                </Text>
              </View>
            )}
            {!first.affects_stock && (
              <View style={styles.infoLine}>
                <Text style={styles.infoLineLabel}>STOCK UPDATE</Text>
                <Text style={[styles.infoLineValue, { fontFamily: "Helvetica" }]}>: No (accounting only)</Text>
              </View>
            )}

            {/* ── Table ── */}
            <View style={styles.table}>
              <View style={styles.separator} />

              {/* Column headers */}
              <View style={styles.plainTableHead}>
                <Text style={[styles.plainTableHeadCell, { width: "7%" }]}>S No.</Text>
                <Text style={[styles.plainTableHeadCell, { flex: 1, textAlign: "center" }]}>Material Name</Text>
                <Text style={[styles.plainTableHeadCell, { width: "12%", textAlign: "right" }]}>Qty</Text>
                <Text style={[styles.plainTableHeadCell, { width: "9%", marginLeft: 6 }]}>Unit</Text>
                {showRates && (
                  <>
                    <Text style={[styles.plainTableHeadCell, { width: "11%", textAlign: "right" }]}>Rate</Text>
                    <Text style={[styles.plainTableHeadCell, { width: "8%", textAlign: "right" }]}>Tax%</Text>
                    <Text style={[styles.plainTableHeadCell, { width: "11%", textAlign: "right" }]}>Tax Amt</Text>
                    <Text style={[styles.plainTableHeadCell, { width: "13%", textAlign: "right" }]}>Amount</Text>
                  </>
                )}
              </View>

              <View style={styles.separator} />

              {/* Data rows */}
              {items.map((r, idx) => {
                const taxAmt = parseFloat(r.cgst_amount ?? "0") + parseFloat(r.sgst_amount ?? "0") + parseFloat(r.igst_amount ?? "0");
                const grossAmt = parseFloat(r.amount ?? "0") + taxAmt;
                return (
                  <View key={r.item_id ?? idx} style={styles.plainTableRow}>
                    <Text style={[styles.plainTableCell, { width: "7%" }]}>{idx + 1}</Text>
                    <Text style={[styles.plainTableCell, { flex: 1, textAlign: "center" }]}>{r.material_name ?? "—"}</Text>
                    <Text style={[styles.plainTableCell, { width: "12%", textAlign: "right" }]}>
                      {fmtQty(r.qty)}
                    </Text>
                    <Text style={[styles.plainTableCell, { width: "9%", marginLeft: 6 }]}>
                      {r.unit_name ?? "—"}
                    </Text>
                    {showRates && (
                      <>
                        <Text style={[styles.plainTableCell, { width: "11%", textAlign: "right" }]}>
                          {r.rate ? fmtAmt(r.rate) : "—"}
                        </Text>
                        <Text style={[styles.plainTableCell, { width: "8%", textAlign: "right" }]}>
                          {r.tax_percentage ? `${parseFloat(r.tax_percentage)}%` : "—"}
                        </Text>
                        <Text style={[styles.plainTableCell, { width: "11%", textAlign: "right" }]}>
                          {fmtAmt(taxAmt.toFixed(2))}
                        </Text>
                        <Text style={[styles.plainTableCellBold, { width: "13%", textAlign: "right" }]}>
                          {fmtAmt(grossAmt.toFixed(2))}
                        </Text>
                      </>
                    )}
                  </View>
                );
              })}

              <View style={styles.separator} />

              {/* Footer — only when showRates */}
              {showRates && (
                <View style={{ marginTop: 4 }}>
                  <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 1 }}>
                    <Text style={[styles.plainTableCell, { textAlign: "right", marginRight: 4 }]}>Taxable Value:</Text>
                    <Text style={[styles.plainTableCellBold, { width: "13%", textAlign: "right" }]}>
                      Rs. {fmtAmt(poSubtotal.toFixed(2))}
                    </Text>
                  </View>
                  {poCgst > 0 && (
                    <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 1 }}>
                      <Text style={[styles.plainTableCell, { textAlign: "right", marginRight: 4 }]}>CGST:</Text>
                      <Text style={[styles.plainTableCellBold, { width: "13%", textAlign: "right" }]}>
                        Rs. {fmtAmt(poCgst.toFixed(2))}
                      </Text>
                    </View>
                  )}
                  {poSgst > 0 && (
                    <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 1 }}>
                      <Text style={[styles.plainTableCell, { textAlign: "right", marginRight: 4 }]}>SGST:</Text>
                      <Text style={[styles.plainTableCellBold, { width: "13%", textAlign: "right" }]}>
                        Rs. {fmtAmt(poSgst.toFixed(2))}
                      </Text>
                    </View>
                  )}
                  {poIgst > 0 && (
                    <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 1 }}>
                      <Text style={[styles.plainTableCell, { textAlign: "right", marginRight: 4 }]}>IGST:</Text>
                      <Text style={[styles.plainTableCellBold, { width: "13%", textAlign: "right" }]}>
                        Rs. {fmtAmt(poIgst.toFixed(2))}
                      </Text>
                    </View>
                  )}
                  <View style={[styles.separator, { marginVertical: 2 }]} />
                  <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                    <Text style={[styles.plainTableCell, { textAlign: "right", marginRight: 4 }]}>Grand Total:</Text>
                    <Text style={[styles.plainTableCellBold, { width: "13%", textAlign: "right" }]}>
                      Rs. {fmtAmt(poGrand.toFixed(2))}
                    </Text>
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
