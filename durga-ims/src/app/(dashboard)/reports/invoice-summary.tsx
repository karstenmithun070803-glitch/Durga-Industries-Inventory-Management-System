"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getInvoiceSummaryReport } from "@/lib/actions/reports.actions";
import type { InvoiceSummaryRow } from "@/lib/actions/reports.actions";
import type { CompanySetting } from "@/lib/actions/settings.actions";
import { PrintButton } from "@/components/pdf/print-button";

function buildFYOptions(defaultFY: string) {
  const [startYear] = defaultFY.split("-").map(Number);
  return Array.from({ length: 5 }, (_, i) => {
    const y = startYear - i;
    const label = `${y}-${y + 1}`;
    return { value: label, label: `FY ${label}` };
  });
}

const STATUS_OPTIONS = [
  { value: "Finalized", label: "Finalized Only" },
  { value: "All", label: "All Statuses" },
  { value: "Cancelled", label: "Cancelled Only" },
];

function fmtAmt(v: number) {
  return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  vehicles: { id: string; job_ref_no: string }[];
  customers: { id: string; customer_name: string; gstin: string | null }[];
  defaultFY: string;
  companySetting?: CompanySetting;
}

export function InvoiceSummaryReport({ vehicles, customers, defaultFY, companySetting }: Props) {
  const FY_OPTIONS = buildFYOptions(defaultFY);
  const [fy, setFy] = useState(defaultFY);

  // When the global FY switcher changes, reset this report's FY filter to match
  useEffect(() => {
    setFy(defaultFY);
  }, [defaultFY]);

  const [status, setStatus] = useState("Finalized");
  const [vehicleId, setVehicleId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rows, setRows] = useState<InvoiceSummaryRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const fetchGenRef = useRef(0);

  const vehicleOptions = vehicles.map((v) => ({
    value: v.id,
    label: v.job_ref_no,
  }));

  const customerOptions = customers.map((c) => ({
    value: c.id,
    label: c.gstin ? `${c.customer_name} (${c.gstin})` : c.customer_name,
  }));

  function runReport() {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      toast.error("From date cannot be after To date.");
      return;
    }
    const gen = ++fetchGenRef.current;
    setIsLoading(true);
    getInvoiceSummaryReport({
      fy,
      status: status === "All" ? undefined : status,
      vehicleId: vehicleId || undefined,
      customerId: customerId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    })
      .then((data) => { if (gen === fetchGenRef.current) { setRows(data); setHasRun(true); } })
      .catch(() => { if (gen === fetchGenRef.current) toast.error("Failed to load report data."); })
      .finally(() => { if (gen === fetchGenRef.current) setIsLoading(false); });
  }

  // Auto-run on mount and whenever filters change
  useEffect(() => {
    if (dateFrom && dateTo && dateFrom > dateTo) return;
    const gen = ++fetchGenRef.current;
    const t = setTimeout(() => {
      if (gen !== fetchGenRef.current) return;
      setIsLoading(true);
      getInvoiceSummaryReport({
        fy,
        status: status === "All" ? undefined : status,
        vehicleId: vehicleId || undefined,
        customerId: customerId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      })
        .then((data) => { if (gen === fetchGenRef.current) { setRows(data); setHasRun(true); } })
        .catch(() => { if (gen === fetchGenRef.current) toast.error("Failed to load report data."); })
        .finally(() => { if (gen === fetchGenRef.current) setIsLoading(false); });
    }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fy, status, vehicleId, customerId, dateFrom, dateTo]);

  // Totals — when viewing Cancelled Only, show cancelled totals for reference.
  // Otherwise exclude Cancelled (they are void for GST filing purposes).
  const isCancelledOnlyView = status === "Cancelled";
  const totals = useMemo(() => {
    const forTotal = isCancelledOnlyView ? rows : rows.filter((r) => r.status !== "Cancelled");
    return {
      taxable: forTotal.reduce((s, r) => s + r.taxable_value, 0),
      tax: forTotal.reduce((s, r) => s + r.total_cgst + r.total_sgst + r.total_igst, 0),
      gross: forTotal.reduce((s, r) => s + r.gross_total, 0),
      discount: forTotal.reduce((s, r) => s + r.discount, 0),
      net: forTotal.reduce((s, r) => s + r.net_amount, 0),
    };
  }, [rows, isCancelledOnlyView]);

  function downloadCsv() {
    const headers = ["Bill #", "Date", "Job Ref", "Type", "Customer", "GSTIN", "Taxable", "Tax Amt", "Gross Total", "Discount", "Net Amount"];
    const csvRows = rows.map((r) => [
      r.bill_number, r.bill_date, r.job_ref_no ?? "",
      r.vehicle_type === "New" ? "New Build" : r.vehicle_type === "Old" ? "Old Build" : "",
      r.customer_name ?? "", r.customer_gstin ?? "",
      r.taxable_value.toFixed(2),
      (r.total_cgst + r.total_sgst + r.total_igst).toFixed(2),
      r.gross_total.toFixed(2), r.discount.toFixed(2), r.net_amount.toFixed(2),
    ]);
    const bom = "﻿";
    const csv = bom + [headers, ...csvRows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `invoice-summary-${fy}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 flex flex-col gap-5 h-full">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Invoice Summary</h2>
        <p className="text-sm text-slate-600 mt-0.5">GST filing and billing review by financial year</p>
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
          <label className="text-xs font-medium text-slate-600">Customer (optional)</label>
          <Combobox options={[{ value: "", label: "All Customers" }, ...customerOptions]} value={customerId} onChange={setCustomerId} placeholder="All Customers" />
        </div>
        <div className="space-y-1 w-52">
          <label className="text-xs font-medium text-slate-600">Vehicle (optional)</label>
          <Combobox options={[{ value: "", label: "All Vehicles" }, ...vehicleOptions]} value={vehicleId} onChange={setVehicleId} placeholder="All Vehicles" />
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
          {(customerId || vehicleId || dateFrom || dateTo || status !== "Finalized" || fy !== defaultFY) && (
            <button
              onClick={() => { setCustomerId(""); setVehicleId(""); setDateFrom(""); setDateTo(""); setStatus("Finalized"); setFy(defaultFY); }}
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
          No invoices found for the selected filters.
        </div>
      ) : (
        <>
          {/* Export buttons */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={downloadCsv}>
              Export CSV
            </Button>
            <PrintButton
              label="Print"
              hotkey="mod+p"
              getDocument={async () => {
                const { InvoiceSummaryReportDocument } = await import("@/components/pdf/invoice-summary-report-pdf");
                return (
                  <InvoiceSummaryReportDocument
                    rows={rows}
                    fy={fy}
                    statusFilter={status}
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    companySetting={companySetting}
                  />
                );
              }}
            />
          </div>

          {/* Table */}
          <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-lg overflow-auto">
            <table className="min-w-max w-full text-xs">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap">Bill #</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap">Date</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap">Job Ref</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap">Type</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap">Customer</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap">GSTIN</th>
                  <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap">Taxable</th>
                  <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap">Tax Amt</th>
                  <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap">Gross</th>
                  <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap">Discount</th>
                  <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap">Net Amount</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className={cn(
                      "border-t border-slate-100 hover:bg-slate-50/50",
                      r.status === "Cancelled" && "opacity-60 line-through-cells"
                    )}
                  >
                    <td className="px-3 py-1.5 whitespace-nowrap font-medium text-slate-800">{r.bill_number}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-slate-600">{r.bill_date}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-slate-600">{r.job_ref_no ?? "—"}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {r.vehicle_type ? (
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-xs font-medium",
                          r.vehicle_type === "New" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                        )}>
                          {r.vehicle_type === "New" ? "New Build" : "Old Build"}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-slate-600">{r.customer_name ?? "—"}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-slate-700 font-mono text-xs">{r.customer_gstin ?? "—"}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-right">{fmtAmt(r.taxable_value)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-right">{(r.total_cgst + r.total_sgst + r.total_igst) > 0 ? fmtAmt(r.total_cgst + r.total_sgst + r.total_igst) : "—"}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-right">{fmtAmt(r.gross_total)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-right">{r.discount > 0 ? fmtAmt(r.discount) : "—"}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-right font-semibold text-slate-800">{fmtAmt(r.net_amount)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-xs font-medium",
                        r.status === "Finalized" ? "bg-green-100 text-green-700"
                        : r.status === "Cancelled" ? "bg-rose-100 text-rose-700"
                        : "bg-slate-100 text-slate-600"
                      )}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Totals row */}
              <tfoot className="bg-slate-100 sticky bottom-0">
                <tr className="font-semibold text-slate-800 border-t-2 border-slate-300">
                  <td colSpan={6} className="px-3 py-2 whitespace-nowrap text-right text-slate-600 font-medium">
                    {isCancelledOnlyView
                      ? "Reference Total (void — excluded from GST)"
                      : rows.some((r) => r.status === "Cancelled")
                        ? "TOTAL (Cancelled excluded)"
                        : "TOTAL"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">{fmtAmt(totals.taxable)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">{totals.tax > 0 ? fmtAmt(totals.tax) : "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">{fmtAmt(totals.gross)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">{totals.discount > 0 ? fmtAmt(totals.discount) : "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right text-slate-900">{fmtAmt(totals.net)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
