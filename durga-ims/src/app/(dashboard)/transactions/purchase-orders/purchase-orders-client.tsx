"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFY } from "@/lib/financial-year";
import { getPurchaseOrders, deletePurchaseOrder } from "@/lib/actions/purchase-orders.actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCode } from "@/lib/utils";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { PrintButton } from "@/components/pdf/print-button";
import { PORegisterDocument } from "@/components/pdf/po-register-pdf";
import type { CompanySetting } from "@/lib/actions/settings.actions";

type ItemRow = {
  // PO header
  id: string;
  po_number: number;
  po_date: Date | string;
  status: string;
  affects_stock: boolean;
  supplier_bill_no: string | null;
  supplier_bill_date: string | null;
  // line item
  item_id: string | null;
  material_id: string | null;
  material_name: string | null;
  material_no: number | null;
  supplier_id: string | null;
  supplier_name: string | null;
  qty: string | null;
  unit_name: string | null;
  rate: string | null;
  tax_percentage: string | null;
  cgst_amount: string | null;
  sgst_amount: string | null;
  igst_amount: string | null;
  amount: string | null;
  gst_type: string | null;
};

type StatusFilter = "All" | "Draft" | "Received";

interface Props {
  initialRows: ItemRow[];
  initialFY: string;
  companySetting?: CompanySetting;
}

function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatAmount(amt: string | null): string {
  if (!amt) return "—";
  return "₹" + parseFloat(amt).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function taxDisplay(row: ItemRow): string {
  const igst = parseFloat(row.igst_amount ?? "0");
  const cgst = parseFloat(row.cgst_amount ?? "0");
  const sgst = parseFloat(row.sgst_amount ?? "0");
  if (igst > 0) return formatAmount(row.igst_amount);
  if (cgst > 0 || sgst > 0) return formatAmount(String(cgst + sgst));
  return "—";
}

export function PurchaseOrdersClient({ initialRows, initialFY, companySetting }: Props) {
  const router = useRouter();
  const { activeFY } = useFY();
  const [rows, setRows] = useState<ItemRow[]>(initialRows);
  const [loadedFY, setLoadedFY] = useState(initialFY);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [deletingPoId, setDeletingPoId] = useState<string | null>(null);
  const [deletingStatus, setDeletingStatus] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [isFetching, setIsFetching] = useState(false);
  const [showRates, setShowRates] = useState(false);

  // Re-fetch when FY changes
  useEffect(() => {
    if (activeFY === loadedFY) return;
    setIsFetching(true);
    getPurchaseOrders(activeFY).then((data) => {
      setRows(data as ItemRow[]);
      setLoadedFY(activeFY);
      setIsFetching(false);
    });
  }, [activeFY, loadedFY]);

  const visible = rows.filter((r) => {
    if (statusFilter !== "All" && r.status !== statusFilter) return false;

    if (dateFrom) {
      const from = new Date(dateFrom);
      const rowDate = typeof r.po_date === "string" ? new Date(r.po_date) : r.po_date;
      if (rowDate < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      const rowDate = typeof r.po_date === "string" ? new Date(r.po_date) : r.po_date;
      if (rowDate > to) return false;
    }

    const q = search.toLowerCase();
    if (!q) return true;
    return (
      (r.supplier_name ?? "").toLowerCase().includes(q) ||
      (r.material_name ?? "").toLowerCase().includes(q) ||
      formatCode("PO-", r.po_number, 4).toLowerCase().includes(q) ||
      String(r.po_number).includes(q) ||
      (r.material_no ? formatCode("M", r.material_no).toLowerCase().includes(q) : false) ||
      (r.material_no ? String(r.material_no).includes(q) : false)
    );
  });



  function handleDeleteClick(r: ItemRow) {
    setDeletingPoId(r.id);
    setDeletingStatus(r.status);
  }

  function confirmDelete() {
    if (!deletingPoId) return;
    startTransition(async () => {
      try {
        await deletePurchaseOrder(deletingPoId);
        setRows((prev) => prev.filter((r) => r.id !== deletingPoId));
        toast.success("Purchase order deleted");
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Delete failed");
      } finally {
        setDeletingPoId(null);
      }
    });
  }

  const deleteTitle = deletingStatus === "Received"
    ? "Delete received purchase order?"
    : "Delete draft purchase order?";
  const deleteDescription = deletingStatus === "Received"
    ? "This will permanently delete the PO and reverse all stock additions. This cannot be undone."
    : "This draft PO will be permanently deleted. No stock was added.";

  const tabs: StatusFilter[] = ["All", "Draft", "Received"];

  function downloadCsv() {
    const headers = ["PO #", "Date", "Supplier", "Material", "Qty", "Unit", "Rate", "Taxable Amount", "CGST", "SGST", "IGST", "Total Amount", "Stock Updated", "Status"];
    const csvRows = visible.map((r) => {
      const taxable = parseFloat(r.amount ?? "0");
      const cgst = parseFloat(r.cgst_amount ?? "0");
      const sgst = parseFloat(r.sgst_amount ?? "0");
      const igst = parseFloat(r.igst_amount ?? "0");
      return [
        `PO-${String(r.po_number).padStart(4, "0")}`,
        new Date(r.po_date).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }),
        r.supplier_name ?? "",
        r.material_name ?? "",
        r.qty ?? "",
        r.unit_name ?? "",
        parseFloat(r.rate ?? "0").toFixed(2),
        taxable.toFixed(2),
        cgst.toFixed(2),
        sgst.toFixed(2),
        igst.toFixed(2),
        (taxable + cgst + sgst + igst).toFixed(2),
        r.affects_stock ? "Yes" : "No",
        r.status,
      ];
    });
    const bom = "﻿";
    const csv = bom + [headers, ...csvRows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `purchase-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Purchase Orders</h1>
          <p className="text-sm text-slate-500 mt-0.5">FY {activeFY}</p>
        </div>
        <Link href="/transactions/purchase-orders/new">
          <Button className="gap-1.5"><Plus className="w-4 h-4" />New PO</Button>
        </Link>
      </div>

      {/* Table card */}
      <div className="flex-1 bg-white rounded-lg border border-slate-200 flex flex-col min-h-0">
        {/* Toolbar */}
        <div className="p-3 border-b border-slate-100 flex items-center gap-3 flex-wrap">
          {/* Status tabs */}
          <div className="flex gap-1">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setStatusFilter(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  statusFilter === t
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
          <Input
            placeholder="Search supplier, material, M001, PO#..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          {isFetching && <span className="text-xs text-slate-400">Loading...</span>}
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
              disabled={visible.length === 0}
            >
              Export CSV ({visible.length})
            </Button>
            <PrintButton
              label={`Print (${visible.length})`}
              disabled={visible.length === 0}
              getDocument={() => (
                <PORegisterDocument
                  rows={visible}
                  fy={activeFY}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  statusFilter={statusFilter}
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
                  { label: "PO#", align: "" },
                  { label: "Mat. Code", align: "" },
                  { label: "Material Name", align: "" },
                  { label: "Supplier", align: "" },
                  { label: "Qty", align: "" },
                  { label: "Unit", align: "" },
                  { label: "Rate", align: "text-right" },
                  { label: "Tax", align: "text-right" },
                  { label: "Amount", align: "text-right" },
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
              {visible.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-4 py-12 text-center text-slate-400">
                    {rows.length === 0 ? "No purchase orders yet. Create your first PO." : "No entries match your filters."}
                  </td>
                </tr>
              )}
              {visible.map((r, i) => (
                <tr
                  key={r.item_id ?? r.id + i}
                  className="border-t border-slate-100 hover:bg-blue-50/40 cursor-pointer"
                  onClick={() => router.push(`/transactions/purchase-orders/${r.id}/edit`)}
                >
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{i + 1}</td>
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{formatDate(r.po_date)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs font-medium text-slate-800 whitespace-nowrap">
                    {formatCode("PO-", r.po_number, 4)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-700 whitespace-nowrap">
                    {r.material_no ? formatCode("M", r.material_no) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-800 whitespace-nowrap">{r.material_name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{r.supplier_name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{r.qty ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{r.unit_name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-800 whitespace-nowrap text-right">
                    {r.rate ? "₹" + parseFloat(r.rate).toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap text-right">{taxDisplay(r)}</td>
                  <td className="px-4 py-2.5 text-slate-800 font-medium whitespace-nowrap text-right">{formatAmount(r.amount)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      r.status === "Received"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }`}>
                      {r.status}
                    </span>
                    {!r.affects_stock && (
                      <span className="ml-1.5 text-xs text-slate-400 italic">no stock</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-500 hover:bg-red-50"
                      title="Delete entire PO"
                      onClick={(e) => { e.stopPropagation(); handleDeleteClick(r); }}
                      disabled={isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={deletingPoId !== null}
        onOpenChange={(open) => { if (!open) setDeletingPoId(null); }}
        title={deleteTitle}
        description={deleteDescription}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        isPending={isPending}
      />
    </div>
  );
}
