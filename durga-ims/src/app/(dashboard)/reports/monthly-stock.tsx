"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getMonthlyStockReport } from "@/lib/actions/reports.actions";
import { fyDateRange } from "@/lib/fy";
import type { MonthlyStockRow } from "@/lib/actions/reports.actions";
import type { CompanySetting } from "@/lib/actions/settings.actions";
import { PrintButton } from "@/components/pdf/print-button";

function fmtQty(v: number) {
  return v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function fmtAmt(v: number) {
  return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtSigned(v: number) {
  if (v === 0) return "—";
  const abs = Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  return v > 0 ? `+${abs}` : `-${abs}`;
}

function currentMonthStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthToDateRange(monthStr: string): { from: string; to: string } {
  const [year, month] = monthStr.split("-").map(Number);
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
  return { from, to };
}

interface Props {
  materials: { id: string; name: string; material_no: number }[];
  defaultFY: string;
  companySetting?: CompanySetting;
}

function fyToMonthRange(fy: string): { from: string; to: string } {
  const { start, end } = fyDateRange(fy);
  const from = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
  const to = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}`;
  return { from, to };
}

export function MonthlyStockReport({ materials, defaultFY, companySetting }: Props) {
  const initialRange = fyToMonthRange(defaultFY);
  const [fromMonth, setFromMonth] = useState(initialRange.from);
  const [toMonth, setToMonth] = useState(initialRange.to);

  // When the global FY switcher changes, reset the date range to that FY
  useEffect(() => {
    const range = fyToMonthRange(defaultFY);
    setFromMonth(range.from);
    setToMonth(range.to);
  }, [defaultFY]);
  const [materialId, setMaterialId] = useState("");
  const [showPrices, setShowPrices] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [rows, setRows] = useState<MonthlyStockRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const fetchGenRef = useRef(0);

  const materialOptions = materials.map((m) => ({
    value: m.id,
    label: `M-${String(m.material_no).padStart(4, "0")} — ${m.name}`,
  }));

  function runReport() {
    if (fromMonth > toMonth) {
      toast.error("From month cannot be after To month.");
      return;
    }
    const gen = ++fetchGenRef.current;
    setIsLoading(true);
    const { from } = monthToDateRange(fromMonth);
    const { to } = monthToDateRange(toMonth);
    getMonthlyStockReport({ fromDate: from, toDate: to, materialId: materialId || undefined })
      .then((data) => { if (gen === fetchGenRef.current) { setRows(data); setHasRun(true); } })
      .catch(() => { if (gen === fetchGenRef.current) { toast.error("Failed to load report data."); } })
      .finally(() => { if (gen === fetchGenRef.current) setIsLoading(false); });
  }

  // Auto-run on mount and whenever filters change
  useEffect(() => {
    if (fromMonth > toMonth) {
      toast.error("From month cannot be after To month.");
      return;
    }
    const gen = ++fetchGenRef.current;
    const t = setTimeout(() => {
      if (gen !== fetchGenRef.current) return;
      setIsLoading(true);
      const { from } = monthToDateRange(fromMonth);
      const { to } = monthToDateRange(toMonth);
      getMonthlyStockReport({ fromDate: from, toDate: to, materialId: materialId || undefined })
        .then((data) => { if (gen === fetchGenRef.current) { setRows(data); setHasRun(true); } })
        .catch(() => { if (gen === fetchGenRef.current) { toast.error("Failed to load report data."); } })
        .finally(() => { if (gen === fetchGenRef.current) setIsLoading(false); });
    }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromMonth, toMonth, materialId]);

  const totals = useMemo(() => ({
    opening: rows.reduce((s, r) => s + r.opening_stock, 0),
    inward: rows.reduce((s, r) => s + r.po_inward, 0),
    issues: rows.reduce((s, r) => s + r.issues, 0),
    reversals: rows.reduce((s, r) => s + r.reversals, 0),
    adjustments: rows.reduce((s, r) => s + r.adjustments, 0),
    closing: rows.reduce((s, r) => s + r.closing_stock, 0),
  }), [rows]);

  const hasMultipleUnits = useMemo(() => {
    const unitSet = new Set(rows.map((r) => r.unit_name ?? "—"));
    return unitSet.size > 1;
  }, [rows]);

  function downloadCsv() {
    const baseHeaders = showDetails
      ? ["Material", "Unit", "Opening", "PO Inward", "Issues", "Reversals", "Adjustments", "Closing"]
      : ["Material", "Unit", "Opening", "PO Inward", "Issues", "Closing"];
    const headers = showPrices ? [...baseHeaders, "Last Rate", "Closing Value"] : baseHeaders;

    const csvRows = rows.map((r) => {
      const base = [
        `M-${String(r.material_no).padStart(4, "0")} ${r.material_name}`,
        r.unit_name ?? "",
        r.opening_stock.toFixed(3),
        r.po_inward.toFixed(3),
        r.issues.toFixed(3),
        ...(showDetails ? [
          r.reversals >= 0 ? `+${r.reversals.toFixed(3)}` : r.reversals.toFixed(3),
          r.adjustments >= 0 ? `+${r.adjustments.toFixed(3)}` : r.adjustments.toFixed(3),
        ] : []),
        r.closing_stock.toFixed(3),
      ];
      if (showPrices) {
        const rate = r.last_po_rate ?? r.standard_cost;
        base.push(rate !== null ? rate.toFixed(2) : "");
        base.push(rate !== null ? (r.closing_stock * rate).toFixed(2) : "");
      }
      return base;
    });

    const bom = "﻿";
    const csv = bom + [headers, ...csvRows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `monthly-stock-${fromMonth}-to-${toMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 flex flex-col gap-5 h-full">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Monthly Stock Report</h2>
        <p className="text-sm text-slate-600 mt-0.5">Warehouse stock movement by period — what came in, what was used, and what remains</p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap gap-4 items-end">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">From Month</label>
          <input
            type="month"
            value={fromMonth}
            onChange={(e) => setFromMonth(e.target.value)}
            className="h-9 text-sm w-36 border border-input rounded-md px-3 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">To Month</label>
          <input
            type="month"
            value={toMonth}
            onChange={(e) => setToMonth(e.target.value)}
            className="h-9 text-sm w-36 border border-input rounded-md px-3 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="space-y-1 w-64">
          <label className="text-xs font-medium text-slate-600">Material (optional)</label>
          <Combobox
            options={[{ value: "", label: "All Materials" }, ...materialOptions]}
            value={materialId}
            onChange={setMaterialId}
            placeholder="All Materials"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600 block">Show Prices</label>
          <button
            type="button"
            onClick={() => setShowPrices((p) => !p)}
            className={cn(
              "h-9 px-4 rounded-md text-sm font-medium border transition-colors",
              showPrices
                ? "bg-slate-800 text-white border-slate-800"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
            )}
          >
            {showPrices ? "Prices On" : "Prices Off"}
          </button>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600 block">Details</label>
          <button
            type="button"
            onClick={() => setShowDetails((d) => !d)}
            className={cn(
              "h-9 px-4 rounded-md text-sm font-medium border transition-colors",
              showDetails
                ? "bg-slate-800 text-white border-slate-800"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
            )}
          >
            {showDetails ? "Details On" : "Show Details"}
          </button>
        </div>
        <div className="flex gap-2 items-end">
          <Button onClick={runReport} disabled={isLoading} className="h-9">
            {isLoading ? "Loading…" : "Run Report"}
          </Button>
          {(materialId || showPrices || fromMonth !== currentMonthStr() || toMonth !== currentMonthStr()) && (
            <button
              onClick={() => { setMaterialId(""); setShowPrices(false); setFromMonth(currentMonthStr()); setToMonth(currentMonthStr()); }}
              className="text-xs text-blue-600 underline h-9 px-1"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      {!hasRun ? (
        <div className="flex-1 flex items-center justify-center text-slate-700 text-sm">
          {isLoading ? "Loading…" : "Set filters and click Run Report"}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-700 text-sm">
          No active materials found.
        </div>
      ) : (
        <>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={downloadCsv}>
              Export CSV
            </Button>
            <PrintButton
              label="Print"
              hotkey="mod+p"
              getDocument={async () => {
                const { MonthlyStockReportDocument } = await import("@/components/pdf/monthly-stock-report-pdf");
                return (
                  <MonthlyStockReportDocument
                    rows={rows}
                    fromMonth={fromMonth}
                    toMonth={toMonth}
                    showDetails={showDetails}
                    showPrices={showPrices}
                    materialName={materialId ? materials.find((m) => m.id === materialId)?.name : undefined}
                    companySetting={companySetting}
                  />
                );
              }}
            />
          </div>

          <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-lg overflow-auto">
            <table className="min-w-max w-full text-xs">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-800 whitespace-nowrap">Material</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-800 whitespace-nowrap">Unit</th>
                  <th className="px-3 py-2.5 text-right font-medium text-slate-800 whitespace-nowrap">Opening</th>
                  <th className="px-3 py-2.5 text-right font-medium text-slate-800 whitespace-nowrap">PO Inward</th>
                  <th className="px-3 py-2.5 text-right font-medium text-slate-800 whitespace-nowrap">Issues</th>
                  {showDetails && (
                    <>
                      <th className="px-3 py-2.5 text-right font-medium text-slate-800 whitespace-nowrap">Reversals</th>
                      <th className="px-3 py-2.5 text-right font-medium text-slate-800 whitespace-nowrap">Adjustments</th>
                    </>
                  )}
                  <th className="px-3 py-2.5 text-right font-medium text-slate-800 whitespace-nowrap">Closing</th>
                  {showPrices && (
                    <>
                      <th className="px-3 py-2.5 text-right font-medium text-slate-800 whitespace-nowrap">Last Rate</th>
                      <th className="px-3 py-2.5 text-right font-medium text-slate-800 whitespace-nowrap">Closing Value</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const effectiveRate = r.last_po_rate ?? r.standard_cost;
                  const isStdRate = r.last_po_rate === null && r.standard_cost !== null;
                  const closingValue = showPrices && effectiveRate !== null
                    ? r.closing_stock * effectiveRate
                    : null;
                  return (
                    <tr key={r.material_id} className="border-t border-slate-200 hover:bg-rowhover">
                      <td className="px-3 py-1.5 whitespace-nowrap text-slate-800">
                        <span className="font-mono text-slate-700 mr-1.5">
                          M-{String(r.material_no).padStart(4, "0")}
                        </span>
                        {r.material_name}
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-slate-800">{r.unit_name ?? "—"}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-right tabular-nums text-slate-800">{fmtQty(r.opening_stock)}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-right tabular-nums text-blue-700">
                        {r.po_inward > 0 ? `+${fmtQty(r.po_inward)}` : "—"}
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-right tabular-nums text-orange-700">
                        {r.issues > 0 ? `-${fmtQty(r.issues)}` : "—"}
                      </td>
                      {showDetails && (
                        <>
                          <td className={cn(
                            "px-3 py-1.5 whitespace-nowrap text-right tabular-nums",
                            r.reversals > 0 ? "text-purple-700" : r.reversals < 0 ? "text-rose-700" : "text-slate-700"
                          )}>
                            {fmtSigned(r.reversals)}
                          </td>
                          <td className={cn(
                            "px-3 py-1.5 whitespace-nowrap text-right tabular-nums",
                            r.adjustments > 0 ? "text-green-700" : r.adjustments < 0 ? "text-rose-700" : "text-slate-700"
                          )}>
                            {fmtSigned(r.adjustments)}
                          </td>
                        </>
                      )}
                      <td className={cn(
                        "px-3 py-1.5 whitespace-nowrap text-right tabular-nums font-semibold",
                        r.closing_stock < 0 ? "text-rose-600" : "text-slate-900"
                      )}>
                        {fmtQty(r.closing_stock)}
                      </td>
                      {showPrices && (
                        <>
                          <td className="px-3 py-1.5 whitespace-nowrap text-right tabular-nums text-slate-800">
                            {effectiveRate !== null ? (
                              <span className="inline-flex items-center gap-1 justify-end">
                                {fmtAmt(effectiveRate)}
                                {isStdRate && <span className="text-[10px] font-medium text-slate-700 bg-slate-100 px-1 rounded">Std</span>}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="px-3 py-1.5 whitespace-nowrap text-right tabular-nums font-medium text-slate-800">
                            {closingValue !== null ? fmtAmt(closingValue) : "—"}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-100 sticky bottom-0">
                {hasMultipleUnits ? (
                  <tr className="border-t-2 border-slate-300">
                    <td colSpan={6 + (showDetails ? 2 : 0) + (showPrices ? 2 : 0)} className="px-3 py-2 text-center text-xs text-slate-600 italic">
                      Unit-wise total not shown — multiple units in this report. Filter by a single material or unit for a meaningful total.
                    </td>
                  </tr>
                ) : (
                  <tr className="font-semibold text-slate-800 border-t-2 border-slate-300">
                    <td colSpan={2} className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-slate-800 font-medium">TOTAL</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">{fmtQty(totals.opening)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-blue-700">
                      {totals.inward > 0 ? `+${fmtQty(totals.inward)}` : "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-orange-700">
                      {totals.issues > 0 ? `-${fmtQty(totals.issues)}` : "—"}
                    </td>
                    {showDetails && (
                      <>
                        <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">{fmtSigned(totals.reversals)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">{fmtSigned(totals.adjustments)}</td>
                      </>
                    )}
                    <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-slate-900">{fmtQty(totals.closing)}</td>
                    {showPrices && <td colSpan={2} />}
                  </tr>
                )}
                {!showDetails && (
                  <tr>
                    <td colSpan={6 + (showPrices ? 2 : 0)} className="px-3 py-1 text-center text-[10px] text-slate-700 italic border-t border-slate-200">
                      Reversals and Adjustments columns hidden — toggle Show Details to view.
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
