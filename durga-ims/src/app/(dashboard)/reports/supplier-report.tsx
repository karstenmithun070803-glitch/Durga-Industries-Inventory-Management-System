"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { toast } from "sonner";
import { getSupplierMaterialReport } from "@/lib/actions/reports.actions";
import type { SupplierMaterialRow } from "@/lib/actions/reports.actions";
import { fyToMonthRange } from "@/lib/fy";

function fmtAmt(v: number) {
  return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQty(v: number) {
  return v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function monthToLabel(yyyyMM: string): string {
  const [y, m] = yyyyMM.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

interface Props {
  suppliers: { id: string; name: string }[];
  materials: { id: string; name: string; material_no: number }[];
  defaultFY: string;
}

export function SupplierReport({ suppliers, materials, defaultFY }: Props) {
  const range = fyToMonthRange(defaultFY);

  const [fromMonth, setFromMonth] = useState(range.from);
  const [toMonth, setToMonth] = useState(range.to);
  const [supplierId, setSupplierId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [rows, setRows] = useState<SupplierMaterialRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    const r = fyToMonthRange(defaultFY);
    setFromMonth(r.from);
    setToMonth(r.to);
  }, [defaultFY]);

  const supplierOptions = [
    { value: "", label: "All Suppliers" },
    ...suppliers.map((s) => ({ value: s.id, label: s.name })),
  ];

  const materialOptions = [
    { value: "", label: "All Materials" },
    ...materials.map((m) => ({ value: m.id, label: m.name })),
  ];

  async function handleRun() {
    if (!fromMonth || !toMonth) {
      toast.error("Select both From and To months.");
      return;
    }
    if (fromMonth > toMonth) {
      toast.error("From month must be before To month.");
      return;
    }
    setLoading(true);
    try {
      const fromDate = fromMonth + "-01";
      // Last day of toMonth
      const [ty, tm] = toMonth.split("-").map(Number);
      const lastDay = new Date(ty, tm, 0).getDate();
      const toDate = `${toMonth}-${String(lastDay).padStart(2, "0")}`;

      const data = await getSupplierMaterialReport({
        fromDate,
        toDate,
        supplierId: supplierId || undefined,
        materialId: materialId || undefined,
      });
      setRows(data);
      setHasRun(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }

  function handleExportCSV() {
    const headers = ["Supplier", "Material", "Month", "Qty", "Amount"];
    const csvRows = rows.map((r) => [
      r.supplier_name,
      r.material_name,
      r.month,
      r.total_qty.toFixed(3),
      r.total_amount.toFixed(2),
    ]);
    const bom = "﻿";
    const csv = bom + [headers, ...csvRows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `supplier-report-${fromMonth}-to-${toMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Totals
  const totalQty = rows.reduce((s, r) => s + r.total_qty, 0);
  const totalAmt = rows.reduce((s, r) => s + r.total_amount, 0);

  return (
    <div className="p-6 flex flex-col gap-5 h-full overflow-auto">
      <div>
        <h2 className="text-base font-semibold text-slate-800">Supplier Monthly Report</h2>
        <p className="text-sm text-slate-500 mt-0.5">Purchase quantities and amounts by supplier, material, and month</p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">From Month</label>
          <input
            type="month"
            value={fromMonth}
            onChange={(e) => setFromMonth(e.target.value)}
            className="h-9 px-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">To Month</label>
          <input
            type="month"
            value={toMonth}
            onChange={(e) => setToMonth(e.target.value)}
            className="h-9 px-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>
        <div className="flex flex-col gap-1 w-52">
          <label className="text-xs font-medium text-slate-500">Supplier</label>
          <Combobox
            options={supplierOptions}
            value={supplierId}
            onChange={setSupplierId}
            placeholder="All Suppliers"
            searchPlaceholder="Search supplier..."
          />
        </div>
        <div className="flex flex-col gap-1 w-52">
          <label className="text-xs font-medium text-slate-500">Material</label>
          <Combobox
            options={materialOptions}
            value={materialId}
            onChange={setMaterialId}
            placeholder="All Materials"
            searchPlaceholder="Search material..."
          />
        </div>
        <Button onClick={handleRun} disabled={loading} className="h-9">
          {loading ? "Loading…" : "Run Report"}
        </Button>
      </div>

      {/* Results */}
      {hasRun && (
        <div className="bg-white border border-slate-200 rounded-lg flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-sm text-slate-500">{rows.length} row{rows.length !== 1 ? "s" : ""}</span>
            {rows.length > 0 && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleExportCSV}>
                Export CSV
              </Button>
            )}
          </div>

          {rows.length === 0 ? (
            <p className="text-sm text-slate-400 py-12 text-center">No data found for the selected period.</p>
          ) : (
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap">Supplier</th>
                    <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap">Material</th>
                    <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap">Month</th>
                    <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap">Qty</th>
                    <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 whitespace-nowrap text-slate-800">{r.supplier_name}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-700">{r.material_name}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500">{monthToLabel(r.month)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">{fmtQty(r.total_qty)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums font-medium">{fmtAmt(r.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-300 bg-slate-50">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-right font-semibold text-slate-600 text-sm">TOTAL</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">{fmtQty(totalQty)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">{fmtAmt(totalAmt)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
