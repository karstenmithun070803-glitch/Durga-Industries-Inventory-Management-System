"use client";

import { useState, useMemo } from "react";
import { Combobox } from "@/components/ui/combobox";
import { PrintButton } from "@/components/pdf/print-button";
import { JobCostDocument } from "@/components/pdf/job-cost-pdf";
import { getJobCostData } from "@/lib/actions/stock.actions";
import type { VehicleSearchRow, JobCostResult } from "@/lib/actions/stock.actions";
import type { CompanySetting } from "@/lib/actions/settings.actions";
import { cn } from "@/lib/utils";

interface Props {
  vehicles: VehicleSearchRow[];
  companySetting?: CompanySetting;
}

function fmtQty(v: number): string {
  return v.toLocaleString("en-IN", { maximumFractionDigits: 4 });
}

function fmtAmt(v: number): string {
  if (isNaN(v)) return "—";
  return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function JobCostPanel({ vehicles, companySetting }: Props) {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [result, setResult] = useState<JobCostResult | null>(null);
  const [loading, setLoading] = useState(false);

  const vehicleOptions = useMemo(
    () =>
      vehicles.map((v) => ({
        value: v.id,
        label: `${v.job_ref_no} — ${v.vehicle_name}${v.customer_name ? ` (${v.customer_name})` : ""}${!v.is_active ? " [Inactive]" : ""}`,
      })),
    [vehicles]
  );

  async function handleSelect(vehicleId: string) {
    setSelectedVehicleId(vehicleId);
    setResult(null);
    setLoading(true);
    const data = await getJobCostData(vehicleId);
    setResult(data);
    setLoading(false);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <p className="text-sm font-medium text-slate-700 mb-3">Job Cost Search</p>

      <div className="w-96">
        <Combobox
          options={vehicleOptions}
          value={selectedVehicleId ?? ""}
          onChange={handleSelect}
          placeholder="Search by job #, vehicle name, or customer..."
          searchPlaceholder="Type to search..."
        />
      </div>

      {loading && (
        <p className="text-sm text-slate-400 py-6 text-center">Loading job cost data…</p>
      )}

      {!loading && result && (
        <div className="mt-4">
          {/* Vehicle info */}
          <div className="flex items-center gap-4 mb-3 text-sm">
            <span className="font-medium text-slate-800">{result.vehicle.vehicle_name}</span>
            <span className={cn(
              "px-2 py-0.5 rounded-full text-xs font-medium",
              result.vehicle.vehicle_type === "New" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
            )}>
              {result.vehicle.vehicle_type === "New" ? "New Build" : "Repair"}
            </span>
            <span className="text-slate-400">Job #{result.vehicle.job_ref_no}</span>
            {result.vehicle.customer_name && (
              <span className="text-slate-500">{result.vehicle.customer_name}</span>
            )}
          </div>

          {result.rows.length === 0 ? (
            <p className="text-sm text-slate-400 py-4">No materials have been issued to this vehicle yet.</p>
          ) : (
            <>
              <div className="overflow-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">Material</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">Contractor</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-600 whitespace-nowrap">Qty</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">Unit</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-600 whitespace-nowrap">Rate</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-600 whitespace-nowrap">Total Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((r, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 whitespace-nowrap text-slate-800">{r.material_name}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-slate-500">{r.contractor_name ?? "—"}</td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap">{fmtQty(r.total_qty)}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-slate-500">{r.unit_name ?? "—"}</td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap text-slate-600">{fmtAmt(r.rate)}</td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap font-medium">{fmtAmt(r.total_amount)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-sm">
                      <td colSpan={5} className="px-3 py-2 text-right text-slate-600">TOTAL</td>
                      <td className="px-3 py-2 text-right text-slate-800">{fmtAmt(result.totals.total_cost)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex justify-end">
                <PrintButton
                  label="Print Job Cost PDF"
                  getDocument={() => (
                    <JobCostDocument result={result} companySetting={companySetting} />
                  )}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
