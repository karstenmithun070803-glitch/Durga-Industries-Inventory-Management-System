"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useFY } from "@/lib/financial-year";
import { getPurchaseOrders, deletePurchaseOrder } from "@/lib/actions/purchase-orders.actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCode } from "@/lib/utils";
import { Eye, Pencil, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

type PORow = {
  id: string;
  po_number: number;
  po_date: Date | string;
  supplier_name: string;
  total_amount: string;
  status: string;
  item_count: number;
};

type StatusFilter = "All" | "Draft" | "Received";

interface Props {
  initialOrders: PORow[];
  initialFY: string;
}

function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatAmount(amt: string): string {
  return "₹" + parseFloat(amt).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PurchaseOrdersClient({ initialOrders, initialFY }: Props) {
  const { activeFY } = useFY();
  const [orders, setOrders] = useState<PORow[]>(initialOrders);
  const [loadedFY, setLoadedFY] = useState(initialFY);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingStatus, setDeletingStatus] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [isFetching, setIsFetching] = useState(false);

  // Re-fetch when FY changes
  useEffect(() => {
    if (activeFY === loadedFY) return;
    setIsFetching(true);
    getPurchaseOrders(activeFY).then((rows) => {
      setOrders(rows as PORow[]);
      setLoadedFY(activeFY);
      setIsFetching(false);
    });
  }, [activeFY, loadedFY]);

  const visible = orders.filter((o) => {
    if (statusFilter !== "All" && o.status !== statusFilter) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      o.supplier_name.toLowerCase().includes(q) ||
      formatCode("PO-", o.po_number, 4).toLowerCase().includes(q) ||
      String(o.po_number).includes(q)
    );
  });

  function handleDeleteClick(o: PORow) {
    setDeletingId(o.id);
    setDeletingStatus(o.status);
  }

  function confirmDelete() {
    if (!deletingId) return;
    startTransition(async () => {
      try {
        await deletePurchaseOrder(deletingId);
        setOrders((prev) => prev.filter((o) => o.id !== deletingId));
        toast.success("Purchase order deleted");
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Delete failed");
      } finally {
        setDeletingId(null);
      }
    });
  }

  const tabs: StatusFilter[] = ["All", "Draft", "Received"];
  const draftCount = orders.filter((o) => o.status === "Draft").length;
  const receivedCount = orders.filter((o) => o.status === "Received").length;
  const tabCounts: Record<StatusFilter, number> = {
    All: orders.length,
    Draft: draftCount,
    Received: receivedCount,
  };

  const deleteTitle = deletingStatus === "Received"
    ? "Delete received purchase order?"
    : "Delete draft purchase order?";
  const deleteDescription = deletingStatus === "Received"
    ? "This will permanently delete the PO and reverse all stock additions. This cannot be undone."
    : "This draft PO will be permanently deleted. No stock was added.";

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
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                  statusFilter === t ? "bg-slate-700 text-white" : "bg-white text-slate-500"
                }`}>
                  {tabCounts[t]}
                </span>
              </button>
            ))}
          </div>
          <Input
            placeholder="Search by PO number, supplier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          {isFetching && <span className="text-xs text-slate-400">Loading...</span>}
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1 min-w-0">
          <table className="min-w-max text-sm w-full">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr>
                {["S.No", "PO Number", "Date", "Supplier", "Items", "Amount", "Status", "Actions"].map((h) => (
                  <th key={h} className={`px-4 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap ${h === "Amount" ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                    {orders.length === 0 ? "No purchase orders yet. Create your first PO." : "No orders match your search."}
                  </td>
                </tr>
              )}
              {visible.map((o, i) => (
                <tr key={o.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{i + 1}</td>
                  <td className="px-4 py-2.5 font-mono text-xs font-medium text-slate-800 whitespace-nowrap">
                    {formatCode("PO-", o.po_number, 4)}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{formatDate(o.po_date)}</td>
                  <td className="px-4 py-2.5 text-slate-800 whitespace-nowrap">{o.supplier_name}</td>
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{o.item_count} item{o.item_count !== 1 ? "s" : ""}</td>
                  <td className="px-4 py-2.5 text-slate-800 font-medium whitespace-nowrap text-right">{formatAmount(o.total_amount)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      o.status === "Received"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      {o.status === "Received" && (
                        <Link href={`/transactions/purchase-orders/${o.id}/view`}>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-600 hover:bg-slate-100" title="View">
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                      )}
                      <Link href={`/transactions/purchase-orders/${o.id}/edit`}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-7 w-7 ${o.status === "Received" ? "text-amber-600 hover:bg-amber-50" : "text-slate-600 hover:bg-slate-100"}`}
                          title={o.status === "Received" ? "Edit (will reverse & reapply stock)" : "Edit"}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-500 hover:bg-red-50"
                        title="Delete"
                        onClick={() => handleDeleteClick(o)}
                        disabled={isPending}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={deletingId !== null}
        onOpenChange={(open) => { if (!open) setDeletingId(null); }}
        title={deleteTitle}
        description={deleteDescription}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        isPending={isPending}
      />
    </div>
  );
}
