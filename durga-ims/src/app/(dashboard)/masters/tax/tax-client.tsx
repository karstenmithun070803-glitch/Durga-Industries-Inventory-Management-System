"use client";

import { useState, useTransition } from "react";
import { MasterLayout } from "@/components/masters/master-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createTaxRate, updateTaxRate, deleteTaxRate } from "@/lib/actions/tax.actions";
import type { TaxRate } from "@/types";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function TaxClient({ taxRates }: { taxRates: TaxRate[] }) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<TaxRate | null>(null);
  const [form, setForm] = useState({ tax_percentage: "", description: "", inv_prefix: "" });
  const [isPending, startTransition] = useTransition();

  const filtered = taxRates.filter(
    (t) =>
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      t.tax_percentage.toString().includes(search)
  );

  function startEdit(t: TaxRate) {
    setEditing(t);
    setForm({ tax_percentage: t.tax_percentage, description: t.description, inv_prefix: t.inv_prefix ?? "" });
  }

  function resetForm() {
    setEditing(null);
    setForm({ tax_percentage: "", description: "", inv_prefix: "" });
  }

  function handleSubmit() {
    startTransition(async () => {
      try {
        if (editing) {
          await updateTaxRate(editing.id, form);
          toast.success("Tax rate updated");
        } else {
          await createTaxRate(form);
          toast.success("Tax rate added");
        }
        resetForm();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <MasterLayout
      title="Tax Master"
      formPanel={
        <div className="space-y-4">
          <p className="text-sm font-medium text-slate-700">{editing ? "Edit Tax Rate" : "Add Tax Rate"}</p>
          {[
            { label: "Tax Percentage *", key: "tax_percentage", placeholder: "e.g. 18" },
            { label: "Description *", key: "description", placeholder: "e.g. GST 18%" },
            { label: "Invoice Prefix", key: "inv_prefix", placeholder: "e.g. D" },
          ].map(({ label, key, placeholder }) => (
            <div key={key} className="space-y-1.5">
              <label className="text-xs text-slate-500">{label}</label>
              <Input
                placeholder={placeholder}
                value={form[key as keyof typeof form]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={isPending} className="flex-1">
              {editing ? "Update" : "Add"}
            </Button>
            {editing && <Button variant="outline" onClick={resetForm}>Cancel</Button>}
          </div>
        </div>
      }
      tablePanel={
        <div className="flex flex-col h-full">
          <div className="p-3 border-b border-slate-100">
            <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          </div>
          <div className="overflow-auto flex-1">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  {["S.No", "VAT Code", "Tax %", "Description", "Prefix", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left font-medium text-slate-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No tax rates found</td></tr>
                )}
                {filtered.map((t, i) => (
                  <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-500">{i + 1}</td>
                    <td className="px-4 py-2.5 text-slate-500">{t.vat_code}</td>
                    <td className="px-4 py-2.5 font-medium">{t.tax_percentage}%</td>
                    <td className="px-4 py-2.5">{t.description}</td>
                    <td className="px-4 py-2.5 text-slate-500">{t.inv_prefix ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(t)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:bg-red-50"
                          onClick={() => startTransition(async () => { await deleteTaxRate(t.id); toast.success("Deleted"); })} disabled={isPending}>
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
