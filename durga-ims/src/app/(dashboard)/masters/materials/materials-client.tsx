"use client";

import { useState, useTransition } from "react";
import { MasterLayout } from "@/components/masters/master-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createMaterial, updateMaterial, deleteMaterial, reactivateMaterial } from "@/lib/actions/materials.actions";
import { formatCode, matchesCode } from "@/lib/utils";
import type { Material, TaxRate, Unit } from "@/types";
import { RotateCcw, UserX, Upload } from "lucide-react";
import { toast } from "sonner";
import { BulkImportDialog } from "@/components/masters/bulk-import-dialog";

const EMPTY = { name: "", hsn_code: "", tax_rate_id: "", purchase_unit_id: "", opening_stock: "0", min_level: "0" };

interface Props { materials: Material[]; taxRates: TaxRate[]; units: Unit[]; }

export function MaterialsClient({ materials, taxRates, units }: Props) {
  const [search, setSearch] = useState("");
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [isPending, startTransition] = useTransition();
  const [importOpen, setImportOpen] = useState(false);

  const inactive = materials.filter((m) => !m.is_active);
  const activeUnits = units.filter((u) => u.is_active);
  const activeTaxRates = taxRates.filter((t) => t.is_active);

  const visible = materials.filter((m) => showInactive ? !m.is_active : m.is_active).filter((m) => {
    const q = search.toLowerCase();
    return (
      m.name.toLowerCase().includes(q) ||
      (m.hsn_code ?? "").includes(q) ||
      matchesCode(search, "M", m.material_no)
    );
  });

  function startEdit(m: Material) {
    setEditing(m);
    setFocusedIdx(-1);
    setForm({ name: m.name, hsn_code: m.hsn_code ?? "", tax_rate_id: m.tax_rate_id ?? "", purchase_unit_id: m.purchase_unit_id ?? "", opening_stock: m.opening_stock, min_level: m.min_level ?? "0" });
  }

  function resetForm() { setEditing(null); setForm(EMPTY); }
  function set(key: string, val: string) { setForm((f) => ({ ...f, [key]: val })); }

  function handleSubmit() {
    startTransition(async () => {
      try {
        if (editing) { await updateMaterial(editing.id, form); } else { await createMaterial(form); }
        toast.success(editing ? "Material updated" : "Material added");
        resetForm();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function handleReactivate(id: string) {
    startTransition(async () => {
      try {
        await reactivateMaterial(id);
        toast.success("Material reactivated");
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Could not reactivate");
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
              <label className="text-xs text-slate-500">Material Name *</label>
              <Input placeholder="e.g. 25*3MM ANGLE" value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">HSN Code</label>
              <Input placeholder="8-digit HSN" value={form.hsn_code} onChange={(e) => set("hsn_code", e.target.value)} maxLength={8} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">Tax Rate</label>
              <Combobox
                options={activeTaxRates.map((t) => ({ value: t.id, label: t.description }))}
                value={form.tax_rate_id}
                onChange={(v) => set("tax_rate_id", v)}
                placeholder="Select tax rate..."
                searchPlaceholder="Search tax rates..."
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">Purchase Unit *</label>
              <Combobox
                options={activeUnits.map((u) => ({ value: u.id, label: `${formatCode("U", u.unit_code, 2)} — ${u.unit_name}` }))}
                value={form.purchase_unit_id}
                onChange={(v) => set("purchase_unit_id", v)}
                placeholder="Select unit..."
                searchPlaceholder="Search units..."
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {!editing && (
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">Opening Stock</label>
                  <Input type="number" value={form.opening_stock} onChange={(e) => set("opening_stock", e.target.value)} />
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-500">Min Level</label>
                <Input type="number" value={form.min_level} onChange={(e) => set("min_level", e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={handleSubmit} disabled={isPending} className="flex-1">{editing ? "Update" : "Add"}</Button>
              {editing && <Button variant="outline" onClick={resetForm}>Cancel</Button>}
            </div>
            {editing && (
              <div className="pt-3 border-t border-slate-200 mt-1">
                {editing.is_active ? (
                  <Button type="button" variant="ghost" size="sm" className="text-amber-600 hover:bg-amber-50 hover:text-amber-700 text-xs" onClick={() => setDeactivatingId(editing.id)} disabled={isPending}>
                    <UserX className="w-3.5 h-3.5 mr-1.5" />Deactivate
                  </Button>
                ) : (
                  <Button type="button" variant="ghost" size="sm" className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 text-xs" onClick={() => handleReactivate(editing.id)} disabled={isPending}>
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />Reactivate
                  </Button>
                )}
              </div>
            )}
          </div>
        }
        tablePanel={
          <div className="flex flex-col h-full">
            <div className="p-3 border-b border-slate-100 flex items-center gap-2">
              <Input
                placeholder="Search by name, M001 or just 1, HSN..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setFocusedIdx(-1); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setFocusedIdx((i) => Math.min(i + 1, visible.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setFocusedIdx((i) => Math.max(i - 1, 0)); }
                  else if (e.key === "Enter" && focusedIdx >= 0) { startEdit(visible[focusedIdx]); }
                  else if (e.key === "Escape") { setFocusedIdx(-1); }
                }}
                className="max-w-sm"
              />
              {inactive.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setShowInactive((v) => !v)} className="shrink-0 text-xs">
                  {showInactive ? "Back to Active" : `Inactive Only (${inactive.length})`}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="shrink-0 text-xs ml-auto">
                <Upload className="w-3.5 h-3.5 mr-1.5" />Import
              </Button>
            </div>
            <div className="overflow-auto flex-1">
              <table className="min-w-max text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap sticky left-0 z-20 bg-slate-50 w-12">S.No</th>
                    <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap sticky left-12 z-20 bg-slate-50 w-28">Material Code</th>
                    <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap sticky left-40 z-20 bg-slate-50 w-44 border-r border-slate-200">Material Name</th>
                    {["HSN", "Tax Rate", "Unit", "Min", "Stock"].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No materials found</td></tr>
                  )}
                  {visible.map((m, i) => {
                    const purUnit = units.find((u) => u.id === m.purchase_unit_id);
                    const taxRate = taxRates.find((t) => t.id === m.tax_rate_id);
                    const stockLow = m.min_level && parseFloat(m.current_stock) < parseFloat(m.min_level);
                    const stickyBg = !m.is_active ? "bg-slate-50" : stockLow ? "bg-red-50" : "bg-white";
                    return (
                      <tr
                        key={m.id}
                        className={`border-t border-slate-100 cursor-pointer ${i === focusedIdx ? "ring-1 ring-inset ring-blue-400 bg-blue-50" : !m.is_active ? "opacity-50 bg-slate-50 hover:bg-slate-100" : stockLow ? "bg-red-50 hover:bg-red-100/60" : "hover:bg-blue-50/40"}`}
                        onClick={() => startEdit(m)}
                      >
                        <td className={`px-3 py-2.5 text-slate-500 sticky left-0 z-10 w-12 ${stickyBg}`}>{i + 1}</td>
                        <td className={`px-3 py-2.5 font-mono text-xs font-medium text-slate-700 sticky left-12 z-10 w-28 ${stickyBg}`}>{formatCode("M", m.material_no)}</td>
                        <td className={`px-3 py-2.5 font-medium sticky left-40 z-10 w-44 border-r border-slate-200 ${stickyBg}`}>{m.name}</td>
                        <td className="px-3 py-2.5 text-slate-500 font-mono text-xs">{m.hsn_code ?? "—"}</td>
                        <td className="px-3 py-2.5 text-slate-500 text-xs">{taxRate ? taxRate.description : "—"}</td>
                        <td className="px-3 py-2.5 text-slate-500">{purUnit?.unit_name ?? "—"}</td>
                        <td className="px-3 py-2.5 text-slate-500">{m.min_level ?? "—"}</td>
                        <td className={`px-3 py-2.5 font-semibold ${stockLow ? "text-red-600" : "text-slate-800"}`}>{m.current_stock}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        }
      />
      <BulkImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        units={units}
        taxRates={taxRates}
        existingMaterials={materials}
      />
      <ConfirmDialog
        open={deactivatingId !== null}
        onOpenChange={(open) => { if (!open) setDeactivatingId(null); }}
        title="Deactivate material?"
        description="This will deactivate the material. Stock and transaction history will be preserved. You can reactivate at any time."
        confirmLabel="Deactivate"
        onConfirm={() => {
          if (!deactivatingId) return;
          startTransition(async () => {
            try {
              await deleteMaterial(deactivatingId);
              toast.success("Material deactivated");
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
