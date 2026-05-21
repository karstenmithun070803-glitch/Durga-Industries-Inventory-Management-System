"use client";

import { useState, useTransition } from "react";
import { MasterLayout } from "@/components/masters/master-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createCustomer, updateCustomer, deleteCustomer } from "@/lib/actions/customers.actions";
import { INDIAN_STATES } from "@/lib/constants";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Customer } from "@/types";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const EMPTY = { customer_name: "", address_1: "", address_2: "", street: "", city: "", state: "", gstin: "" };

export function CustomersClient({ customers }: { customers: Customer[] }) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [isPending, startTransition] = useTransition();

  const filtered = customers.filter(
    (c) =>
      c.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      (c.city ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (c.gstin ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function startEdit(c: Customer) {
    setEditing(c);
    setForm({
      customer_name: c.customer_name,
      address_1: c.address_1 ?? "",
      address_2: c.address_2 ?? "",
      street: c.street ?? "",
      city: c.city ?? "",
      state: c.state ?? "",
      gstin: c.gstin ?? "",
    });
  }

  function resetForm() { setEditing(null); setForm(EMPTY); }

  function set(key: string, val: string) { setForm((f) => ({ ...f, [key]: val })); }

  function handleSubmit() {
    startTransition(async () => {
      try {
        editing ? await updateCustomer(editing.id, form) : await createCustomer(form);
        toast.success(editing ? "Customer updated" : "Customer added");
        resetForm();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <>
    <MasterLayout
      title="Customer Master"
      formPanel={
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-700">{editing ? "Edit Customer" : "Add Customer"}</p>
          <div className="space-y-1.5">
            <label className="text-xs text-slate-500">Customer Name *</label>
            <Input placeholder="Full name" value={form.customer_name} onChange={(e) => set("customer_name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-slate-500">Address Line 1</label>
            <Input placeholder="Door no, Building" value={form.address_1} onChange={(e) => set("address_1", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-slate-500">Address Line 2</label>
            <Input placeholder="Area, Landmark" value={form.address_2} onChange={(e) => set("address_2", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-slate-500">Street</label>
            <Input placeholder="Street name" value={form.street} onChange={(e) => set("street", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">City</label>
              <Input placeholder="City" value={form.city} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">State</label>
              <Combobox
                options={INDIAN_STATES.map((s) => ({ value: s, label: s }))}
                value={form.state}
                onChange={(v) => set("state", v)}
                placeholder="Select state..."
                searchPlaceholder="Search states..."
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-slate-500">GSTIN</label>
            <Input placeholder="15-character GSTIN" value={form.gstin} onChange={(e) => set("gstin", e.target.value)} maxLength={15} />
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
            <Input placeholder="Search by name, city, GSTIN..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
          </div>
          <div className="overflow-auto flex-1">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  {["S.No", "Customer Name", "City", "State", "GSTIN", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left font-medium text-slate-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No customers found</td></tr>
                )}
                {filtered.map((c, i) => (
                  <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-500">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium">{c.customer_name}</td>
                    <td className="px-4 py-2.5 text-slate-500">{c.city ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-500">{c.state ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{c.gstin ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>
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
      title="Delete customer?"
      description="This will soft-delete the customer. Historical records will be preserved."
      onConfirm={() => {
        if (!deletingId) return;
        startTransition(async () => {
          await deleteCustomer(deletingId);
          toast.success("Customer deleted");
          setDeletingId(null);
        });
      }}
      isPending={isPending}
    />
    </>
  );
}
