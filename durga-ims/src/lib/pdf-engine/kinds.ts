import { buildTablePdf, type TablePdfSpec } from "./table-pdf";
import { buildPurchaseReportSpec, type PurchaseReportProps } from "./specs/purchase-report";
import { buildInvoiceSummarySpec, type InvoiceSummaryProps } from "./specs/invoice-summary";
import { buildMonthlyStockSpec, type MonthlyStockProps } from "./specs/monthly-stock";
import { buildJobCostSpec, type JobCostProps } from "./specs/job-cost";
import { buildStageWiseSpec, type StageWiseProps } from "./specs/stage-wise-costing";
import { buildVehicleComparisonSpec, type VehicleComparisonProps } from "./specs/vehicle-comparison";

// Registry of tabular reports rendered by the direct-draw engine. Add a new report by
// writing a spec builder (props → TablePdfSpec) and registering it here.
export interface TableKindProps {
  "purchase-report": PurchaseReportProps;
  "invoice-summary": InvoiceSummaryProps;
  "monthly-stock": MonthlyStockProps;
  "job-cost": JobCostProps;
  "stage-wise-costing": StageWiseProps;
  "vehicle-comparison": VehicleComparisonProps;
}
export type TableKind = keyof TableKindProps;

const builders: { [K in TableKind]: (props: TableKindProps[K]) => TablePdfSpec } = {
  "purchase-report": buildPurchaseReportSpec,
  "invoice-summary": buildInvoiceSummarySpec,
  "monthly-stock": buildMonthlyStockSpec,
  "job-cost": buildJobCostSpec,
  "stage-wise-costing": buildStageWiseSpec,
  "vehicle-comparison": buildVehicleComparisonSpec,
};

export function renderTablePdf<K extends TableKind>(kind: K, props: TableKindProps[K]): Uint8Array {
  return buildTablePdf(builders[kind](props));
}
