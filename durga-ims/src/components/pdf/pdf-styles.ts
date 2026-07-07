import { StyleSheet } from "@react-pdf/renderer";

export const COMPANY_NAME = "DURGA INDUSTRIES";
export const COMPANY_ADDRESS = "S.FNO.1994/2, MADURAI NEW BYE PASS RD, NEAR PERIYAR ARCH, KARUR - 639002";
export const COMPANY_GSTIN = "33AALPU5476B1ZJ";

// ── Base definitions at document (current) sizes ─────────────────────────────
// Plain object so both scales can spread from it safely. `docStyles` uses these
// sizes verbatim (invoices / slips / POs / job-cost); `styles` (the report scale)
// overrides only the font sizes below to a smaller, less-crowded proportion.
const base = {
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    paddingTop: 30,
    paddingBottom: 40,
    paddingHorizontal: 32,
    color: "#000",
  },

  // ── Document-style centered company block ──────────────────────────────────
  companyNameCentered: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    letterSpacing: 1,
    color: "#000",
  },
  companyDetailCentered: {
    fontSize: 9.5,
    textAlign: "center",
    color: "#000",
    marginTop: 2,
  },
  docTypeCentered: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 10,
    color: "#000",
  },

  // ── Left-aligned info block (PO No / Date / Supplier) ─────────────────────
  infoLine: {
    flexDirection: "row",
    marginBottom: 3,
  },
  infoLineLabel: {
    fontSize: 10,
    width: 145,
    color: "#000",
  },
  infoLineLabelInvoice: {
    fontSize: 10,
    width: 105,
    color: "#000",
  },
  infoLineLabelMI: {
    fontSize: 10,
    width: 90,
    color: "#000",
  },
  infoLineValue: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#000",
    flex: 1,
  },

  // ── Solid separator line ───────────────────────────────────────────────────
  separator: {
    borderTopWidth: 0.75,
    borderTopColor: "#000",
    marginVertical: 5,
  },

  // ── Plain document table ───────────────────────────────────────────────────
  table: {
    width: "100%",
  },
  plainTableHead: {
    flexDirection: "row",
    paddingVertical: 3,
  },
  plainTableHeadCell: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#000",
    paddingRight: 3,
  },
  plainTableRow: {
    flexDirection: "row",
    paddingVertical: 4,
  },
  plainTableCell: {
    fontSize: 10,
    color: "#000",
    paddingRight: 3,
  },
  plainTableCellBold: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#000",
    paddingRight: 3,
  },

  // ── Page footer ────────────────────────────────────────────────────────────
  pageFooter: {
    position: "absolute",
    bottom: 18,
    left: 32,
    right: 32,
  },
  footerLine: {
    borderTopWidth: 0.5,
    borderTopColor: "#000",
    marginBottom: 4,
  },
  footerText: {
    fontSize: 9.5,
    textAlign: "right",
    color: "#000",
  },

  // ── Stage sub-header row (VMI New multi-stage PDF) ────────────────────────
  stageHeaderRow: {
    backgroundColor: "#f1f5f9",
    paddingVertical: 2,
    paddingHorizontal: 6,
    marginTop: 4,
    marginBottom: 1,
  },
  stageHeaderText: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: "#475569",
    textTransform: "uppercase",
  },

  // ── Legacy styles kept for any future reuse ────────────────────────────────
  companyName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    letterSpacing: 0.5,
  },
  companyDetail: {
    fontSize: 7.5,
    color: "#64748b",
    marginTop: 1,
  },
  tableCellRight: {
    textAlign: "right",
  },
  tableCellCenter: {
    textAlign: "center",
  },
} as const;

// Document scale — single-record docs (invoices, MI slips, POs, job-cost) keep
// today's sizes. Alias in those components via `import { docStyles as styles }`.
export const docStyles = StyleSheet.create(base);

// Report scale (default) — tabular list reports. Font sizes reduced ~1.5pt so
// dense reports (Purchase Report, etc.) are less crowded; only fontSize and row
// padding differ from `base`. All widths/margins/separators stay identical.
export const styles = StyleSheet.create({
  ...base,
  page: { ...base.page, fontSize: 8.5 },
  companyNameCentered: { ...base.companyNameCentered, fontSize: 16 },
  companyDetailCentered: { ...base.companyDetailCentered, fontSize: 8 },
  docTypeCentered: { ...base.docTypeCentered, fontSize: 11 },
  infoLineLabel: { ...base.infoLineLabel, fontSize: 8.5 },
  infoLineLabelInvoice: { ...base.infoLineLabelInvoice, fontSize: 8.5 },
  infoLineLabelMI: { ...base.infoLineLabelMI, fontSize: 8.5 },
  infoLineValue: { ...base.infoLineValue, fontSize: 8.5 },
  plainTableHead: { ...base.plainTableHead, paddingVertical: 2 },
  plainTableHeadCell: { ...base.plainTableHeadCell, fontSize: 8.5 },
  plainTableRow: { ...base.plainTableRow, paddingVertical: 3 },
  plainTableCell: { ...base.plainTableCell, fontSize: 8.5 },
  plainTableCellBold: { ...base.plainTableCellBold, fontSize: 8.5 },
  footerText: { ...base.footerText, fontSize: 8 },
});

export function fmtAmt(v: string | null | undefined): string {
  if (!v) return "0.00";
  return parseFloat(v).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtQty(v: string | null | undefined): string {
  if (!v) return "—";
  const n = parseFloat(v);
  if (isNaN(n)) return "—";
  return n.toFixed(3);
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
}
