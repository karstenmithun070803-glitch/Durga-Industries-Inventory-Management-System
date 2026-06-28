"use client";

import { useState, useTransition, useRef, useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useMasterKeyboardNav } from "@/hooks/use-master-keyboard-nav";
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

const EMPTY = { name: "", gstin: "", address: "", state: "" };


export function SuppliersClient({ suppliers }: { suppliers: Supplier[] }) {
  const [search, setSearch] = useState("");
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [isPending, startTransition] = useTransition();
  const [importOpen, setImportOpen] = useState(false);
  const [escapeDiscardOpen, setEscapeDiscardOpen] = useState(false);

  const firstFieldRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const originalFormRef = useRef<typeof EMPTY>(EMPTY);

  const isDuplicateName = form.name.trim() !== "" &&
    suppliers.some((s) =>
      s.name.toLowerCase() === form.name.trim().toLowerCase() &&
      s.id !== editing?.id
    );

  const inactive = suppliers.filter((s) => !s.is_active);
  const visible = useMemo(() =>
    suppliers.filter((s) => showInactive ? !s.is_active : s.is_active).filter((s) => {
      const q = search.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        (s.gstin ?? "").toLowerCase().includes(q) ||
        (s.state ?? "").toLowerCase().includes(q) ||
        matchesCode(search, "S", s.code_no)
      );
    }),
    [suppliers, search, showInactive]
  );

  function startEdit(s: Supplier) {
    setEditing(s);
    setFocusedIdx(-1);
    const next = { name: s.name, gstin: s.gstin ?? "", address: s.address ?? "", state: s.state ?? "" };
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
      try {
        await reactivateSupplier(id);
        toast.success("Supplier reactivated");
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
        title="Supplier Master"
        formPanel={
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">{editing ? "Edit Supplier" : "Add Supplier"}</p>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-600">Supplier Name *</label>
              <Input ref={firstFieldRef} placeholder="Company name" value={form.name} onChange={(e) => set("name", e.target.value)} />
              {isDuplicateName && (
                <p className="text-xs text-red-500 mt-0.5">A supplier named &ldquo;{form.name.trim()}&rdquo; already exists.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-600">Address</label>
              <Input placeholder="Full address" value={form.address} onChange={(e) => set("address", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-600">GSTIN</label>
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
              <label className="text-xs text-slate-600">State</label>
              <Combobox options={INDIAN_STATES.map((s) => ({ value: s, label: s }))} value={form.state} onChange={(v) => set("state", v)} placeholder="Select state..." searchPlaceholder="Search states..." />
            </div>
            <div className="flex gap-2 pt-1">
              <Button ref={saveRef} onClick={handleSubmit} disabled={isPending || isDuplicateName || !form.name.trim()} className="flex-1">{editing ? "Update" : "Add"}</Button>
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
                autoComplete="off"
                placeholder="Search by name, S001 or just 1, GSTIN..."
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
              <table className="min-w-full text-sm">
                <thead className="bg-slate-700 text-white">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium whitespace-nowrap sticky left-0 z-20 bg-slate-700 w-12">S.No</th>
                    <th className="px-3 py-1.5 text-left font-medium whitespace-nowrap sticky left-12 z-20 bg-slate-700 w-28">Supplier Code</th>
                    <th className="px-3 py-1.5 text-left font-medium whitespace-nowrap sticky left-40 z-20 bg-slate-700 w-44 border-r border-slate-600">Supplier Name</th>
                    {["Address", "State", "GSTIN"].map((h) => (
                      <th key={h} className="px-3 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-700">No suppliers found</td></tr>
                  )}
                  {visible.map((s, i) => {
                    const stickyBg = !s.is_active ? "bg-slate-50" : "bg-white";
                    return (
                    <tr
                      key={s.id}
                      className={`border-t border-slate-100 cursor-pointer ${i === focusedIdx ? "ring-1 ring-inset ring-blue-400 bg-blue-50" : !s.is_active ? "opacity-50 bg-slate-50 hover:bg-slate-100" : "hover:bg-blue-50/40"}`}
                      onClick={() => startEdit(s)}
                    >
                      <td className={`px-3 py-1.5 text-slate-600 sticky left-0 z-10 w-12 ${stickyBg}`}>{i + 1}</td>
                      <td className={`px-3 py-1.5 font-mono text-xs font-medium text-slate-700 sticky left-12 z-10 w-28 ${stickyBg}`}>{formatCode("S", s.code_no)}</td>
                      <td className={`px-3 py-1.5 font-medium sticky left-40 z-10 w-44 border-r border-slate-200 ${stickyBg}`}>{s.name}</td>
                      <td className="px-3 py-1.5 text-slate-600"><div className="min-w-[180px] max-w-sm break-words">{s.address ?? "—"}</div></td>
                      <td className="px-3 py-1.5 text-slate-600">{s.state ?? "—"}</td>
                      <td className="px-3 py-1.5 text-slate-600 font-mono text-xs">{s.gstin ?? "—"}</td>
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
        templateColumns={["Supplier Name", "Address", "State", "GSTIN"]}
        exampleRow={["Steel India Pvt Ltd", "45 Industrial Area, Coimbatore", "Tamil Nadu", "33BBBBB1111B1Z6"]}
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
            },
          };
        }}
        onImport={(rows) => bulkImportSuppliers(rows.map((r) => ({
          name: r.name as string,
          address: r.address as string | null,
          state: r.state as string | null,
          gstin: r.gstin as string | null,
          tin_no: null,
          cst_no: null,
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
        title="Deactivate supplier?"
        description="This will deactivate the supplier. They will be hidden from active lists. You can reactivate at any time."
        confirmLabel="Deactivate"
        onConfirm={() => {
          if (!deactivatingId) return;
          startTransition(async () => {
            try {
              await deleteSupplier(deactivatingId);
              toast.success("Supplier deactivated");
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
