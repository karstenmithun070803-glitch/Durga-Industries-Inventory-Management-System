"use client";

import { useState, useTransition, useRef, useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useMasterKeyboardNav } from "@/hooks/use-master-keyboard-nav";
import { MasterLayout } from "@/components/masters/master-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createCustomer, updateCustomer, deleteCustomer, reactivateCustomer, bulkImportCustomers } from "@/lib/actions/customers.actions";
import { INDIAN_STATES } from "@/lib/constants";
import { formatCode, matchesCode, validateGstinFormat } from "@/lib/utils";
import type { Customer } from "@/types";
import { RotateCcw, UserX, Upload } from "lucide-react";
import { toast } from "sonner";
import { GenericBulkImportDialog } from "@/components/masters/generic-bulk-import-dialog";

const EMPTY = { customer_name: "", address_1: "", address_2: "", street: "", city: "", state: "", gstin: "" };

export function CustomersClient({ customers }: { customers: Customer[] }) {
  const [search, setSearch] = useState("");
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [isPending, startTransition] = useTransition();
  const [importOpen, setImportOpen] = useState(false);
  const [escapeDiscardOpen, setEscapeDiscardOpen] = useState(false);

  const firstFieldRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const originalFormRef = useRef<typeof EMPTY>(EMPTY);

  const isDuplicateName = form.customer_name.trim() !== "" &&
    customers.some((c) =>
      c.customer_name.toLowerCase() === form.customer_name.trim().toLowerCase() &&
      (c.address_1 ?? "").trim().toLowerCase() === (form.address_1 ?? "").trim().toLowerCase() &&
      (c.gstin ?? "").trim().toLowerCase() === (form.gstin ?? "").trim().toLowerCase() &&
      c.id !== editing?.id
    );

  const inactive = customers.filter((c) => !c.is_active);
  const visible = useMemo(() =>
    customers.filter((c) => showInactive ? !c.is_active : c.is_active).filter((c) => {
      const s = search.toLowerCase();
      return (
        c.customer_name.toLowerCase().includes(s) ||
        (c.city ?? "").toLowerCase().includes(s) ||
        (c.gstin ?? "").toLowerCase().includes(s) ||
        matchesCode(search, "C", c.customer_no)
      );
    }),
    [customers, search, showInactive]
  );

  function startEdit(c: Customer) {
    setEditing(c);
    setFocusedIdx(-1);
    const next = { customer_name: c.customer_name, address_1: c.address_1 ?? "", address_2: c.address_2 ?? "", street: c.street ?? "", city: c.city ?? "", state: c.state ?? "", gstin: c.gstin ?? "" };
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
        if (editing) { await updateCustomer(editing.id, form); } else { await createCustomer(form); }
        toast.success(editing ? "Customer updated" : "Customer added");
        resetForm();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function handleReactivate(id: string) {
    startTransition(async () => {
      try {
        await reactivateCustomer(id);
        toast.success("Customer reactivated");
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
        title="Customer Master"
        formPanel={
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">{editing ? "Edit Customer" : "Add Customer"}</p>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-600">Customer Name *</label>
              <Input ref={firstFieldRef} data-testid="customer-name-input" placeholder="Full name" value={form.customer_name} onChange={(e) => set("customer_name", e.target.value)} />
              {isDuplicateName && (
                <p className="text-xs text-red-500 mt-0.5">A customer named &ldquo;{form.customer_name.trim()}&rdquo; with the same address and GSTIN already exists. Change the address or GSTIN.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-600">Address Line 1</label>
              <Input placeholder="Door no, Building" value={form.address_1} onChange={(e) => set("address_1", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-600">Address Line 2</label>
              <Input placeholder="Area, Landmark" value={form.address_2} onChange={(e) => set("address_2", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-600">Street</label>
              <Input placeholder="Street name" value={form.street} onChange={(e) => set("street", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-600">City</label>
                <Input placeholder="City" value={form.city} onChange={(e) => set("city", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-600">State</label>
                <Combobox options={INDIAN_STATES.map((s) => ({ value: s, label: s }))} value={form.state} onChange={(v) => set("state", v)} placeholder="Select state..." searchPlaceholder="Search states..." />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-600">GSTIN</label>
              <Input
                placeholder="e.g. 33AAAAA1234A1Z5"
                value={form.gstin}
                onChange={(e) => set("gstin", e.target.value.toUpperCase())}
                onBlur={(e) => {
                  const err = validateGstinFormat(e.target.value);
                  if (err) toast.warning(err);
                  else if (e.target.value.trim()) set("gstin", e.target.value.trim().toUpperCase());
                }}
                maxLength={15}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button ref={saveRef} data-testid="customer-save-btn" onClick={handleSubmit} disabled={isPending || isDuplicateName || !form.customer_name.trim()} className="flex-1">{editing ? "Update" : "Add"}</Button>
              {editing && <Button variant="outline" onClick={resetForm}>Cancel</Button>}
            </div>
            {editing && (
              <div className="pt-3 border-t border-slate-200 mt-1">
                {editing.is_active ? (
                  <Button type="button" data-testid="customer-deactivate-btn" variant="ghost" size="sm" className="text-amber-600 hover:bg-amber-50 hover:text-amber-700 text-xs" onClick={() => setDeactivatingId(editing.id)} disabled={isPending}>
                    <UserX className="w-3.5 h-3.5 mr-1.5" />Deactivate
                  </Button>
                ) : (
                  <Button type="button" data-testid="customer-reactivate-btn" variant="ghost" size="sm" className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 text-xs" onClick={() => handleReactivate(editing.id)} disabled={isPending}>
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
                placeholder="Search by name, C001 or just 1, city, GSTIN..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setFocusedIdx(-1); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setFocusedIdx((i) => Math.min(i + 1, visible.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setFocusedIdx((i) => Math.max(i - 1, 0)); }
                  else if (e.key === "Enter" && focusedIdx >= 0) { startEdit(visible[focusedIdx]); setTimeout(() => firstFieldRef.current?.focus(), 50); }
                  else if (e.key === "Escape") { setFocusedIdx(-1); }
                }}
                ref={searchRef}
                autoComplete="off"
                className="max-w-sm"
              />
              {inactive.length > 0 && (
                <Button data-testid="inactive-only-btn" variant="outline" size="sm" onClick={() => setShowInactive((v) => !v)} className="shrink-0 text-xs">
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
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap sticky left-0 z-20 bg-slate-700 w-12">S.No</th>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap sticky left-12 z-20 bg-slate-700 w-28">Customer Code</th>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap sticky left-40 z-20 bg-slate-700 w-44 border-r border-slate-600">Customer Name</th>
                    {["Address", "City", "State", "GSTIN"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-700">No customers found</td></tr>
                  )}
                  {visible.map((c, i) => {
                    const stickyBg = !c.is_active ? "bg-slate-50" : i % 2 === 1 ? "bg-slate-50" : "bg-white";
                    const addr = [c.address_1, c.address_2, c.street].filter(Boolean).join(", ") || "—";
                    return (
                    <tr
                      key={c.id}
                      className={`group border-t border-slate-200 cursor-pointer ${i === focusedIdx ? "ring-1 ring-inset ring-blue-500 bg-blue-50" : !c.is_active ? "opacity-50 bg-slate-50 hover:bg-slate-100" : "hover:bg-slate-400 hover:text-slate-900"}`}
                      onClick={() => startEdit(c)}
                    >
                      <td className={`px-3 py-1.5 text-slate-800 group-hover:bg-slate-400 group-hover:text-slate-900 sticky left-0 z-10 w-12 ${stickyBg}`}>{i + 1}</td>
                      <td className={`px-3 py-1.5 font-mono text-xs font-medium text-slate-700 group-hover:bg-slate-400 group-hover:text-slate-900 sticky left-12 z-10 w-28 ${stickyBg}`}>{formatCode("C", c.customer_no)}</td>
                      <td className={`px-3 py-1.5 font-medium group-hover:bg-slate-400 group-hover:text-slate-900 sticky left-40 z-10 w-44 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(15,23,42,0.15)] ${stickyBg}`}>{c.customer_name}</td>
                      <td className="px-3 py-1.5 text-slate-800 group-hover:text-slate-900 whitespace-nowrap">{addr}</td>
                      <td className="px-3 py-1.5 text-slate-800 group-hover:text-slate-900">{c.city ?? "—"}</td>
                      <td className="px-3 py-1.5 text-slate-800 group-hover:text-slate-900">{c.state ?? "—"}</td>
                      <td className="px-3 py-1.5 text-slate-800 group-hover:text-slate-900 font-mono text-xs">{c.gstin ?? "—"}</td>
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
        title="Import Customers"
        templateFileName="customers-import-template.xlsx"
        templateColumns={["Customer Name", "Address Line 1", "Address Line 2", "Street", "City", "State", "GSTIN"]}
        exampleRow={["Ravi Motors", "12/A Gandhi Street", "Near Bus Stand", "Main Road", "Chennai", "Tamil Nadu", "33AAAAA0000A1Z5"]}
        referenceSheet={{ rows: [
          ["REFERENCE — do not edit this sheet"],
          [],
          ["Available States (copy exact name into State column)"],
          ...INDIAN_STATES.map((s) => [s]),
        ]}}
        existingKeys={new Set(customers.map((c) =>
          `${c.customer_name.toUpperCase()}|${(c.address_1 ?? '').trim().toUpperCase()}|${(c.gstin ?? '').trim().toUpperCase()}`
        ))}
        processRow={(row) => {
          const errors: string[] = [];
          const name = row["Customer Name"]?.trim() ?? "";
          if (!name) errors.push("Customer Name is required");

          const address1 = row["Address Line 1"]?.trim() || null;
          const gstin = row["GSTIN"]?.trim().toUpperCase() || null;

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
            dedupKey: `${name.toUpperCase()}|${(address1 ?? '').toUpperCase()}|${(gstin ?? '').toUpperCase()}`,
            data: {
              customer_name: name,
              address_1: address1,
              address_2: row["Address Line 2"]?.trim() || null,
              street: row["Street"]?.trim() || null,
              city: row["City"]?.trim() || null,
              state: resolvedState,
              gstin,
            },
          };
        }}
        onImport={(rows) => bulkImportCustomers(rows.map((r) => ({
          customer_name: r.customer_name as string,
          address_1: r.address_1 as string | null,
          address_2: r.address_2 as string | null,
          street: r.street as string | null,
          city: r.city as string | null,
          state: r.state as string | null,
          gstin: r.gstin as string | null,
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
        title="Deactivate customer?"
        description="This will deactivate the customer. They will be hidden from active lists. You can reactivate at any time."
        confirmLabel="Deactivate"
        onConfirm={() => {
          if (!deactivatingId) return;
          startTransition(async () => {
            try {
              await deleteCustomer(deactivatingId);
              toast.success("Customer deactivated");
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
