"use client";

import { useState, useTransition, useRef, useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useMasterKeyboardNav } from "@/hooks/use-master-keyboard-nav";
import { MasterLayout } from "@/components/masters/master-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createUnit, updateUnit, deleteUnit } from "@/lib/actions/units.actions";
import { formatCode, matchesCode } from "@/lib/utils";
import type { Unit } from "@/types";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

export function UnitsClient({ units }: { units: Unit[] }) {
  const [search, setSearch] = useState("");
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();
  const [escapeDiscardOpen, setEscapeDiscardOpen] = useState(false);

  const firstFieldRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const originalNameRef = useRef("");

  const visible = useMemo(() =>
    units.filter((u) =>
      u.unit_name.toLowerCase().includes(search.toLowerCase()) ||
      matchesCode(search, "U-", u.unit_code, 2)
    ),
    [units, search]
  );

  function startEdit(unit: Unit) { setEditing(unit); setFocusedIdx(-1); setName(unit.unit_name); originalNameRef.current = unit.unit_name; }
  function resetForm() { setEditing(null); setName(""); }

  function handleEscape() {
    if (!editing) return;
    if (name !== originalNameRef.current) {
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
    if (!name.trim()) return;
    startTransition(async () => {
      try {
        if (editing) { await updateUnit(editing.id, name); } else { await createUnit(name); }
        toast.success(editing ? "Unit updated" : "Unit added");
        resetForm();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <>
      <MasterLayout
        title="Unit Master"
        formPanel={
          <div className="space-y-4">
            <p className="text-sm font-medium text-slate-700">{editing ? "Edit Unit" : "Add New Unit"}</p>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-600">Unit Name *</label>
              <Input ref={firstFieldRef} placeholder="e.g. KG, PCS, ROLL" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} forceUppercase />
            </div>
            <div className="flex gap-2">
              <Button ref={saveRef} onClick={handleSubmit} disabled={isPending} className="flex-1">{editing ? "Update" : "Add Unit"}</Button>
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
                placeholder="Search by name, U01 or just 1..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setFocusedIdx(-1); }}
                forceUppercase
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setFocusedIdx((i) => Math.min(i + 1, visible.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setFocusedIdx((i) => Math.max(i - 1, 0)); }
                  else if (e.key === "Enter" && focusedIdx >= 0) { startEdit(visible[focusedIdx]); setTimeout(() => firstFieldRef.current?.focus(), 50); }
                  else if (e.key === "Escape") { setFocusedIdx(-1); }
                }}
                className="max-w-xs"
              />
            </div>
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead className="bg-slate-700 text-white">
                  <tr>
                    <th className="px-4 py-1.5 text-left font-medium w-16">S.No</th>
                    <th className="px-4 py-1.5 text-left font-medium w-28">Unit Code</th>
                    <th className="px-4 py-1.5 text-left font-medium">Unit Name</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-700 text-sm">No units found</td></tr>
                  )}
                  {visible.map((unit, i) => (
                    <tr
                      key={unit.id}
                      className={`group border-t border-slate-200 cursor-pointer ${i === focusedIdx ? "ring-1 ring-inset ring-blue-500 bg-blue-50" : "hover:bg-rowhover hover:text-slate-900"}`}
                      onClick={() => startEdit(unit)}
                    >
                      <td className="px-4 py-1.5 text-slate-800 group-hover:text-slate-900">{i + 1}</td>
                      <td className="px-4 py-1.5 font-mono text-xs font-medium text-slate-700 group-hover:text-slate-900">{formatCode("U-", unit.unit_code, 2)}</td>
                      <td className="px-4 py-1.5 font-medium text-slate-800 group-hover:text-slate-900">{unit.unit_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        }
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
        title="Delete unit?"
        description="This permanently deletes the unit. If it is used by any material or transaction, its history is preserved and it is simply removed from all lists. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          if (!deletingId) return;
          startTransition(async () => {
            try {
              await deleteUnit(deletingId);
              toast.success("Unit deleted");
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
    </>
  );
}
