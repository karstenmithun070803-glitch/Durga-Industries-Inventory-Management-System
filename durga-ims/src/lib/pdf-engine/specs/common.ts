import type { HeaderLine } from "../table-pdf";

// Mirrors COMPANY_* in src/components/pdf/pdf-styles.ts (that file imports react-pdf,
// which must not be pulled into the worker bundle for tabular reports).
export const COMPANY_NAME = "DURGA INDUSTRIES";
export const COMPANY_ADDRESS = "S.FNO.1994/2, MADURAI NEW BYE PASS RD, NEAR PERIYAR ARCH, KARUR - 639002";
export const COMPANY_GSTIN = "33AALPU5476B1ZJ";

export interface CompanyInfo {
  company_name?: string | null;
  address?: string | null;
  gstin?: string | null;
}

// Intl.NumberFormat construction is expensive; toLocaleString(options) builds one per
// call. Reuse formatters — this alone is the difference between 20k rows in 0.1s and 2s.
const nf2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0to3 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 3 });

export const fmt2 = (v: number): string => nf2.format(v);
export const fmtQ = (v: number): string => nf0to3.format(v);

export function companyHeader(
  co: CompanyInfo | undefined,
  title: string,
  filterLine: string,
  titleSize = 11.5
): HeaderLine[] {
  return [
    { text: co?.company_name ?? COMPANY_NAME, size: 17, bold: true, align: "center" },
    { text: co?.address ?? COMPANY_ADDRESS, size: 9, align: "center", marginTop: 2 },
    { text: `GSTIN: ${co?.gstin ?? COMPANY_GSTIN}`, size: 9, align: "center", marginTop: 2 },
    { text: title, size: titleSize, bold: true, align: "center", marginTop: 6 },
    { text: filterLine, size: 8.5, align: "center", color: "#6B7280", marginTop: 2, marginBottom: 4 },
  ];
}
