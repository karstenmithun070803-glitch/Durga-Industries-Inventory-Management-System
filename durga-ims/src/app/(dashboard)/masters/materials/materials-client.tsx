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
import { Pencil, RotateCcw, UserX } from "lucide-react";
import { toast } from "sonner";

const EMPTY = { name: "", hsn_code: "", tax_rate_id: "", purchase_unit_id: "", sales_unit_id: "", conversion_value: "1", opening_stock: "0", min_level: "0", max_level: "" };

interface Props { materials: Material[]; taxRates: TaxRate[]; units: Unit[]; }

export function MaterialsClient({ materials, taxRates, units }: Props) {
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [isPending, startTransition] = useTransition();

  const inactive = materials.filter((m) => !m.is_active);
  const activeUnits = units.filter((u) => u.is_active);
  const activeTaxRates = taxRates.filter((t) => t.is_active);

  const visible = (showInactive ? materials : materials.filter((m) => m.is_active)).filter((m) => {
    const q = search.toLowerCase();
    return (
      m.name.toLowerCase().includes(q) ||
      (m.hsn_code ?? "").includes(q) ||
      matchesCode(search, "M", m.material_no)
    );
  });

  function startEdit(m: Material) {
    setEditing(m);
    setForm({ name: m.name, hsn_code: m.hsn_code ?? "", tax_rate_id: m.tax_rate_id ?? "", purchase_unit_id: m.purchase_unit_id ?? "", sales_unit_id: m.sales_unit_id ?? "", conversion_value: m.conversion_value ?? "1", opening_stock: m.opening_stock, min_level: m.min_level ?? "0", max_level: m.max_level ?? "" });
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
      await reactivateMaterial(id);
      toast.success("Material reactivated");
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
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">Sales Unit</label>
              <Combobox
                options={activeUnits.map((u) => ({ value: u.id, label: `${formatCode("U", u.unit_code, 2)} — ${u.unit_name}` }))}
                value={form.sales_unit_id}
                onChange={(v) => set("sales_unit_id", v)}
                placeholder="Select unit..."
                searchPlaceholder="Search units..."
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-500">Conv. Value</label>
                <Input type="number" value={form.conversion_value} onChange={(e) => set("conversion_value", e.target.value)} />
              </div>
              {!editing && (
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">Opening Stock</label>
                  <Input type="number" value={form.opening_stock} onChange={(e) => set("opening_stock", e.target.value)} />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-500">Min Level</label>
                <Input type="number" value={form.min_level} onChange={(e) => set("min_level", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-500">Max Level</label>
                <Input type="number" value={form.max_level} onChange={(e) => set("max_level", e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={handleSubmit} disabled={isPending} className="flex-1">{editing ? "Update" : "Add"}</Button>
              {editing && <Button variant="outline" onClick={resetForm}>Cancel</Button>}
            </div>
          </div>
        }
        tablePanel={
          <div className="flex flex-col h-full">
            <div className="p-3 border-b border-slate-100 flex items-center gap-2">
              <Input placeholder="Search by name, M001 or just 1, HSN..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
              {inactive.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setShowInactive((v) => !v)} className="shrink-0 text-xs">
                  {showInactive ? "Hide Inactive" : `Show Inactive (${inactive.length})`}
                </Button>
              )}
            </div>
            <div className="overflow-auto flex-1">
              <table className="min-w-max text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap sticky left-0 z-20 bg-slate-50 w-12">S.No</th>
                    <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap sticky left-12 z-20 bg-slate-50 w-28">Material Code</th>
                    <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap sticky left-40 z-20 bg-slate-50 w-44 border-r border-slate-200">Material Name</th>
                    {["HSN", "Tax Rate", "Pur. Unit", "Sal. Unit", "Conv.", "Min", "Max", "Stock", "Actions"].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr><td colSpan={12} className="px-4 py-8 text-center text-slate-400">No materials found</td></tr>
                  )}
                  {visible.map((m, i) => {
                    const purUnit = units.find((u) => u.id === m.purchase_unit_id);
                    const salUnit = units.find((u) => u.id === m.sales_unit_id);
                    const taxRate = taxRates.find((t) => t.id === m.tax_rate_id);
                    const stockLow = m.min_level && parseFloat(m.current_stock) < parseFloat(m.min_level);
                    const stickyBg = !m.is_active ? "bg-slate-50" : stockLow ? "bg-red-50" : "bg-white";
                    return (
                      <tr key={m.id} className={`border-t border-slate-100 ${!m.is_active ? "opacity-50 bg-slate-50" : stockLow ? "bg-red-50" : "hover:bg-slate-50"}`}>
                        <td className={`px-3 py-2.5 text-slate-500 sticky left-0 z-10 w-12 ${stickyBg}`}>{i + 1}</td>
                        <td className={`px-3 py-2.5 font-mono text-xs font-medium text-slate-700 sticky left-12 z-10 w-28 ${stickyBg}`}>{formatCode("M", m.material_no)}</td>
                        <td className={`px-3 py-2.5 font-medium sticky left-40 z-10 w-44 border-r border-slate-200 ${stickyBg}`}>{m.name}</td>
                        <td className="px-3 py-2.5 text-slate-500 font-mono text-xs">{m.hsn_code ?? "—"}</td>
                        <td className="px-3 py-2.5 text-slate-500 text-xs">{taxRate ? taxRate.description : "—"}</td>
                        <td className="px-3 py-2.5 text-slate-500">{purUnit?.unit_name ?? "—"}</td>
                        <td className="px-3 py-2.5 text-slate-500">{salUnit?.unit_name ?? "—"}</td>
                        <td className="px-3 py-2.5 text-slate-500">{m.conversion_value}</td>
                        <td className="px-3 py-2.5 text-slate-500">{m.min_level ?? "—"}</td>
                        <td className="px-3 py-2.5 text-slate-500">{m.max_level ?? "—"}</td>
                        <td className={`px-3 py-2.5 font-semibold ${stockLow ? "text-red-600" : "text-slate-800"}`}>{m.current_stock}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1">
                            {m.is_active ? (
                              <>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(m)}><Pencil className="w-3.5 h-3.5" /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-600 hover:bg-amber-50" onClick={() => setDeactivatingId(m.id)} disabled={isPending}><UserX className="w-3.5 h-3.5" /></Button>
                              </>
                            ) : (
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-600 hover:bg-emerald-50" onClick={() => handleReactivate(m.id)} disabled={isPending}><RotateCcw className="w-3 h-3 mr-1" />Reactivate</Button>
                            )}
                          </div>
                        </td>
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
        open={deactivatingId !== null}
        onOpenChange={(open) => { if (!open) setDeactivatingId(null); }}
        title="Deactivate material?"
        description="This will deactivate the material. Stock and transaction history will be preserved. You can reactivate at any time."
        confirmLabel="Deactivate"
        onConfirm={() => {
          if (!deactivatingId) return;
          startTransition(async () => {
            await deleteMaterial(deactivatingId);
            toast.success("Material deactivated");
            setDeactivatingId(null);
          });
        }}
        isPending={isPending}
      />
    </>
  );
}
