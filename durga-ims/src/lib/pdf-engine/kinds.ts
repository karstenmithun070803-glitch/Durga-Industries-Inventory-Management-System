import { buildTablePdf, type TablePdfSpec } from "./table-pdf";
import { buildPurchaseReportSpec, type PurchaseReportProps } from "./specs/purchase-report";

// Registry of tabular reports rendered by the direct-draw engine. Add a new report by
// writing a spec builder (props → TablePdfSpec) and registering it here.
export interface TableKindProps {
  "purchase-report": PurchaseReportProps;
}
export type TableKind = keyof TableKindProps;

const builders: { [K in TableKind]: (props: TableKindProps[K]) => TablePdfSpec } = {
  "purchase-report": buildPurchaseReportSpec,
};

export function renderTablePdf<K extends TableKind>(kind: K, props: TableKindProps[K]): Uint8Array {
  return buildTablePdf(builders[kind](props));
}
