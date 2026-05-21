"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { deleteMaterialIssue } from "@/lib/actions/material-issues.actions";
import type { MaterialIssueRow } from "@/types";
import { formatCode, matchesCode } from "@/lib/utils";
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
import { Pencil, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";

interface Props {
  rows: MaterialIssueRow[];
}

type StatusTab = "all" | "Draft" | "Issued";

export function MaterialIssuesClient({ rows }: Props) {
  const [, startTransition] = useTransition();

  const [tab, setTab] = useState<StatusTab>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<MaterialIssueRow | null>(null);

  // ---- Filter logic ----
  const filtered = rows.filter((r) => {
    if (tab !== "all" && r.status !== tab) return false;
    if (dateFrom && r.issue_date < dateFrom) return false;
    if (dateTo && r.issue_date > dateTo) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchesMat =
        r.material_name.toLowerCase().includes(q) ||
        matchesCode(search, "M", r.material_no);
      const matchesVehicle =
        r.vehicle_name.toLowerCase().includes(q) ||
        matchesCode(search, "J", r.job_ref_no);
      const matchesSlip = matchesCode(search, "MI-", r.slip_number);
      const matchesCustomer = r.customer_name?.toLowerCase().includes(q) ?? false;
      const matchesContractor = r.contractor_name?.toLowerCase().includes(q) ?? false;
      if (!matchesMat && !matchesVehicle && !matchesSlip && !matchesCustomer && !matchesContractor)
        return false;
    }
    return true;
  });

  const counts = {
    all: rows.length,
    Draft: rows.filter((r) => r.status === "Draft").length,
    Issued: rows.filter((r) => r.status === "Issued").length,
  };

  function handleDelete(row: MaterialIssueRow) {
    setDeleteTarget(row);
  }

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

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 pt-5 pb-3 gap-4 flex-wrap">
        <h1 className="text-xl font-semibold text-slate-800">Material Issues</h1>
        <Link href="/transactions/material-issues/new">
          <Button size="sm">+ New Issue Slip</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="px-6 pb-3 flex items-center gap-3 flex-wrap">
        {/* Status tabs */}
        <div className="flex rounded-md border border-slate-200 overflow-hidden text-sm">
          {(["all", "Draft", "Issued"] as StatusTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 font-medium transition-colors ${
                tab === t
                  ? "bg-slate-800 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t === "all" ? "All" : t}{" "}
              <span className={`ml-1 text-xs ${tab === t ? "text-slate-300" : "text-slate-400"}`}>
                {counts[t]}
              </span>
            </button>
          ))}
        </div>

        {/* Date range */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-slate-500 whitespace-nowrap">From</label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 w-36 text-xs"
          />
          <label className="text-xs text-slate-500 whitespace-nowrap">To</label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 w-36 text-xs"
          />
        </div>

        {/* Search */}
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search slip, vehicle, material, customer, contractor…"
          className="h-8 text-sm w-72"
        />
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 px-6 pb-6">
        <div className="h-full bg-white rounded-lg border border-slate-200 flex flex-col min-h-0">
          <div className="flex-1 overflow-auto min-h-0">
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
                    <td colSpan={16} className="px-6 py-12 text-center text-slate-400 text-sm">
                      {search || tab !== "all" || dateFrom || dateTo
                        ? "No issue slips match the current filters."
                        : "No material issue slips yet. Create the first one."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((r, i) => {
                    const slipLabel = `MI-${String(r.slip_number).padStart(4, "0")}`;
                    const stickyBg = "bg-white";

                    // Tax amount: prefer IGST, else CGST+SGST combined
                    const taxAmt =
                      parseFloat(r.igst_amount) > 0
                        ? r.igst_amount
                        : (parseFloat(r.cgst_amount) + parseFloat(r.sgst_amount)).toFixed(2);

                    return (
                      <tr key={r.item_id} className="border-t border-slate-100 hover:bg-slate-50/50">
                        {/* Sticky: S.No */}
                        <td
                          className={`px-3 py-2.5 text-slate-500 sticky left-0 z-10 w-12 ${stickyBg}`}
                        >
                          {i + 1}
                        </td>
                        {/* Sticky: Date */}
                        <td
                          className={`px-3 py-2.5 text-slate-700 whitespace-nowrap sticky left-12 z-10 w-24 border-r border-slate-200 ${stickyBg}`}
                        >
                          {fmtDate(r.issue_date)}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs font-medium text-slate-700 whitespace-nowrap">
                          {slipLabel}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-slate-700">
                          <span className="text-xs text-slate-400 mr-1">
                            {formatCode("J", r.job_ref_no, 5)}
                          </span>
                          {r.vehicle_name}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">
                          {r.customer_name ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-slate-600 whitespace-nowrap">
                          {formatCode("M", r.material_no)}
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
                              onClick={() => handleDelete(r)}
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
