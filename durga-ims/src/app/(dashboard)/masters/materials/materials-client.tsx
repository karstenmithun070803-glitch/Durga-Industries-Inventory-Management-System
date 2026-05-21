"use client";

import { useState, useTransition } from "react";
import { MasterLayout } from "@/components/masters/master-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createMaterial, updateMaterial, deleteMaterial } from "@/lib/actions/materials.actions";
import type { Material, TaxRate, Unit } from "@/types";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const EMPTY = { name: "", hsn_code: "", tax_rate_id: "", purchase_unit_id: "", sales_unit_id: "", conversion_value: "1", opening_stock: "0", min_level: "0", max_level: "" };

interface Props { materials: Material[]; taxRates: TaxRate[]; units: Unit[]; }

export function MaterialsClient({ materials, taxRates, units }: Props) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Material | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [isPending, startTransition] = useTransition();

  const filtered = materials.filter(
    (m) => m.name.toLowerCase().includes(search.toLowerCase()) || (m.hsn_code ?? "").includes(search)
  );

  function startEdit(m: Material) {
    setEditing(m);
    setForm({
      name: m.name, hsn_code: m.hsn_code ?? "", tax_rate_id: m.tax_rate_id ?? "",
      purchase_unit_id: m.purchase_unit_id ?? "", sales_unit_id: m.sales_unit_id ?? "",
      conversion_value: m.conversion_value ?? "1", opening_stock: m.opening_stock,
      min_level: m.min_level ?? "0", max_level: m.max_level ?? "",
    });
  }

  function resetForm() { setEditing(null); setForm(EMPTY); }
  function set(key: string, val: string) { setForm((f) => ({ ...f, [key]: val })); }

  function handleSubmit() {
    startTransition(async () => {
      try {
        editing ? await updateMaterial(editing.id, form) : await createMaterial(form);
        toast.success(editing ? "Material updated" : "Material added");
        resetForm();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  const Sel = ({ label, k, opts }: { label: string; k: string; opts: { value: string; label: string }[] }) => (
    <div className="space-y-1.5">
      <label className="text-xs text-slate-500">{label}</label>
      <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
        value={form[k as keyof typeof form]} onChange={(e) => set(k, e.target.value)}>
        <option value="">Select...</option>
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  return (
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
          <Sel label="Tax Rate" k="tax_rate_id" opts={taxRates.map((t) => ({ value: t.id, label: `${t.tax_percentage}% — ${t.description}` }))} />
          <Sel label="Purchase Unit" k="purchase_unit_id" opts={units.map((u) => ({ value: u.id, label: u.unit_name }))} />
          <Sel label="Sales Unit" k="sales_unit_id" opts={units.map((u) => ({ value: u.id, label: u.unit_name }))} />
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
          <div className="p-3 border-b border-slate-100">
            <Input placeholder="Search by name or HSN..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
          </div>
          <div className="overflow-auto flex-1">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  {["S.No", "No.", "Material Name", "HSN", "Pur. Unit", "Sal. Unit", "Conv.", "Stock", "Actions"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No materials found</td></tr>
                )}
                {filtered.map((m, i) => {
                  const purUnit = units.find((u) => u.id === m.purchase_unit_id);
                  const salUnit = units.find((u) => u.id === m.sales_unit_id);
                  const stockLow = m.min_level && parseFloat(m.current_stock) < parseFloat(m.min_level);
                  return (
                    <tr key={m.id} className={`border-t border-slate-100 ${stockLow ? "bg-red-50" : "hover:bg-slate-50"}`}>
                      <td className="px-3 py-2.5 text-slate-500">{i + 1}</td>
                      <td className="px-3 py-2.5 text-slate-500">{m.material_no}</td>
                      <td className="px-3 py-2.5 font-medium">{m.name}</td>
                      <td className="px-3 py-2.5 text-slate-500 font-mono text-xs">{m.hsn_code ?? "—"}</td>
                      <td className="px-3 py-2.5 text-slate-500">{purUnit?.unit_name ?? "—"}</td>
                      <td className="px-3 py-2.5 text-slate-500">{salUnit?.unit_name ?? "—"}</td>
                      <td className="px-3 py-2.5 text-slate-500">{m.conversion_value}</td>
                      <td className={`px-3 py-2.5 font-semibold ${stockLow ? "text-red-600" : "text-slate-800"}`}>{m.current_stock}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(m)}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:bg-red-50"
                            onClick={() => startTransition(async () => { await deleteMaterial(m.id); toast.success("Deleted"); })} disabled={isPending}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
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
  );
}
