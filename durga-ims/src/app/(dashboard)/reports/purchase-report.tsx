"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getPurchaseReport } from "@/lib/actions/reports.actions";
import type { PurchaseReportRow } from "@/lib/actions/reports.actions";
import type { CompanySetting } from "@/lib/actions/settings.actions";

function buildFYOptions(currentFY: string) {
  const [startYear] = currentFY.split("-").map(Number);
  return Array.from({ length: 5 }, (_, i) => {
    const y = startYear - i;
    const label = `${y}-${y + 1}`;
    return { value: label, label: `FY ${label}` };
  });
}

const STATUS_OPTIONS = [
  { value: "Received", label: "Received Only" },
  { value: "All", label: "All Statuses" },
  { value: "Draft", label: "Draft Only" },
];

function fmtAmt(v: number) {
  return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQty(v: number) {
  return v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

interface Props {
  suppliers: { id: string; name: string }[];
  materials: { id: string; name: string; material_no: number }[];
  currentFY: string;
  companySetting?: CompanySetting;
}

export function PurchaseReport({ suppliers, materials, currentFY, companySetting }: Props) {
  const FY_OPTIONS = buildFYOptions(currentFY);
  const [fy, setFy] = useState(currentFY);
  const [status, setStatus] = useState("Received");
  const [supplierId, setSupplierId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rows, setRows] = useState<PurchaseReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const supplierOptions = suppliers.map((s) => ({ value: s.id, label: s.name }));
  const materialOptions = materials.map((m) => ({
    value: m.id,
    label: `M-${String(m.material_no).padStart(4, "0")} — ${m.name}`,
  }));

  async function runReport() {
    setIsLoading(true);
    try {
      const data = await getPurchaseReport({
        fy,
        status: status === "All" ? undefined : status,
        supplierId: supplierId || undefined,
        materialId: materialId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setRows(data);
      setHasRun(true);
    } catch {
      toast.error("Failed to load report data.");
    } finally {
      setIsLoading(false);
    }
  }

  const totals = useMemo(() => {
    const active = rows.filter((r) => r.status === "Received");
    return {
      qty: active.reduce((s, r) => s + r.qty, 0),
      taxable: active.reduce((s, r) => s + r.taxable_amount, 0),
      cgst: active.reduce((s, r) => s + r.cgst_amount, 0),
      sgst: active.reduce((s, r) => s + r.sgst_amount, 0),
      igst: active.reduce((s, r) => s + r.igst_amount, 0),
      total: active.reduce((s, r) => s + r.total_amount, 0),
    };
  }, [rows]);

  function downloadCsv() {
    const headers = [
      "PO #", "Date", "Supplier Bill No.", "Supplier Bill Date", "Supplier", "Material", "Qty", "Unit", "Rate",
      "Taxable Amount", "CGST", "SGST", "IGST", "Total Amount", "Stock Updated", "Status",
    ];
    const csvRows = rows.map((r) => [
      r.po_number, r.po_date, r.supplier_bill_no ?? "", r.supplier_bill_date ?? "",
      r.supplier_name ?? "", r.material_name,
      r.qty.toFixed(3), r.unit_name ?? "", r.rate.toFixed(2),
      r.taxable_amount.toFixed(2), r.cgst_amount.toFixed(2),
      r.sgst_amount.toFixed(2), r.igst_amount.toFixed(2),
      r.total_amount.toFixed(2), r.affects_stock ? "Yes" : "No", r.status,
    ]);
    const bom = "﻿";
    const csv = bom + [headers, ...csvRows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `purchase-report-${fy}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 flex flex-col gap-5 h-full">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Purchase Report</h2>
        <p className="text-sm text-slate-500 mt-0.5">Input tax credit tracking and supplier spend analysis</p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap gap-4 items-end">
        <div className="space-y-1 w-44">
          <label className="text-xs font-medium text-slate-600">Financial Year</label>
          <Combobox options={FY_OPTIONS} value={fy} onChange={setFy} placeholder="Select FY" />
        </div>
        <div className="space-y-1 w-44">
          <label className="text-xs font-medium text-slate-600">Status</label>
          <Combobox options={STATUS_OPTIONS} value={status} onChange={setStatus} placeholder="Status" />
        </div>
        <div className="space-y-1 w-52">
          <label className="text-xs font-medium text-slate-600">Supplier (optional)</label>
          <Combobox
            options={[{ value: "", label: "All Suppliers" }, ...supplierOptions]}
            value={supplierId}
            onChange={setSupplierId}
            placeholder="All Suppliers"
          />
        </div>
        <div className="space-y-1 w-52">
          <label className="text-xs font-medium text-slate-600">Material (optional)</label>
          <Combobox
            options={[{ value: "", label: "All Materials" }, ...materialOptions]}
            value={materialId}
            onChange={setMaterialId}
            placeholder="All Materials"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Date From</label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-sm w-36" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Date To</label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-sm w-36" />
        </div>
        <div className="flex gap-2 items-end">
          <Button onClick={runReport} disabled={isLoading} className="h-9">
            {isLoading ? "Loading…" : "Run Report"}
          </Button>
          {(supplierId || materialId || dateFrom || dateTo || status !== "Received" || fy !== currentFY) && (
            <button
              onClick={() => { setSupplierId(""); setMaterialId(""); setDateFrom(""); setDateTo(""); setStatus("Received"); setFy(currentFY); }}
              className="text-xs text-blue-600 underline h-9 px-1"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      {!hasRun ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
          Set filters and click Run Report
        </div>
      ) : rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
          No purchase orders found for the selected filters.
        </div>
      ) : (
        <>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={downloadCsv}>
              Export CSV ({rows.length})
            </Button>
          </div>

          <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-lg overflow-auto">
            <table className="min-w-max w-full text-xs">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap">PO #</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap">Date</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap">Supplier Bill</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap">Supplier</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap">Material</th>
                  <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap">Qty</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap">Unit</th>
                  <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap">Rate</th>
                  <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap">Taxable</th>
                  <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap">CGST</th>
                  <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap">SGST</th>
                  <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap">IGST</th>
                  <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap">Total</th>
                  <th className="px-3 py-2.5 text-center font-medium text-slate-600 whitespace-nowrap">Stock Updated</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={`${r.id}-${r.material_no}`}
                    className="border-t border-slate-100 hover:bg-slate-50/50"
                  >
                    <td className="px-3 py-1.5 whitespace-nowrap font-medium text-slate-800">PO-{String(r.po_number).padStart(4, "0")}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-slate-500">{r.po_date}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-slate-500">
                      {r.supplier_bill_no ? (
                        <span title={r.supplier_bill_date ?? undefined}>{r.supplier_bill_no}</span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-slate-600">{r.supplier_name ?? "—"}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-slate-600">{r.material_name}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-right">{fmtQty(r.qty)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-slate-500">{r.unit_name ?? "—"}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-right">{fmtAmt(r.rate)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-right">{fmtAmt(r.taxable_amount)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-right">{r.cgst_amount > 0 ? fmtAmt(r.cgst_amount) : "—"}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-right">{r.sgst_amount > 0 ? fmtAmt(r.sgst_amount) : "—"}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-right">{r.igst_amount > 0 ? fmtAmt(r.igst_amount) : "—"}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-right font-semibold text-slate-800">{fmtAmt(r.total_amount)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-center">
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-xs font-medium",
                        r.affects_stock ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
                      )}>
                        {r.affects_stock ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-xs font-medium",
                        r.status === "Received" ? "bg-green-100 text-green-700"
                        : r.status === "Draft" ? "bg-slate-100 text-slate-600"
                        : "bg-amber-100 text-amber-700"
                      )}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-100 sticky bottom-0">
                <tr className="font-semibold text-slate-800 border-t-2 border-slate-300">
                  <td colSpan={4} className="px-3 py-2 whitespace-nowrap text-right text-slate-500 font-medium">
                    TOTAL {rows.filter((r) => r.status !== "Received").length > 0 && "(Received only)"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">{fmtQty(totals.qty)}</td>
                  <td />
                  <td />
                  <td className="px-3 py-2 whitespace-nowrap text-right">{fmtAmt(totals.taxable)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">{totals.cgst > 0 ? fmtAmt(totals.cgst) : "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">{totals.sgst > 0 ? fmtAmt(totals.sgst) : "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">{totals.igst > 0 ? fmtAmt(totals.igst) : "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right text-slate-900">{fmtAmt(totals.total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
