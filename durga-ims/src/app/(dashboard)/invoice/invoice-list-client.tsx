"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PrintButton } from "@/components/pdf/print-button";
import { formatCode } from "@/lib/utils";
import { deleteInvoice, getInvoices, getInvoiceCounts } from "@/lib/actions/invoices.actions";
import type { InvoiceRow } from "@/types";
import { useFY } from "@/lib/financial-year";
import type { CompanySetting } from "@/lib/actions/settings.actions";
import { Trash2, Plus, Loader2 } from "lucide-react";
import { INVOICE_STATUS } from "@/lib/constants";
import { useDebounce } from "@/hooks/use-debounce";

interface Props {
  initialRows: InvoiceRow[];
  fy: string;
  companySetting?: CompanySetting;
}

type StatusFilter = "all" | "Draft" | "Finalized";

export function InvoiceListClient({ initialRows, fy, companySetting }: Props) {
  const router = useRouter();
  const { activeFY } = useFY();
  const [rows, setRows] = useState<InvoiceRow[]>(initialRows);
  const [counts, setCounts] = useState({ all: 0, draft: 0, finalized: 0 });
  const [isLoading, setIsLoading] = useState(false);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; bill_number: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load tab counts once per FY — separate lightweight query
  useEffect(() => {
    getInvoiceCounts(activeFY).then(setCounts);
  }, [activeFY]);

  // Re-fetch filtered rows whenever FY or any filter changes
  const fetchRows = useCallback(() => {
    setIsLoading(true);
    getInvoices(activeFY, {
      search: debouncedSearch || undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    })
      .then((data) => { setRows(data); })
      .finally(() => setIsLoading(false));
  }, [activeFY, debouncedSearch, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  // Deduplicate: one row per invoice (first item only)
  const invoiceRows = useMemo(
    () => rows.filter((row, idx, arr) => arr.findIndex((r) => r.id === row.id) === idx),
    [rows]
  );

  const hasDraft = invoiceRows.some((r) => r.status === INVOICE_STATUS.DRAFT);

  // Item count per invoice id (for the "+N more" badge)
  const itemCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.id, (map.get(r.id) ?? 0) + 1);
    return map;
  }, [rows]);

  // Group rows by invoice id for PDF generation (one page per invoice)
  const groupedForPdf = useMemo(() => {
    const map = new Map<string, InvoiceRow[]>();
    for (const r of rows) {
      if (!map.has(r.id)) map.set(r.id, []);
      map.get(r.id)!.push(r);
    }
    return Array.from(map.values());
  }, [rows]);

  const filteredInvoiceCount = invoiceRows.length;

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteInvoice(deleteTarget.id);
      toast.success(`${deleteTarget.bill_number} deleted.`);
      fetchRows();
      getInvoiceCounts(activeFY).then(setCounts);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete.");
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }

  const fmt2 = (v: string | null) =>
    parseFloat(v || "0").toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });

  function downloadCsv() {
    const headers = ["Bill #", "Date", "Job No / Reg No", "Customer", "GSTIN", "Net Amount", "Status"];
    const csvRows = invoiceRows.map((r) => [
      r.bill_number,
      fmtDate(r.bill_date),
      r.job_ref_no ?? "",
      r.customer_name ?? "",
      r.customer_gstin ?? "",
      parseFloat(r.net_amount ?? "0").toFixed(2),
      r.status,
    ]);
    const bom = "﻿";
    const csv = bom + [headers, ...csvRows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 flex flex-col gap-4 h-full">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-lg font-semibold text-slate-800 mr-2">Invoices</h1>

        {/* Status tabs */}
        {(["all", INVOICE_STATUS.DRAFT, INVOICE_STATUS.FINALIZED] as StatusFilter[]).map((s) => {
          const count = s === "all" ? counts.all : s === INVOICE_STATUS.DRAFT ? counts.draft : counts.finalized;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                statusFilter === s
                  ? "bg-slate-800 text-white border-slate-800"
                  : "text-slate-600 border-slate-200 hover:border-slate-400"
              }`}
            >
              {s === "all" ? "All" : s} ({count})
            </button>
          );
        })}

        <div className="flex items-center gap-2 ml-2">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 text-xs w-36"
            placeholder="From"
          />
          <span className="text-slate-700 text-xs">—</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 text-xs w-36"
            placeholder="To"
          />
        </div>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search bill#, vehicle, customer..."
          className="h-8 text-xs w-64"
        />

        <div className="ml-auto flex items-center gap-2">
          <PrintButton
            label={`Insurance PDF (${filteredInvoiceCount})`}
            disabled={rows.length === 0}
            getDocument={async () => {
              const { InsuranceInvoiceDocument } = await import("@/components/pdf/insurance-invoice-pdf");
              return (
                <InsuranceInvoiceDocument
                  groups={groupedForPdf}
                  fy={fy}
                  companySetting={companySetting}
                />
              );
            }}
          />
          <PrintButton
            label={`Customer PDF (${filteredInvoiceCount})`}
            disabled={rows.length === 0}
            getDocument={async () => {
              const { CustomerInvoiceDocument } = await import("@/components/pdf/customer-invoice-pdf");
              return (
                <CustomerInvoiceDocument
                  groups={groupedForPdf}
                  fy={fy}
                  companySetting={companySetting}
                />
              );
            }}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1"
            onClick={downloadCsv}
            disabled={invoiceRows.length === 0}
          >
            Export CSV ({invoiceRows.length})
          </Button>
          <Link href="/invoice/new">
            <Button size="sm" className="h-8 text-xs gap-1">
              <Plus className="w-3.5 h-3.5" />
              New Invoice
            </Button>
          </Link>
        </div>
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-lg flex flex-col">
        <div className={`overflow-auto flex-1 transition-opacity duration-150 ${isLoading ? "opacity-50" : ""}`}>
          <table className="min-w-max text-sm w-full">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 sticky left-0 z-20 bg-slate-50 w-10 whitespace-nowrap">S.No</th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 sticky left-10 z-20 bg-slate-50 w-28 whitespace-nowrap border-r border-slate-200">Bill #</th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-28">Date</th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-28">Job No / Reg No</th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-40">Customer</th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-20">Mat. Code</th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-40">Material</th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-24">HSN</th>
                <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap w-20">Qty</th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-16">Unit</th>
                <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap w-24">Rate</th>
                <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap w-20">Tax %</th>
                <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap w-24">Amount</th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-24">Status</th>
                {hasDraft && <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-20">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {invoiceRows.length === 0 && !isLoading ? (
                <tr>
                  <td colSpan={hasDraft ? 15 : 14} className="px-3 py-12 text-center text-slate-700">
                    No invoices found.
                  </td>
                </tr>
              ) : isLoading && invoiceRows.length === 0 ? (
                <tr>
                  <td colSpan={hasDraft ? 15 : 14} className="px-3 py-12 text-center text-slate-700">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                    Loading…
                  </td>
                </tr>
              ) : (
                invoiceRows.map((r, i) => {
                  const stickyBg = "bg-white";
                  const extraItems = (itemCounts.get(r.id) ?? 1) - 1;
                  return (
                    <tr key={r.item_id} className="border-t border-slate-100 hover:bg-blue-50/40 cursor-pointer" onClick={() => router.push(`/invoice/${r.id}/edit`)}>
                      <td className={`px-3 py-2.5 text-slate-700 text-xs sticky left-0 z-10 ${stickyBg}`}>
                        {i + 1}
                      </td>
                      <td className={`px-3 py-2.5 font-mono text-xs font-medium text-slate-700 sticky left-10 z-10 border-r border-slate-200 whitespace-nowrap ${stickyBg}`}>
                        {r.bill_number}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 text-xs">
                        {fmtDate(r.bill_date)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                        <span className="font-mono text-slate-600">
                          {r.job_ref_no}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-700 text-xs">
                        {r.customer_name ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-600 whitespace-nowrap">
                        {formatCode("M-", r.material_no)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-700 text-xs">
                        {r.material_name}
                        {extraItems > 0 && (
                          <span className="ml-1.5 text-slate-700">(+{extraItems} more)</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-700 whitespace-nowrap">
                        {r.hsn_code ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 text-xs whitespace-nowrap">
                        {parseFloat(r.qty).toFixed(3)}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 text-xs whitespace-nowrap">
                        {r.unit_name ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 text-xs whitespace-nowrap">
                        {fmt2(r.rate)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 text-xs whitespace-nowrap">
                        {parseFloat(r.tax_percentage_item || "0").toFixed(0)}%
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium text-slate-800 text-xs whitespace-nowrap">
                        ₹{fmt2(r.net_amount)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            r.status === INVOICE_STATUS.FINALIZED
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      {hasDraft && (
                        <td className="px-3 py-2.5">
                          {r.status === INVOICE_STATUS.DRAFT && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-700 hover:text-red-500 hover:bg-red-50"
                              title="Delete"
                              onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: r.id, bill_number: r.bill_number }); }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {invoiceRows.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-700 bg-slate-50 rounded-b-lg flex items-center justify-between">
            <span className="flex items-center gap-2">
              {isLoading && <Loader2 className="w-3 h-3 animate-spin" />}
              {filteredInvoiceCount} invoice{filteredInvoiceCount !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`Delete ${deleteTarget?.bill_number}?`}
        description="This will permanently delete the invoice and all its line items. This cannot be undone."
        confirmLabel={isDeleting ? "Deleting…" : "Delete Invoice"}
        onConfirm={handleDelete}
      />

    </div>
  );
}
