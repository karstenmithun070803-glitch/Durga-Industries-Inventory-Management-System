"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { cn, formatCode } from "@/lib/utils";
import {
  getStockMovementHistory,
  adjustStock,
  getJobCostData,
  getStockForMaterial,
} from "@/lib/actions/stock.actions";
import type {
  StockMaterialRow,
  StockSummary,
  StockLedgerEntry,
  VehicleSearchRow,
  JobCostResult,
} from "@/lib/actions/stock.actions";
import type { CompanySetting } from "@/lib/actions/settings.actions";
import { History, SlidersHorizontal, RefreshCw, ChevronDown, ChevronUp, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { PrintButton } from "@/components/pdf/print-button";
import { JobCostDocument } from "@/components/pdf/job-cost-pdf";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtQty(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: 4 });
}

function fmtAmt(v: number): string {
  if (isNaN(v)) return "—";
  return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtLargeAmt(v: number): string {
  if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(2)} Cr`;
  if (v >= 1_00_000) return `₹${(v / 1_00_000).toFixed(2)} L`;
  if (v >= 1_000) return `₹${(v / 1_000).toFixed(1)} K`;
  return fmtAmt(v);
}

function fmtDateTime(d: Date): string {
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtLastUpdated(d: Date): string {
  const now = new Date();
  const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Today at ${time}`;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + ` at ${time}`;
}

type StockStatus = "ok" | "low" | "out" | "inactive";

function getStatus(row: StockMaterialRow): StockStatus {
  if (!row.is_active) return "inactive";
  const stock = parseFloat(row.current_stock);
  if (stock === 0) return "out";
  const minL = parseFloat(row.min_level ?? "0");
  if (minL > 0 && stock < minL) return "low";
  return "ok";
}

type TabFilter = "all" | "low" | "out" | "inactive";

const LEDGER_TYPE_COLOR: Record<string, string> = {
  PO_INWARD: "bg-blue-100 text-blue-700",
  ISSUE: "bg-orange-100 text-orange-700",
  REVERSAL: "bg-purple-100 text-purple-700",
  ADJUSTMENT: "bg-red-100 text-red-700",
};

const LEDGER_TYPE_LABELS: Record<string, string> = {
  PO_INWARD: "PO Receipt",
  ISSUE: "Material Issue",
  REVERSAL: "Reversal",
  ADJUSTMENT: "Manual Adjustment",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  initialRows: StockMaterialRow[];
  summary: StockSummary;
  vehicles: VehicleSearchRow[];
  companySetting?: CompanySetting;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StockClient({ initialRows, summary: initialSummary, vehicles, companySetting }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState(initialRows);
  const [summary, setSummary] = useState(initialSummary);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Table filters
  const [tab, setTab] = useState<TabFilter>("all");
  const [search, setSearch] = useState("");

  // History drawer
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyMaterial, setHistoryMaterial] = useState<StockMaterialRow | null>(null);
  const [historyEntries, setHistoryEntries] = useState<StockLedgerEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Adjustment dialog
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustMaterial, setAdjustMaterial] = useState<StockMaterialRow | null>(null);
  const [adjustFreshStock, setAdjustFreshStock] = useState<string | null>(null);
  const [newQty, setNewQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Job cost search
  const [jobCostOpen, setJobCostOpen] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [jobCostResult, setJobCostResult] = useState<JobCostResult | null>(null);
  const [jobCostLoading, setJobCostLoading] = useState(false);

  // ---------------------------------------------------------------------------
  // Refresh
  // ---------------------------------------------------------------------------

  async function handleRefresh() {
    await new Promise<void>((resolve) => startTransition(() => { router.refresh(); resolve(); }));
    setLastUpdated(new Date());
  }

  // ---------------------------------------------------------------------------
  // Filtered table rows
  // ---------------------------------------------------------------------------

  const filtered = useMemo(() => {
    let result = rows;
    if (tab === "low") result = result.filter((r) => getStatus(r) === "low");
    else if (tab === "out") result = result.filter((r) => getStatus(r) === "out");
    else if (tab === "inactive") result = result.filter((r) => getStatus(r) === "inactive");
    else result = result.filter((r) => r.is_active); // "all" = active only

    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(s) ||
          formatCode("M", r.material_no).toLowerCase().includes(s)
      );
    }
    return result;
  }, [rows, tab, search]);

  // Summary tab counts
  const tabCounts = useMemo(() => {
    const active = rows.filter((r) => r.is_active);
    return {
      low: active.filter((r) => getStatus(r) === "low").length,
      out: active.filter((r) => getStatus(r) === "out").length,
      inactive: rows.filter((r) => getStatus(r) === "inactive").length,
    };
  }, [rows]);

  // ---------------------------------------------------------------------------
  // History drawer
  // ---------------------------------------------------------------------------

  async function openHistory(mat: StockMaterialRow) {
    setHistoryMaterial(mat);
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryEntries([]);
    const entries = await getStockMovementHistory(mat.id, 100);
    setHistoryEntries(entries);
    setHistoryLoading(false);
  }

  // ---------------------------------------------------------------------------
  // Adjustment dialog
  // ---------------------------------------------------------------------------

  async function openAdjust(mat: StockMaterialRow) {
    const initialQty = parseFloat(mat.current_stock).toString();
    setAdjustMaterial(mat);
    setAdjustFreshStock(null);
    setNewQty(initialQty);
    setAdjustReason("");
    setAdjustOpen(true);
    // Fetch live stock — only update the input if the user hasn't changed the pre-fill yet
    const fresh = await getStockForMaterial(mat.id);
    if (fresh) {
      setAdjustFreshStock(fresh.current_stock);
      setNewQty((prev) => (prev === initialQty ? parseFloat(fresh.current_stock).toString() : prev));
    }
  }

  const adjustedQty = parseFloat(newQty);
  const currentQty = parseFloat(adjustFreshStock ?? adjustMaterial?.current_stock ?? "0");
  const delta = isNaN(adjustedQty) ? 0 : adjustedQty - currentQty;
  const deltaLabel = isNaN(adjustedQty)
    ? ""
    : delta === 0
    ? "No change in quantity"
    : delta > 0
    ? `This will ADD ${fmtQty(Math.abs(delta))} to stock`
    : `This will REMOVE ${fmtQty(Math.abs(delta))} from stock`;

  async function handleAdjust() {
    if (!adjustMaterial) return;
    if (isNaN(adjustedQty)) { toast.error("Enter a valid quantity."); return; }
    if (adjustedQty < 0) { toast.error("Stock cannot go below zero."); return; }
    if (!adjustReason.trim() || adjustReason.trim().length < 10) {
      toast.error("Reason must be at least 10 characters.");
      return;
    }
    setIsSaving(true);
    try {
      await adjustStock(adjustMaterial.id, adjustedQty, adjustReason);
      toast.success(`Stock adjusted for ${adjustMaterial.name}`);
      setAdjustOpen(false);
      router.refresh();
      setLastUpdated(new Date());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Adjustment failed.");
    } finally {
      setIsSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Job cost search
  // ---------------------------------------------------------------------------

  async function handleVehicleSelect(vehicleId: string) {
    setSelectedVehicleId(vehicleId);
    setJobCostResult(null);
    setJobCostLoading(true);
    const result = await getJobCostData(vehicleId);
    setJobCostResult(result);
    setJobCostLoading(false);
  }

  const vehicleOptions = useMemo(
    () =>
      vehicles.map((v) => ({
        value: v.id,
        label: `Job #${v.job_ref_no} — ${v.vehicle_name}${v.customer_name ? ` (${v.customer_name})` : ""}${!v.is_active ? " [Inactive]" : ""}`,
      })),
    [vehicles]
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="p-6 flex flex-col gap-5 h-full">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-800">Stock Dashboard</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            Last updated: {fmtLastUpdated(lastUpdated)}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={handleRefresh}
            disabled={isPending}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isPending && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard
          label="Total Materials"
          value={String(summary.totalMaterials)}
          sub="active materials"
        />
        <SummaryCard
          label="Stock Value"
          value={fmtLargeAmt(summary.totalStockValue)}
          sub={summary.materialsExcludedFromValue > 0
            ? `* excludes ${summary.materialsExcludedFromValue} with no purchase history`
            : "based on last PO rate"}
        />
        <SummaryCard
          label="Low Stock"
          value={String(summary.lowStockCount)}
          sub="below minimum level"
          accent={summary.lowStockCount > 0 ? "amber" : undefined}
          onClick={() => setTab("low")}
          clickable
        />
        <SummaryCard
          label="Out of Stock"
          value={String(summary.outOfStockCount)}
          sub="zero quantity"
          accent={summary.outOfStockCount > 0 ? "red" : undefined}
          onClick={() => setTab("out")}
          clickable
        />
      </div>

      {/* ── Job Cost Search ── */}
      <JobCostPanel
        vehicleOptions={vehicleOptions}
        selectedVehicleId={selectedVehicleId}
        onSelect={handleVehicleSelect}
        result={jobCostResult}
        loading={jobCostLoading}
        companySetting={companySetting}
        open={jobCostOpen}
        onToggle={() => setJobCostOpen((p) => !p)}
      />

      {/* ── Materials Table ── */}
      <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-lg flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 flex-wrap">
          {(["all", "low", "out", "inactive"] as TabFilter[]).map((t) => {
            const label =
              t === "all" ? `Active (${search.trim() ? filtered.length : summary.totalMaterials})`
              : t === "low" ? `Low Stock (${tabCounts.low})`
              : t === "out" ? `Out of Stock (${tabCounts.out})`
              : `Inactive with Stock (${tabCounts.inactive})`;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                  tab === t
                    ? "bg-slate-800 text-white border-slate-800"
                    : "text-slate-500 border-slate-200 hover:border-slate-400"
                )}
              >
                {label}
              </button>
            );
          })}
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search material name or code..."
            className="h-8 text-xs w-56 ml-2"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs ml-auto"
            onClick={() => {
              const headers = ["Code", "Material Name", "Unit", "Current Stock", "Min Level", "Max Level", "Last PO Rate", "Stock Value", "Status"];
              const statusLabel: Record<string, string> = { ok: "OK", low: "Low Stock", out: "Out of Stock", inactive: "Inactive" };
              const csvRows = filtered.map((r) => {
                const stock = parseFloat(r.current_stock);
                const rate = r.last_po_rate ? parseFloat(r.last_po_rate) : null;
                return [
                  formatCode("M", r.material_no),
                  r.name,
                  r.unit_name ?? "",
                  stock.toFixed(4),
                  r.min_level ? parseFloat(r.min_level).toFixed(4) : "",
                  r.max_level ? parseFloat(r.max_level).toFixed(4) : "",
                  rate != null ? rate.toFixed(2) : "",
                  rate != null ? (stock * rate).toFixed(2) : "",
                  statusLabel[getStatus(r)] ?? "",
                ];
              });
              const bom = "﻿";
              const csv = bom + [headers, ...csvRows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `stock-${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export CSV ({filtered.length})
          </Button>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1">
          <table className="min-w-max text-sm w-full">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap">Code</th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap">Material Name</th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap">Unit</th>
                <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap">Current Stock</th>
                <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap">Min Level</th>
                <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap">Last PO Rate</th>
                <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap">Stock Value</th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap">Status</th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-12 text-center text-slate-400 text-sm">
                    No materials found.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const status = getStatus(row);
                  const stock = parseFloat(row.current_stock);
                  const rate = row.last_po_rate ? parseFloat(row.last_po_rate) : null;
                  const value = rate != null ? stock * rate : null;

                  const rowBg =
                    status === "out" ? "bg-red-50"
                    : status === "low" ? "bg-amber-50"
                    : status === "inactive" ? "bg-slate-50"
                    : "";

                  return (
                    <tr key={row.id} className={cn("border-t border-slate-100 hover:bg-slate-50/50 transition-colors", rowBg)}>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500 font-mono text-xs">
                        {formatCode("M", row.material_no)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-800">
                        {row.name}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                        {row.unit_name ?? "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-right font-semibold text-slate-800">
                        {fmtQty(row.current_stock)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-right text-slate-500">
                        {row.min_level && parseFloat(row.min_level) > 0 ? fmtQty(row.min_level) : "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-right text-slate-600">
                        {rate != null ? fmtAmt(rate) : "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-right text-slate-600">
                        {value != null ? fmtAmt(value) : "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <StatusBadge status={status} />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openHistory(row)}
                            title="View stock history"
                            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                          >
                            <History className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openAdjust(row)}
                            title="Adjust stock"
                            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                          >
                            <SlidersHorizontal className="w-4 h-4" />
                          </button>
                          {(status === "low" || status === "out") && (
                            <Link
                              href={`/transactions/purchase-orders/new?prefill=${row.id}`}
                              title="Create Purchase Order for this material"
                            >
                              <button className="p-1 rounded hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors">
                                <ShoppingCart className="w-4 h-4" />
                              </button>
                            </Link>
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
      </div>

      {/* ── Stock History Drawer ── */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent className="w-[560px] sm:max-w-[560px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-base">
              Stock History — {historyMaterial?.name}
              <span className="ml-2 text-xs font-normal text-slate-400 font-mono">
                {historyMaterial ? formatCode("M", historyMaterial.material_no) : ""}
              </span>
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            {historyLoading ? (
              <p className="text-sm text-slate-400 py-8 text-center">Loading history…</p>
            ) : historyEntries.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">No movement history for this material.</p>
            ) : (
              <>
                <div className="overflow-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="px-2 py-2 text-left font-medium text-slate-600 whitespace-nowrap">Date & Time</th>
                        <th className="px-2 py-2 text-left font-medium text-slate-600 whitespace-nowrap">Type</th>
                        <th className="px-2 py-2 text-left font-medium text-slate-600 whitespace-nowrap">Reference</th>
                        <th className="px-2 py-2 text-right font-medium text-slate-600 whitespace-nowrap">Change</th>
                        <th className="px-2 py-2 text-right font-medium text-slate-600 whitespace-nowrap">Stock After</th>
                        <th className="px-2 py-2 text-left font-medium text-slate-600">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyEntries.map((e) => {
                        const change = parseFloat(e.qty_change);
                        const isPos = change >= 0;
                        return (
                          <tr key={e.id} className="border-t border-slate-100">
                            <td className="px-2 py-1.5 whitespace-nowrap text-slate-500">{fmtDateTime(e.created_at)}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap">
                              <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium", LEDGER_TYPE_COLOR[e.transaction_type] ?? "bg-slate-100 text-slate-600")}>
                                {LEDGER_TYPE_LABELS[e.transaction_type] ?? e.transaction_type.replace("_", " ")}
                              </span>
                            </td>
                            <td className="px-2 py-1.5 whitespace-nowrap text-slate-600">{e.reference_label}</td>
                            <td className={cn("px-2 py-1.5 whitespace-nowrap text-right font-semibold", isPos ? "text-green-600" : "text-red-600")}>
                              {isPos ? "+" : ""}{fmtQty(e.qty_change)}
                            </td>
                            <td className="px-2 py-1.5 whitespace-nowrap text-right text-slate-700">{fmtQty(e.stock_after)}</td>
                            <td className="px-2 py-1.5 text-slate-400 max-w-[200px] truncate" title={e.reason ?? ""}>
                              {e.reason ? (e.reason.length > 80 ? e.reason.slice(0, 80) + "…" : e.reason) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {historyEntries.length === 100 && (
                  <p className="text-xs text-slate-400 text-center py-2">
                    Showing last 100 movements. For older history use the Monthly Stock Report.
                  </p>
                )}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Stock Adjustment Dialog ── */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Adjust Stock — {adjustMaterial?.name}
              <span className="ml-2 text-xs font-normal text-slate-400 font-mono">
                {adjustMaterial ? formatCode("M", adjustMaterial.material_no) : ""}
              </span>
            </DialogTitle>
            <DialogDescription>
              Manual stock corrections are permanent and logged in the stock movement history.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <div>
                <span className="text-sm text-slate-500">Current Stock</span>
                {adjustFreshStock === null && (
                  <span className="ml-2 text-xs text-slate-400">(loading live value…)</span>
                )}
              </div>
              <span className="text-2xl font-bold text-slate-800">
                {fmtQty(adjustFreshStock ?? adjustMaterial?.current_stock ?? "0")}
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">New Quantity</label>
              <Input
                type="number"
                min={0}
                step="any"
                value={newQty}
                onChange={(e) => setNewQty(e.target.value)}
                className="text-sm"
                placeholder="Enter new quantity"
              />
              {deltaLabel && (
                <p className={cn("text-xs mt-1", delta === 0 ? "text-slate-400" : delta > 0 ? "text-green-600" : "text-red-600")}>
                  {deltaLabel}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Reason <span className="text-slate-400 font-normal">(required)</span></label>
              <Textarea
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="e.g. Physical count mismatch — warehouse counted 430, system shows 450"
                rows={3}
                className="text-sm resize-none"
              />
              {adjustReason.trim().length > 0 && adjustReason.trim().length < 10 && (
                <p className="text-xs text-red-500">Minimum 10 characters required.</p>
              )}
            </div>

            <p className="text-xs text-slate-400">
              ⚠ Adjustments are permanent and cannot be undone. They will appear in this material&apos;s movement history.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleAdjust} disabled={isSaving}>
              {isSaving ? "Saving…" : "Confirm Adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({
  label, value, sub, accent, onClick, clickable,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: "amber" | "red";
  onClick?: () => void;
  clickable?: boolean;
}) {
  const accentClass =
    accent === "red" ? "border-red-200 bg-red-50"
    : accent === "amber" ? "border-amber-200 bg-amber-50"
    : "border-slate-200 bg-white";

  const valueClass =
    accent === "red" ? "text-red-700"
    : accent === "amber" ? "text-amber-700"
    : "text-slate-800";

  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-lg border p-4 transition-shadow",
        accentClass,
        clickable && "cursor-pointer hover:shadow-sm"
      )}
    >
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={cn("text-2xl font-bold mt-1", valueClass)}>{value}</p>
      <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: StockStatus }) {
  if (status === "out") return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Out of Stock</span>;
  if (status === "low") return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Low Stock</span>;
  if (status === "inactive") return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">Inactive</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">OK</span>;
}

// ---------------------------------------------------------------------------
// Job Cost Panel
// ---------------------------------------------------------------------------

function JobCostPanel({
  vehicleOptions, selectedVehicleId, onSelect, result, loading, companySetting, open, onToggle,
}: {
  vehicleOptions: { value: string; label: string }[];
  selectedVehicleId: string | null;
  onSelect: (id: string) => void;
  result: JobCostResult | null;
  loading: boolean;
  companySetting?: CompanySetting;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors rounded-lg"
      >
        <span>Job Cost Search</span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-slate-100">
          <div className="mt-3 flex items-center gap-3">
            <div className="w-96">
              <Combobox
                options={vehicleOptions}
                value={selectedVehicleId ?? ""}
                onChange={onSelect}
                placeholder="Search by job #, vehicle name, or customer..."
              />
            </div>
            {selectedVehicleId && (
              <span className="text-xs text-slate-400">Select a vehicle to see material costs</span>
            )}
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
                          <th className="px-3 py-2 text-right font-medium text-slate-600 whitespace-nowrap">Billed</th>
                          <th className="px-3 py-2 text-right font-medium text-slate-600 whitespace-nowrap">Unbilled</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.rows.map((r, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            <td className="px-3 py-1.5 whitespace-nowrap text-slate-800">{r.material_name}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap text-slate-500">{r.contractor_name ?? "—"}</td>
                            <td className="px-3 py-1.5 text-right whitespace-nowrap">{r.total_qty.toLocaleString("en-IN", { maximumFractionDigits: 4 })}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap text-slate-500">{r.unit_name ?? "—"}</td>
                            <td className="px-3 py-1.5 text-right whitespace-nowrap text-slate-600">{fmtAmt(r.rate)}</td>
                            <td className="px-3 py-1.5 text-right whitespace-nowrap font-medium">{fmtAmt(r.total_amount)}</td>
                            <td className="px-3 py-1.5 text-right whitespace-nowrap text-green-700">{fmtAmt(r.billed_amount)}</td>
                            <td className={cn("px-3 py-1.5 text-right whitespace-nowrap font-semibold", r.unbilled_amount > 0 ? "text-amber-700" : "text-slate-400")}>
                              {fmtAmt(r.unbilled_amount)}
                            </td>
                          </tr>
                        ))}
                        {/* Totals row */}
                        <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-sm">
                          <td colSpan={5} className="px-3 py-2 text-right text-slate-600">TOTAL</td>
                          <td className="px-3 py-2 text-right text-slate-800">{fmtAmt(result.totals.total_cost)}</td>
                          <td className="px-3 py-2 text-right text-green-700">{fmtAmt(result.totals.total_billed)}</td>
                          <td className={cn("px-3 py-2 text-right", result.totals.total_unbilled > 0 ? "text-amber-700" : "text-slate-400")}>
                            {fmtAmt(result.totals.total_unbilled)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Print button */}
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
      )}
    </div>
  );
}
