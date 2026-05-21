"use client";

import { useState, useTransition } from "react";
import { MasterLayout } from "@/components/masters/master-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createUnit, updateUnit, deleteUnit } from "@/lib/actions/units.actions";
import type { Unit } from "@/types";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function UnitsClient({ units }: { units: Unit[] }) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Unit | null>(null);
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  const filtered = units.filter((u) =>
    u.unit_name.toLowerCase().includes(search.toLowerCase())
  );

  function startEdit(unit: Unit) {
    setEditing(unit);
    setName(unit.unit_name);
  }

  function resetForm() {
    setEditing(null);
    setName("");
  }

  function handleSubmit() {
    if (!name.trim()) return;
    startTransition(async () => {
      try {
        if (editing) {
          await updateUnit(editing.id, name);
          toast.success("Unit updated");
        } else {
          await createUnit(name);
          toast.success("Unit added");
        }
        resetForm();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteUnit(id);
        toast.success("Unit deleted");
      } catch {
        toast.error("Failed to delete");
      }
    });
  }

  return (
    <MasterLayout
      title="Unit Master"
      formPanel={
        <div className="space-y-4">
          <p className="text-sm font-medium text-slate-700">
            {editing ? "Edit Unit" : "Add New Unit"}
          </p>
          <div className="space-y-1.5">
            <label className="text-xs text-slate-500">Unit Name *</label>
            <Input
              placeholder="e.g. KG, PCS, ROLL"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={isPending} className="flex-1">
              {editing ? "Update" : "Add Unit"}
            </Button>
            {editing && (
              <Button variant="outline" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      }
      tablePanel={
        <div className="flex flex-col h-full">
          <div className="p-3 border-b border-slate-100">
            <Input
              placeholder="Search units..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
          </div>
          <div className="overflow-auto flex-1">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-600 w-16">S.No</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-600 w-24">Code</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-600">Unit Name</th>
                  <th className="px-4 py-2.5 text-right font-medium text-slate-600 w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-sm">
                      No units found
                    </td>
                  </tr>
                )}
                {filtered.map((unit, i) => (
                  <tr
                    key={unit.id}
                    className="border-t border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-2.5 text-slate-500">{i + 1}</td>
                    <td className="px-4 py-2.5 text-slate-500">{unit.unit_code}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{unit.unit_name}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => startEdit(unit)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => handleDelete(unit.id)}
                          disabled={isPending}
                        >
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
  );
}
