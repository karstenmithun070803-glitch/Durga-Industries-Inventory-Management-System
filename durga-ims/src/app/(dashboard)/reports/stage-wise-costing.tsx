"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  getStageWiseCostingData,
  getMaterialWiseCostingData,
} from "@/lib/actions/reports.actions";
import type {
  StageWiseCostingRow,
  MaterialWiseCostingRow,
} from "@/lib/actions/reports.actions";
import type { CompanySetting } from "@/lib/actions/settings.actions";
import { PrintButton } from "@/components/pdf/print-button";
import { StageWiseCostingDocument } from "@/components/pdf/stage-wise-costing-pdf";

function buildFYOptions(defaultFY: string) {
  const [startYear] = defaultFY.split("-").map(Number);
  return Array.from({ length: 5 }, (_, i) => {
    const y = startYear - i;
    const label = `${y}-${String(y + 1).slice(-2)}`;
    return { value: label, label: `FY ${label}` };
  });
}

function fmtAmt(v: number) {
  return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  return iso.split("-").reverse().join("/");
}

type RptType = "stage" | "material";

interface Props {
  vehicles: { id: string; vehicle_name: string | null; job_ref_no: string }[];
  defaultFY: string;
  companySetting?: CompanySetting;
}

export function StageWiseCostingReport({ vehicles, defaultFY, companySetting }: Props) {
  const FY_OPTIONS = buildFYOptions(defaultFY);
  const [fy, setFy] = useState(defaultFY);
  const [vehicleId, setVehicleId] = useState("");
  const [asOfDate, setAsOfDate] = useState("");
  const [rptType, setRptType] = useState<RptType>("stage");
  const [marginPct, setMarginPct] = useState(0);
  const [stageRows, setStageRows] = useState<StageWiseCostingRow[]>([]);
  const [materialRows, setMaterialRows] = useState<MaterialWiseCostingRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const fetchGenRef = useRef(0);

  const vehicleOptions = vehicles.map((v) => ({
    value: v.id,
    label: `${v.job_ref_no}${v.vehicle_name ? ` — ${v.vehicle_name}` : ""}`,
  }));

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const vehicleLabel = selectedVehicle
    ? `${selectedVehicle.job_ref_no}${selectedVehicle.vehicle_name ? ` — ${selectedVehicle.vehicle_name}` : ""}`
    : "";

  function runReport() {
    if (!vehicleId) return;
    const gen = ++fetchGenRef.current;
    setIsLoading(true);
    Promise.all([
      getStageWiseCostingData(vehicleId, fy, asOfDate || undefined),
      getMaterialWiseCostingData(vehicleId, fy, asOfDate || undefined),
    ])
      .then(([sw, mw]) => { if (gen === fetchGenRef.current) { setStageRows(sw); setMaterialRows(mw); setHasRun(true); } })
      .catch(() => { if (gen === fetchGenRef.current) toast.error("Failed to load report data."); })
      .finally(() => { if (gen === fetchGenRef.current) setIsLoading(false); });
  }

  // Auto-run on filter change — skips silently if no vehicle selected
  useEffect(() => {
    if (!vehicleId) return;
    const gen = ++fetchGenRef.current;
    const t = setTimeout(() => {
      if (gen !== fetchGenRef.current) return;
      setIsLoading(true);
      Promise.all([
        getStageWiseCostingData(vehicleId, fy, asOfDate || undefined),
        getMaterialWiseCostingData(vehicleId, fy, asOfDate || undefined),
      ])
        .then(([sw, mw]) => { if (gen === fetchGenRef.current) { setStageRows(sw); setMaterialRows(mw); setHasRun(true); } })
        .catch(() => { if (gen === fetchGenRef.current) toast.error("Failed to load report data."); })
        .finally(() => { if (gen === fetchGenRef.current) setIsLoading(false); });
    }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId, fy, asOfDate]);

  // Apply margin client-side — no re-fetch needed
  const displayStageRows = useMemo(
    () => stageRows.map((r) => ({ ...r, amount: r.base_amount * (1 + marginPct / 100) })),
    [stageRows, marginPct]
  );
  const displayMaterialRows = useMemo(
    () => materialRows.map((r) => ({ ...r, amount: r.base_amount * (1 + marginPct / 100) })),
    [materialRows, marginPct]
  );


  const activeRows = rptType === "stage" ? displayStageRows : displayMaterialRows;
  const grandTotal = activeRows.reduce((s, r) => s + r.amount, 0);

  function downloadCsv() {
    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const safeVal = (v: string) => (v.match(/^[=+\-@]/) ? `'${v}` : v);
    let headers: string[];
    let csvRows: string[][];
    if (rptType === "stage") {
      headers = ["Code", "Stage Name", "Amount (Incl. Tax)"];
      csvRows = displayStageRows.map((r) => [
        safeVal(r.code),
        safeVal(r.name),
        r.amount.toFixed(2),
      ]);
    } else {
      headers = ["S.No", "Material No", "Name", "Stages", "Amount (Incl. Tax)"];
      csvRows = displayMaterialRows.map((r, i) => [
        String(i + 1), safeVal(r.code), safeVal(r.name), safeVal(r.stages), r.amount.toFixed(2),
      ]);
    }
    const bom = "﻿";
    const csv =
      bom +
      [headers, ...csvRows]
        .map((row) => row.map((v) => escape(v)).join(","))
        .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stage-wise-costing-${vehicleLabel.replace(/[^a-z0-9]/gi, "_")}-${fy}${asOfDate ? `-as-of-${asOfDate}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const canRun = !!vehicleId;
  const hasData = activeRows.length > 0;

  return (
    <div className="p-6 flex flex-col gap-5 h-full">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Stage Wise Costing</h2>
        <p className="text-sm text-slate-500 mt-0.5">Material cost breakdown by stage or material for a vehicle</p>
        <p className="text-xs text-slate-400 mt-0.5">Stage-wise view shows VMI New (stage-based) issues only.</p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap gap-4 items-end">
        <div className="space-y-1 w-44">
          <label className="text-xs font-medium text-slate-600">Financial Year</label>
          <Combobox options={FY_OPTIONS} value={fy} onChange={setFy} placeholder="Select FY" />
        </div>
        <div className="space-y-1 w-56">
          <label className="text-xs font-medium text-slate-600">Vehicle <span className="text-rose-500">*</span></label>
          <Combobox
            options={vehicleOptions}
            value={vehicleId}
            onChange={setVehicleId}
            placeholder="Select vehicle"
            openOnArrowDown
          />
        </div>

        <div className="space-y-1 w-36">
          <label className="text-xs font-medium text-slate-600">As Of Date</label>
          <Input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="h-9 text-sm"
          />
        </div>

        {/* Report Type toggle */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Report Type</label>
          <div className="flex rounded-md border border-slate-200 overflow-hidden h-9">
            {(["stage", "material"] as RptType[]).map((t) => (
              <button
                key={t}
                onClick={() => setRptType(t)}
                className={cn(
                  "px-3 text-xs font-medium transition-colors",
                  rptType === t
                    ? "bg-slate-800 text-white"
                    : "bg-white text-slate-500 hover:bg-slate-50"
                )}
              >
                {t === "stage" ? "Stage Wise" : "Material Wise"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1 w-28">
          <label className="text-xs font-medium text-slate-600">Margin %</label>
          <Input
            type="number"
            step="0.01"
            value={marginPct}
            onChange={(e) => setMarginPct(parseFloat(e.target.value) || 0)}
            className="h-9 text-sm"
          />
        </div>

        <Button onClick={runReport} disabled={!canRun || isLoading} className="h-9">
          {isLoading ? "Loading…" : "Refresh"}
        </Button>
      </div>

      {/* Results */}
      {!hasRun ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
          {isLoading ? "Loading…" : "Select a vehicle and financial year to view stage-wise costs"}
        </div>
      ) : activeRows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
          No stage-based (VMI New) material slips found for {vehicleLabel} in FY {fy}{asOfDate && ` as of ${fmtDate(asOfDate)}`}
        </div>
      ) : (
        <>
          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={downloadCsv} disabled={!hasData}>
              Export CSV
            </Button>
            <PrintButton
              label="Print"
              disabled={!hasData}
              getDocument={() => (
                <StageWiseCostingDocument
                  stageRows={displayStageRows}
                  materialRows={displayMaterialRows}
                  rptType={rptType}
                  vehicleName={vehicleLabel}
                  fy={fy}
                  marginPct={marginPct}
                  companySetting={companySetting}
                  asOfDate={asOfDate || undefined}
                />
              )}
            />
          </div>

          {/* Table */}
          <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-lg overflow-auto">
            {rptType === "stage" ? (
              <table className="min-w-max w-full text-xs">
                <thead className="bg-slate-700 text-white sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-medium w-24">Code</th>
                    <th className="px-3 py-2.5 text-left font-medium">Stage Name</th>
                    <th className="px-3 py-2.5 text-right font-medium w-40">Amount (Incl. Tax)</th>
                  </tr>
                </thead>
                <tbody>
                  {displayStageRows.map((r) => (
                    <tr
                      key={r.code}
                      className={cn(
                        "border-t border-slate-100 hover:bg-slate-50/50",
                        r.is_direct && "bg-amber-50/60 italic"
                      )}
                    >
                      <td className="px-3 py-1.5 font-mono text-slate-500">{r.code}</td>
                      <td className="px-3 py-1.5 text-slate-700">{r.name}</td>
                      <td className="px-3 py-1.5 text-right font-medium text-slate-800">{fmtAmt(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-100 sticky bottom-0">
                  <tr className="border-t-2 border-slate-300 font-semibold text-slate-800">
                    <td colSpan={2} className="px-3 py-2 text-right">TOTAL</td>
                    <td className="px-3 py-2 text-right">{fmtAmt(grandTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <table className="min-w-max w-full text-xs">
                <thead className="bg-slate-700 text-white sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-medium w-12">S.No</th>
                    <th className="px-3 py-2.5 text-left font-medium w-20">Mat. No</th>
                    <th className="px-3 py-2.5 text-left font-medium">Material Name</th>
                    <th className="px-3 py-2.5 text-left font-medium w-48">Stages</th>
                    <th className="px-3 py-2.5 text-right font-medium w-40">Amount (Incl. Tax)</th>
                  </tr>
                </thead>
                <tbody>
                  {displayMaterialRows.map((r, i) => (
                    <tr key={r.code + i} className="border-t border-slate-100 hover:bg-slate-50/50">
                      <td className="px-3 py-1.5 text-slate-500">{i + 1}</td>
                      <td className="px-3 py-1.5 font-mono text-slate-600">{r.code}</td>
                      <td className="px-3 py-1.5 text-slate-700">{r.name}</td>
                      <td className="px-3 py-1.5 text-slate-400 text-xs">{r.stages || "—"}</td>
                      <td className="px-3 py-1.5 text-right font-medium text-slate-800">{fmtAmt(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-100 sticky bottom-0">
                  <tr className="border-t-2 border-slate-300 font-semibold text-slate-800">
                    <td colSpan={4} className="px-3 py-2 text-right">TOTAL</td>
                    <td className="px-3 py-2 text-right">{fmtAmt(grandTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
