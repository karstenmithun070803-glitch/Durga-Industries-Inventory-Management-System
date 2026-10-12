import React from "react";
import fs from "fs";
import { renderToBuffer } from "@react-pdf/renderer";
import { PurchaseReportDocument } from "./src/components/pdf/purchase-report-pdf";
import { renderTablePdf } from "./src/lib/pdf-engine/kinds";
async function main() {
const N = Number(process.argv[2] || 60);
const rows: any[] = [];
for (let i = 0; i < N; i++) for (let j = 0; j < 1 + (i % 3); j++) rows.push({
  item_id: `i${i}-${j}`, id: `po${i}`, po_number: i + 1, po_date: "07/07/2026", supplier_name: "Sri Murugan Steel Traders & Co " + (i % 5),
  supplier_bill_no: "B" + i, supplier_bill_date: null, material_name: "MS Angle 50x50x6 with a very long descriptive name " + (i % 9), material_no: 1,
  qty: 12.5 + j, unit_name: "Kg", rate: 62.5, taxable_amount: 169930.62, cgst_amount: 9, sgst_amount: 9, igst_amount: 0, total_amount: 200518.13,
  affects_stock: true, status: "Received" });
const props: any = { rows, monthlyRows: [], groupByMonth: false, fy: "2026-27", showBill: true, showTaxAmt: true };
let t = performance.now();
const old = await renderToBuffer(<PurchaseReportDocument {...props} />);
console.log("old", rows.length, "rows", (performance.now() - t).toFixed(0), "ms");
t = performance.now();
const neu = renderTablePdf("purchase-report", props);
console.log("new", (performance.now() - t).toFixed(0), "ms");
fs.writeFileSync(process.argv[3] + "/old.pdf", old); fs.writeFileSync(process.argv[3] + "/new.pdf", neu);
}
main();
