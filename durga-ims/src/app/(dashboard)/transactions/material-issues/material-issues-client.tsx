"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { deleteMaterialIssue, getMaterialIssues } from "@/lib/actions/material-issues.actions";
import type { MaterialIssueRow } from "@/types";
import { formatCode, matchesCode } from "@/lib/utils";
import { useFY } from "@/lib/financial-year";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Pencil, Trash2, Eye, Plus } from "lucide-react";
import { toast } from "sonner";
import { PrintButton } from "@/components/pdf/print-button";
import { MIRegisterDocument } from "@/components/pdf/mi-register-pdf";
import type { CompanySetting } from "@/lib/actions/settings.actions";

interface Props {
  initialRows: MaterialIssueRow[];
  initialFY: string;
  companySetting?: CompanySetting;
}

type StatusTab = "All" | "Draft" | "Issued";

export function MaterialIssuesClient({ initialRows, initialFY, companySetting }: Props) {
  const { activeFY } = useFY();
  const [rows, setRows] = useState<MaterialIssueRow[]>(initialRows);
  const [loadedFY, setLoadedFY] = useState(initialFY);
  const [isFetching, setIsFetching] = useState(false);
  const [, startTransition] = useTransition();

  // Re-fetch when FY changes in the sidebar
  useEffect(() => {
    if (activeFY === loadedFY) return;
    setIsFetching(true);
    getMaterialIssues(activeFY).then((data) => {
      setRows(data);
      setLoadedFY(activeFY);
      setIsFetching(false);
    });
  }, [activeFY, loadedFY]);

  const [tab, setTab] = useState<StatusTab>("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [showRates, setShowRates] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MaterialIssueRow | null>(null);

  // ---- Filter logic ----
  const filtered = rows.filter((r) => {
    if (tab !== "All" && r.status !== tab) return false;
    if (dateFrom && r.issue_date < dateFrom) return false;
    if (dateTo && r.issue_date > dateTo) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchesMat =
        r.material_name.toLowerCase().includes(q) ||
        matchesCode(search, "M", r.material_no);
      const matchesVehicle =
        r.vehicle_name.toLowerCase().includes(q) ||
        (r.job_ref_no ?? "").toLowerCase().includes(q);
      const matchesSlip = matchesCode(search, "MI-", r.slip_number);
      const matchesCustomer = r.customer_name?.toLowerCase().includes(q) ?? false;
      const matchesContractor = r.contractor_name?.toLowerCase().includes(q) ?? false;
      if (!matchesMat && !matchesVehicle && !matchesSlip && !matchesCustomer && !matchesContractor)
        return false;
    }
    return true;
  });


  function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    startTransition(async () => {
      try {
        await deleteMaterialIssue(target.id);
        toast.success(`MI-${String(target.slip_number).padStart(4, "0")} deleted.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete.");
      }
    });
  }

  const fmt2 = (v: string) =>
    parseFloat(v || "0").toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const fmtDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const tabs: StatusTab[] = ["All", "Draft", "Issued"];

  function downloadCsv() {
    const headers = ["Slip #", "Date", "Vehicle", "Job Ref", "Material", "Qty", "Unit", "Rate", "Amount", "Contractor", "Status"];
    const csvRows = filtered.map((r) => [
      `MI-${String(r.slip_number).padStart(4, "0")}`,
      new Date(r.issue_date).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }),
      r.vehicle_name,
      r.job_ref_no ?? "",
      r.material_name,
      r.qty,
      r.unit_name ?? "",
      parseFloat(r.rate).toFixed(2),
      parseFloat(r.amount).toFixed(2),
      r.contractor_name ?? "",
      r.status,
    ]);
    const bom = "﻿";
    const csv = bom + [headers, ...csvRows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `material-issues-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Material Issues</h1>
          <p className="text-sm text-slate-500 mt-0.5">FY {activeFY}</p>
        </div>
        <Link href="/transactions/material-issues/new">
          <Button className="gap-1.5">
            <Plus className="w-4 h-4" />
            New Issue Slip
          </Button>
        </Link>
      </div>

      {/* Table card */}
      <div className="flex-1 bg-white rounded-lg border border-slate-200 flex flex-col min-h-0">
        {/* Toolbar inside card */}
        <div className="p-3 border-b border-slate-100 flex items-center gap-3 flex-wrap">
          {/* Status tabs */}
          <div className="flex gap-1">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  tab === t
                    ? "bg-slate-800 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Date range */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500">From</span>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-36 text-xs"
            />
            <span className="text-xs text-slate-500">To</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-36 text-xs"
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(""); setDateTo(""); }}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                Clear
              </button>
            )}
          </div>

          {/* Search */}
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search slip, vehicle, material, customer, contractor…"
            className="max-w-xs"
          />
          {isFetching && <span className="text-xs text-slate-400">Loading…</span>}
          <div className="ml-auto flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showRates}
                onChange={(e) => setShowRates(e.target.checked)}
                className="w-3.5 h-3.5 accent-slate-700"
              />
              <span className="text-xs text-slate-500">Include rates</span>
            </label>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1"
              onClick={downloadCsv}
              disabled={filtered.length === 0}
            >
              Export CSV ({filtered.length})
            </Button>
            <PrintButton
              label={`Print (${filtered.length})`}
              disabled={filtered.length === 0}
              getDocument={() => (
                <MIRegisterDocument
                  rows={filtered}
                  fy={activeFY}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  statusFilter={tab}
                  showRates={showRates}
                  companySetting={companySetting}
                />
              )}
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1 min-w-0">
          <table className="min-w-max text-sm w-full">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap sticky left-0 z-20 bg-slate-50 w-12">
                  S.No
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap sticky left-12 z-20 bg-slate-50 w-24 border-r border-slate-200">
                  Date
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-24">
                  Slip #
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-36">
                  Vehicle / Job
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-36">
                  Customer
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-20">
                  Mat. Code
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-24">
                  HSN
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-44">
                  Material Name
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-36">
                  Contractor
                </th>
                <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap w-20">
                  Qty
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-16">
                  Unit
                </th>
                <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap w-24">
                  Rate
                </th>
                <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap w-24">
                  Tax
                </th>
                <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap w-28">
                  Amount
                </th>
                <th className="px-3 py-2.5 text-center font-medium text-slate-600 whitespace-nowrap w-24">
                  Stk
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-20">
                  Status
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-20">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={17} className="px-6 py-12 text-center text-slate-400 text-sm">
                    {search || tab !== "All" || dateFrom || dateTo
                      ? "No issue slips match the current filters."
                      : "No material issue slips yet. Create the first one."}
                  </td>
                </tr>
              ) : (
                filtered.map((r, i) => {
                  const slipLabel = `MI-${String(r.slip_number).padStart(4, "0")}`;
                  const stickyBg = "bg-white";

                  const taxAmt =
                    parseFloat(r.igst_amount) > 0
                      ? r.igst_amount
                      : (parseFloat(r.cgst_amount) + parseFloat(r.sgst_amount)).toFixed(2);

                  return (
                    <tr key={r.item_id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className={`px-3 py-2.5 text-slate-500 sticky left-0 z-10 w-12 ${stickyBg}`}>
                        {i + 1}
                      </td>
                      <td className={`px-3 py-2.5 text-slate-700 whitespace-nowrap sticky left-12 z-10 w-24 border-r border-slate-200 ${stickyBg}`}>
                        {fmtDate(r.issue_date)}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs font-medium text-slate-700 whitespace-nowrap">
                        {slipLabel}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-700">
                        <span className="text-xs text-slate-400 mr-1">
                          {r.job_ref_no}
                        </span>
                        {r.vehicle_name}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">
                        {r.customer_name ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-600 whitespace-nowrap">
                        {formatCode("M", r.material_no)}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-500 whitespace-nowrap">
                        {r.hsn_code ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-slate-800 whitespace-nowrap">
                        {r.material_name}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                        {r.contractor_name ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-700 tabular-nums">
                        {r.qty}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
                        {r.unit_name ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-700 tabular-nums">
                        {fmt2(r.rate)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums">
                        {fmt2(taxAmt)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium text-slate-800 tabular-nums">
                        ₹{fmt2(r.amount)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {r.affects_inventory ? (
                          <span className="text-emerald-600 text-xs font-medium">✓</span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            r.status === "Issued"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          <Link
                            href={`/transactions/material-issues/${r.id}/view`}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-slate-400 hover:text-blue-600 hover:bg-slate-100 transition-colors"
                            title="View"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Link>
                          <Link
                            href={`/transactions/material-issues/${r.id}/edit`}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Link>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-400 hover:text-red-500 hover:bg-red-50"
                            onClick={() => setDeleteTarget(r)}
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete MI-{String(deleteTarget?.slip_number ?? 0).padStart(4, "0")}?
            </DialogTitle>
            <DialogDescription>
              {deleteTarget?.status === "Issued"
                ? "This slip has been confirmed. Deleting it will reverse the stock changes recorded when it was issued."
                : "This draft issue slip will be permanently deleted. No stock changes will occur."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              {deleteTarget?.status === "Issued" ? "Delete & Reverse Stock" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
