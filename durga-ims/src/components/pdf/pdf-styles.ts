import { StyleSheet } from "@react-pdf/renderer";

export const COMPANY_NAME = "DURGA INDUSTRIES";
export const COMPANY_ADDRESS = "S.FNO.1994/2, MADURAI NEW BYE PASS RD, NEAR PERIYAR ARCH, KARUR - 639002";
export const COMPANY_GSTIN = "33AALPU5476B1ZJ";

export const styles = StyleSheet.create({
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
