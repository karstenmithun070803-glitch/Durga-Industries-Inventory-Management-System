"use client";

import { useState, useTransition } from "react";
import { MasterLayout } from "@/components/masters/master-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createUnit, updateUnit, deleteUnit, reactivateUnit } from "@/lib/actions/units.actions";
import { formatCode, matchesCode } from "@/lib/utils";
import type { Unit } from "@/types";
import { Pencil, RotateCcw, UserX } from "lucide-react";
import { toast } from "sonner";

export function UnitsClient({ units }: { units: Unit[] }) {
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  const inactive = units.filter((u) => !u.is_active);
  const visible = (showInactive ? units : units.filter((u) => u.is_active)).filter((u) =>
    u.unit_name.toLowerCase().includes(search.toLowerCase()) ||
    matchesCode(search, "U", u.unit_code, 2)
  );

  function startEdit(unit: Unit) { setEditing(unit); setName(unit.unit_name); }
  function resetForm() { setEditing(null); setName(""); }

  function handleSubmit() {
    if (!name.trim()) return;
    startTransition(async () => {
      try {
        editing ? await updateUnit(editing.id, name) : await createUnit(name);
        toast.success(editing ? "Unit updated" : "Unit added");
        resetForm();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function handleReactivate(id: string) {
    startTransition(async () => {
      await reactivateUnit(id);
      toast.success("Unit reactivated");
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
              <label className="text-xs text-slate-500">Unit Name *</label>
              <Input placeholder="e.g. KG, PCS, ROLL" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSubmit} disabled={isPending} className="flex-1">{editing ? "Update" : "Add Unit"}</Button>
              {editing && <Button variant="outline" onClick={resetForm}>Cancel</Button>}
            </div>
          </div>
        }
        tablePanel={
          <div className="flex flex-col h-full">
            <div className="p-3 border-b border-slate-100 flex items-center gap-2">
              <Input placeholder="Search by name, U01 or just 1..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
              {inactive.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setShowInactive((v) => !v)} className="shrink-0 text-xs">
                  {showInactive ? "Hide Inactive" : `Show Inactive (${inactive.length})`}
                </Button>
              )}
            </div>
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-600 w-16">S.No</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-600 w-28">Unit Code</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-600">Unit Name</th>
                    <th className="px-4 py-2.5 text-right font-medium text-slate-600 w-28">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-sm">No units found</td></tr>
                  )}
                  {visible.map((unit, i) => (
                    <tr key={unit.id} className={`border-t border-slate-100 ${!unit.is_active ? "opacity-50 bg-slate-50" : "hover:bg-slate-50"}`}>
                      <td className="px-4 py-2.5 text-slate-500">{i + 1}</td>
                      <td className="px-4 py-2.5 font-mono text-xs font-medium text-slate-700">{formatCode("U", unit.unit_code, 2)}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{unit.unit_name}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          {unit.is_active ? (
                            <>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(unit)}><Pencil className="w-3.5 h-3.5" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-600 hover:bg-amber-50" onClick={() => setDeactivatingId(unit.id)} disabled={isPending}><UserX className="w-3.5 h-3.5" /></Button>
                            </>
                          ) : (
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-600 hover:bg-emerald-50" onClick={() => handleReactivate(unit.id)} disabled={isPending}><RotateCcw className="w-3 h-3 mr-1" />Reactivate</Button>
                          )}
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
        open={deactivatingId !== null}
        onOpenChange={(open) => { if (!open) setDeactivatingId(null); }}
        title="Deactivate unit?"
        description="This will deactivate the unit. Materials using this unit will retain their existing assignments. You can reactivate at any time."
        confirmLabel="Deactivate"
        onConfirm={() => {
          if (!deactivatingId) return;
          startTransition(async () => {
            await deleteUnit(deactivatingId);
            toast.success("Unit deactivated");
            setDeactivatingId(null);
          });
        }}
        isPending={isPending}
      />
    </>
  );
}
