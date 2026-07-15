"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { batchUpdateMaterialRates } from "@/lib/actions/materials.actions";
import { parseCeilingInput } from "@/lib/utils/max-rate";
import { formatCode, matchesCode } from "@/lib/utils";
import type { Material, Unit } from "@/types";
import { AlertTriangle, Upload } from "lucide-react";
import { toast } from "sonner";
import { ImportRatesDialog } from "./import-rates-dialog";
import { useIsMobile } from "@/hooks/use-is-mobile";

// "150.0000" -> "150". Keeps the grid readable without losing precision on save.
function displayRate(raw: string | null): string {
  if (raw === null || raw.trim() === "") return "";
  const n = Number(raw);
  return Number.isFinite(n) ? String(n) : "";
}

interface Props {
  materials: Material[];
  units: Unit[];
}

// ─── Row ─────────────────────────────────────────────────────────────────────
// React.memo + stable callbacks are load-bearing, not an optimisation. With 150-200
// controlled inputs, re-rendering every row on every keystroke makes typing visibly
// laggy. TransactionGrid never hits this because a PO has a handful of lines.

interface RowProps {
  id: string;
  code: string;
  name: string;
  unitName: string;
  value: string;
  isDirty: boolean;
  rowIndex: number;
  onChange: (id: string, value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number) => void;
}

const RateRow = React.memo(function RateRow({
  id,
  code,
  name,
  unitName,
  value,
  isDirty,
  rowIndex,
  onChange,
  onKeyDown,
}: RowProps) {
  const unset = value.trim() === "";
  return (
    <tr className={`border-t border-slate-200 ${isDirty ? "bg-blue-50" : rowIndex % 2 ? "bg-slate-50" : "bg-white"}`}>
      <td className="px-3 py-1.5 text-slate-800 w-12">{rowIndex + 1}</td>
      <td className="px-3 py-1.5 font-mono text-xs font-medium text-slate-700 w-28">{code}</td>
      <td className="px-3 py-1.5 font-medium text-slate-800">{name}</td>
      <td className="px-3 py-1.5 text-slate-800 w-24">{unitName}</td>
      <td className="px-3 py-1.5 w-64">
        <div className="flex items-center gap-2">
          <Input
            type="text"
            inputMode="decimal"
            aria-label={`Max rate for ${name}`}
            data-rate-row={rowIndex}
            data-testid={`rate-input-${id}`}
            className={`w-28 h-8 text-sm tabular-nums ${unset ? "border-amber-400 bg-amber-50" : ""}`}
            value={value}
            placeholder="Not set"
            onChange={(e) => onChange(id, e.target.value)}
            onKeyDown={(e) => onKeyDown(e, rowIndex)}
          />
          {unset && (
            <span className="flex items-center gap-1 text-xs text-amber-700 whitespace-nowrap">
              <AlertTriangle className="w-3.5 h-3.5" />
              Not set — cannot be purchased
            </span>
          )}
        </div>
      </td>
    </tr>
  );
});

// ─── Mobile card row ─────────────────────────────────────────────────────────
// Single-column card equivalent of RateRow for phones. Memoized for the same reason:
// 150-200 controlled inputs must not all re-render on every keystroke. Rendered instead
// of (never alongside) RateRow, so there is only ever one input per material — no
// duplicate ids / data attrs and no double-mounted state.

interface CardProps {
  id: string;
  code: string;
  name: string;
  unitName: string;
  value: string;
  isDirty: boolean;
  onChange: (id: string, value: string) => void;
}

const RateCard = React.memo(function RateCard({
  id,
  code,
  name,
  unitName,
  value,
  isDirty,
  onChange,
}: CardProps) {
  const unset = value.trim() === "";
  return (
    <div className={`rounded-lg border p-3 ${isDirty ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}>
      <div className="min-w-0">
        <div className="font-medium text-slate-800">{name}</div>
        <div className="text-xs text-slate-500 font-mono mt-0.5">{code} · {unitName}</div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <label className="text-xs text-slate-600 shrink-0" htmlFor={`rate-m-${id}`}>Max Rate (₹)</label>
        <Input
          id={`rate-m-${id}`}
          type="text"
          inputMode="decimal"
          aria-label={`Max rate for ${name}`}
          data-testid={`rate-input-m-${id}`}
          className={`ml-auto w-32 tabular-nums ${unset ? "border-amber-400 bg-amber-50" : ""}`}
          value={value}
          placeholder="Not set"
          onChange={(e) => onChange(id, e.target.value)}
        />
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

export function MaterialRatesClient({ materials, units }: Props) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const [importOpen, setImportOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const pendingHref = useRef<string | null>(null);

  const [rates, setRates] = useState<Record<string, string>>(() =>
    Object.fromEntries(materials.map((m) => [m.id, displayRate(m.max_rate)]))
  );
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  // Read dirty inside the merge effect without making it a dependency — otherwise the
  // merge re-runs on the keystroke that first dirties a row.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // Reconcile server props into state. Merge BY MATERIAL ID and never overwrite a dirty
  // row. The instinctive `setRates(fromProps)` wipes every unsaved rate the moment any
  // background revalidation fires — another tab saving, a router.refresh(), a cache
  // flush — while the admin is mid-typing. It looks exactly like the app ate their work.
  useEffect(() => {
    setRates((prev) => {
      const next: Record<string, string> = {};
      for (const m of materials) {
        next[m.id] = dirtyRef.current.has(m.id) ? prev[m.id] ?? "" : displayRate(m.max_rate);
      }
      return next;
    });
  }, [materials]);

  // Pull in materials the employee added while this page sat open (R2), so the admin does
  // not flip the switch believing every material is rated. Safe to fire at any time: the
  // merge above preserves every dirty row, so re-rendering never eats an unsaved rate.
  useEffect(() => {
    const onFocus = () => router.refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [router]);

  const visible = useMemo(() => {
    const q = search.trim();
    if (!q) return materials;
    return materials.filter(
      (m) => m.name.toLowerCase().includes(q.toLowerCase()) || matchesCode(q, "M-", m.material_no)
    );
  }, [materials, search]);

  const unitName = useCallback(
    (m: Material) => units.find((u) => u.id === m.purchase_unit_id)?.unit_name ?? "—",
    [units]
  );

  // Derived from current client state, not a server prop frozen at load, so it drops to
  // 0 the instant the last rate is typed — not after a reload.
  const unratedCount = useMemo(
    () => materials.filter((m) => (rates[m.id] ?? "").trim() === "").length,
    [materials, rates]
  );

  const handleChange = useCallback((id: string, value: string) => {
    setRates((prev) => ({ ...prev, [id]: value }));
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

  function resetToServer() {
    setRates(Object.fromEntries(materials.map((m) => [m.id, displayRate(m.max_rate)])));
    setDirty(new Set());
  }

  function handleSave() {
    if (dirty.size === 0) return;

    const updates = Array.from(dirty).map((id) => ({ id, max_rate: rates[id] ?? "" }));

    // Pre-check with the same parser the server uses, so the two cannot disagree about
    // what a valid ceiling is. The server still validates independently.
    for (const u of updates) {
      try {
        parseCeilingInput(u.max_rate);
      } catch {
        const name = materials.find((m) => m.id === u.id)?.name ?? "A material";
        toast.error(`${name}: ceiling must be greater than 0. Leave blank to mark it as not set.`);
        return;
      }
    }

    startTransition(async () => {
      try {
        await batchUpdateMaterialRates(updates);
        // Clear dirty BEFORE refreshing: the merge above preserves dirty rows, so a
        // refresh with rows still marked dirty would keep re-preserving now-saved values
        // and the counter would never return to 0.
        setDirty(new Set());
        toast.success(`Saved ${updates.length} rate${updates.length === 1 ? "" : "s"}`);
        router.refresh();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Could not save rates");
      }
    });
  }

  // Unsaved-changes guard. beforeunload covers tab close and hard reload, but does NOT
  // fire on App Router client-side navigation — clicking "Masters" in the sidebar would
  // silently discard everything typed. Intercept in-app anchor clicks too.
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
          Only an admin can set the purchase ceiling. A material with no ceiling cannot be purchased.
        </span>
      </div>

      <div className="flex-1 min-h-0 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className="p-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
          <Input
            autoComplete="off"
            placeholder="Search by name or M001..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <span
            data-testid="unrated-count"
            className={`text-xs font-medium ${unratedCount > 0 ? "text-amber-700" : "text-emerald-700"}`}
          >
            {unratedCount} material{unratedCount === 1 ? "" : "s"} without a rate
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
            className="shrink-0 text-xs ml-auto"
          >
            <Upload className="w-3.5 h-3.5 mr-1.5" />
            Import Rates
          </Button>
        </div>

        <div className="overflow-auto flex-1">
          {isMobile ? (
            // Mobile: single-column editable cards (the allowed admin entry path on phones)
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
                    value={rates[m.id] ?? ""}
                    isDirty={dirty.has(m.id)}
                    onChange={handleChange}
                  />
                ))
              )}
            </div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-slate-700 text-white sticky top-0 z-10">
                <tr>
                  {["S.No", "Material Code", "Material Name", "Unit", "Max Rate (₹)"].map((h) => (
                    <th key={h} className="px-3 py-1.5 text-left font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-700">
                      No materials found
                    </td>
                  </tr>
                )}
                {visible.map((m, i) => (
                  <RateRow
                    key={m.id}
                    id={m.id}
                    code={formatCode("M-", m.material_no)}
                    name={m.name}
                    unitName={unitName(m)}
                    value={rates[m.id] ?? ""}
                    isDirty={dirty.has(m.id)}
                    rowIndex={i}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
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
          // Pre-fills the grid as dirty. Saves nothing — the admin reviews, corrects by
          // keyboard, then presses Save All. One write path, one set of validation.
          setRates((prev) => ({ ...prev, ...matched }));
          setDirty((prev) => {
            const next = new Set(prev);
            Object.keys(matched).forEach((id) => next.add(id));
            return next;
          });
          setImportOpen(false);
          toast.success(`${Object.keys(matched).length} rates filled in — review, then press Save All`);
        }}
      />

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={(o) => {
          if (!o) {
            setDiscardOpen(false);
            pendingHref.current = null;
          }
        }}
        title="Discard unsaved rates?"
        description={`You have ${dirty.size} unsaved rate${dirty.size === 1 ? "" : "s"}. Leaving this page will discard ${dirty.size === 1 ? "it" : "them"}.`}
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
