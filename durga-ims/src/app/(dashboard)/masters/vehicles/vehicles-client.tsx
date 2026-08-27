"use client";

import { useState, useTransition, useRef, useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useMasterKeyboardNav } from "@/hooks/use-master-keyboard-nav";
import { MasterLayout } from "@/components/masters/master-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createVehicle, updateVehicle, deleteVehicle, reactivateVehicle, bulkImportVehicles } from "@/lib/actions/vehicles.actions";
import { formatCode } from "@/lib/utils";
import type { Customer } from "@/types";
import { Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { GenericBulkImportDialog } from "@/components/masters/generic-bulk-import-dialog";

type VehicleRow = { id: string; job_ref_no: string; type: string; customer_id: string | null; customer_name: string | null; is_active: boolean; created_at: Date; updated_at: Date };
const EMPTY = { job_ref_no: "", type: "New", customer_id: "" };

interface Props { vehicles: VehicleRow[]; customers: Customer[]; }

export function VehiclesClient({ vehicles, customers }: Props) {
  const [search, setSearch] = useState("");
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const [editing, setEditing] = useState<VehicleRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Set when a new job_ref_no collides with a hidden ("deleted") vehicle: prompt to restore it (R5).
  const [hiddenCollision, setHiddenCollision] = useState<{ id: string; name: string } | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [isPending, startTransition] = useTransition();
  const [importOpen, setImportOpen] = useState(false);
  const [escapeDiscardOpen, setEscapeDiscardOpen] = useState(false);

  const firstFieldRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const originalFormRef = useRef<typeof EMPTY>(EMPTY);

  const activeCustomers = customers.filter((c) => c.is_active);

  // Picker options: active customers, plus the vehicle's currently-saved customer even if it
  // has since been deleted (hidden) — otherwise editing that vehicle would blank the field (R4).
  const customerOptions = useMemo(() => {
    const opts = activeCustomers.map((c) => ({ value: c.id, label: `${formatCode("C-", c.customer_no)} — ${c.customer_name}` }));
    if (form.customer_id && !activeCustomers.some((c) => c.id === form.customer_id)) {
      const cur = customers.find((c) => c.id === form.customer_id);
      if (cur) opts.unshift({ value: cur.id, label: `${formatCode("C-", cur.customer_no)} — ${cur.customer_name} (deleted)` });
    }
    return opts;
  }, [customers, form.customer_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() =>
    vehicles.filter((v) => {
      const q = search.toLowerCase();
      return (
        (v.customer_name ?? "").toLowerCase().includes(q) ||
        (v.job_ref_no ?? "").toLowerCase().includes(q)
      );
    }),
    [vehicles, search]
  );

  function startEdit(v: VehicleRow) {
    setEditing(v);
    setFocusedIdx(-1);
    const next = { job_ref_no: v.job_ref_no.toUpperCase(), type: v.type, customer_id: v.customer_id ?? "" };
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

  useMasterKeyboardNav({
    searchRef,
    saveRef,
    onNew: () => { resetForm(); setTimeout(() => firstFieldRef.current?.focus(), 50); },
  });

  function handleSubmit() {
    startTransition(async () => {
      try {
        if (editing) {
          await updateVehicle(editing.id, form);
          toast.success("Vehicle updated");
          resetForm();
        } else {
          const res = await createVehicle(form);
          if ("hiddenCollision" in res) {
            // job_ref_no matches a previously-deleted (hidden) vehicle — offer to restore it.
            setHiddenCollision(res.hiddenCollision);
            return;
          }
          toast.success("Vehicle added");
          resetForm();
        }
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function handleRestore() {
    if (!hiddenCollision) return;
    startTransition(async () => {
      try {
        await reactivateVehicle(hiddenCollision.id);
        toast.success("Vehicle restored");
        resetForm();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Could not restore");
      } finally {
        setHiddenCollision(null);
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
              <label className="text-xs text-slate-600">Job No / Reg No *</label>
              <Input
                ref={firstFieldRef}
                placeholder="e.g. 2026/001"
                value={form.job_ref_no}
                onChange={(e) => set("job_ref_no", e.target.value.toUpperCase())}
              />
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
                options={customerOptions}
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
                <Button type="button" variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 hover:text-red-700 text-xs" onClick={() => setDeletingId(editing.id)} disabled={isPending}>
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />Delete
                </Button>
              </div>
            )}
          </div>
        }
        tablePanel={
          <div className="flex flex-col h-full">
            <div className="p-3 border-b border-slate-100 flex items-center gap-2">
              <Input
                ref={searchRef}
                autoComplete="off"
                placeholder="Search by job no / reg no or customer..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setFocusedIdx(-1); }}
                forceUppercase
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setFocusedIdx((i) => Math.min(i + 1, visible.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setFocusedIdx((i) => Math.max(i - 1, 0)); }
                  else if (e.key === "Enter" && focusedIdx >= 0) { startEdit(visible[focusedIdx]); setTimeout(() => firstFieldRef.current?.focus(), 50); }
                  else if (e.key === "Escape") { setFocusedIdx(-1); }
                }}
                className="max-w-sm"
              />
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="shrink-0 text-xs border-field ml-auto">
                <Upload className="w-3.5 h-3.5 mr-1.5" />Import
              </Button>
            </div>
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead className="bg-slate-700 text-white">
                  <tr>
                    {["S.No", "Job No / Reg No", "Type", "Customer"].map((h) => (
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
                      className={`group border-t border-slate-200 cursor-pointer ${i === focusedIdx ? "ring-1 ring-inset ring-blue-500 bg-blue-50" : "hover:bg-rowhover hover:text-slate-900"}`}
                      onClick={() => startEdit(v)}
                    >
                      <td className="px-4 py-1.5 text-slate-800 group-hover:text-slate-900">{i + 1}</td>
                      <td className="px-4 py-1.5 font-mono text-xs font-medium text-slate-700 group-hover:text-slate-900">{v.job_ref_no}</td>
                      <td className="px-4 py-1.5">
                        <Badge variant={v.type === "New" ? "default" : "secondary"}>{v.type}</Badge>
                      </td>
                      <td className="px-4 py-1.5 text-slate-800 group-hover:text-slate-900">{v.customer_name ?? "—"}</td>
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
        templateColumns={["Job No / Reg No", "Type", "Customer Name"]}
        exampleRow={["JB-2024-001", "New", "Ravi Motors"]}
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
          const jobRef = (row["Job No / Reg No"]?.trim() ?? "").toUpperCase();
          const typeRaw = row["Type"]?.trim() ?? "";
          const custNameRaw = row["Customer Name"]?.trim() ?? "";

          if (!jobRef) errors.push("Job No / Reg No is required");
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
            displayName: jobRef || "—",
            dedupKey: jobRef,
            data: {
              job_ref_no: jobRef,
              type: normalizedType,
              customer_id,
            },
          };
        }}
        onImport={(rows) => bulkImportVehicles(rows.map((r) => ({
          job_ref_no: r.job_ref_no as string,
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
        open={deletingId !== null}
        onOpenChange={(open) => { if (!open) setDeletingId(null); }}
        title="Delete vehicle?"
        description="This permanently deletes the vehicle / job. If it appears in any transaction, its history is preserved and it is simply removed from all lists. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          if (!deletingId) return;
          startTransition(async () => {
            try {
              await deleteVehicle(deletingId);
              toast.success("Vehicle deleted");
              resetForm();
            } catch (e: unknown) {
              toast.error(e instanceof Error ? e.message : "Could not delete");
            } finally {
              setDeletingId(null);
            }
          });
        }}
        isPending={isPending}
      />
      <ConfirmDialog
        open={hiddenCollision !== null}
        onOpenChange={(open) => { if (!open) setHiddenCollision(null); }}
        title="Restore deleted vehicle?"
        description={`A previously-deleted vehicle "${hiddenCollision?.name ?? ""}" still exists in your transaction history. Restore that record (its history reattaches), or cancel and use a different number.`}
        confirmLabel="Restore"
        onConfirm={handleRestore}
        isPending={isPending}
      />
    </>
  );
}
