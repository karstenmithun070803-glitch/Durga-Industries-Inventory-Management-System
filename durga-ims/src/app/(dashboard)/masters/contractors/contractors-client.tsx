"use client";

import { useState, useTransition, useRef, useMemo, useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { MasterLayout } from "@/components/masters/master-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createContractor, updateContractor, deleteContractor, reactivateContractor, bulkImportContractors } from "@/lib/actions/contractors.actions";
import { formatCode, matchesCode } from "@/lib/utils";
import type { Contractor } from "@/types";
import { RotateCcw, UserX, Upload } from "lucide-react";
import { toast } from "sonner";
import { GenericBulkImportDialog } from "@/components/masters/generic-bulk-import-dialog";

export function ContractorsClient({ contractors }: { contractors: Contractor[] }) {
  const [search, setSearch] = useState("");
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Contractor | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", role: "", contact: "" });
  const [isPending, startTransition] = useTransition();
  const [importOpen, setImportOpen] = useState(false);
  const [escapeDiscardOpen, setEscapeDiscardOpen] = useState(false);

  const firstFieldRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const originalFormRef = useRef({ name: "", role: "", contact: "" });

  const inactive = contractors.filter((c) => !c.is_active);
  const visible = useMemo(() =>
    contractors.filter((c) => showInactive ? !c.is_active : c.is_active).filter((c) => {
      const q = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        (c.role ?? "").toLowerCase().includes(q) ||
        matchesCode(search, "CON", c.code_no, 2)
      );
    }),
    [contractors, search, showInactive]
  );

  function startEdit(c: Contractor) {
    setEditing(c);
    setFocusedIdx(-1);
    const next = { name: c.name, role: c.role ?? "", contact: c.contact ?? "" };
    setForm(next);
    originalFormRef.current = next;
  }
  function resetForm() { setEditing(null); setForm({ name: "", role: "", contact: "" }); }

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
        if (editing) { await updateContractor(editing.id, form); } else { await createContractor(form); }
        toast.success(editing ? "Contractor updated" : "Contractor added");
        resetForm();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function handleReactivate(id: string) {
    startTransition(async () => {
      try {
        await reactivateContractor(id);
        toast.success("Contractor reactivated");
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
                <label className="text-xs text-slate-600">{label}</label>
                <Input ref={key === "name" ? firstFieldRef : undefined} placeholder={placeholder} value={form[key as keyof typeof form]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
            <div className="flex gap-2">
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
                placeholder="Search by name, CON01 or just 1, role..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setFocusedIdx(-1); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setFocusedIdx((i) => Math.min(i + 1, visible.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setFocusedIdx((i) => Math.max(i - 1, 0)); }
                  else if (e.key === "Enter" && focusedIdx >= 0) { startEdit(visible[focusedIdx]); setTimeout(() => firstFieldRef.current?.focus(), 50); }
                  else if (e.key === "Escape") { setFocusedIdx(-1); }
                }}
                className="max-w-xs"
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
                    {["S.No", "Contractor Code", "Contractor Name", "Role", "Contact"].map((h) => (
                      <th key={h} className="px-4 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-700">No contractors found</td></tr>
                  )}
                  {visible.map((c, i) => (
                    <tr
                      key={c.id}
                      className={`border-t border-slate-100 cursor-pointer ${i === focusedIdx ? "ring-1 ring-inset ring-blue-400 bg-blue-50" : !c.is_active ? "opacity-50 bg-slate-50 hover:bg-slate-100" : "hover:bg-blue-50/40"}`}
                      onClick={() => startEdit(c)}
                    >
                      <td className="px-4 py-1.5 text-slate-600">{i + 1}</td>
                      <td className="px-4 py-1.5 font-mono text-xs font-medium text-slate-700">{formatCode("CON", c.code_no, 2)}</td>
                      <td className="px-4 py-1.5 font-medium">{c.name}</td>
                      <td className="px-4 py-1.5 text-slate-600">{c.role ?? "—"}</td>
                      <td className="px-4 py-1.5 text-slate-600">{c.contact ?? "—"}</td>
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
        title="Import Contractors"
        templateFileName="contractors-import-template.xlsx"
        templateColumns={["Contractor Name", "Role", "Contact"]}
        exampleRow={["Kumar Fabrications", "Fabrication & Welding", "9876543210"]}
        existingKeys={new Set(contractors.map((c) => c.name.toUpperCase()))}
        processRow={(row) => {
          const errors: string[] = [];
          const name = row["Contractor Name"]?.trim() ?? "";
          if (!name) errors.push("Contractor Name is required");
          return {
            errors,
            displayName: name || "—",
            dedupKey: name,
            data: {
              name,
              role: row["Role"]?.trim() || null,
              contact: row["Contact"]?.trim() || null,
            },
          };
        }}
        onImport={(rows) => bulkImportContractors(rows.map((r) => ({
          name: r.name as string,
          role: r.role as string | null,
          contact: r.contact as string | null,
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
        title="Deactivate contractor?"
        description="This will deactivate the contractor. Historical material issue records will be preserved. You can reactivate at any time."
        confirmLabel="Deactivate"
        onConfirm={() => {
          if (!deactivatingId) return;
          startTransition(async () => {
            try {
              await deleteContractor(deactivatingId);
              toast.success("Contractor deactivated");
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
