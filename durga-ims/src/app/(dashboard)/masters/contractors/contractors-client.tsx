"use client";

import { useState, useTransition } from "react";
import { MasterLayout } from "@/components/masters/master-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createContractor, updateContractor, deleteContractor } from "@/lib/actions/contractors.actions";
import type { Contractor } from "@/types";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function ContractorsClient({ contractors }: { contractors: Contractor[] }) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Contractor | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", role: "", contact: "" });
  const [isPending, startTransition] = useTransition();

  const filtered = contractors.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.role ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function startEdit(c: Contractor) {
    setEditing(c);
    setForm({ name: c.name, role: c.role ?? "", contact: c.contact ?? "" });
  }

  function resetForm() {
    setEditing(null);
    setForm({ name: "", role: "", contact: "" });
  }

  function handleSubmit() {
    startTransition(async () => {
      try {
        editing ? await updateContractor(editing.id, form) : await createContractor(form);
        toast.success(editing ? "Contractor updated" : "Contractor added");
        resetForm();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <>
      <MasterLayout
        title="Contractor Master"
        formPanel={
          <div className="space-y-4">
            <p className="text-sm font-medium text-slate-700">{editing ? "Edit Contractor" : "Add Contractor"}</p>
            {[
              { label: "Name *", key: "name", placeholder: "Full name" },
              { label: "Role / Specialization", key: "role", placeholder: "e.g. Glass Work, Welding" },
              { label: "Contact Number", key: "contact", placeholder: "Phone number" },
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
              <Input placeholder="Search contractors..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
            </div>
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    {["S.No", "Code", "Name", "Role", "Contact", "Actions"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium text-slate-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No contractors found</td></tr>
                  )}
                  {filtered.map((c, i) => (
                    <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-500">{i + 1}</td>
                      <td className="px-4 py-2.5 text-slate-500">{c.code_no}</td>
                      <td className="px-4 py-2.5 font-medium">{c.name}</td>
                      <td className="px-4 py-2.5 text-slate-500">{c.role ?? "—"}</td>
                      <td className="px-4 py-2.5 text-slate-500">{c.contact ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(c)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:bg-red-50"
                            onClick={() => setDeletingId(c.id)} disabled={isPending}>
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
      <ConfirmDialog
        open={deletingId !== null}
        onOpenChange={(open) => { if (!open) setDeletingId(null); }}
        title="Delete contractor?"
        description="This will soft-delete the contractor. Historical material issue records will be preserved."
        onConfirm={() => {
          if (!deletingId) return;
          startTransition(async () => {
            await deleteContractor(deletingId);
            toast.success("Contractor deleted");
            setDeletingId(null);
          });
        }}
        isPending={isPending}
      />
    </>
  );
}
