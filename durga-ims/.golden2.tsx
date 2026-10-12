import React from "react";
import fs from "fs";
import { renderToBuffer } from "@react-pdf/renderer";
import { InvoiceSummaryReportDocument } from "./src/components/pdf/invoice-summary-report-pdf";
import { MonthlyStockReportDocument } from "./src/components/pdf/monthly-stock-report-pdf";
import { JobCostDocument } from "./src/components/pdf/job-cost-pdf";
import { StageWiseCostingDocument } from "./src/components/pdf/stage-wise-costing-pdf";
import { VehicleComparisonDocument } from "./src/components/pdf/vehicle-comparison-pdf";
import { renderTablePdf } from "./src/lib/pdf-engine/kinds";

const out = process.argv[2];
const N = Number(process.argv[3] || 45);
const inv = Array.from({ length: N }, (_, i) => ({ id: "i" + i, bill_number: 100 + i, bill_date: "07/07/2026", job_ref_no: "TN45 AB " + (1000 + i), customer_name: "Customer Number " + i, status: i % 11 === 5 ? "Cancelled" : "Finalized", taxable_value: 100000 + i * 13.37, total_cgst: 9000, total_sgst: 9000, total_igst: 0, discount: i % 4 === 0 ? 500 : 0, net_amount: 118000 + i }));
const stock = Array.from({ length: N }, (_, i) => ({ material_id: "m" + i, material_no: i + 1, material_name: "Material item " + i, unit_name: i % 9 === 0 ? "Nos" : "Kg", opening_stock: 100 + i, po_inward: i % 3 ? 20.5 : 0, issues: i % 2 ? 8 : 0, reversals: i % 7 === 0 ? -1 : 0, adjustments: i % 5 === 0 ? 2 : 0, closing_stock: i % 13 === 0 ? -3 : 150 + i, last_po_rate: 62.5, opening_rate: null, standard_cost: null }));
const job = { vehicle: { job_ref_no: "TN45 AB 1234", vehicle_type: "New", customer_name: "ABC Transports" }, rows: Array.from({ length: N }, (_, i) => ({ material_name: "Material " + i, material_no: i, contractor_name: i % 2 ? "Raman" : null, unit_name: "Kg", total_qty: 12.5, rate: 62.5, total_amount: 781.25 })), totals: { total_cost: 781.25 * N } };
const stageRows = Array.from({ length: N }, (_, i) => ({ code: "S" + i, name: "Stage name " + i, is_direct: i % 6 === 0, amount: 1000 * i }));
const matRows = Array.from({ length: N }, (_, i) => ({ code: "M" + i, name: "Material " + i, stages: "S1, S2", amount: 500 * i }));
const cmp = Array.from({ length: N }, (_, i) => ({ code: "c" + i, material_name: "Material " + i, stage_name: "Stage " + (i % 5), qty1: 10 + i, amt1: 100 * i, qty2: i % 3 ? 10 + i : 8, amt2: 90 * i, diff: i % 3 ? 0 : 2 }));

const cases: [string, any, any][] = [
  ["invoice-summary", <InvoiceSummaryReportDocument rows={inv as any} fy="2026-27" />, { rows: inv, fy: "2026-27" }],
  ["monthly-stock", <MonthlyStockReportDocument rows={stock as any} fromMonth="2026-05" toMonth="2026-06" showDetails showPrices />, { rows: stock, fromMonth: "2026-05", toMonth: "2026-06", showDetails: true, showPrices: true }],
  ["job-cost", <JobCostDocument result={job as any} />, { result: job }],
  ["stage-wise-costing", <StageWiseCostingDocument stageRows={stageRows as any} materialRows={matRows as any} rptType="stage" jobLabel="TN45 AB 1234" fy="2026-27" marginPct={5} />, { stageRows, materialRows: matRows, rptType: "stage", jobLabel: "TN45 AB 1234", fy: "2026-27", marginPct: 5 }],
  ["vehicle-comparison", <VehicleComparisonDocument rows={cmp as any} v1Name="TN45 AB 1234" v2Name="TN45 CD 5678" fy="2026-27" stageName="All Stages" hideAmounts={false} showDiffOnly={false} />, { rows: cmp, v1Name: "TN45 AB 1234", v2Name: "TN45 CD 5678", fy: "2026-27", stageName: "All Stages", hideAmounts: false, showDiffOnly: false }],
];
async function main() {
  for (const [kind, el, props] of cases) {
    const t0 = performance.now(); const old = await renderToBuffer(el); const t1 = performance.now();
    const neu = renderTablePdf(kind as any, props); const t2 = performance.now();
    fs.writeFileSync(`${out}/${kind}.old.pdf`, old); fs.writeFileSync(`${out}/${kind}.new.pdf`, neu);
    console.log(kind.padEnd(20), "old", (t1 - t0).toFixed(0), "ms  new", (t2 - t1).toFixed(0), "ms");
  }
  // scale: 3-year invoice summary / stock at 20k and 100k rows
  for (const n of [20000, 100000]) {
    const big = Array.from({ length: n }, (_, i) => ({ ...inv[i % N], id: "x" + i, bill_number: i }));
    const t = performance.now(); const b = renderTablePdf("invoice-summary", { rows: big, fy: "2026-27" } as any);
    console.log(`invoice-summary ${n} rows: ${(performance.now() - t).toFixed(0)} ms, ${(b.length / 1024).toFixed(0)} KB`);
  }
}
main();
