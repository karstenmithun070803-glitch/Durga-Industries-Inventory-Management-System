"use client";

import { useState, useTransition } from "react";
import { MasterLayout } from "@/components/masters/master-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createSupplier, updateSupplier, deleteSupplier } from "@/lib/actions/suppliers.actions";
import { INDIAN_STATES } from "@/lib/constants";
import type { Supplier } from "@/types";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const EMPTY = { name: "", tin_no: "", cst_no: "", gstin: "", address: "", state: "" };

export function SuppliersClient({ suppliers }: { suppliers: Supplier[] }) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [isPending, startTransition] = useTransition();

  const filtered = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.gstin ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function startEdit(s: Supplier) {
    setEditing(s);
    setForm({ name: s.name, tin_no: s.tin_no ?? "", cst_no: s.cst_no ?? "", gstin: s.gstin ?? "", address: s.address ?? "", state: s.state ?? "" });
  }

  function resetForm() { setEditing(null); setForm(EMPTY); }
  function set(key: string, val: string) { setForm((f) => ({ ...f, [key]: val })); }

  function handleSubmit() {
    startTransition(async () => {
      try {
        editing ? await updateSupplier(editing.id, form) : await createSupplier(form);
        toast.success(editing ? "Supplier updated" : "Supplier added");
        resetForm();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <MasterLayout
      title="Supplier Master"
      formPanel={
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-700">{editing ? "Edit Supplier" : "Add Supplier"}</p>
          {[
            { label: "Supplier Name *", key: "name", placeholder: "Company name" },
            { label: "TIN No", key: "tin_no", placeholder: "Legacy TIN number" },
            { label: "CST No", key: "cst_no", placeholder: "Legacy CST number" },
            { label: "GSTIN", key: "gstin", placeholder: "15-character GSTIN" },
            { label: "Address", key: "address", placeholder: "Full address" },
          ].map(({ label, key, placeholder }) => (
            <div key={key} className="space-y-1.5">
              <label className="text-xs text-slate-500">{label}</label>
              <Input placeholder={placeholder} value={form[key as keyof typeof form]} onChange={(e) => set(key, e.target.value)} />
            </div>
          ))}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-500">State</label>
            <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={form.state} onChange={(e) => set("state", e.target.value)}>
              <option value="">Select state</option>
              {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
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
            <Input placeholder="Search suppliers..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          </div>
          <div className="overflow-auto flex-1">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  {["S.No", "Code", "Supplier Name", "Address", "GSTIN", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left font-medium text-slate-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No suppliers found</td></tr>
                )}
                {filtered.map((s, i) => (
                  <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-500">{i + 1}</td>
                    <td className="px-4 py-2.5 text-slate-500">{s.code_no}</td>
                    <td className="px-4 py-2.5 font-medium">{s.name}</td>
                    <td className="px-4 py-2.5 text-slate-500 max-w-xs truncate">{s.address ?? "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{s.gstin ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(s)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:bg-red-50"
                          onClick={() => startTransition(async () => { await deleteSupplier(s.id); toast.success("Deleted"); })} disabled={isPending}>
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
      }
    />
  );
}
