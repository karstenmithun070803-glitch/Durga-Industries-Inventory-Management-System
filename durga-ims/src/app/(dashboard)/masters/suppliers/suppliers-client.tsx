"use client";

import { useState, useTransition } from "react";
import { MasterLayout } from "@/components/masters/master-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createSupplier, updateSupplier, deleteSupplier, reactivateSupplier, bulkImportSuppliers } from "@/lib/actions/suppliers.actions";
import { INDIAN_STATES } from "@/lib/constants";
import { formatCode, matchesCode, validateGstinFormat } from "@/lib/utils";
import type { Supplier } from "@/types";
import { RotateCcw, UserX, Upload } from "lucide-react";
import { toast } from "sonner";
import { GenericBulkImportDialog } from "@/components/masters/generic-bulk-import-dialog";

const EMPTY = { name: "", tin_no: "", cst_no: "", gstin: "", address: "", state: "" };


export function SuppliersClient({ suppliers }: { suppliers: Supplier[] }) {
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [isPending, startTransition] = useTransition();
  const [importOpen, setImportOpen] = useState(false);

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
        if (editing) { await updateSupplier(editing.id, form); } else { await createSupplier(form); }
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
              { label: "Address", key: "address", placeholder: "Full address" },
            ].map(({ label, key, placeholder }) => (
              <div key={key} className="space-y-1.5">
                <label className="text-xs text-slate-500">{label}</label>
                <Input placeholder={placeholder} value={form[key as keyof typeof form]} onChange={(e) => set(key, e.target.value)} />
              </div>
            ))}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">GSTIN</label>
              <Input
                placeholder="e.g. 33AAAAA1234A1Z5"
                value={form.gstin}
                onChange={(e) => set("gstin", e.target.value)}
                onBlur={(e) => {
                  const err = validateGstinFormat(e.target.value);
                  if (err) toast.warning(err);
                  else if (e.target.value.trim()) set("gstin", e.target.value.trim().toUpperCase());
                }}
                maxLength={15}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">State</label>
              <Combobox options={INDIAN_STATES.map((s) => ({ value: s, label: s }))} value={form.state} onChange={(v) => set("state", v)} placeholder="Select state..." searchPlaceholder="Search states..." />
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
              <Input placeholder="Search by name, S001 or just 1, GSTIN..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
              {inactive.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setShowInactive((v) => !v)} className="shrink-0 text-xs">
                  {showInactive ? "Hide Inactive" : `Show Inactive (${inactive.length})`}
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
                    <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap sticky left-12 z-20 bg-slate-50 w-28">Supplier Code</th>
                    <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap sticky left-40 z-20 bg-slate-50 w-44 border-r border-slate-200">Supplier Name</th>
                    {["Address", "State", "GSTIN", "TIN No."].map((h) => (
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
                    <tr
                      key={s.id}
                      className={`border-t border-slate-100 cursor-pointer ${!s.is_active ? "opacity-50 bg-slate-50 hover:bg-slate-100" : "hover:bg-blue-50/40"}`}
                      onClick={() => startEdit(s)}
                    >
                      <td className={`px-3 py-2.5 text-slate-500 sticky left-0 z-10 w-12 ${stickyBg}`}>{i + 1}</td>
                      <td className={`px-3 py-2.5 font-mono text-xs font-medium text-slate-700 sticky left-12 z-10 w-28 ${stickyBg}`}>{formatCode("S", s.code_no)}</td>
                      <td className={`px-3 py-2.5 font-medium sticky left-40 z-10 w-44 border-r border-slate-200 ${stickyBg}`}>{s.name}</td>
                      <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{s.address ?? "—"}</td>
                      <td className="px-3 py-2.5 text-slate-500">{s.state ?? "—"}</td>
                      <td className="px-3 py-2.5 text-slate-500 font-mono text-xs">{s.gstin ?? "—"}</td>
                      <td className="px-3 py-2.5 text-slate-500 font-mono text-xs">{s.tin_no ?? "—"}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        }
      />
      <GenericBulkImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Suppliers"
        templateFileName="suppliers-import-template.xlsx"
        templateColumns={["Supplier Name", "Address", "State", "GSTIN", "TIN No", "CST No"]}
        exampleRow={["Steel India Pvt Ltd", "45 Industrial Area, Coimbatore", "Tamil Nadu", "33BBBBB1111B1Z6", "", ""]}
        referenceSheet={{ rows: [
          ["REFERENCE — do not edit this sheet"],
          [],
          ["Available States (copy exact name into State column)"],
          ...INDIAN_STATES.map((s) => [s]),
        ]}}
        existingKeys={new Set(suppliers.map((s) => s.name.toUpperCase()))}
        processRow={(row) => {
          const errors: string[] = [];
          const name = row["Supplier Name"]?.trim() ?? "";
          if (!name) errors.push("Supplier Name is required");

          const stateRaw = row["State"]?.trim() ?? "";
          let resolvedState: string | null = null;
          if (stateRaw) {
            const match = INDIAN_STATES.find((s) => s.toLowerCase() === stateRaw.toLowerCase());
            if (!match) errors.push(`State "${stateRaw}" not recognized — check Reference sheet`);
            else resolvedState = match;
          }

          return {
            errors,
            displayName: name || "—",
            dedupKey: name,
            data: {
              name,
              address: row["Address"]?.trim() || null,
              state: resolvedState,
              gstin: row["GSTIN"]?.trim().toUpperCase() || null,
              tin_no: row["TIN No"]?.trim() || null,
              cst_no: row["CST No"]?.trim() || null,
            },
          };
        }}
        onImport={(rows) => bulkImportSuppliers(rows.map((r) => ({
          name: r.name as string,
          address: r.address as string | null,
          state: r.state as string | null,
          gstin: r.gstin as string | null,
          tin_no: r.tin_no as string | null,
          cst_no: r.cst_no as string | null,
        })))}
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
