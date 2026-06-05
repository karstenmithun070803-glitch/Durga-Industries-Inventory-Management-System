"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getPurchaseReport } from "@/lib/actions/reports.actions";
import type { PurchaseReportRow } from "@/lib/actions/reports.actions";
import type { CompanySetting } from "@/lib/actions/settings.actions";
import { PrintButton } from "@/components/pdf/print-button";
import { PurchaseReportDocument } from "@/components/pdf/purchase-report-pdf";

function buildFYOptions(defaultFY: string) {
  const [startYear] = defaultFY.split("-").map(Number);
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
  defaultFY: string;
  companySetting?: CompanySetting;
}

export function PurchaseReport({ suppliers, materials, defaultFY, companySetting }: Props) {
  const FY_OPTIONS = buildFYOptions(defaultFY);
  const [fy, setFy] = useState(defaultFY);

  // When the global FY switcher changes, reset this report's FY filter to match
  useEffect(() => {
    setFy(defaultFY);
  }, [defaultFY]);

  const [status, setStatus] = useState("Received");
  const [supplierId, setSupplierId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rows, setRows] = useState<PurchaseReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [groupByMonth, setGroupByMonth] = useState(false);
  const fetchGenRef = useRef(0);

  const supplierOptions = suppliers.map((s) => ({ value: s.id, label: s.name }));
  const materialOptions = materials.map((m) => ({
    value: m.id,
    label: `M-${String(m.material_no).padStart(4, "0")} — ${m.name}`,
  }));

  function runReport() {
    setGroupByMonth(false);
    const gen = ++fetchGenRef.current;
    setIsLoading(true);
    getPurchaseReport({
      fy,
      status: status === "All" ? undefined : status,
      supplierId: supplierId || undefined,
      materialId: materialId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    })
      .then((data) => { if (gen === fetchGenRef.current) { setRows(data); setHasRun(true); } })
      .catch(() => { if (gen === fetchGenRef.current) toast.error("Failed to load report data."); })
      .finally(() => { if (gen === fetchGenRef.current) setIsLoading(false); });
  }

  // Auto-run on mount and whenever filters change
  useEffect(() => {
    const gen = ++fetchGenRef.current;
    const t = setTimeout(() => {
      if (gen !== fetchGenRef.current) return;
      setIsLoading(true);
      getPurchaseReport({
        fy,
        status: status === "All" ? undefined : status,
        supplierId: supplierId || undefined,
        materialId: materialId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      })
        .then((data) => { if (gen === fetchGenRef.current) { setRows(data); setHasRun(true); } })
        .catch(() => { if (gen === fetchGenRef.current) toast.error("Failed to load report data."); })
        .finally(() => { if (gen === fetchGenRef.current) setIsLoading(false); });
    }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fy, status, supplierId, materialId, dateFrom, dateTo]);

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

  type MonthlyGroup = {
    key: string;
    monthKey: string;
    monthLabel: string;
    supplier: string;
    material: string;
    qty: number;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
  };

  const monthlyRows = useMemo((): MonthlyGroup[] => {
    if (!groupByMonth) return [];
    const map = new Map<string, MonthlyGroup>();
    for (const r of rows.filter((r) => r.status === "Received")) {
      const parts = r.po_date.split("/"); // ["03", "06", "2026"]
      const monthKey = `${parts[2]}-${parts[1]}`; // "2026-06"
      const monthLabel = new Date(+parts[2], +parts[1] - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
      const supplier = r.supplier_name ?? "—";
      const material = r.material_name;
      const key = `${monthKey}/${supplier}/${material}`;
      const prev = map.get(key) ?? { key, monthKey, monthLabel, supplier, material, qty: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
      map.set(key, { ...prev, qty: prev.qty + r.qty, taxable: prev.taxable + r.taxable_amount, cgst: prev.cgst + r.cgst_amount, sgst: prev.sgst + r.sgst_amount, igst: prev.igst + r.igst_amount, total: prev.total + r.total_amount });
    }
    return Array.from(map.values()).sort((a, b) =>
      a.monthKey.localeCompare(b.monthKey) || a.supplier.localeCompare(b.supplier) || a.material.localeCompare(b.material)
    );
  }, [rows, groupByMonth]);

  function downloadCsv() {
    let headers: string[];
    let csvRows: (string | number)[][];
    if (groupByMonth) {
      headers = ["Month", "Supplier", "Material", "Qty", "Taxable Amount", "CGST", "SGST", "IGST", "Total Amount"];
      csvRows = monthlyRows.map((r) => [r.monthLabel, r.supplier, r.material, r.qty.toFixed(3), r.taxable.toFixed(2), r.cgst.toFixed(2), r.sgst.toFixed(2), r.igst.toFixed(2), r.total.toFixed(2)]);
    } else {
      headers = [
        "PO #", "Date", "Supplier Bill No.", "Supplier Bill Date", "Supplier", "Material", "Qty", "Unit", "Rate",
        "Taxable Amount", "CGST", "SGST", "IGST", "Total Amount", "Stock Updated", "Status",
      ];
      csvRows = rows.map((r) => [
        r.po_number, r.po_date, r.supplier_bill_no ?? "", r.supplier_bill_date ?? "",
        r.supplier_name ?? "", r.material_name,
        r.qty.toFixed(3), r.unit_name ?? "", r.rate.toFixed(2),
        r.taxable_amount.toFixed(2), r.cgst_amount.toFixed(2),
        r.sgst_amount.toFixed(2), r.igst_amount.toFixed(2),
        r.total_amount.toFixed(2), r.affects_stock ? "Yes" : "No", r.status,
      ]);
    }
    const bom = "﻿";
    const csv = bom + [headers, ...csvRows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = groupByMonth ? `purchase-report-monthly-${fy}.csv` : `purchase-report-${fy}.csv`;
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
          {(supplierId || materialId || dateFrom || dateTo || status !== "Received" || fy !== defaultFY) && (
            <button
              onClick={() => { setSupplierId(""); setMaterialId(""); setDateFrom(""); setDateTo(""); setStatus("Received"); setFy(defaultFY); setGroupByMonth(false); }}
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
          {isLoading ? "Loading…" : "Set filters and click Run Report"}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
          No purchase orders found for the selected filters.
        </div>
      ) : (
        <>
          <div className="flex justify-end gap-2">
            <Button
              variant={groupByMonth ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setGroupByMonth((g) => !g)}
            >
              {groupByMonth ? "Monthly View" : "Group by Month"}
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={downloadCsv}>
              Export CSV ({groupByMonth ? monthlyRows.length : rows.length})
            </Button>
            <PrintButton
              label={`Print (${groupByMonth ? monthlyRows.length : rows.length})`}
              getDocument={() => (
                <PurchaseReportDocument
                  rows={rows}
                  monthlyRows={monthlyRows}
                  groupByMonth={groupByMonth}
                  fy={fy}
                  statusFilter={status}
                  supplierName={supplierId ? suppliers.find((s) => s.id === supplierId)?.name : undefined}
                  materialName={materialId ? materials.find((m) => m.id === materialId)?.name : undefined}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  companySetting={companySetting}
                />
              )}
            />
          </div>

          {groupByMonth ? (
            <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-lg overflow-auto">
              <table className="min-w-max w-full text-xs">
                <thead className="bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap">Month</th>
                    <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap">Supplier</th>
                    <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap">Material</th>
                    <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap">Qty</th>
                    <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap">Taxable</th>
                    <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap">CGST</th>
                    <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap">SGST</th>
                    <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap">IGST</th>
                    <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyRows.length === 0 ? (
                    <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">No received purchases in selected range.</td></tr>
                  ) : (
                    monthlyRows.map((r) => (
                      <tr key={r.key} className="border-t border-slate-100 hover:bg-slate-50/50">
                        <td className="px-3 py-1.5 whitespace-nowrap font-medium text-slate-800">{r.monthLabel}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-slate-600">{r.supplier}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-slate-600">{r.material}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-right">{fmtQty(r.qty)}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-right">{fmtAmt(r.taxable)}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-right">{r.cgst > 0 ? fmtAmt(r.cgst) : "—"}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-right">{r.sgst > 0 ? fmtAmt(r.sgst) : "—"}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-right">{r.igst > 0 ? fmtAmt(r.igst) : "—"}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-right font-semibold text-slate-800">{fmtAmt(r.total)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="bg-slate-100 sticky bottom-0">
                  <tr className="font-semibold text-slate-800 border-t-2 border-slate-300">
                    <td colSpan={3} className="px-3 py-2 whitespace-nowrap text-right text-slate-500 font-medium">TOTAL</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">{fmtQty(totals.qty)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">{fmtAmt(totals.taxable)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">{totals.cgst > 0 ? fmtAmt(totals.cgst) : "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">{totals.sgst > 0 ? fmtAmt(totals.sgst) : "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">{totals.igst > 0 ? fmtAmt(totals.igst) : "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right text-slate-900">{fmtAmt(totals.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (

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
                    key={r.item_id}
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
                  <td colSpan={5} className="px-3 py-2 whitespace-nowrap text-right text-slate-500 font-medium">
                    TOTAL {rows.filter((r) => r.status !== "Received").length > 0 && "(Received only)"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">{fmtQty(totals.qty)}</td>
                  <td />{/* Unit */}
                  <td />{/* Rate — no total */}
                  <td className="px-3 py-2 whitespace-nowrap text-right">{fmtAmt(totals.taxable)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">{totals.cgst > 0 ? fmtAmt(totals.cgst) : "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">{totals.sgst > 0 ? fmtAmt(totals.sgst) : "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">{totals.igst > 0 ? fmtAmt(totals.igst) : "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right text-slate-900">{fmtAmt(totals.total)}</td>
                  <td />{/* Stock Updated */}
                  <td />{/* Status */}
                </tr>
              </tfoot>
            </table>
          </div>
          )}
        </>
      )}
    </div>
  );
}
