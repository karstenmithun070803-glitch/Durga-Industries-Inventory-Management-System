import { StyleSheet } from "@react-pdf/renderer";

export const COMPANY_NAME = "DURGA INDUSTRIES";
export const COMPANY_ADDRESS = "Chennai, Tamil Nadu";
export const COMPANY_GSTIN = "";

export const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 8,
    paddingTop: 28,
    paddingBottom: 32,
    paddingHorizontal: 28,
    color: "#1e293b",
  },

  // Company header
  companyHeader: {
    marginBottom: 10,
    borderBottomWidth: 1.5,
    borderBottomColor: "#1e293b",
    paddingBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
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
  docTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    textAlign: "right",
  },
  docMeta: {
    fontSize: 7.5,
    color: "#64748b",
    textAlign: "right",
    marginTop: 1,
  },

  // Summary bar
  summaryBar: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 8,
    padding: "5 8",
    backgroundColor: "#f8fafc",
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  summaryItem: {
    flexDirection: "row",
    gap: 4,
  },
  summaryLabel: {
    color: "#64748b",
    fontSize: 7.5,
  },
  summaryValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: "#1e293b",
  },

  // Table
  table: {
    width: "100%",
  },
  tableHead: {
    flexDirection: "row",
    backgroundColor: "#1e293b",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 2,
    marginBottom: 1,
  },
  tableHeadCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: "#f8fafc",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 3.5,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
  },
  tableRowAlt: {
    backgroundColor: "#f8fafc",
  },
  tableCell: {
    fontSize: 7.5,
    color: "#334155",
  },
  tableCellBold: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: "#0f172a",
  },
  tableCellMono: {
    fontFamily: "Helvetica",
    fontSize: 7,
    color: "#475569",
  },
  tableCellRight: {
    textAlign: "right",
  },
  tableCellCenter: {
    textAlign: "center",
  },

  // Group header (PO# / Slip#)
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e2e8f0",
    paddingVertical: 3,
    paddingHorizontal: 6,
    marginTop: 4,
    marginBottom: 1,
    borderRadius: 2,
  },
  groupHeaderLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: "#1e293b",
    flex: 1,
  },
  groupHeaderMeta: {
    fontSize: 7,
    color: "#475569",
  },

  // Totals footer
  totalsSection: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  totalsBox: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 3,
    padding: "5 10",
    minWidth: 160,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 1.5,
  },
  totalsLabel: {
    fontSize: 7.5,
    color: "#64748b",
  },
  totalsValue: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#1e293b",
    textAlign: "right",
    minWidth: 60,
  },
  totalsDivider: {
    borderTopWidth: 1,
    borderTopColor: "#cbd5e1",
    marginVertical: 2,
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  grandTotalLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: "#0f172a",
  },
  grandTotalValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: "#0f172a",
    textAlign: "right",
    minWidth: 60,
  },

  // Footer
  pageFooter: {
    position: "absolute",
    bottom: 14,
    left: 28,
    right: 28,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 6.5,
    color: "#94a3b8",
  },

  // Status badge
  badgeDraft: {
    fontSize: 6.5,
    color: "#475569",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
  },
  badgeReceived: {
    fontSize: 6.5,
    color: "#065f46",
    backgroundColor: "#d1fae5",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
  },
  badgeIssued: {
    fontSize: 6.5,
    color: "#065f46",
    backgroundColor: "#d1fae5",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
  },
});

export function fmtAmt(v: string | null | undefined): string {
  if (!v) return "0.00";
  return parseFloat(v).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
}
