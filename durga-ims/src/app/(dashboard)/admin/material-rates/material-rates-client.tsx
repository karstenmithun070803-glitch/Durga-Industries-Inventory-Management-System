"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { batchUpdateMaterialRates } from "@/lib/actions/materials.actions";
import { parseBaseRateInput, parseBufferInput } from "@/lib/utils/max-rate";
import { formatRate } from "@/lib/utils/row-calc";
import { formatCode, matchesCode } from "@/lib/utils";
import type { Material, Unit } from "@/types";
import { AlertTriangle, Upload, History } from "lucide-react";
import { toast } from "sonner";
import { ImportRatesDialog } from "./import-rates-dialog";
import { DeviationDrawer } from "./deviation-drawer";
import { useIsMobile } from "@/hooks/use-is-mobile";

interface Fields {
  base: string;
  buffer: string;
}

function toFields(m: Material): Fields {
  return { base: formatRate(m.base_rate), buffer: formatRate(m.buffer) };
}

// A material is purchasable only with BOTH base and buffer. Either blank = not configured.
function notConfigured(f: Fields | undefined): boolean {
  return !f || f.base.trim() === "" || f.buffer.trim() === "";
}

interface Props {
  materials: Material[];
  units: Unit[];
  /** Material ids that have ≥1 off-base received purchase — drives the "changed prices" filter. */
  deviationMaterialIds: string[];
}

interface OpenMaterial {
  id: string;
  name: string;
  code: string;
}

// ─── Desktop row ───────────────────────────────────────────────────────────────
// React.memo + stable callbacks are load-bearing: with 661 materials × 2 inputs, an
// unmemoized grid re-renders every row on every keystroke and typing goes laggy.

interface RowProps {
  id: string;
  code: string;
  name: string;
  unitName: string;
  base: string;
  buffer: string;
  isDirty: boolean;
  rowIndex: number;
  onChange: (id: string, field: keyof Fields, value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number) => void;
  onOpenHistory: (id: string) => void;
}

const RateRow = React.memo(function RateRow({
  id, code, name, unitName, base, buffer, isDirty, rowIndex, onChange, onKeyDown, onOpenHistory,
}: RowProps) {
  const unset = notConfigured({ base, buffer });
  return (
    <tr className={`border-t border-slate-200 ${isDirty ? "bg-blue-50" : rowIndex % 2 ? "bg-slate-50" : "bg-white"}`}>
      <td className="px-3 py-1.5 text-slate-800 w-12">{rowIndex + 1}</td>
      <td className="px-3 py-1.5 font-mono text-xs font-medium text-slate-700 w-28">{code}</td>
      <td className="px-3 py-1.5 font-medium text-slate-800">{name}</td>
      <td className="px-3 py-1.5 text-slate-800 w-20">{unitName}</td>
      <td className="px-3 py-1.5 w-28">
        <Input
          type="text"
          inputMode="decimal"
          aria-label={`Base rate for ${name}`}
          data-rate-row={rowIndex}
          data-testid={`base-input-${id}`}
          className={`w-24 h-8 text-sm tabular-nums ${base.trim() === "" ? "border-amber-400 bg-amber-50" : ""}`}
          value={base}
          placeholder="Not set"
          onChange={(e) => onChange(id, "base", e.target.value)}
          onKeyDown={(e) => onKeyDown(e, rowIndex)}
        />
      </td>
      <td className="px-3 py-1.5 w-24">
        <Input
          type="text"
          inputMode="decimal"
          aria-label={`Buffer for ${name}`}
          data-testid={`buffer-input-${id}`}
          className={`w-20 h-8 text-sm tabular-nums ${buffer.trim() === "" ? "border-amber-400 bg-amber-50" : ""}`}
          value={buffer}
          placeholder="Not set"
          onChange={(e) => onChange(id, "buffer", e.target.value)}
        />
      </td>
      <td className="px-3 py-1.5 w-40">
        {unset ? (
          <span className="flex items-center gap-1 text-xs text-amber-700 whitespace-nowrap">
            <AlertTriangle className="w-3.5 h-3.5" />
            Not set
          </span>
        ) : (
          <span className="text-xs text-slate-400">±{buffer}</span>
        )}
      </td>
      <td className="px-2 py-1.5 w-10">
        <button
          type="button"
          aria-label={`Price history for ${name}`}
          data-testid={`history-btn-${id}`}
          onClick={() => onOpenHistory(id)}
          className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800"
        >
          <History className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
});

// ─── Mobile card ─────────────────────────────────────────────────────────────

interface CardProps {
  id: string;
  code: string;
  name: string;
  unitName: string;
  base: string;
  buffer: string;
  isDirty: boolean;
  onChange: (id: string, field: keyof Fields, value: string) => void;
  onOpenHistory: (id: string) => void;
}

const RateCard = React.memo(function RateCard({
  id, code, name, unitName, base, buffer, isDirty, onChange, onOpenHistory,
}: CardProps) {
  const unset = notConfigured({ base, buffer });
  return (
    <div className={`rounded-lg border p-3 ${isDirty ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-slate-800">{name}</div>
          <div className="text-xs text-slate-500 font-mono mt-0.5">{code} · {unitName}</div>
        </div>
        <button
          type="button"
          aria-label={`Price history for ${name}`}
          data-testid={`history-btn-m-${id}`}
          onClick={() => onOpenHistory(id)}
          className="p-1.5 rounded hover:bg-slate-200 text-slate-500 shrink-0"
        >
          <History className="w-4 h-4" />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="flex items-center gap-2 text-xs text-slate-600">
          Base ₹
          <Input
            type="text" inputMode="decimal" aria-label={`Base rate for ${name}`}
            data-testid={`base-input-m-${id}`}
            className={`w-full tabular-nums ${base.trim() === "" ? "border-amber-400 bg-amber-50" : ""}`}
            value={base} placeholder="Not set" onChange={(e) => onChange(id, "base", e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          Buffer ₹
          <Input
            type="text" inputMode="decimal" aria-label={`Buffer for ${name}`}
            data-testid={`buffer-input-m-${id}`}
            className={`w-full tabular-nums ${buffer.trim() === "" ? "border-amber-400 bg-amber-50" : ""}`}
            value={buffer} placeholder="Not set" onChange={(e) => onChange(id, "buffer", e.target.value)}
          />
        </label>
      </div>
      {unset && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-amber-700">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Not set — cannot be purchased
        </p>
      )}
    </div>
  );
});

// ─── Grid ────────────────────────────────────────────────────────────────────

export function MaterialRatesClient({ materials, units, deviationMaterialIds }: Props) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [importOpen, setImportOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [bulkBuffer, setBulkBuffer] = useState("");
  const [openMaterial, setOpenMaterial] = useState<OpenMaterial | null>(null);
  const pendingHref = useRef<string | null>(null);

  const deviationSet = useMemo(() => new Set(deviationMaterialIds), [deviationMaterialIds]);

  const [rates, setRates] = useState<Record<string, Fields>>(() =>
    Object.fromEntries(materials.map((m) => [m.id, toFields(m)]))
  );
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // Reconcile server props into state. Merge BY MATERIAL ID; NEVER overwrite a dirty row.
  // A naive setRates(fromProps) wipes every unsaved value the instant any background
  // revalidation fires (another tab, router.refresh, cache flush) while the admin types.
  useEffect(() => {
    setRates((prev) => {
      const next: Record<string, Fields> = {};
      for (const m of materials) {
        next[m.id] = dirtyRef.current.has(m.id) ? prev[m.id] ?? toFields(m) : toFields(m);
      }
      return next;
    });
  }, [materials]);

  // Pull in materials the employee added while this page sat open (R2). Safe: the merge
  // above preserves every dirty row, so re-rendering never eats an unsaved value.
  useEffect(() => {
    const onFocus = () => router.refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [router]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return materials.filter((m) => {
      if (onlyChanged && !deviationSet.has(m.id)) return false;
      if (!q) return true;
      return m.name.toLowerCase().includes(q) || matchesCode(search, "M-", m.material_no);
    });
  }, [materials, search, onlyChanged, deviationSet]);

  const unitName = useCallback(
    (m: Material) => units.find((u) => u.id === m.purchase_unit_id)?.unit_name ?? "—",
    [units]
  );

  // Derived from current client state, so it drops the instant the last field is filled.
  const unconfiguredCount = useMemo(
    () => materials.filter((m) => notConfigured(rates[m.id])).length,
    [materials, rates]
  );

  const handleChange = useCallback((id: string, field: keyof Fields, value: string) => {
    setRates((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { base: "", buffer: "" }), [field]: value } }));
    setDirty((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number) => {
    const move = (to: number) => {
      const el = document.querySelector<HTMLInputElement>(`[data-rate-row="${to}"]`);
      if (el) {
        e.preventDefault();
        el.focus();
        el.select();
      }
    };
    if (e.key === "Enter" || e.key === "ArrowDown") move(rowIndex + 1);
    else if (e.key === "ArrowUp") move(rowIndex - 1);
  }, []);

  const openHistory = useCallback((id: string) => {
    const m = materials.find((x) => x.id === id);
    if (m) setOpenMaterial({ id: m.id, name: m.name, code: formatCode("M-", m.material_no) });
  }, [materials]);

  // Bulk-fill buffer for the currently-shown materials. Fill ONLY empty cells by default,
  // so tuned buffers are never silently overwritten (C16).
  function applyBufferToShown(overwrite: boolean) {
    const raw = bulkBuffer.trim();
    if (raw === "") { toast.error("Type a buffer value first."); return; }
    try { parseBufferInput(raw); } catch { toast.error("Buffer cannot be negative."); return; }

    let filled = 0;
    setRates((prev) => {
      const next = { ...prev };
      const touched = new Set(dirty);
      for (const m of visible) {
        const cur = next[m.id] ?? { base: "", buffer: "" };
        if (!overwrite && cur.buffer.trim() !== "") continue;
        next[m.id] = { ...cur, buffer: raw };
        touched.add(m.id);
        filled++;
      }
      setDirty(touched);
      return next;
    });
    toast.success(filled === 0 ? "All shown materials already have a buffer." : `Filled ${filled} buffer${filled === 1 ? "" : "s"} — review, then Save All`);
  }

  function resetToServer() {
    setRates(Object.fromEntries(materials.map((m) => [m.id, toFields(m)])));
    setDirty(new Set());
  }

  function handleSave() {
    if (dirty.size === 0) return;

    const updates = Array.from(dirty).map((id) => ({
      id,
      base_rate: rates[id]?.base ?? "",
      buffer: rates[id]?.buffer ?? "",
    }));

    // Pre-check with the SAME parsers the server uses, so the two cannot disagree.
    for (const u of updates) {
      const name = materials.find((m) => m.id === u.id)?.name ?? "A material";
      try { parseBaseRateInput(u.base_rate); }
      catch { toast.error(`${name}: base rate must be greater than 0, or blank.`); return; }
      try { parseBufferInput(u.buffer); }
      catch { toast.error(`${name}: buffer cannot be negative.`); return; }
    }

    startTransition(async () => {
      try {
        await batchUpdateMaterialRates(updates);
        // Clear dirty BEFORE refreshing so the merge doesn't re-preserve saved values.
        setDirty(new Set());
        toast.success(`Saved ${updates.length} material${updates.length === 1 ? "" : "s"}`);
        router.refresh();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Could not save");
      }
    });
  }

  // Unsaved-changes guard. beforeunload misses App Router Link clicks, so intercept those.
  useEffect(() => {
    if (dirty.size === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("http") || anchor.target === "_blank") return;
      e.preventDefault();
      pendingHref.current = href;
      setDiscardOpen(true);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty.size]);

  return (
    <div className="p-4 lg:p-6 h-full flex flex-col gap-4">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h1 className="text-xl font-semibold text-slate-800">Material Rate Master</h1>
        <span className="text-xs text-slate-500">
          A PO may only be priced within <strong>base rate ± buffer</strong>. A material needs both set before it can be purchased.
        </span>
      </div>

      <div className="flex-1 min-h-0 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className="p-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
          <Input
            autoComplete="off"
            placeholder="Search by name or M001..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              data-testid="only-changed-toggle"
              checked={onlyChanged}
              onChange={(e) => setOnlyChanged(e.target.checked)}
              className="w-3.5 h-3.5"
            />
            Only changed prices
          </label>
          <span
            data-testid="unrated-count"
            className={`text-xs font-medium ${unconfiguredCount > 0 ? "text-amber-700" : "text-emerald-700"}`}
          >
            {unconfiguredCount} not fully configured
          </span>

          <div className="flex items-center gap-1 ml-auto">
            <Input
              type="text"
              inputMode="decimal"
              placeholder="Buffer ₹"
              value={bulkBuffer}
              onChange={(e) => setBulkBuffer(e.target.value)}
              className="w-20 h-8 text-xs"
              data-testid="bulk-buffer-input"
            />
            <Button variant="outline" size="sm" className="text-xs" onClick={() => applyBufferToShown(false)}>
              Fill empty
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="shrink-0 text-xs">
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              Import
            </Button>
          </div>
        </div>

        <div className="overflow-auto flex-1">
          {isMobile ? (
            <div className="p-3 flex flex-col gap-2">
              {visible.length === 0 ? (
                <p className="px-4 py-8 text-center text-slate-700">No materials found</p>
              ) : (
                visible.map((m) => (
                  <RateCard
                    key={m.id}
                    id={m.id}
                    code={formatCode("M-", m.material_no)}
                    name={m.name}
                    unitName={unitName(m)}
                    base={rates[m.id]?.base ?? ""}
                    buffer={rates[m.id]?.buffer ?? ""}
                    isDirty={dirty.has(m.id)}
                    onChange={handleChange}
                    onOpenHistory={openHistory}
                  />
                ))
              )}
            </div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-slate-700 text-white sticky top-0 z-10">
                <tr>
                  {["S.No", "Material Code", "Material Name", "Unit", "Base Rate (₹)", "Buffer (₹)", "", ""].map((h, i) => (
                    <th key={i} className="px-3 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-700">No materials found</td>
                  </tr>
                )}
                {visible.map((m, i) => (
                  <RateRow
                    key={m.id}
                    id={m.id}
                    code={formatCode("M-", m.material_no)}
                    name={m.name}
                    unitName={unitName(m)}
                    base={rates[m.id]?.base ?? ""}
                    buffer={rates[m.id]?.buffer ?? ""}
                    isDirty={dirty.has(m.id)}
                    rowIndex={i}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onOpenHistory={openHistory}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t border-slate-200 px-3 py-2 flex items-center gap-3 bg-slate-50">
          <span data-testid="dirty-count" className="text-xs text-slate-600">
            {dirty.size === 0 ? "No unsaved changes" : `${dirty.size} unsaved change${dirty.size === 1 ? "" : "s"}`}
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" disabled={dirty.size === 0 || isPending} onClick={resetToServer}>
              Discard
            </Button>
            <Button size="sm" disabled={dirty.size === 0 || isPending} onClick={handleSave}>
              Save All
            </Button>
          </div>
        </div>
      </div>

      <ImportRatesDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        materials={materials}
        onApply={(matched) => {
          // Pre-fills the grid as dirty. Saves nothing — admin reviews, then Save All.
          setRates((prev) => {
            const next = { ...prev };
            for (const [id, fields] of Object.entries(matched)) {
              const cur = next[id] ?? { base: "", buffer: "" };
              next[id] = {
                base: fields.base !== undefined ? fields.base : cur.base,
                buffer: fields.buffer !== undefined ? fields.buffer : cur.buffer,
              };
            }
            return next;
          });
          setDirty((prev) => {
            const nx = new Set(prev);
            Object.keys(matched).forEach((id) => nx.add(id));
            return nx;
          });
          setImportOpen(false);
          toast.success(`${Object.keys(matched).length} materials filled in — review, then Save All`);
        }}
      />

      <DeviationDrawer material={openMaterial} onClose={() => setOpenMaterial(null)} />

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={(o) => { if (!o) { setDiscardOpen(false); pendingHref.current = null; } }}
        title="Discard unsaved changes?"
        description={`You have ${dirty.size} unsaved material${dirty.size === 1 ? "" : "s"}. Leaving this page will discard ${dirty.size === 1 ? "it" : "them"}.`}
        confirmLabel="Discard and leave"
        isPending={false}
        onConfirm={() => {
          const href = pendingHref.current;
          setDirty(new Set());
          setDiscardOpen(false);
          pendingHref.current = null;
          if (href) router.push(href);
        }}
      />
    </div>
  );
}
