"use client";

import { useState, useMemo, useTransition, useEffect, useRef, useCallback } from "react";
import { useListKeyboardNav } from "@/hooks/use-list-keyboard-nav";
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
import { cn, formatCode } from "@/lib/utils";
import {
  getStockMovementHistory,
  adjustStock,
  getStockForMaterial,
} from "@/lib/actions/stock.actions";
import type {
  StockMaterialRow,
  StockSummary,
  StockLedgerEntry,
  DraftCommitmentsResult,
} from "@/lib/actions/stock.actions";
import { History, SlidersHorizontal, RefreshCw, ShoppingCart, AlertTriangle } from "lucide-react";
import Link from "next/link";

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
  if (v >= 10_00_000)   return `₹${(v / 1_00_000).toFixed(2)} L`;
  if (v >= 1_00_000)    return "₹" + Math.round(v).toLocaleString("en-IN");
  if (v >= 1_000)       return `₹${(v / 1_000).toFixed(1)} K`;
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

type StockStatus = "ok" | "out";

function getStatus(row: StockMaterialRow): StockStatus {
  if (parseFloat(row.current_stock) === 0) return "out";
  return "ok";
}

type TabFilter = "all" | "out";

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

const ADJUSTMENT_TYPES = [
  "Physical Count Correction",
  "Damage / Scrap",
  "Theft / Loss",
  "Wastage / Spoilage",
  "Transfer / Write-off",
  "Opening Stock Correction",
  "Other",
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  initialRows: StockMaterialRow[];
  summary: StockSummary;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StockClient({ initialRows, summary: initialSummary }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState(initialRows);
  const [summary, setSummary] = useState(initialSummary);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => { setRows(initialRows); }, [initialRows]);
  useEffect(() => { setSummary(initialSummary); }, [initialSummary]);

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
  const [adjustStandardCost, setAdjustStandardCost] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Adjustment guardrail state
  const [adjustType, setAdjustType] = useState("Physical Count Correction");
  const [draftCommitments, setDraftCommitments] = useState<DraftCommitmentsResult | null>(null);
  const [commitmentBreachAcknowledged, setCommitmentBreachAcknowledged] = useState(false);

  // ---------------------------------------------------------------------------
  // Refresh — update timestamp only after transition fully settles
  // ---------------------------------------------------------------------------

  const searchRef = useRef<HTMLInputElement>(null);

  const refreshTriggered = useRef(false);
  const prevPending = useRef(false);

  useEffect(() => {
    if (prevPending.current && !isPending && refreshTriggered.current) {
      setLastUpdated(new Date());
      refreshTriggered.current = false;
    }
    prevPending.current = isPending;
  }, [isPending]);

  const handleRefresh = useCallback(() => {
    refreshTriggered.current = true;
    startTransition(() => { router.refresh(); });
  }, [router]);

  // ---------------------------------------------------------------------------
  // Derived adjustment values
  // ---------------------------------------------------------------------------

  const adjustedQty = parseFloat(newQty);
  const currentQty = parseFloat(adjustFreshStock ?? adjustMaterial?.current_stock ?? "0");
  const delta = isNaN(adjustedQty) ? 0 : adjustedQty - currentQty;

  const isReduction = delta < 0;
  const commitmentBreached = isReduction
    && draftCommitments !== null
    && draftCommitments.totalCommitted > adjustedQty;

  const effectiveRateStr = adjustMaterial?.last_po_rate ?? adjustMaterial?.standard_cost ?? null;
  const effectiveRate = effectiveRateStr !== null ? parseFloat(effectiveRateStr) : null;
  const writeOff = (isReduction && effectiveRate !== null && !isNaN(effectiveRate))
    ? Math.abs(delta) * effectiveRate
    : null;

  const isLargeReduction = isReduction
    && currentQty > 0
    && Math.abs(delta) / currentQty > 0.5
    && Math.abs(delta) >= 10;

  const deltaLabel = isNaN(adjustedQty)
    ? ""
    : delta === 0
    ? "No change in quantity"
    : delta > 0
    ? `This will ADD ${fmtQty(Math.abs(delta))} to stock`
    : `This will REMOVE ${fmtQty(Math.abs(delta))} from stock`;

  // ---------------------------------------------------------------------------
  // Auto-reset breach acknowledgment when qty becomes safe
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const isBreached = isReduction && draftCommitments !== null &&
      draftCommitments.totalCommitted > adjustedQty;
    if (!isBreached && commitmentBreachAcknowledged) {
      setCommitmentBreachAcknowledged(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjustedQty]);

  // ---------------------------------------------------------------------------
  // Filtered table rows
  // ---------------------------------------------------------------------------

  const filtered = useMemo(() => {
    let result = rows;
    if (tab === "out") result = result.filter((r) => getStatus(r) === "out");

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

  const tabCounts = useMemo(() => ({
    out: rows.filter((r) => getStatus(r) === "out").length,
  }), [rows]);

  // ---------------------------------------------------------------------------
  // List keyboard nav (declared after filtered so itemCount is available)
  // ---------------------------------------------------------------------------

  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;

  const { highlightedIndex, setHighlightedIndex, searchProps, tableProps } = useListKeyboardNav({
    itemCount: filtered.length,
    searchRef,
    onActivate: (i) => openHistory(filteredRef.current[i]),
    onRefresh: handleRefresh,
  });

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
    const initialCost = mat.standard_cost ? parseFloat(mat.standard_cost).toString() : "";
    setAdjustMaterial(mat);
    setAdjustFreshStock(null);
    setNewQty(initialQty);
    setAdjustReason("");
    setAdjustStandardCost(initialCost);
    setAdjustType("Physical Count Correction");
    setDraftCommitments(null);
    setCommitmentBreachAcknowledged(false);
    setAdjustOpen(true);
    // Fetch live stock + draft commitments in one round-trip
    const fresh = await getStockForMaterial(mat.id);
    if (fresh) {
      setAdjustFreshStock(fresh.current_stock);
      setNewQty((prev) => (prev === initialQty ? parseFloat(fresh.current_stock).toString() : prev));
      const freshCost = fresh.standard_cost ? parseFloat(fresh.standard_cost).toString() : "";
      setAdjustStandardCost((prev) => (prev === initialCost ? freshCost : prev));
      setDraftCommitments(fresh.draftCommitments);
    }
  }

  async function handleAdjust() {
    if (!adjustMaterial) return;
    if (isNaN(adjustedQty)) { toast.error("Enter a valid quantity."); return; }
    if (adjustedQty < 0) { toast.error("Stock cannot go below zero."); return; }
    if (!adjustReason.trim() || adjustReason.trim().length < 10) {
      toast.error("Reason must be at least 10 characters.");
      return;
    }
    const showCostField = adjustMaterial.last_po_rate === null;
    let parsedCost: number | undefined;
    if (showCostField && adjustStandardCost.trim() !== "") {
      parsedCost = parseFloat(adjustStandardCost);
      if (isNaN(parsedCost) || parsedCost < 0) {
        toast.error("Unit cost must be a non-negative number.");
        return;
      }
    }
    // Draft commitment guards
    if (isReduction && draftCommitments === null) {
      toast.error("Still loading issue slip data. Please wait a moment.");
      return;
    }
    if (commitmentBreached && !commitmentBreachAcknowledged) {
      toast.error("Acknowledge the impact on Draft issue slips before proceeding.");
      return;
    }

    setIsSaving(true);
    try {
      await adjustStock(adjustMaterial.id, adjustedQty, adjustReason, parsedCost, adjustType);
      toast.success(`Stock adjusted for ${adjustMaterial.name}`);
      setAdjustOpen(false);
      refreshTriggered.current = true;
      startTransition(() => { router.refresh(); });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Adjustment failed.");
    } finally {
      setIsSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="p-6 flex flex-col gap-5 h-full">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-800">Stock Dashboard</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-700">
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
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard
          label="Total Materials"
          value={String(summary.totalMaterials)}
          sub="active materials"
        />
        <SummaryCard
          label="Stock Value"
          value={fmtLargeAmt(summary.totalStockValue)}
          sub={[
            summary.standardCostCount > 0 ? `${summary.standardCostCount} use standard cost` : null,
            summary.materialsExcludedFromValue > 0 ? `${summary.materialsExcludedFromValue} excl. (no cost set)` : null,
          ].filter(Boolean).join(" · ") || "based on last PO rate (incl. GST)"}
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

      {/* ── Materials Table ── */}
      <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-lg flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 flex-wrap">
          {(["all", "out"] as TabFilter[]).map((t) => {
            const label =
              t === "all" ? `All (${search.trim() ? filtered.length : summary.totalMaterials})`
              : `Out of Stock (${tabCounts.out})`;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                  tab === t
                    ? "bg-slate-800 text-white border-slate-800"
                    : "text-slate-600 border-slate-200 hover:border-slate-400"
                )}
              >
                {label}
              </button>
            );
          })}
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setHighlightedIndex(-1); }}
            placeholder="Search material name or code..."
            className="h-8 text-xs w-56 ml-2"
            data-testid="stock-search"
            {...searchProps}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs ml-auto"
            onClick={() => {
              const headers = ["Code", "Material Name", "Unit", "Current Stock", "Max Level", "Valuation Rate (incl. GST)", "Stock Value (incl. GST)", "Status"];
              const statusLabel: Record<string, string> = { ok: "OK", out: "Out of Stock" };
              const csvRows = filtered.map((r) => {
                const stock = parseFloat(r.current_stock);
                const poRate = r.last_po_rate !== null ? parseFloat(r.last_po_rate) : null;
                const stdRate = r.standard_cost !== null ? parseFloat(r.standard_cost) : null;
                const rate = poRate ?? stdRate;
                return [
                  formatCode("M", r.material_no),
                  r.name,
                  r.unit_name ?? "",
                  stock.toFixed(4),
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
            Export CSV
          </Button>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1 outline-none" {...tableProps}>
          <table className="min-w-max text-sm w-full">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2.5 text-left font-medium text-slate-800 whitespace-nowrap">Code</th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-800 whitespace-nowrap">Material Name</th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-800 whitespace-nowrap">Unit</th>
                <th className="px-3 py-2.5 text-right font-medium text-slate-800 whitespace-nowrap">Current Stock</th>
                <th className="px-3 py-2.5 text-right font-medium text-slate-800 whitespace-nowrap">Last PO Rate (incl. GST)</th>
                <th className="px-3 py-2.5 text-right font-medium text-slate-800 whitespace-nowrap">Stock Value (incl. GST)</th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-800 whitespace-nowrap">Status</th>
                <th className="px-3 py-2.5 text-left font-medium text-slate-800 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-12 text-center text-slate-700 text-sm">
                    No materials found.
                  </td>
                </tr>
              ) : (
                filtered.map((row, filteredIdx) => {
                  const status = getStatus(row);
                  const stock = parseFloat(row.current_stock);
                  const poRate = row.last_po_rate !== null ? parseFloat(row.last_po_rate) : null;
                  const stdRate = row.standard_cost !== null ? parseFloat(row.standard_cost) : null;
                  const rate = poRate ?? stdRate;
                  const isStdRate = poRate === null && stdRate !== null;
                  const value = rate !== null ? stock * rate : null;

                  const rowBg = status === "out" ? "bg-red-50" : "";

                  const isHighlighted = highlightedIndex === filteredIdx;
                  return (
                    <tr
                      key={row.id}
                      data-highlighted={isHighlighted || undefined}
                      className={cn(
                        "border-t border-slate-200 hover:bg-rowhover transition-colors cursor-pointer",
                        rowBg,
                        isHighlighted && "ring-1 ring-inset ring-blue-500 bg-blue-50"
                      )}
                      onClick={() => openHistory(row)}
                    >
                      <td className="px-3 py-2 whitespace-nowrap text-slate-800 font-mono text-xs">
                        {formatCode("M", row.material_no)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-800">
                        {row.name}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-800">
                        {row.unit_name ?? "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-right font-semibold text-slate-800">
                        {fmtQty(row.current_stock)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-right text-slate-800">
                        {rate !== null ? (
                          <span
                            className={cn("inline-flex items-center gap-1 justify-end", isStdRate && "italic text-slate-700")}
                            title={isStdRate ? "Standard cost — no purchase order received yet" : undefined}
                          >
                            {fmtAmt(rate)}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-right text-slate-800">
                        {value !== null ? fmtAmt(value) : "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <StatusBadge status={status} />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); openHistory(row); }}
                            title="View stock history"
                            className="p-1 rounded hover:bg-slate-100 text-slate-700 hover:text-slate-700 transition-colors"
                          >
                            <History className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); openAdjust(row); }}
                            title="Adjust stock"
                            className="p-1 rounded hover:bg-slate-100 text-slate-700 hover:text-slate-700 transition-colors"
                          >
                            <SlidersHorizontal className="w-4 h-4" />
                          </button>
                          {status === "out" && (
                            <span onClick={(e) => e.stopPropagation()}>
                              <Link
                                href={`/transactions/purchase-orders/new?prefill=${row.id}`}
                                title="Create Purchase Order for this material"
                              >
                                <button className="p-1 rounded hover:bg-blue-50 text-slate-700 hover:text-blue-600 transition-colors">
                                  <ShoppingCart className="w-4 h-4" />
                                </button>
                              </Link>
                            </span>
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
        <SheetContent data-testid="stock-ledger-drawer" className="w-[560px] sm:max-w-[560px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-base">
              Stock History — {historyMaterial?.name}
              <span className="ml-2 text-xs font-normal text-slate-700 font-mono">
                {historyMaterial ? formatCode("M", historyMaterial.material_no) : ""}
              </span>
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            {historyLoading ? (
              <p className="text-sm text-slate-700 py-8 text-center">Loading history…</p>
            ) : historyEntries.length === 0 ? (
              <p className="text-sm text-slate-700 py-8 text-center">No movement history for this material.</p>
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
                        <th className="px-2 py-2 text-right font-medium text-slate-600 whitespace-nowrap" title="Value impact for manual adjustments (qty × base rate at time of adjustment, excl. GST)">Value Δ</th>
                        <th className="px-2 py-2 text-left font-medium text-slate-600">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyEntries.map((e) => {
                        const change = parseFloat(e.qty_change);
                        const isPos = change >= 0;
                        const isAdjustment = e.transaction_type === "ADJUSTMENT";
                        const valueImpact = isAdjustment && e.rate_at_time
                          ? change * parseFloat(e.rate_at_time)
                          : null;
                        return (
                          <tr key={e.id} className="border-t border-slate-100">
                            <td className="px-2 py-1.5 whitespace-nowrap text-slate-600">{fmtDateTime(e.created_at)}</td>
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
                            <td
                              className="px-2 py-1.5 whitespace-nowrap text-right"
                              title={isAdjustment && !e.rate_at_time ? "Rate data not available for this adjustment" : ""}
                            >
                              {valueImpact !== null ? (
                                <span className={valueImpact >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                                  {valueImpact >= 0 ? "+" : ""}{"₹" + Math.abs(valueImpact).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                                </span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-slate-700 max-w-[120px] truncate" title={e.reason ?? ""}>
                              {e.reason ? (e.reason.length > 80 ? e.reason.slice(0, 80) + "…" : e.reason) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {historyEntries.length === 100 && (
                  <p className="text-xs text-slate-700 text-center py-2">
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
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Adjust Stock — {adjustMaterial?.name}
              <span className="ml-2 text-xs font-normal text-slate-700 font-mono">
                {adjustMaterial ? formatCode("M", adjustMaterial.material_no) : ""}
              </span>
            </DialogTitle>
            <DialogDescription>
              Manual stock corrections are permanent and logged in the stock movement history.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">

            {/* Current Stock panel */}
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <div>
                <span className="text-sm text-slate-600">Current Stock</span>
                {adjustFreshStock === null && (
                  <span className="ml-2 text-xs text-slate-700">(loading live value…)</span>
                )}
              </div>
              <span className="text-2xl font-bold text-slate-800">
                {fmtQty(adjustFreshStock ?? adjustMaterial?.current_stock ?? "0")}
              </span>
            </div>

            {/* Adjustment Type dropdown */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Adjustment Type</label>
              <select
                value={adjustType}
                onChange={(e) => setAdjustType(e.target.value)}
                className="w-full h-9 text-sm border border-input rounded-md px-3 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {ADJUSTMENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* New Quantity input */}
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
                <p className={cn("text-xs mt-1", delta === 0 ? "text-slate-700" : delta > 0 ? "text-green-600" : "text-red-600")}>
                  {deltaLabel}
                </p>
              )}
            </div>

            {/* Value write-off (only when reducing and write-off > 0) */}
            {isReduction && writeOff !== null && writeOff > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                <p className="text-xs font-medium text-red-700">
                  This adjustment will write off {fmtAmt(writeOff)} from total stock value
                </p>
              </div>
            )}

            {/* Draft Commitment section (only when reducing) */}
            {isReduction && (
              <div className="space-y-1.5">
                {draftCommitments === null ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <p className="text-xs text-amber-700">Checking pending issue slips…</p>
                  </div>
                ) : draftCommitments.totalCommitted > 0 ? (
                  commitmentBreached ? (
                    <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-red-700">
                            Reducing to {fmtQty(adjustedQty)} will prevent these Draft Issue Slips from being issued:
                          </p>
                          <ul className="text-xs text-red-700 space-y-0.5">
                            {draftCommitments.slips.map((s) => (
                              <li key={s.slip_number}>
                                • MI-{String(s.slip_number).padStart(4, "0")}: {fmtQty(s.committed_qty)} units needed
                              </li>
                            ))}
                          </ul>
                          <p className="text-xs text-red-600 font-medium">
                            Total needed: {fmtQty(draftCommitments.totalCommitted)} — Shortfall: {fmtQty(draftCommitments.totalCommitted - adjustedQty)} units
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                      <p className="text-xs text-amber-700">
                        {fmtQty(adjustedQty)} units still covers the {fmtQty(draftCommitments.totalCommitted)} committed in {draftCommitments.slips.length} Draft Issue Slip{draftCommitments.slips.length > 1 ? "s" : ""}.
                      </p>
                    </div>
                  )
                ) : null}
              </div>
            )}

            {/* Large reduction warning */}
            {isLargeReduction && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700">
                  You are reducing by {Math.round(Math.abs(delta) / currentQty * 100)}% of current stock ({fmtQty(Math.abs(delta))} units). Verify this is correct before confirming.
                </p>
              </div>
            )}

            {/* Unit Cost field (when no PO rate) */}
            {adjustMaterial?.last_po_rate === null && (
              <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
                <label className="text-sm font-medium text-slate-700">
                  Unit Cost (₹) <span className="text-slate-700 font-normal">— for stock valuation</span>
                </label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={adjustStandardCost}
                  onChange={(e) => setAdjustStandardCost(e.target.value)}
                  className="text-sm bg-white"
                  placeholder="e.g. 150.00"
                />
                <p className="text-xs text-amber-700">
                  This item has no purchase history. Enter a unit cost to include it in total stock value.
                  {adjustMaterial?.standard_cost ? " Current cost will be updated." : " Leave blank to keep it excluded."}
                </p>
              </div>
            )}

            {/* Reason textarea */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Reason <span className="text-slate-700 font-normal">(required)</span></label>
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

            {/* Commitment breach acknowledgment checkbox */}
            {commitmentBreached && (
              <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-red-300 bg-red-50 px-3 py-3">
                <input
                  type="checkbox"
                  checked={commitmentBreachAcknowledged}
                  onChange={(e) => setCommitmentBreachAcknowledged(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-red-400 accent-red-600 shrink-0"
                />
                <span className="text-xs text-red-700 leading-relaxed">
                  I understand that this reduction will leave insufficient stock for pending Draft Issue Slips. Those slips will fail when issued.
                </span>
              </label>
            )}

            {/* Permanent warning */}
            <p className="text-xs text-slate-700">
              ⚠ Adjustments are permanent and cannot be undone. They will appear in this material&apos;s movement history.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleAdjust}
              disabled={
                isSaving ||
                (commitmentBreached && !commitmentBreachAcknowledged) ||
                (isReduction && draftCommitments === null)
              }
            >
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
      <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">{label}</p>
      <p className={cn("text-2xl font-bold mt-1", valueClass)}>{value}</p>
      <p className="text-xs text-slate-700 mt-0.5">{sub}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: StockStatus }) {
  if (status === "out") return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Out of Stock</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">OK</span>;
}
