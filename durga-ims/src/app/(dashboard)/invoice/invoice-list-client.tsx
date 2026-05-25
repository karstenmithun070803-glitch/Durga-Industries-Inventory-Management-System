"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PrintButton } from "@/components/pdf/print-button";
import { InsuranceInvoiceDocument } from "@/components/pdf/insurance-invoice-pdf";
import { CustomerInvoiceDocument } from "@/components/pdf/customer-invoice-pdf";
import { formatCode } from "@/lib/utils";
import { deleteInvoice, markInvoicePayment } from "@/lib/actions/invoices.actions";
import type { InvoiceRow } from "@/types";
import type { CompanySetting } from "@/lib/actions/settings.actions";
import { Pencil, Trash2, Plus, CreditCard } from "lucide-react";
import { INVOICE_STATUS, PAYMENT_STATUS } from "@/lib/constants";

interface Props {
  rows: InvoiceRow[];
  fy: string;
  companySetting?: CompanySetting;
}

type StatusFilter = "all" | "Draft" | "Finalized" | "Cancelled";

export function InvoiceListClient({ rows, fy, companySetting }: Props) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; bill_number: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<{ id: string; bill_number: string; current_status: string } | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string>(PAYMENT_STATUS.UNPAID);
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState<"all" | string>("all");

  const filtered = useMemo(() => {
    let result = rows;

    if (statusFilter !== "all") result = result.filter((r) => r.status === statusFilter);
    if (paymentFilter !== "all") result = result.filter((r) => r.payment_status === paymentFilter);

    if (dateFrom) result = result.filter((r) => r.bill_date >= dateFrom);
    if (dateTo) result = result.filter((r) => r.bill_date <= dateTo + "T23:59:59");

    if (search.trim()) {
      const s = search.toLowerCase().trim();
      result = result.filter(
        (r) =>
          r.bill_number.toLowerCase().includes(s) ||
          r.vehicle_name?.toLowerCase().includes(s) ||
          r.customer_name?.toLowerCase().includes(s) ||
          r.material_name?.toLowerCase().includes(s) ||
          formatCode("M", r.material_no).toLowerCase().includes(s) ||
          String(r.job_ref_no).includes(s)
      );
    }

    return result;
  }, [rows, statusFilter, paymentFilter, dateFrom, dateTo, search]);

  // Deduplicate: one row per invoice (first item only)
  const invoiceRows = useMemo(
    () => filtered.filter((row, idx, arr) => arr.findIndex((r) => r.id === row.id) === idx),
    [filtered]
  );
  // Item count per invoice id (for the "+N more" badge)
  const itemCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) map.set(r.id, (map.get(r.id) ?? 0) + 1);
    return map;
  }, [filtered]);

  // Count per status tab (unique invoices, not items)
  const counts = useMemo(() => {
    const uniqueIds = new Set(rows.map((r) => r.id));
    const draftIds = new Set(rows.filter((r) => r.status === INVOICE_STATUS.DRAFT).map((r) => r.id));
    const finalizedIds = new Set(rows.filter((r) => r.status === INVOICE_STATUS.FINALIZED).map((r) => r.id));
    const cancelledIds = new Set(rows.filter((r) => r.status === INVOICE_STATUS.CANCELLED).map((r) => r.id));
    return { all: uniqueIds.size, draft: draftIds.size, finalized: finalizedIds.size, cancelled: cancelledIds.size };
  }, [rows]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteInvoice(deleteTarget.id);
      toast.success(`${deleteTarget.bill_number} deleted.`);
      router.refresh();
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
    const headers = ["Bill #", "Date", "Vehicle", "Job Ref", "Customer", "GSTIN", "Net Amount", "Status"];
    const csvRows = invoiceRows.map((r) => [
      r.bill_number,
      fmtDate(r.bill_date),
      r.vehicle_name ?? "",
      r.job_ref_no != null ? `J${String(r.job_ref_no).padStart(5, "0")}` : "",
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

  async function handleSavePayment() {
    if (!paymentTarget) return;
    if (paymentStatus === PAYMENT_STATUS.PAID && !paymentDate) {
      toast.error("Please enter the payment date.");
      return;
    }
    setIsSavingPayment(true);
    try {
      await markInvoicePayment(paymentTarget.id, {
        payment_status: paymentStatus,
        payment_date: paymentDate || null,
        payment_notes: paymentNotes || null,
      });
      toast.success(`${paymentTarget.bill_number} marked as ${paymentStatus}.`);
      setPaymentTarget(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update payment.");
    } finally {
      setIsSavingPayment(false);
    }
  }

  // Group rows by invoice id for PDF generation (one page per invoice)
  const groupedForPdf = useMemo(() => {
    const map = new Map<string, InvoiceRow[]>();
    for (const r of filtered) {
      if (!map.has(r.id)) map.set(r.id, []);
      map.get(r.id)!.push(r);
    }
    return Array.from(map.values());
  }, [filtered]);

  // Unique invoice IDs in filtered set (for count display)
  const filteredInvoiceCount = useMemo(
    () => new Set(filtered.map((r) => r.id)).size,
    [filtered]
  );

  return (
    <div className="p-6 flex flex-col gap-4 h-full">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-lg font-semibold text-slate-800 mr-2">Invoices</h1>

        {/* Status tabs */}
        {(["all", INVOICE_STATUS.DRAFT, INVOICE_STATUS.FINALIZED, INVOICE_STATUS.CANCELLED] as StatusFilter[]).map((s) => {
          const count = s === "all" ? counts.all : s === INVOICE_STATUS.DRAFT ? counts.draft : s === INVOICE_STATUS.FINALIZED ? counts.finalized : counts.cancelled;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                statusFilter === s
                  ? "bg-slate-800 text-white border-slate-800"
                  : "text-slate-500 border-slate-200 hover:border-slate-400"
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
          <span className="text-slate-400 text-xs">—</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 text-xs w-36"
            placeholder="To"
          />
        </div>

        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value as typeof paymentFilter)}
          className="h-8 text-xs border border-slate-200 rounded-md px-2 text-slate-600 bg-white"
        >
          <option value="all">All Payments</option>
          <option value={PAYMENT_STATUS.UNPAID}>Unpaid</option>
          <option value={PAYMENT_STATUS.PARTIAL}>Partial</option>
          <option value={PAYMENT_STATUS.PAID}>Paid</option>
        </select>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search bill#, vehicle, customer, material..."
          className="h-8 text-xs w-64"
        />

        <div className="ml-auto flex items-center gap-2">
          <PrintButton
            label={`Insurance PDF (${filteredInvoiceCount})`}
            disabled={filtered.length === 0}
            getDocument={() => (
              <InsuranceInvoiceDocument
                groups={groupedForPdf}
                fy={fy}
                companySetting={companySetting}
              />
            )}
          />
          <PrintButton
            label={`Customer PDF (${filteredInvoiceCount})`}
            disabled={filtered.length === 0}
            getDocument={() => (
              <CustomerInvoiceDocument
                groups={groupedForPdf}
                fy={fy}
                companySetting={companySetting}
              />
            )}
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
        <div className="overflow-auto flex-1">
          <table className="min-w-max text-sm w-full">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 sticky left-0 z-20 bg-slate-50 w-10 whitespace-nowrap">S.No</th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 sticky left-10 z-20 bg-slate-50 w-28 whitespace-nowrap border-r border-slate-200">Bill #</th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-28">Date</th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-28">Vehicle/Job</th>
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
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-24">Payment</th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoiceRows.length === 0 ? (
                <tr>
                  <td colSpan={16} className="px-3 py-12 text-center text-slate-400">
                    No invoices found.
                  </td>
                </tr>
              ) : (
                invoiceRows.map((r, i) => {
                  const stickyBg = "bg-white";
                  const extraItems = (itemCounts.get(r.id) ?? 1) - 1;
                  return (
                    <tr key={r.item_id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className={`px-3 py-2.5 text-slate-400 text-xs sticky left-0 z-10 ${stickyBg}`}>
                        {i + 1}
                      </td>
                      <td className={`px-3 py-2.5 font-mono text-xs font-medium text-slate-700 sticky left-10 z-10 border-r border-slate-200 whitespace-nowrap ${stickyBg}`}>
                        {r.bill_number}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 text-xs">
                        {fmtDate(r.bill_date)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                        <span className="font-mono text-slate-500">
                          {formatCode("J", r.job_ref_no, 5)}
                        </span>{" "}
                        <span className="text-slate-700">{r.vehicle_name}</span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-700 text-xs">
                        {r.customer_name ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-500 whitespace-nowrap">
                        {formatCode("M", r.material_no)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-700 text-xs">
                        {r.material_name}
                        {extraItems > 0 && (
                          <span className="ml-1.5 text-slate-400">(+{extraItems} more)</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-400 whitespace-nowrap">
                        {r.hsn_code ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 text-xs whitespace-nowrap">
                        {parseFloat(r.qty).toFixed(3)}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 text-xs whitespace-nowrap">
                        {r.unit_name ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 text-xs whitespace-nowrap">
                        {fmt2(r.rate)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-500 text-xs whitespace-nowrap">
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
                              : r.status === INVOICE_STATUS.CANCELLED
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {r.status === INVOICE_STATUS.FINALIZED ? (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer ${
                              r.payment_status === PAYMENT_STATUS.PAID
                                ? "bg-green-50 text-green-700 border border-green-200"
                                : r.payment_status === PAYMENT_STATUS.PARTIAL
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : "bg-red-50 text-red-700 border border-red-200"
                            }`}
                            onClick={() => {
                              setPaymentTarget({ id: r.id, bill_number: r.bill_number, current_status: r.payment_status });
                              setPaymentStatus(r.payment_status ?? PAYMENT_STATUS.UNPAID);
                              setPaymentDate(r.payment_date ?? "");
                              setPaymentNotes(r.payment_notes ?? "");
                            }}
                            title="Click to update payment"
                          >
                            {r.payment_status ?? PAYMENT_STATUS.UNPAID}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          <Link href={`/invoice/${r.id}/edit`}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-400 hover:text-slate-700"
                              title="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                          {r.status === INVOICE_STATUS.FINALIZED && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                              title="Update Payment"
                              onClick={() => {
                                setPaymentTarget({ id: r.id, bill_number: r.bill_number, current_status: r.payment_status });
                                setPaymentStatus(r.payment_status ?? PAYMENT_STATUS.UNPAID);
                                setPaymentDate(r.payment_date ?? "");
                                setPaymentNotes(r.payment_notes ?? "");
                              }}
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {r.status === INVOICE_STATUS.DRAFT && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-400 hover:text-red-500 hover:bg-red-50"
                              title="Delete"
                              onClick={() => setDeleteTarget({ id: r.id, bill_number: r.bill_number })}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {invoiceRows.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400 bg-slate-50 rounded-b-lg flex items-center justify-between">
            <span>{filteredInvoiceCount} invoice{filteredInvoiceCount !== 1 ? "s" : ""}</span>
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

      {/* Payment dialog */}
      {paymentTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-800">
              Update Payment — {paymentTarget.bill_number}
            </h2>

            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-600">Payment Status</p>
              <div className="flex flex-col gap-2">
                {(Object.values(PAYMENT_STATUS) as string[]).map((s) => (
                  <label key={s} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="payment_status"
                      value={s}
                      checked={paymentStatus === s}
                      onChange={() => setPaymentStatus(s)}
                      className="accent-slate-700"
                    />
                    <span className={`text-xs font-medium ${
                      s === PAYMENT_STATUS.PAID ? "text-green-700"
                      : s === PAYMENT_STATUS.PARTIAL ? "text-amber-700"
                      : "text-red-700"
                    }`}>{s}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">
                Payment Date {paymentStatus === PAYMENT_STATUS.PAID && <span className="text-red-500">*</span>}
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Notes (optional)</label>
              <textarea
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="e.g. Cheque #1234, NEFT ref..."
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPaymentTarget(null)}
                disabled={isSavingPayment}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleSavePayment} disabled={isSavingPayment}>
                {isSavingPayment ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
