"use client";

import { useState, useTransition, useRef, useMemo, useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useMasterKeyboardNav } from "@/hooks/use-master-keyboard-nav";
import { MasterLayout } from "@/components/masters/master-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createTaxRate, updateTaxRate, deleteTaxRate, reactivateTaxRate } from "@/lib/actions/tax.actions";
import { formatCode, matchesCode } from "@/lib/utils";
import type { TaxRate } from "@/types";
import { RotateCcw, UserX } from "lucide-react";
import { toast } from "sonner";

export function TaxClient({ taxRates }: { taxRates: TaxRate[] }) {
  const [search, setSearch] = useState("");
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<TaxRate | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [form, setForm] = useState({ tax_percentage: "" });
  const [isPending, startTransition] = useTransition();
  const [escapeDiscardOpen, setEscapeDiscardOpen] = useState(false);

  const firstFieldRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const originalFormRef = useRef({ tax_percentage: "" });

  const inactive = taxRates.filter((t) => !t.is_active);
  const visible = useMemo(() =>
    taxRates.filter((t) => showInactive ? !t.is_active : t.is_active).filter((t) => {
      const q = search.toLowerCase();
      return (
        t.description.toLowerCase().includes(q) ||
        t.tax_percentage.toString().includes(q) ||
        matchesCode(search, "T", t.vat_code, 2)
      );
    }),
    [taxRates, search, showInactive]
  );

  function startEdit(t: TaxRate) {
    setEditing(t);
    setFocusedIdx(-1);
    const next = { tax_percentage: t.tax_percentage };
    setForm(next);
    originalFormRef.current = next;
  }

  function resetForm() { setEditing(null); setForm({ tax_percentage: "" }); }

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
        if (editing) { await updateTaxRate(editing.id, form); } else { await createTaxRate(form); }
        toast.success(editing ? "Tax rate updated" : "Tax rate added");
        resetForm();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function handleReactivate(id: string) {
    startTransition(async () => {
      try {
        await reactivateTaxRate(id);
        toast.success("Tax rate reactivated");
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
        title="Tax Master"
        formPanel={
          <div className="space-y-4">
            <p className="text-sm font-medium text-slate-700">{editing ? "Edit Tax Rate" : "Add Tax Rate"}</p>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-600">Tax Percentage *</label>
              <Input
                ref={firstFieldRef}
                placeholder="e.g. 18"
                value={form.tax_percentage}
                onChange={(e) => setForm({ tax_percentage: e.target.value })}
                type="number"
                min="0"
                max="100"
                step="any"
              />
              <p className="text-xs text-slate-700">Description auto-generated (e.g. GST 18%)</p>
            </div>
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
                placeholder="Search by description, T01 or just 1, tax %..."
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
            </div>
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead className="bg-slate-700 text-white">
                  <tr>
                    {["S.No", "Tax Code", "Tax %"].map((h) => (
                      <th key={h} className="px-4 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-700">No tax rates found</td></tr>
                  )}
                  {visible.map((t, i) => (
                    <tr
                      key={t.id}
                      className={`border-t border-slate-100 cursor-pointer ${i === focusedIdx ? "ring-1 ring-inset ring-blue-400 bg-blue-50" : !t.is_active ? "opacity-50 bg-slate-50 hover:bg-slate-100" : "hover:bg-blue-50/40"}`}
                      onClick={() => startEdit(t)}
                    >
                      <td className="px-4 py-1.5 text-slate-600">{i + 1}</td>
                      <td className="px-4 py-1.5 font-mono text-xs font-medium text-slate-700">{formatCode("T", t.vat_code, 2)}</td>
                      <td className="px-4 py-1.5 font-medium">{parseFloat(t.tax_percentage)}%</td>
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
        open={deactivatingId !== null}
        onOpenChange={(open) => { if (!open) setDeactivatingId(null); }}
        title="Deactivate tax rate?"
        description="This will deactivate the tax rate. Materials and transactions using this rate will be unaffected. You can reactivate at any time."
        confirmLabel="Deactivate"
        onConfirm={() => {
          if (!deactivatingId) return;
          startTransition(async () => {
            try {
              await deleteTaxRate(deactivatingId);
              toast.success("Tax rate deactivated");
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
