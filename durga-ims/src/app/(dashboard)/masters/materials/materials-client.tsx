"use client";

import { useState, useTransition, useRef, useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useMasterKeyboardNav } from "@/hooks/use-master-keyboard-nav";
import { MasterLayout } from "@/components/masters/master-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createMaterial, updateMaterial, deleteMaterial, reactivateMaterial } from "@/lib/actions/materials.actions";
import { formatCode, matchesCode } from "@/lib/utils";
import type { Material, TaxRate, Unit } from "@/types";
import { Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { BulkImportDialog } from "@/components/masters/bulk-import-dialog";

const EMPTY = { name: "", hsn_code: "", tax_rate_id: "", purchase_unit_id: "", opening_stock: "0", opening_rate: "", standard_cost: "" };

interface Props { materials: Material[]; taxRates: TaxRate[]; units: Unit[]; isAdmin: boolean; }

export function MaterialsClient({ materials, taxRates, units, isAdmin }: Props) {
  const [search, setSearch] = useState("");
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const [editing, setEditing] = useState<Material | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Set when a new name collides with a hidden ("deleted") material: prompt to restore it (R5).
  const [hiddenCollision, setHiddenCollision] = useState<{ id: string; name: string } | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [isPending, startTransition] = useTransition();
  const [importOpen, setImportOpen] = useState(false);
  const [escapeDiscardOpen, setEscapeDiscardOpen] = useState(false);

  const firstFieldRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const originalFormRef = useRef<typeof EMPTY>(EMPTY);

  const isDuplicateName = form.name.trim() !== "" &&
    materials.some((m) =>
      m.name.toLowerCase() === form.name.trim().toLowerCase() &&
      m.id !== editing?.id
    );

  const activeUnits = units.filter((u) => u.is_active);
  const activeTaxRates = taxRates.filter((t) => t.is_active);

  // Picker options: active choices, plus the material's currently-saved tax/unit even if it
  // has since been deleted (hidden) — otherwise editing that material would blank the field (R4).
  const taxOptions = useMemo(() => {
    const opts = activeTaxRates.map((t) => ({ value: t.id, label: t.description }));
    if (form.tax_rate_id && !activeTaxRates.some((t) => t.id === form.tax_rate_id)) {
      const cur = taxRates.find((t) => t.id === form.tax_rate_id);
      if (cur) opts.unshift({ value: cur.id, label: `${cur.description} (deleted)` });
    }
    return opts;
  }, [taxRates, form.tax_rate_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const unitOptions = useMemo(() => {
    const opts = activeUnits.map((u) => ({ value: u.id, label: `${formatCode("U-", u.unit_code, 2)} — ${u.unit_name}` }));
    if (form.purchase_unit_id && !activeUnits.some((u) => u.id === form.purchase_unit_id)) {
      const cur = units.find((u) => u.id === form.purchase_unit_id);
      if (cur) opts.unshift({ value: cur.id, label: `${formatCode("U-", cur.unit_code, 2)} — ${cur.unit_name} (deleted)` });
    }
    return opts;
  }, [units, form.purchase_unit_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() =>
    materials.filter((m) => {
      const q = search.toLowerCase();
      return (
        m.name.toLowerCase().includes(q) ||
        (m.hsn_code ?? "").includes(q) ||
        matchesCode(search, "M-", m.material_no)
      );
    }),
    [materials, search]
  );

  function startEdit(m: Material) {
    setEditing(m);
    setFocusedIdx(-1);
    const next = { name: m.name, hsn_code: m.hsn_code ?? "", tax_rate_id: m.tax_rate_id ?? "", purchase_unit_id: m.purchase_unit_id ?? "", opening_stock: m.opening_stock, opening_rate: "", standard_cost: m.standard_cost ?? "" };
    setForm(next);
    originalFormRef.current = next;
  }

  function resetForm() { setEditing(null); setForm(EMPTY); }
  function set(key: string, val: string) { setForm((f) => ({ ...f, [key]: val })); }

  function handleEscape() {
    if (!editing) return;
    if (JSON.stringify(form) !== JSON.stringify(originalFormRef.current)) {
      setEscapeDiscardOpen(true);
    } else {
      resetForm();
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }
  useHotkeys("escape", handleEscape, { enableOnFormTags: ["INPUT", "SELECT", "TEXTAREA"] });

  useMasterKeyboardNav({
    searchRef,
    saveRef,
    onNew: () => { resetForm(); setTimeout(() => firstFieldRef.current?.focus(), 50); },
  });

  function handleSubmit() {
    startTransition(async () => {
      try {
        if (editing) {
          await updateMaterial(editing.id, form);
          toast.success("Material updated");
          resetForm();
        } else {
          const res = await createMaterial(form);
          if ("hiddenCollision" in res) {
            // Name matches a previously-deleted (hidden) material — offer to restore it.
            setHiddenCollision(res.hiddenCollision);
            return;
          }
          toast.success("Material added");
          resetForm();
        }
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function handleRestore() {
    if (!hiddenCollision) return;
    startTransition(async () => {
      try {
        await reactivateMaterial(hiddenCollision.id);
        toast.success("Material restored");
        resetForm();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Could not restore");
      } finally {
        setHiddenCollision(null);
      }
    });
  }

  return (
    <>
      <MasterLayout
        title="Material Master"
        formPanel={
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">{editing ? "Edit Material" : "Add Material"}</p>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-600">Material Name *</label>
              <Input ref={firstFieldRef} placeholder="e.g. 25*3MM ANGLE" value={form.name} onChange={(e) => set("name", e.target.value)} forceUppercase />
              {isDuplicateName && (
                <p className="text-xs text-red-500 mt-0.5">A material named &ldquo;{form.name.trim().toUpperCase()}&rdquo; already exists.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-600">HSN Code</label>
              <Input placeholder="8-digit HSN" value={form.hsn_code} onChange={(e) => set("hsn_code", e.target.value)} maxLength={8} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-600">Tax Rate</label>
              <Combobox
                options={taxOptions}
                value={form.tax_rate_id}
                onChange={(v) => set("tax_rate_id", v)}
                placeholder="Select tax rate..."
                searchPlaceholder="Search tax rates..."
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-600">Purchase Unit *</label>
              <Combobox
                options={unitOptions}
                value={form.purchase_unit_id}
                onChange={(v) => set("purchase_unit_id", v)}
                placeholder="Select unit..."
                searchPlaceholder="Search units..."
              />
            </div>
            {isAdmin && !editing && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-600">Opening Stock</label>
                  <Input type="number" min="0" step="any" value={form.opening_stock} onChange={(e) => set("opening_stock", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-600">Opening Rate (₹/unit, incl. GST)</label>
                  <Input type="number" min="0" step="any" placeholder="e.g. 65.00" value={form.opening_rate} onChange={(e) => set("opening_rate", e.target.value)} />
                </div>
              </>
            )}
            {editing && (
              <div className="space-y-1.5">
                <label className="text-xs text-slate-600">Standard Cost (₹) <span className="text-slate-700">— for valuation when no PO rate</span></label>
                <Input type="number" min={0} step="any" placeholder="e.g. 150.00" value={form.standard_cost} onChange={(e) => set("standard_cost", e.target.value)} />
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button ref={saveRef} onClick={handleSubmit} disabled={isPending || isDuplicateName || !form.name.trim()} className="flex-1">{editing ? "Update" : "Add"}</Button>
              {editing && <Button variant="outline" onClick={resetForm}>Cancel</Button>}
            </div>
            {editing && (
              <div className="pt-3 border-t border-slate-200 mt-1">
                <Button type="button" variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 hover:text-red-700 text-xs" onClick={() => setDeletingId(editing.id)} disabled={isPending}>
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />Delete
                </Button>
              </div>
            )}
          </div>
        }
        tablePanel={
          <div className="flex flex-col h-full">
            <div className="p-3 border-b border-slate-100 flex items-center gap-2">
              <Input
                ref={searchRef}
                autoComplete="off"
                placeholder="Search by name, M001 or just 1, HSN..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setFocusedIdx(-1); }}
                forceUppercase
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setFocusedIdx((i) => Math.min(i + 1, visible.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setFocusedIdx((i) => Math.max(i - 1, 0)); }
                  else if (e.key === "Enter" && focusedIdx >= 0) { startEdit(visible[focusedIdx]); setTimeout(() => firstFieldRef.current?.focus(), 50); }
                  else if (e.key === "Escape") { setFocusedIdx(-1); }
                }}
                className="max-w-sm"
              />
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="shrink-0 text-xs border-field ml-auto">
                <Upload className="w-3.5 h-3.5 mr-1.5" />Import
              </Button>
            </div>
            <div className="overflow-auto flex-1">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-700 text-white">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium whitespace-nowrap sticky left-0 z-20 bg-slate-700 w-12">S.No</th>
                    <th className="px-3 py-1.5 text-left font-medium whitespace-nowrap sticky left-12 z-20 bg-slate-700 w-28">Material Code</th>
                    <th className="px-3 py-1.5 text-left font-medium whitespace-nowrap sticky left-40 z-20 bg-slate-700 w-44 border-r border-slate-600">Material Name</th>
                    {["HSN", "Tax Rate", "Unit", "Stock"].map((h) => (
                      <th key={h} className="px-3 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-700">No materials found</td></tr>
                  )}
                  {visible.map((m, i) => {
                    const purUnit = units.find((u) => u.id === m.purchase_unit_id);
                    const taxRate = taxRates.find((t) => t.id === m.tax_rate_id);
                    const stickyBg = i % 2 === 1 ? "bg-slate-50" : "bg-white";
                    return (
                      <tr
                        key={m.id}
                        className={`group border-t border-slate-200 cursor-pointer ${i === focusedIdx ? "ring-1 ring-inset ring-blue-500 bg-blue-50" : "hover:bg-rowhover hover:text-slate-900"}`}
                        onClick={() => startEdit(m)}
                      >
                        <td className={`px-3 py-1.5 text-slate-800 group-hover:bg-rowhover group-hover:text-slate-900 sticky left-0 z-10 w-12 ${stickyBg}`}>{i + 1}</td>
                        <td className={`px-3 py-1.5 font-mono text-xs font-medium text-slate-700 group-hover:bg-rowhover group-hover:text-slate-900 sticky left-12 z-10 w-28 ${stickyBg}`}>{formatCode("M-", m.material_no)}</td>
                        <td className={`px-3 py-1.5 font-medium group-hover:bg-rowhover group-hover:text-slate-900 sticky left-40 z-10 w-44 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(15,23,42,0.15)] ${stickyBg}`}>{m.name}</td>
                        <td className="px-3 py-1.5 text-slate-800 group-hover:text-slate-900 font-mono text-xs">{m.hsn_code ?? "—"}</td>
                        <td className="px-3 py-1.5 text-slate-800 group-hover:text-slate-900 text-xs">{taxRate ? taxRate.description : "—"}</td>
                        <td className="px-3 py-1.5 text-slate-800 group-hover:text-slate-900">{purUnit?.unit_name ?? "—"}</td>
                        <td className="px-3 py-1.5 font-semibold text-slate-800 group-hover:text-slate-900 tabular-nums">{m.current_stock}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        }
      />
      <ConfirmDialog
        open={escapeDiscardOpen}
        onOpenChange={(open) => { if (!open) setEscapeDiscardOpen(false); }}
        title="Discard changes?"
        description="You have unsaved changes. Discard them and close the form?"
        confirmLabel="Discard"
        onConfirm={() => { setEscapeDiscardOpen(false); resetForm(); setTimeout(() => searchRef.current?.focus(), 50); }}
        isPending={false}
      />
      <BulkImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        units={units}
        taxRates={taxRates}
        existingMaterials={materials}
        isAdmin={isAdmin}
      />
      <ConfirmDialog
        open={deletingId !== null}
        onOpenChange={(open) => { if (!open) setDeletingId(null); }}
        title="Delete material?"
        description="This permanently deletes the material. If it appears in any transaction, its history is preserved and it is simply removed from all lists. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          if (!deletingId) return;
          startTransition(async () => {
            try {
              await deleteMaterial(deletingId);
              toast.success("Material deleted");
              resetForm();
            } catch (e: unknown) {
              toast.error(e instanceof Error ? e.message : "Could not delete");
            } finally {
              setDeletingId(null);
            }
          });
        }}
        isPending={isPending}
      />
      <ConfirmDialog
        open={hiddenCollision !== null}
        onOpenChange={(open) => { if (!open) setHiddenCollision(null); }}
        title="Restore deleted material?"
        description={`A previously-deleted material named "${hiddenCollision?.name ?? ""}" still exists in your transaction history. Restore that record (its history reattaches), or cancel and use a different name.`}
        confirmLabel="Restore"
        onConfirm={handleRestore}
        isPending={isPending}
      />
    </>
  );
}
