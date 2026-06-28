"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { getVehicleComparisonData } from "@/lib/actions/reports.actions";
import type { VehicleComparisonRow } from "@/lib/actions/reports.actions";
import type { CompanySetting } from "@/lib/actions/settings.actions";
import { PrintButton } from "@/components/pdf/print-button";
import { VehicleComparisonDocument } from "@/components/pdf/vehicle-comparison-pdf";

function buildFYOptions(defaultFY: string) {
  const [startYear] = defaultFY.split("-").map(Number);
  return Array.from({ length: 5 }, (_, i) => {
    const y = startYear - i;
    const label = `${y}-${y + 1}`;
    return { value: label, label: `FY ${label}` };
  });
}

function fmtAmt(v: number) {
  return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQty(v: number) {
  return v.toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

interface Props {
  vehicles: { id: string; vehicle_name: string | null; job_ref_no: string }[];
  stages: { id: string; stage_code: string; stage_name: string }[];
  defaultFY: string;
  companySetting?: CompanySetting;
}

export function VehicleComparisonReport({ vehicles, stages, defaultFY, companySetting }: Props) {
  const FY_OPTIONS = buildFYOptions(defaultFY);
  const [fy, setFy] = useState(defaultFY);
  const [v1Id, setV1Id] = useState("");
  const [v2Id, setV2Id] = useState("");
  const [stageId, setStageId] = useState("");
  const [showDiffOnly, setShowDiffOnly] = useState(false);
  const [hideAmounts, setHideAmounts] = useState(false);
  const [allRows, setAllRows] = useState<VehicleComparisonRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const vehicleOptions = vehicles.map((v) => ({
    value: v.id,
    label: `${v.job_ref_no}${v.vehicle_name ? ` — ${v.vehicle_name}` : ""}`,
  }));

  const stageOptions = [
    { value: "", label: "All Stages" },
    ...stages.map((s) => ({ value: s.id, label: `${s.stage_code} — ${s.stage_name}` })),
  ];

  const v1Label = vehicles.find((v) => v.id === v1Id)
    ? `${vehicles.find((v) => v.id === v1Id)!.job_ref_no}${vehicles.find((v) => v.id === v1Id)!.vehicle_name ? ` — ${vehicles.find((v) => v.id === v1Id)!.vehicle_name}` : ""}`
    : "";
  const v2Label = vehicles.find((v) => v.id === v2Id)
    ? `${vehicles.find((v) => v.id === v2Id)!.job_ref_no}${vehicles.find((v) => v.id === v2Id)!.vehicle_name ? ` — ${vehicles.find((v) => v.id === v2Id)!.vehicle_name}` : ""}`
    : "";
  const stageLabel = stageId ? (stages.find((s) => s.id === stageId)?.stage_name ?? "Unknown") : "All Stages";

  function runCompare() {
    if (!v1Id || !v2Id) return;
    if (v1Id === v2Id) {
      toast.error("Please select two different vehicles to compare.");
      return;
    }
    setIsLoading(true);
    getVehicleComparisonData(v1Id, v2Id, fy, stageId || null)
      .then((rows) => { setAllRows(rows); setHasRun(true); })
      .catch((err) => { console.error("Vehicle comparison error:", err); toast.error("Failed to load comparison data."); })
      .finally(() => setIsLoading(false));
  }

  // Client-side filter — no re-fetch
  const displayRows = useMemo(
    () => (showDiffOnly ? allRows.filter((r) => r.diff !== 0) : allRows),
    [allRows, showDiffOnly]
  );

  function downloadCsv() {
    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const safeVal = (v: string) => (v.match(/^[=+\-@]/) ? `'${v}` : v);
    const headers = hideAmounts
      ? ["S.No", "Material Name", "Stage", `Qty (${v1Label})`, `Qty (${v2Label})`, "Diff"]
      : ["S.No", "Material Name", "Stage", `Qty (${v1Label})`, `Amt (${v1Label})`, `Qty (${v2Label})`, `Amt (${v2Label})`, "Diff"];
    const csvRows = displayRows.map((r, i) =>
      hideAmounts
        ? [String(i + 1), safeVal(r.material_name), safeVal(r.stage_name), fmtQty(r.qty1), fmtQty(r.qty2), r.diff.toFixed(3)]
        : [String(i + 1), safeVal(r.material_name), safeVal(r.stage_name), fmtQty(r.qty1), r.amt1.toFixed(2), fmtQty(r.qty2), r.amt2.toFixed(2), r.diff.toFixed(3)]
    );
    const bom = "﻿";
    const csv = bom + [headers, ...csvRows].map((row) => row.map((v) => escape(v)).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vehicle-comparison-${v1Label.replace(/[^a-z0-9]/gi, "_")}-vs-${v2Label.replace(/[^a-z0-9]/gi, "_")}-${fy}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const canCompare = !!v1Id && !!v2Id && v1Id !== v2Id;
  const hasData = displayRows.length > 0;

  return (
    <div className="p-6 flex flex-col gap-5 h-full">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Vehicle Comparison</h2>
        <p className="text-sm text-slate-600 mt-0.5">Compare material usage between two vehicles side by side</p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap gap-4 items-end">
        <div className="space-y-1 w-44">
          <label className="text-xs font-medium text-slate-600">Financial Year</label>
          <Combobox options={FY_OPTIONS} value={fy} onChange={setFy} placeholder="Select FY" />
        </div>
        <div className="space-y-1 w-56">
          <label className="text-xs font-medium text-slate-600">Source Vehicle <span className="text-rose-500">*</span></label>
          <Combobox options={vehicleOptions} value={v1Id} onChange={setV1Id} placeholder="Select vehicle 1" openOnArrowDown />
        </div>
        <div className="space-y-1 w-56">
          <label className="text-xs font-medium text-slate-600">Compare Vehicle <span className="text-rose-500">*</span></label>
          <Combobox options={vehicleOptions} value={v2Id} onChange={setV2Id} placeholder="Select vehicle 2" openOnArrowDown />
        </div>
        <div className="space-y-1 w-52">
          <label className="text-xs font-medium text-slate-600">Stage Filter</label>
          <Combobox options={stageOptions} value={stageId} onChange={setStageId} placeholder="All Stages" openOnArrowDown />
        </div>

        <Button onClick={runCompare} disabled={!canCompare || isLoading} className="h-9 gap-1.5">
          {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {isLoading ? "Comparing…" : "Compare"}
        </Button>
      </div>

      {/* Toggles — only show after a run */}
      {hasRun && (
        <div className="flex items-center gap-6">
          {/* All / Diff.Material radio */}
          <div className="flex items-center gap-4 text-sm">
            <label className="text-xs font-medium text-slate-600">Show:</label>
            {[false, true].map((val) => (
              <label key={String(val)} className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-600">
                <input
                  type="radio"
                  name="diffFilter"
                  checked={showDiffOnly === val}
                  onChange={() => setShowDiffOnly(val)}
                  className="accent-slate-700"
                />
                {val ? "Diff. Materials Only" : "All Materials"}
              </label>
            ))}
          </div>
          {/* Without Amount checkbox */}
          <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-600">
            <input
              type="checkbox"
              checked={hideAmounts}
              onChange={(e) => setHideAmounts(e.target.checked)}
              className="accent-slate-700"
            />
            Without Amount
          </label>
        </div>
      )}

      {/* Stage filter info banner */}
      {hasRun && stageId && (
        <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-2 text-xs text-amber-700">
          Showing stage: <strong>{stageLabel}</strong>. Old-type slips without a stage assignment are excluded from this filter. Select &ldquo;All Stages&rdquo; to include them.
        </div>
      )}

      {/* Results */}
      {!hasRun ? (
        <div className="flex-1 flex items-center justify-center text-slate-700 text-sm">
          {isLoading ? "Comparing…" : "Select two vehicles and click Compare"}
        </div>
      ) : displayRows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-700 text-sm">
          {showDiffOnly && allRows.length > 0
            ? "No material differences found between the two vehicles"
            : `No issued material slips found for either vehicle in FY ${fy}`}
        </div>
      ) : (
        <>
          {/* Vehicle labels */}
          <div className="flex items-center gap-3 text-xs text-slate-600">
            <span className="font-medium text-slate-700">{v1Label}</span>
            <span className="text-slate-300">vs</span>
            <span className="font-medium text-slate-700">{v2Label}</span>
            <span className="text-slate-700 ml-1">— FY {fy}</span>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={downloadCsv} disabled={!hasData}>
              Export CSV
            </Button>
            <PrintButton
              label="Print"
              disabled={!hasData}
              getDocument={() => (
                <VehicleComparisonDocument
                  rows={displayRows}
                  v1Name={v1Label}
                  v2Name={v2Label}
                  fy={fy}
                  stageName={stageLabel}
                  hideAmounts={hideAmounts}
                  showDiffOnly={showDiffOnly}
                  companySetting={companySetting}
                />
              )}
            />
          </div>

          {/* Table */}
          <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-lg overflow-auto">
            <table className="min-w-max w-full text-xs">
              <thead className="bg-slate-700 text-white sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium w-12">S.No</th>
                  <th className="px-3 py-2.5 text-left font-medium">Material Name</th>
                  <th className="px-3 py-2.5 text-left font-medium w-32">Stage</th>
                  <th className="px-3 py-2.5 text-right font-medium w-28">Qty ({v1Label.split(" — ")[0]})</th>
                  {!hideAmounts && <th className="px-3 py-2.5 text-right font-medium w-32">Amt ({v1Label.split(" — ")[0]})</th>}
                  <th className="px-3 py-2.5 text-right font-medium w-28">Qty ({v2Label.split(" — ")[0]})</th>
                  {!hideAmounts && <th className="px-3 py-2.5 text-right font-medium w-32">Amt ({v2Label.split(" — ")[0]})</th>}
                  <th className="px-3 py-2.5 text-right font-medium w-28">Diff (Qty)</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((r, i) => (
                  <tr key={`${r.code}-${r.stage_name}`} className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="px-3 py-1.5 text-slate-600">{i + 1}</td>
                    <td className="px-3 py-1.5 text-slate-700">{r.material_name}</td>
                    <td className="px-3 py-1.5 text-slate-600">{r.stage_name}</td>
                    <td className="px-3 py-1.5 text-right text-slate-700">{fmtQty(r.qty1)}</td>
                    {!hideAmounts && <td className="px-3 py-1.5 text-right text-slate-600">{r.amt1 > 0 ? fmtAmt(r.amt1) : "—"}</td>}
                    <td className="px-3 py-1.5 text-right text-slate-700">{fmtQty(r.qty2)}</td>
                    {!hideAmounts && <td className="px-3 py-1.5 text-right text-slate-600">{r.amt2 > 0 ? fmtAmt(r.amt2) : "—"}</td>}
                    <td className={cn(
                      "px-3 py-1.5 text-right font-medium",
                      r.diff !== 0 ? "text-amber-700" : "text-slate-700"
                    )}>
                      {r.diff !== 0 ? (r.diff > 0 ? "+" : "") + fmtQty(r.diff) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
