"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteMaterialIssue, getMaterialIssues } from "@/lib/actions/material-issues.actions";
import type { MaterialIssueRow } from "@/types";
import { matchesCode } from "@/lib/utils";
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
import { Trash2, Plus } from "lucide-react";
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

type GroupedMI = {
  id: string;
  slip_number: number;
  issue_date: string;
  status: string;
  vehicle_name: string | null;
  job_ref_no: string;
  customer_name: string | null;
  grandTotal: number;
  itemCount: number;
  items: MaterialIssueRow[];
};

function groupMIRows(rows: MaterialIssueRow[]): GroupedMI[] {
  const map = new Map<string, GroupedMI>();
  for (const r of rows) {
    if (!map.has(r.id)) {
      map.set(r.id, {
        id: r.id,
        slip_number: r.slip_number,
        issue_date: r.issue_date,
        status: r.status,
        vehicle_name: r.vehicle_name,
        job_ref_no: r.job_ref_no,
        customer_name: r.customer_name,
        grandTotal: 0,
        itemCount: 0,
        items: [],
      });
    }
    const g = map.get(r.id)!;
    g.grandTotal += parseFloat(r.amount || "0");
    g.itemCount++;
    g.items.push(r);
  }
  return Array.from(map.values());
}

export function MaterialIssuesClient({ initialRows, initialFY, companySetting }: Props) {
  const router = useRouter();
  const { activeFY } = useFY();
  const [rows, setRows] = useState<MaterialIssueRow[]>(initialRows);
  const [loadedFY, setLoadedFY] = useState(initialFY);
  const [isFetching, setIsFetching] = useState(false);
  const [, startTransition] = useTransition();

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
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; slip_number: number; status: string } | null>(null);

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
        (r.vehicle_name ?? "").toLowerCase().includes(q) ||
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
      r.vehicle_name ?? "",
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
          <h1 className="text-xl font-semibold text-slate-800">Vehicle Material Issues</h1>
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
        {/* Toolbar */}
        <div className="p-3 border-b border-slate-100 flex items-center gap-3 flex-wrap">
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
                {[
                  { label: "S.No", align: "" },
                  { label: "Date", align: "" },
                  { label: "Slip #", align: "" },
                  { label: "Vehicle / Job", align: "" },
                  { label: "Customer", align: "" },
                  { label: "Items", align: "text-right" },
                  { label: "Total", align: "text-right" },
                  { label: "Status", align: "" },
                  { label: "Actions", align: "" },
                ].map((h) => (
                  <th
                    key={h.label}
                    className={`px-4 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap ${h.align}`}
                  >
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-400 text-sm">
                    {search || tab !== "All" || dateFrom || dateTo
                      ? "No issue slips match the current filters."
                      : "No material issue slips yet. Create the first one."}
                  </td>
                </tr>
              ) : (
                groupMIRows(filtered).map((g, i) => (
                  <tr
                    key={g.id}
                    className="border-t border-slate-100 hover:bg-blue-50/40 cursor-pointer"
                    onClick={() => router.push(`/transactions/material-issues/${g.id}/edit`)}
                  >
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{i + 1}</td>
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(g.issue_date)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs font-medium text-slate-800 whitespace-nowrap">
                      MI-{String(g.slip_number).padStart(4, "0")}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                      <span className="text-xs text-slate-400 mr-1">{g.job_ref_no}</span>
                      {g.vehicle_name ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                      {g.customer_name ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-right whitespace-nowrap">{g.itemCount}</td>
                    <td className="px-4 py-2.5 text-slate-800 font-medium text-right whitespace-nowrap">
                      {"₹" + g.grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        g.status === "Issued"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}>
                        {g.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-400 hover:text-red-500 hover:bg-red-50"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: g.id, slip_number: g.slip_number, status: g.status }); }}
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))
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
