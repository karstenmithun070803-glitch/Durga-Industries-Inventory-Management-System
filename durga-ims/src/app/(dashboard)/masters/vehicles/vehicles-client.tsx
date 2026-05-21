"use client";

import { useState, useTransition } from "react";
import { MasterLayout } from "@/components/masters/master-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createVehicle, updateVehicle, deleteVehicle } from "@/lib/actions/vehicles.actions";
import type { Customer } from "@/types";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

type VehicleRow = { id: string; job_ref_no: number; vehicle_name: string; type: string; customer_id: string | null; customer_name: string | null; is_active: boolean; created_at: Date; updated_at: Date };
const EMPTY = { vehicle_name: "", type: "New", customer_id: "" };

interface Props { vehicles: VehicleRow[]; customers: Customer[]; }

export function VehiclesClient({ vehicles, customers }: Props) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<VehicleRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [isPending, startTransition] = useTransition();

  const filtered = vehicles.filter(
    (v) =>
      v.vehicle_name.toLowerCase().includes(search.toLowerCase()) ||
      (v.customer_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      v.job_ref_no.toString().includes(search)
  );

  function startEdit(v: VehicleRow) {
    setEditing(v);
    setForm({ vehicle_name: v.vehicle_name, type: v.type, customer_id: v.customer_id ?? "" });
  }

  function resetForm() { setEditing(null); setForm(EMPTY); }
  function set(key: string, val: string) { setForm((f) => ({ ...f, [key]: val })); }

  function handleSubmit() {
    startTransition(async () => {
      try {
        editing ? await updateVehicle(editing.id, form) : await createVehicle(form);
        toast.success(editing ? "Vehicle updated" : "Vehicle added");
        resetForm();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <>
      <MasterLayout
        title="Vehicle / Job Master"
        formPanel={
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">{editing ? "Edit Vehicle" : "Add Vehicle"}</p>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">Vehicle Name / Reg. No *</label>
              <Input placeholder="e.g. TN 82 H 3560" value={form.vehicle_name} onChange={(e) => set("vehicle_name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">Vehicle Type</label>
              <Combobox
                options={[
                  { value: "New", label: "New (New chassis + New body)" },
                  { value: "Old", label: "Old (Old chassis + New body)" },
                ]}
                value={form.type}
                onChange={(v) => set("type", v || "New")}
                placeholder="Select type..."
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">Customer</label>
              <Combobox
                options={customers.map((c) => ({ value: c.id, label: c.customer_name }))}
                value={form.customer_id}
                onChange={(v) => set("customer_id", v)}
                placeholder="Select customer..."
                searchPlaceholder="Search customers..."
              />
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
              <Input placeholder="Search by vehicle name, job no, customer..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
            </div>
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    {["S.No", "Job No", "Vehicle Name", "Type", "Customer", "Actions"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium text-slate-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No vehicles found</td></tr>
                  )}
                  {filtered.map((v, i) => (
                    <tr key={v.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-500">{i + 1}</td>
                      <td className="px-4 py-2.5 font-mono font-medium">{String(v.job_ref_no).padStart(5, "0")}</td>
                      <td className="px-4 py-2.5 font-medium">{v.vehicle_name}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant={v.type === "New" ? "default" : "secondary"}>{v.type}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{v.customer_name ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(v)}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:bg-red-50"
                            onClick={() => setDeletingId(v.id)} disabled={isPending}>
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
        title="Delete vehicle?"
        description="This will soft-delete the vehicle / job record. Historical material issues will be preserved."
        onConfirm={() => {
          if (!deletingId) return;
          startTransition(async () => {
            await deleteVehicle(deletingId);
            toast.success("Vehicle deleted");
            setDeletingId(null);
          });
        }}
        isPending={isPending}
      />
    </>
  );
}
