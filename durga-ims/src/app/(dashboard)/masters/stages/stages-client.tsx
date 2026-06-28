"use client";

import { useState, useTransition, useRef, useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useMasterKeyboardNav } from "@/hooks/use-master-keyboard-nav";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  saveStage,
  deleteStage,
  reactivateStage,
  type StageWithMaterials,
} from "@/lib/actions/stages.actions";
import { formatCode } from "@/lib/utils";
import { Trash2, RotateCcw, Layers } from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StageMaterialDraft {
  _key: string;
  material_id: string;
  material_name: string;
  material_no: number;
  default_qty: string;
  unit_id: string;
  unit_name: string;
}

type ActiveMaterial = {
  id: string;
  material_no: number;
  name: string;
  purchase_unit_id: string | null;
};

type ActiveUnit = {
  id: string;
  unit_code: number;
  unit_name: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyRow(): StageMaterialDraft {
  return {
    _key: crypto.randomUUID(),
    material_id: "",
    material_name: "",
    material_no: 0,
    default_qty: "",
    unit_id: "",
    unit_name: "",
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  stages: StageWithMaterials[];
  materials: ActiveMaterial[];
  units: ActiveUnit[];
}

export function StagesClient({ stages, materials, units }: Props) {
  // ── List state ────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const [showInactive, setShowInactive] = useState(false);

  // ── Form state ────────────────────────────────────────────────────────────
  const [editing, setEditing] = useState<StageWithMaterials | null>(null);
  const [stageName, setStageName] = useState("");
  const [smRows, setSmRows] = useState<StageMaterialDraft[]>([emptyRow()]);
  const [openComboboxCell, setOpenComboboxCell] = useState<{ row: number; col: number } | null>(
    null
  );
  const [isPending, startTransition] = useTransition();

  // ── Dialog state ──────────────────────────────────────────────────────────
  const [escapeDiscardOpen, setEscapeDiscardOpen] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const subGridRef = useRef<HTMLTableElement>(null);
  const originalFormRef = useRef<{ name: string; rows: StageMaterialDraft[] }>({
    name: "",
    rows: [],
  });

  // ── Derived ───────────────────────────────────────────────────────────────
  const inactive = stages.filter((s) => !s.is_active);
  const visible = useMemo(() =>
    stages
      .filter((s) => (showInactive ? !s.is_active : s.is_active))
      .filter((s) => {
        const q = search.toLowerCase();
        return s.stage_name.toLowerCase().includes(q) || s.stage_code.toLowerCase().includes(q);
      }),
    [stages, search, showInactive]
  );

  const materialOptions = materials.map((m) => ({
    value: m.id,
    label: `${formatCode("M", m.material_no)} — ${m.name}`,
  }));

  // ── Form helpers ──────────────────────────────────────────────────────────
  function startEdit(stage: StageWithMaterials) {
    setEditing(stage);
    setStageName(stage.stage_name);
    const rows: StageMaterialDraft[] = [
      ...stage.materials.map((sm) => ({
        _key: crypto.randomUUID(),
        material_id: sm.material_id,
        material_name: sm.material_name,
        material_no: sm.material_no,
        default_qty: sm.default_qty,
        unit_id: sm.unit_id,
        unit_name: sm.unit_name,
      })),
      emptyRow(),
    ];
    setSmRows(rows);
    originalFormRef.current = { name: stage.stage_name, rows };
    setFocusedIdx(-1);
  }

  function resetForm() {
    const initialRows = [emptyRow()];
    setEditing(null);
    setStageName("");
    setSmRows(initialRows);
    setOpenComboboxCell(null);
    originalFormRef.current = { name: "", rows: initialRows };
  }

  function isDirty() {
    return (
      stageName !== originalFormRef.current.name ||
      JSON.stringify(smRows) !== JSON.stringify(originalFormRef.current.rows)
    );
  }

  // ── Sub-grid helpers ──────────────────────────────────────────────────────
  function focusSubCell(row: number, col: number) {
    const el = subGridRef.current?.querySelector(
      `[data-grid-row="${row}"][data-grid-col="${col}"]`
    ) as HTMLElement | null;
    if (el) {
      el.focus();
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function handleSubGridKeyDown(
    e: React.KeyboardEvent,
    rowIndex: number,
    colIndex: number,
    isComboboxOpen: boolean
  ) {
    if (isComboboxOpen) return;
    const COLS = 2; // col 0 = material, col 1 = qty; unit is read-only

    switch (e.key) {
      case "ArrowDown":
      case "Enter": {
        e.preventDefault();
        const isLastRow = rowIndex === smRows.length - 1;
        if (isLastRow) {
          if (smRows[rowIndex].material_id !== "") {
            // Append new empty row only if current row has a material selected
            setSmRows((prev) => [...prev, emptyRow()]);
            setTimeout(() => focusSubCell(rowIndex + 1, 0), 10);
          }
          // Empty last row → do nothing
        } else {
          focusSubCell(rowIndex + 1, colIndex);
        }
        break;
      }
      case "ArrowUp":
        e.preventDefault();
        if (rowIndex > 0) focusSubCell(rowIndex - 1, colIndex);
        break;
      case "ArrowRight":
        e.preventDefault();
        if (colIndex < COLS - 1) focusSubCell(rowIndex, colIndex + 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (colIndex > 0) focusSubCell(rowIndex, colIndex - 1);
        break;
    }
  }

  function isComboboxOpen(row: number, col: number) {
    return openComboboxCell?.row === row && openComboboxCell?.col === col;
  }

  function handleMaterialSelect(rowIndex: number, materialId: string) {
    const mat = materials.find((m) => m.id === materialId);
    if (!mat) return;
    const unit = mat.purchase_unit_id ? units.find((u) => u.id === mat.purchase_unit_id) : null;
    setSmRows((prev) =>
      prev.map((r, i) =>
        i === rowIndex
          ? {
              ...r,
              material_id: mat.id,
              material_name: mat.name,
              material_no: mat.material_no,
              unit_id: unit?.id ?? "",
              unit_name: unit?.unit_name ?? "",
            }
          : r
      )
    );
    setTimeout(() => focusSubCell(rowIndex, 1), 10);
  }

  function updateSmRow(rowIndex: number, patch: Partial<StageMaterialDraft>) {
    setSmRows((prev) => prev.map((r, i) => (i === rowIndex ? { ...r, ...patch } : r)));
  }

  function removeSmRow(key: string) {
    setSmRows((prev) => {
      const next = prev.filter((r) => r._key !== key);
      // Always keep at least one row; ensure trailing empty row
      if (next.length === 0) return [emptyRow()];
      if (next[next.length - 1].material_id !== "") return [...next, emptyRow()];
      return next;
    });
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  function handleSave() {
    if (!stageName.trim()) {
      toast.error("Stage name is required");
      firstFieldRef.current?.focus();
      return;
    }

    const filledRows = smRows.filter((r) => r.material_id !== "");

    for (const r of filledRows) {
      const q = parseFloat(r.default_qty);
      if (!r.default_qty || isNaN(q) || q <= 0) {
        toast.error(`${r.material_name}: default quantity must be a positive number`);
        return;
      }
    }

    const ids = filledRows.map((r) => r.material_id);
    if (new Set(ids).size !== ids.length) {
      toast.error("Duplicate material in list — each material can only appear once");
      return;
    }

    startTransition(async () => {
      try {
        await saveStage({
          id: editing?.id ?? null,
          stage_name: stageName.trim(),
          materials: filledRows.map((r) => ({
            material_id: r.material_id,
            default_qty: r.default_qty,
            unit_id: r.unit_id,
          })),
        });
        toast.success(editing ? "Stage updated" : "Stage created");
        resetForm();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  // ── Escape handler ────────────────────────────────────────────────────────
  function handleEscape() {
    if (!editing) return;
    if (isDirty()) {
      setEscapeDiscardOpen(true);
    } else {
      resetForm();
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }
  useHotkeys("escape", handleEscape, { enableOnFormTags: ["INPUT", "SELECT", "TEXTAREA"] });
  useHotkeys("ctrl+s", (e) => { e.preventDefault(); handleSave(); }, {
    enableOnFormTags: ["INPUT", "SELECT", "TEXTAREA"],
  });

  useMasterKeyboardNav({
    searchRef,
    saveRef,
    onNew: () => { resetForm(); setTimeout(() => firstFieldRef.current?.focus(), 50); },
  });

  // ── Reactivate ────────────────────────────────────────────────────────────
  function handleReactivate(id: string) {
    startTransition(async () => {
      try {
        await reactivateStage(id);
        toast.success("Stage reactivated");
        setShowInactive(false);
        resetForm();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Could not reactivate");
      }
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="p-6 h-full flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
          <Layers className="w-5 h-5 text-slate-600" />
          Stage Master
        </h1>

        <div className="flex gap-5 flex-1 min-h-0">
          {/* ── Left: Form panel ─────────────────────────────────────────── */}
          <div className="w-[480px] shrink-0 bg-white rounded-lg border border-slate-200 p-5 flex flex-col gap-4 h-fit">
            {/* Stage Code */}
            <div className="flex items-center gap-4">
              <div className="flex-1 space-y-1.5">
                <label className="text-xs text-slate-600">Stage Code</label>
                <div className="h-9 flex items-center px-3 bg-slate-50 border border-slate-200 rounded-md text-sm font-mono text-slate-600">
                  {editing ? editing.stage_code : <span className="text-slate-700 italic">Auto-assigned</span>}
                </div>
              </div>
              <div className="flex-1 space-y-1.5">
                <label className="text-xs text-slate-600">Stage Name *</label>
                <Input
                  ref={firstFieldRef}
                  placeholder="e.g. WOOD WORK"
                  value={stageName}
                  onChange={(e) => setStageName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      focusSubCell(0, 0);
                    }
                  }}
                />
              </div>
            </div>

            {/* Materials sub-grid */}
            <div>
              <p className="text-xs font-medium text-slate-600 mb-2">Materials in this Stage</p>
              <div className="border border-slate-200 rounded-md overflow-hidden">
                <table ref={subGridRef} className="w-full table-fixed text-sm">
                  <colgroup>
                    <col className="w-8" />
                    <col />
                    <col className="w-20" />
                    <col className="w-[72px]" />
                    <col className="w-8" />
                  </colgroup>
                  <thead className="bg-slate-700 text-white">
                    <tr>
                      <th className="px-2 py-1.5 text-left text-xs font-medium">#</th>
                      <th className="px-2 py-1.5 text-left text-xs font-medium">Material</th>
                      <th className="px-2 py-1.5 text-left text-xs font-medium">Qty</th>
                      <th className="px-2 py-1.5 text-left text-xs font-medium">Unit</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {smRows.map((row, i) => (
                      <tr
                        key={row._key}
                        className={
                          i % 2 === 0
                            ? "bg-white border-t border-slate-100"
                            : "bg-slate-50/60 border-t border-slate-100"
                        }
                      >
                        <td className="px-2 py-1 text-slate-700 text-xs text-center">
                          {row.material_id ? i + 1 : ""}
                        </td>
                        <td className="px-1 py-1">
                          <Combobox
                            options={materialOptions}
                            value={row.material_id}
                            onChange={(v) => handleMaterialSelect(i, v)}
                            placeholder="Select…"
                            searchPlaceholder="Search materials…"
                            onOpenChange={(open) =>
                              setOpenComboboxCell(open ? { row: i, col: 0 } : null)
                            }
                            gridRow={i}
                            gridCol={0}
                            onGridKeyDown={(e) => handleSubGridKeyDown(e, i, 0, isComboboxOpen(i, 0))}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="0.000"
                            value={row.default_qty}
                            onChange={(e) => updateSmRow(i, { default_qty: e.target.value })}
                            onKeyDown={(e) => handleSubGridKeyDown(e, i, 1, false)}
                            data-grid-row={i}
                            data-grid-col={1}
                            className="h-8 text-sm"
                          />
                        </td>
                        <td className="px-2 py-1 text-xs text-slate-600 truncate">
                          {row.unit_name || <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-1 py-1 text-center">
                          {row.material_id && (
                            <button
                              type="button"
                              onClick={() => removeSmRow(row._key)}
                              className="text-slate-300 hover:text-red-500 transition-colors"
                              tabIndex={-1}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-700 mt-1.5">
                ↓ or Enter to add rows · ← → to move between columns
              </p>
            </div>

            {/* Buttons */}
            <div className="flex gap-2 pt-1 flex-wrap">
              <Button ref={saveRef} onClick={handleSave} disabled={isPending} className="flex-1">
                {editing ? "Update" : "Add"}
              </Button>
              {editing && (
                <Button variant="outline" onClick={resetForm} disabled={isPending}>
                  Cancel
                </Button>
              )}
            </div>

            {editing && (
              <div className="pt-3 border-t border-slate-200">
                {editing.is_active ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-amber-600 hover:bg-amber-50 hover:text-amber-700 text-xs"
                    onClick={() => setDeactivatingId(editing.id)}
                    disabled={isPending}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    Deactivate
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 text-xs"
                    onClick={() => handleReactivate(editing.id)}
                    disabled={isPending}
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                    Reactivate
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* ── Right: List panel ─────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 bg-white rounded-lg border border-slate-200 flex flex-col min-h-0">
            {/* Search bar */}
            <div className="p-3 border-b border-slate-100 flex items-center gap-2">
              <Input
                ref={searchRef}
                autoComplete="off"
                placeholder="Search by stage code or name…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setFocusedIdx(-1); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setFocusedIdx((i) => Math.min(i + 1, visible.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setFocusedIdx((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter" && focusedIdx >= 0) {
                    startEdit(visible[focusedIdx]);
                    setTimeout(() => firstFieldRef.current?.focus(), 50);
                  } else if (e.key === "Escape") {
                    setFocusedIdx(-1);
                  }
                }}
                className="max-w-sm"
              />
              {inactive.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowInactive((v) => !v)}
                  className="shrink-0 text-xs"
                >
                  {showInactive ? "Back to Active" : `Inactive (${inactive.length})`}
                </Button>
              )}
            </div>

            {/* Table */}
            <div className="overflow-auto flex-1">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-700 text-white">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium w-12">S.No</th>
                    <th className="px-3 py-2 text-left font-medium w-28">Code</th>
                    <th className="px-3 py-2 text-left font-medium">Stage Name</th>
                    <th className="px-3 py-2 text-left font-medium w-24">Materials</th>
                    <th className="px-3 py-2 text-left font-medium w-20">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-700">
                        No stages found
                      </td>
                    </tr>
                  )}
                  {visible.map((s, i) => (
                    <tr
                      key={s.id}
                      onClick={() => startEdit(s)}
                      className={`border-t border-slate-100 cursor-pointer ${
                        i === focusedIdx
                          ? "ring-1 ring-inset ring-blue-400 bg-blue-50"
                          : !s.is_active
                          ? "opacity-50 bg-slate-50 hover:bg-slate-100"
                          : "hover:bg-blue-50/40"
                      }`}
                    >
                      <td className="px-3 py-1.5 text-slate-600">{i + 1}</td>
                      <td className="px-3 py-1.5 font-mono text-xs font-medium text-slate-700">
                        {s.stage_code}
                      </td>
                      <td className="px-3 py-1.5 font-medium">{s.stage_name}</td>
                      <td className="px-3 py-1.5 text-slate-600 text-xs">
                        {s.materials.length > 0
                          ? `${s.materials.length} material${s.materials.length === 1 ? "" : "s"}`
                          : <span className="text-slate-300">None</span>}
                      </td>
                      <td className="px-3 py-1.5">
                        {s.is_active ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                            Inactive
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* ── Dialogs ──────────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={escapeDiscardOpen}
        onOpenChange={(open) => { if (!open) setEscapeDiscardOpen(false); }}
        title="Discard changes?"
        description="You have unsaved changes. Discard them and close the form?"
        confirmLabel="Discard"
        onConfirm={() => {
          setEscapeDiscardOpen(false);
          resetForm();
          setTimeout(() => searchRef.current?.focus(), 50);
        }}
        isPending={false}
      />

      <ConfirmDialog
        open={deactivatingId !== null}
        onOpenChange={(open) => { if (!open) setDeactivatingId(null); }}
        title="Deactivate stage?"
        description="This will deactivate the stage. It will be hidden from the New VMI stage dropdown. You can reactivate at any time."
        confirmLabel="Deactivate"
        onConfirm={() => {
          if (!deactivatingId) return;
          startTransition(async () => {
            try {
              const { draftCount } = await deleteStage(deactivatingId);
              toast.success("Stage deactivated");
              if (draftCount > 0) {
                toast.warning(
                  `${draftCount} draft slip${draftCount === 1 ? "" : "s"} still reference this stage — they are unaffected but the stage is now inactive.`
                );
              }
              resetForm();
            } catch (e: unknown) {
              toast.error(e instanceof Error ? e.message : "Could not deactivate");
            } finally {
              setDeactivatingId(null);
            }
          });
        }}
        isPending={isPending}
      />
    </>
  );
}
