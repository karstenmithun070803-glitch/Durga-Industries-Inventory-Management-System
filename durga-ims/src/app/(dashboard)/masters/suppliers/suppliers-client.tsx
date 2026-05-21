"use client";

import { useState, useTransition } from "react";
import { MasterLayout } from "@/components/masters/master-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createSupplier, updateSupplier, deleteSupplier, reactivateSupplier } from "@/lib/actions/suppliers.actions";
import { INDIAN_STATES } from "@/lib/constants";
import { formatCode, matchesCode } from "@/lib/utils";
import type { Supplier } from "@/types";
import { Pencil, RotateCcw, UserX } from "lucide-react";
import { toast } from "sonner";

const EMPTY = { name: "", tin_no: "", cst_no: "", gstin: "", address: "", state: "" };

export function SuppliersClient({ suppliers }: { suppliers: Supplier[] }) {
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [isPending, startTransition] = useTransition();

  const inactive = suppliers.filter((s) => !s.is_active);
  const visible = (showInactive ? suppliers : suppliers.filter((s) => s.is_active)).filter((s) => {
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.gstin ?? "").toLowerCase().includes(q) ||
      (s.state ?? "").toLowerCase().includes(q) ||
      matchesCode(search, "S", s.code_no)
    );
  });

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

  function handleReactivate(id: string) {
    startTransition(async () => {
      await reactivateSupplier(id);
      toast.success("Supplier reactivated");
    });
  }

  return (
    <>
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
              <Combobox options={INDIAN_STATES.map((s) => ({ value: s, label: s }))} value={form.state} onChange={(v) => set("state", v)} placeholder="Select state..." searchPlaceholder="Search states..." />
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
              <Input placeholder="Search by name, S001 or just 1, GSTIN..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
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
                    <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap sticky left-12 z-20 bg-slate-50 w-28">Supplier Code</th>
                    <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap sticky left-40 z-20 bg-slate-50 w-44 border-r border-slate-200">Supplier Name</th>
                    {["Address", "State", "GSTIN", "TIN No.", "Actions"].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No suppliers found</td></tr>
                  )}
                  {visible.map((s, i) => {
                    const stickyBg = !s.is_active ? "bg-slate-50" : "bg-white";
                    return (
                    <tr key={s.id} className={`border-t border-slate-100 ${!s.is_active ? "opacity-50 bg-slate-50" : "hover:bg-slate-50"}`}>
                      <td className={`px-3 py-2.5 text-slate-500 sticky left-0 z-10 w-12 ${stickyBg}`}>{i + 1}</td>
                      <td className={`px-3 py-2.5 font-mono text-xs font-medium text-slate-700 sticky left-12 z-10 w-28 ${stickyBg}`}>{formatCode("S", s.code_no)}</td>
                      <td className={`px-3 py-2.5 font-medium sticky left-40 z-10 w-44 border-r border-slate-200 ${stickyBg}`}>{s.name}</td>
                      <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{s.address ?? "—"}</td>
                      <td className="px-3 py-2.5 text-slate-500">{s.state ?? "—"}</td>
                      <td className="px-3 py-2.5 text-slate-500 font-mono text-xs">{s.gstin ?? "—"}</td>
                      <td className="px-3 py-2.5 text-slate-500 font-mono text-xs">{s.tin_no ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          {s.is_active ? (
                            <>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(s)}><Pencil className="w-3.5 h-3.5" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-600 hover:bg-amber-50" onClick={() => setDeactivatingId(s.id)} disabled={isPending}><UserX className="w-3.5 h-3.5" /></Button>
                            </>
                          ) : (
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-600 hover:bg-emerald-50" onClick={() => handleReactivate(s.id)} disabled={isPending}><RotateCcw className="w-3 h-3 mr-1" />Reactivate</Button>
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
        title="Deactivate supplier?"
        description="This will deactivate the supplier. They will be hidden from active lists. You can reactivate at any time."
        confirmLabel="Deactivate"
        onConfirm={() => {
          if (!deactivatingId) return;
          startTransition(async () => {
            await deleteSupplier(deactivatingId);
            toast.success("Supplier deactivated");
            setDeactivatingId(null);
          });
        }}
        isPending={isPending}
      />
    </>
  );
}
