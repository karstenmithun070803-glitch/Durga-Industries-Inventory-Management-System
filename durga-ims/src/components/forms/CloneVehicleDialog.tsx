"use client";

import { useState, useMemo, useRef, useEffect, useCallback, useTransition } from "react";
import { handleVerticalFormKeyDown } from "@/hooks/use-vertical-form-nav";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatActionError } from "@/lib/utils";
import { determineGstType } from "@/types";
import { createVehicleWithCustomer } from "@/lib/actions/vehicles.actions";
import { cloneVehicleMaterialIssue } from "@/lib/actions/material-issues.actions";
import { INDIAN_STATES } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CustomerOption {
  id: string;
  customer_name: string;
  gstin: string | null;
  state: string | null;
  address_1: string | null;
  address_2: string | null;
  street: string | null;
  city: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceVehicleId: string;
  sourceVehicleType: "Old" | "New";
  issueType: "OLD" | "NEW";
  financialYear: string;
  customers: CustomerOption[];
  onSuccess: (newVehicleId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CloneVehicleDialog({
  open,
  onOpenChange,
  sourceVehicleId,
  sourceVehicleType,
  issueType,
  financialYear,
  customers,
  onSuccess,
}: Props) {
  const [isPending, startTransition] = useTransition();

  // Vehicle fields
  const [jobRefNo, setJobRefNo] = useState("");
  const [jobRefError, setJobRefError] = useState("");

  // Customer — existing (selectedCustomerId set) or new (fill fields manually)
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [gstin, setGstin] = useState("");
  const [state, setState] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");

  const isExistingCustomer = !!selectedCustomerId;
  const gstType = determineGstType(gstin || null, state || null);

  const customerOptions = useMemo(
    () =>
      customers.map((c) => ({
        value: c.id,
        label: c.customer_name,
        displayLabel: c.customer_name,
      })),
    [customers]
  );

  const stateOptions = useMemo(
    () => INDIAN_STATES.map((s) => ({ value: s, label: s })),
    []
  );

  // ── Keyboard: same vertical-form chain the masters pages use ────────────────
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const customerNameRef = useRef<HTMLInputElement>(null);

  // Focus Job No when the dialog opens (DialogContent uses confirmNavFocus="none",
  // so it does not steal focus to the footer).
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => firstFieldRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Enter/↓/→ next field, ↑/← previous. Disabled fields are skipped, so selecting an
  // existing customer (which disables everything below) lands Enter on Clone & Create.
  const handleFormKeyDown = useCallback((e: React.KeyboardEvent<Element>) => {
    handleVerticalFormKeyDown(e, {
      trapTab: false, // the dialog already focus-traps; trapping would strand Cancel/X
      advanceOnComboboxEnter: true,
      // Final stop = the primary footer button (Clone & Create). Cancel is the FIRST
      // footer button, so it stays out of the Enter chain — Enter must never cancel.
      extraSelector: '[data-slot="dialog-footer"] button:last-of-type:not([disabled])',
    });
  }, []);

  function handleCustomerSelect(val: string) {
    setSelectedCustomerId(val);
    if (!val) {
      // Cleared — reset to new customer mode
      setCustomerName("");
      setGstin("");
      setState("");
      setAddress1("");
      setAddress2("");
      setStreet("");
      setCity("");
      return;
    }
    const c = customers.find((x) => x.id === val);
    if (!c) return;
    setCustomerName(c.customer_name);
    setGstin(c.gstin ?? "");
    setState(c.state ?? "");
    setAddress1(c.address_1 ?? "");
    setAddress2(c.address_2 ?? "");
    setStreet(c.street ?? "");
    setCity(c.city ?? "");
  }

  function handleClose() {
    if (isPending) return;
    resetForm();
    onOpenChange(false);
  }

  function resetForm() {
    setJobRefNo("");
    setJobRefError("");
    setSelectedCustomerId("");
    setCustomerName("");
    setGstin("");
    setState("");
    setAddress1("");
    setAddress2("");
    setStreet("");
    setCity("");
  }

  function validate(): string | null {
    if (!jobRefNo.trim()) return "Job No / Reg No is required.";
    if (!isExistingCustomer && !customerName.trim()) return "Customer name is required.";
    return null;
  }

  function handleSubmit() {
    const err = validate();
    if (err) {
      toast.error(err);
      // Send focus to the field that needs fixing, not leave it on the button.
      if (!jobRefNo.trim()) firstFieldRef.current?.focus();
      else customerNameRef.current?.focus();
      return;
    }
    setJobRefError("");

    startTransition(async () => {
      try {
        const { vehicleId } = await createVehicleWithCustomer({
          job_ref_no: jobRefNo.trim().toUpperCase(),
          type: sourceVehicleType,
          customer_id: isExistingCustomer ? selectedCustomerId : undefined,
          customer_name: !isExistingCustomer ? customerName.trim() : undefined,
          customer_gstin: !isExistingCustomer ? gstin.trim() || undefined : undefined,
          customer_state: !isExistingCustomer ? state || undefined : undefined,
          customer_address_1: !isExistingCustomer ? address1.trim() || undefined : undefined,
          customer_address_2: !isExistingCustomer ? address2.trim() || undefined : undefined,
          customer_street: !isExistingCustomer ? street.trim() || undefined : undefined,
          customer_city: !isExistingCustomer ? city.trim() || undefined : undefined,
        });

        await cloneVehicleMaterialIssue(sourceVehicleId, issueType, financialYear, vehicleId);

        resetForm();
        onSuccess(vehicleId);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.startsWith("DUPLICATE_JOB_REF:")) {
          setJobRefError("This job no / reg no already exists.");
          firstFieldRef.current?.focus();
        } else {
          toast.error(formatActionError(e, "Clone failed"));
        }
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-lg max-h-[90vh] overflow-y-auto"
        confirmNav
        confirmNavFocus="none"
        onKeyDown={handleFormKeyDown}
      >
        <DialogHeader>
          <DialogTitle>Clone Vehicle Materials</DialogTitle>
          <DialogDescription>
            Creates a new vehicle with the same materials. Rates are copied — verify before finalising.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Job & Vehicle section */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Job & Vehicle</p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="clone-job-ref">Job No / Reg No <span className="text-red-500">*</span></Label>
                <Input
                  ref={firstFieldRef}
                  id="clone-job-ref"
                  value={jobRefNo}
                  onChange={(e) => { setJobRefNo(e.target.value.toUpperCase()); setJobRefError(""); }}
                  placeholder="e.g. 2026/045"
                  className={jobRefError ? "border-red-400 focus-visible:ring-red-300" : ""}
                />
                {jobRefError && <p className="text-xs text-red-500">{jobRefError}</p>}
              </div>

            </div>

            <div className="space-y-1.5">
              <Label>Type</Label>
              <div className="h-9 px-3 flex items-center text-sm bg-slate-50 border border-slate-200 rounded-md w-28 text-slate-600">
                {sourceVehicleType}
              </div>
            </div>
          </div>

          {/* Customer section */}
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Customer</p>

            <div className="space-y-1.5">
              <Label>Select existing customer</Label>
              <Combobox
                options={customerOptions}
                value={selectedCustomerId}
                onChange={handleCustomerSelect}
                placeholder="Search active customers…"
                searchPlaceholder="Search by name…"
                emptyText="No customers found."
                advanceOnEnter
                onGridKeyDown={handleFormKeyDown}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="clone-customer-name">
                Customer name <span className="text-red-500">*</span>
                {isExistingCustomer && <span className="ml-1 text-slate-700 font-normal">(read-only — edit in Customer Master)</span>}
              </Label>
              <Input
                ref={customerNameRef}
                id="clone-customer-name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Customer name"
                disabled={isExistingCustomer}
                className={isExistingCustomer ? "bg-slate-50" : ""}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="clone-gstin">GSTIN</Label>
                <Input
                  id="clone-gstin"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  placeholder="e.g. 29AABCU9603R1ZX"
                  disabled={isExistingCustomer}
                  className={isExistingCustomer ? "bg-slate-50" : ""}
                />
              </div>

              <div className="space-y-1.5">
                <Label>State</Label>
                {isExistingCustomer ? (
                  <div className="h-9 px-3 flex items-center text-sm bg-slate-50 border border-slate-200 rounded-md text-slate-600 overflow-hidden truncate">
                    {state || "—"}
                  </div>
                ) : (
                  <Combobox
                    options={stateOptions}
                    value={state}
                    onChange={setState}
                    placeholder="Select state…"
                    searchPlaceholder="Search states…"
                    advanceOnEnter
                    onGridKeyDown={handleFormKeyDown}
                  />
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="clone-addr1">Address Line 1</Label>
              <Input
                id="clone-addr1"
                value={address1}
                onChange={(e) => setAddress1(e.target.value)}
                placeholder="Door no / building"
                disabled={isExistingCustomer}
                className={isExistingCustomer ? "bg-slate-50" : ""}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="clone-addr2">Address Line 2</Label>
              <Input
                id="clone-addr2"
                value={address2}
                onChange={(e) => setAddress2(e.target.value)}
                placeholder="Area / landmark"
                disabled={isExistingCustomer}
                className={isExistingCustomer ? "bg-slate-50" : ""}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="clone-street">Street</Label>
                <Input
                  id="clone-street"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="Street"
                  disabled={isExistingCustomer}
                  className={isExistingCustomer ? "bg-slate-50" : ""}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="clone-city">City</Label>
                <Input
                  id="clone-city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                  disabled={isExistingCustomer}
                  className={isExistingCustomer ? "bg-slate-50" : ""}
                />
              </div>
            </div>

            {/* GST type preview */}
            {(gstin || state) && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-slate-600">GST Type:</span>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                  gstType === "CGST_SGST"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-purple-100 text-purple-800"
                }`}>
                  {gstType === "CGST_SGST" ? "CGST + SGST" : "IGST"}
                </span>
                {gstType === "IGST" && (
                  <span className="text-xs text-slate-700">Tax amounts will be recalculated</span>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending} className="bg-blue-600 hover:bg-blue-700">
            {isPending ? "Creating…" : "Clone & Create →"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
