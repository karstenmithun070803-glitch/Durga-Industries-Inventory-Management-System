"use client";

import { useState, useTransition, useRef, useMemo, useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { MasterLayout } from "@/components/masters/master-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createVehicle, updateVehicle, deleteVehicle, reactivateVehicle, bulkImportVehicles } from "@/lib/actions/vehicles.actions";
import { formatCode } from "@/lib/utils";
import type { Customer } from "@/types";
import { RotateCcw, UserX, Upload } from "lucide-react";
import { toast } from "sonner";
import { GenericBulkImportDialog } from "@/components/masters/generic-bulk-import-dialog";

type VehicleRow = { id: string; job_ref_no: string; vehicle_name: string | null; type: string; customer_id: string | null; customer_name: string | null; is_active: boolean; created_at: Date; updated_at: Date };
const EMPTY = { job_ref_no: "", vehicle_name: "", type: "New", customer_id: "" };

interface Props { vehicles: VehicleRow[]; customers: Customer[]; }

export function VehiclesClient({ vehicles, customers }: Props) {
  const [search, setSearch] = useState("");
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<VehicleRow | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [isPending, startTransition] = useTransition();
  const [importOpen, setImportOpen] = useState(false);
  const [escapeDiscardOpen, setEscapeDiscardOpen] = useState(false);

  const firstFieldRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const originalFormRef = useRef<typeof EMPTY>(EMPTY);

  const inactive = vehicles.filter((v) => !v.is_active);
  const visible = useMemo(() =>
    vehicles.filter((v) => showInactive ? !v.is_active : v.is_active).filter((v) => {
      const q = search.toLowerCase();
      return (
        (v.vehicle_name ?? "").toLowerCase().includes(q) ||
        (v.customer_name ?? "").toLowerCase().includes(q) ||
        (v.job_ref_no ?? "").toLowerCase().includes(q)
      );
    }),
    [vehicles, search, showInactive]
  );

  function startEdit(v: VehicleRow) {
    setEditing(v);
    setFocusedIdx(-1);
    const next = { job_ref_no: v.job_ref_no, vehicle_name: v.vehicle_name ?? "", type: v.type, customer_id: v.customer_id ?? "" };
    setForm(next);
    originalFormRef.current = next;
  }
  function resetForm() { setEditing(null); setForm(EMPTY); }
  function set(key: string, val: string) { setForm((f) => ({ ...f, [key]: val })); }

  function handleEscape() {
    if (!editing) return;
    if (JSON.stringify(form) !== JSON.stringify(originalFormRef.current)) {
      setEscapeDiscardOpen(true);
    } else {
      resetForm();
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }
  useHotkeys("escape", handleEscape, { enableOnFormTags: ["INPUT", "SELECT", "TEXTAREA"] });

  function handleSubmit() {
    startTransition(async () => {
      try {
        if (editing) {
          await updateVehicle(editing.id, form);
        } else {
          await createVehicle(form);
        }
        toast.success(editing ? "Vehicle updated" : "Vehicle added");
        resetForm();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function handleReactivate(id: string) {
    startTransition(async () => {
      try {
        await reactivateVehicle(id);
        toast.success("Vehicle reactivated");
        setShowInactive(false);
        resetForm();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Could not reactivate");
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
              <label className="text-xs text-slate-600">Job No. *</label>
              <Input
                ref={firstFieldRef}
                placeholder="e.g. 2026/001"
                value={form.job_ref_no}
                onChange={(e) => set("job_ref_no", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-600">Vehicle Name / Reg. No</label>
              <Input placeholder="e.g. TN 82 H 3560" value={form.vehicle_name} onChange={(e) => set("vehicle_name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-600">Vehicle Type</label>
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
              <label className="text-xs text-slate-600">Customer</label>
              <Combobox
                options={customers.map((c) => ({ value: c.id, label: `${formatCode("C", c.customer_no)} — ${c.customer_name}` }))}
                value={form.customer_id}
                onChange={(v) => set("customer_id", v)}
                placeholder="Select customer..."
                searchPlaceholder="Search by name or C001..."
              />
              {editing && form.customer_id !== editing.customer_id && (
                <p className="text-xs text-amber-600 mt-0.5">Changing the customer only affects future issue slips. Historical records are preserved.</p>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <Button ref={saveRef} onClick={handleSubmit} disabled={isPending} className="flex-1">{editing ? "Update" : "Add"}</Button>
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
                ref={searchRef}
                placeholder="Search by vehicle name, job number, or customer..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setFocusedIdx(-1); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setFocusedIdx((i) => Math.min(i + 1, visible.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setFocusedIdx((i) => Math.max(i - 1, 0)); }
                  else if (e.key === "Enter" && focusedIdx >= 0) { startEdit(visible[focusedIdx]); setTimeout(() => firstFieldRef.current?.focus(), 50); }
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
              <table className="w-full text-sm">
                <thead className="bg-slate-700 text-white">
                  <tr>
                    {["S.No", "Job No.", "Vehicle Name", "Type", "Customer"].map((h) => (
                      <th key={h} className="px-4 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-700">No vehicles found</td></tr>
                  )}
                  {visible.map((v, i) => (
                    <tr
                      key={v.id}
                      className={`border-t border-slate-100 cursor-pointer ${i === focusedIdx ? "ring-1 ring-inset ring-blue-400 bg-blue-50" : !v.is_active ? "opacity-50 bg-slate-50 hover:bg-slate-100" : "hover:bg-blue-50/40"}`}
                      onClick={() => startEdit(v)}
                    >
                      <td className="px-4 py-1.5 text-slate-600">{i + 1}</td>
                      <td className="px-4 py-1.5 font-mono text-xs font-medium text-slate-700">{v.job_ref_no}</td>
                      <td className="px-4 py-1.5 font-medium">{v.vehicle_name ?? "—"}</td>
                      <td className="px-4 py-1.5">
                        <Badge variant={v.type === "New" ? "default" : "secondary"}>{v.type}</Badge>
                      </td>
                      <td className="px-4 py-1.5 text-slate-600">{v.customer_name ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        }
      />
      <GenericBulkImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Vehicles / Jobs"
        templateFileName="vehicles-import-template.xlsx"
        templateColumns={["Job Ref No", "Vehicle Name", "Type", "Customer Name"]}
        exampleRow={["JB-2024-001", "TN 01 AB 1234", "New", "Ravi Motors"]}
        referenceSheet={{ rows: [
          ["REFERENCE — do not edit this sheet"],
          [],
          ["Type must be one of:"],
          ["New"],
          ["Old"],
          [],
          ["Existing Customers (copy exact name into Customer Name column)"],
          ...customers.map((c) => [c.customer_name]),
        ]}}
        existingKeys={new Set(vehicles.map((v) => v.job_ref_no.toUpperCase()))}
        processRow={(row) => {
          const errors: string[] = [];
          const jobRef = row["Job Ref No"]?.trim() ?? "";
          const vehicleName = row["Vehicle Name"]?.trim() ?? "";
          const typeRaw = row["Type"]?.trim() ?? "";
          const custNameRaw = row["Customer Name"]?.trim() ?? "";

          if (!jobRef) errors.push("Job Ref No is required");
          if (!vehicleName) errors.push("Vehicle Name is required");
          if (!typeRaw) errors.push("Type is required (New or Old)");

          const normalizedType = typeRaw
            ? typeRaw.charAt(0).toUpperCase() + typeRaw.slice(1).toLowerCase()
            : "New";
          if (typeRaw && !["New", "Old"].includes(normalizedType)) {
            errors.push(`Type "${typeRaw}" must be "New" or "Old"`);
          }

          let customer_id: string | null = null;
          if (custNameRaw) {
            const match = customers.find(
              (c) => c.customer_name.toLowerCase() === custNameRaw.toLowerCase()
            );
            if (!match) errors.push(`Customer "${custNameRaw}" not found — check Reference sheet`);
            else customer_id = match.id;
          }

          return {
            errors,
            displayName: jobRef ? `${jobRef}${vehicleName ? ` — ${vehicleName}` : ""}` : vehicleName || "—",
            dedupKey: jobRef,
            data: {
              job_ref_no: jobRef,
              vehicle_name: vehicleName.toUpperCase(),
              type: normalizedType,
              customer_id,
            },
          };
        }}
        onImport={(rows) => bulkImportVehicles(rows.map((r) => ({
          job_ref_no: r.job_ref_no as string,
          vehicle_name: r.vehicle_name as string,
          type: r.type as string,
          customer_id: r.customer_id as string | null,
        })))}
      />
      <ConfirmDialog
        open={escapeDiscardOpen}
        onOpenChange={(open) => { if (!open) setEscapeDiscardOpen(false); }}
        title="Discard changes?"
        description="You have unsaved changes. Discard them and close the form?"
        confirmLabel="Discard"
        onConfirm={() => { setEscapeDiscardOpen(false); resetForm(); setTimeout(() => searchRef.current?.focus(), 50); }}
        isPending={false}
      />
      <ConfirmDialog
        open={deactivatingId !== null}
        onOpenChange={(open) => { if (!open) setDeactivatingId(null); }}
        title="Deactivate vehicle?"
        description="This will deactivate the vehicle / job record. Historical material issues will be preserved. You can reactivate at any time."
        confirmLabel="Deactivate"
        onConfirm={() => {
          if (!deactivatingId) return;
          startTransition(async () => {
            try {
              await deleteVehicle(deactivatingId);
              toast.success("Vehicle deactivated");
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
