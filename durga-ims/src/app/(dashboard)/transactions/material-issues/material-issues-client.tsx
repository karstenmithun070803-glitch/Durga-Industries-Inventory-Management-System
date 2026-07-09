"use client";

import { useState, useEffect, useTransition, useMemo, useRef, useCallback } from "react";
import { useFY } from "@/lib/financial-year";
import { isDateInFY } from "@/lib/fy";
import {
  getVehicleMaterialIssue,
  saveVehicleMaterialIssue,
  deleteMaterialIssue,
  getVehicleIssueDatesForFY,
} from "@/lib/actions/material-issues.actions";
import { useDebounce } from "@/hooks/use-debounce";
import { TransactionGrid, newRow } from "@/components/forms/TransactionGrid";
import { rowsReducer, type RowAction } from "@/lib/utils/rows-reducer";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useHotkeys } from "react-hotkeys-hook";
import { useFormSectionNav, focusGridRowZero } from "@/hooks/use-form-section-nav";
import { toast } from "sonner";
import { formatActionError } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import { determineGstType } from "@/types";
import type { MaterialIssueWithDetails, LineItemDraft } from "@/types";
import type { CompanySetting } from "@/lib/actions/settings.actions";
import { PrintButton } from "@/components/pdf/print-button";
import { CloneVehicleDialog } from "@/components/forms/CloneVehicleDialog";

const todayISO = new Date().toISOString().split("T")[0];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VehicleOption {
  id: string;
  job_ref_no: string;
  customer_name: string | null;
  customer_gstin: string | null;
  customer_state: string | null;
  customer_address: string | null;
  type: string;
}

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

interface ContractorOption {
  id: string;
  code_no: number;
  name: string;
  role: string | null;
}

interface MaterialOption {
  id: string;
  material_no: number;
  name: string;
  hsn_code: string | null;
  tax_rate_id: string | null;
  tax_percentage: string | null;
  purchase_unit_id: string | null;
  current_stock: string;
}

interface TaxRateOption {
  id: string;
  tax_percentage: string;
}

interface UnitOption {
  id: string;
  unit_name: string;
}

interface Props {
  vehicles: VehicleOption[];
  customers: CustomerOption[];
  contractors: ContractorOption[];
  materials: MaterialOption[];
  taxRates: TaxRateOption[];
  units: UnitOption[];
  companySetting?: CompanySetting;
  initialVehicleId?: string;
  initialFY: string;
  initialVehicleIssueDates: { vehicleId: string; issue_date: string }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatIssueDateShort(iso: string): string {
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}.${m}.${y.slice(2)}`;
}

function toISODate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().split("T")[0];
}

function formatAmount(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcTotals(rows: LineItemDraft[]) {
  let subtotal = 0, cgst = 0, sgst = 0, igst = 0;
  for (const r of rows) {
    if (!r.material_id) continue;
    subtotal += parseFloat(r.amount) || 0;
    cgst += parseFloat(r.cgst_amount) || 0;
    sgst += parseFloat(r.sgst_amount) || 0;
    igst += parseFloat(r.igst_amount) || 0;
  }
  return { subtotal, cgst, sgst, igst, grand: subtotal + cgst + sgst + igst };
}

function miItemsToRows(slip: MaterialIssueWithDetails, marginPct: string): LineItemDraft[] {
  const factor = 1 + parseFloat(marginPct || "0") / 100;
  if (slip.items.length === 0) return [newRow()];
  return slip.items.map((item) => ({
    _key: crypto.randomUUID(),
    material_id: item.material_id,
    material_name: item.material_name,
    material_no: item.material_no,
    hsn_code: item.hsn_code ?? "",
    supplier_id: "",
    supplier_name: "",
    gst_type: item.gst_type ?? "CGST_SGST",
    qty: item.qty,
    unit_id: item.unit_id ?? "",
    unit_name: item.unit_name ?? "",
    rate: item.rate,
    baseRate: factor > 1 ? (parseFloat(item.rate) / factor).toFixed(4) : item.rate,
    tax_percentage: item.tax_percentage,
    cgst_amount: item.cgst_amount,
    sgst_amount: item.sgst_amount,
    igst_amount: item.igst_amount,
    amount: item.amount,
    rateBlank: false,
    zeroRateConfirmed: true,
    contractor_id: item.contractor_id ?? "",
    contractor_name: item.contractor_name ?? "",
    affects_inventory: item.affects_inventory,
  }));
}

function buildItemsPayload(rows: LineItemDraft[]) {
  return rows
    .filter((r) => r.material_id)
    .map((r) => ({
      material_id: r.material_id,
      contractor_id: r.contractor_id || null,
      hsn_code: r.hsn_code || "",
      qty: r.qty,
      unit_id: r.unit_id || "",
      rate: r.rate || "0",
      rate_blank: r.rateBlank,
      zero_rate_confirmed: r.zeroRateConfirmed,
      tax_percentage: r.tax_percentage || "0",
      cgst_amount: r.cgst_amount,
      sgst_amount: r.sgst_amount,
      igst_amount: r.igst_amount,
      amount: r.amount,
      gst_type: r.gst_type || "CGST_SGST",
      affects_inventory: r.affects_inventory,
    }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MaterialIssuesClient({
  vehicles,
  customers,
  contractors,
  materials,
  taxRates,
  units,
  companySetting,
  initialVehicleId,
  initialFY,
  initialVehicleIssueDates,
}: Props) {
  const { activeFY } = useFY();
  const [isPending, startTransition] = useTransition();

  const [loadedFY, setLoadedFY] = useState(initialFY);
  const [vehicleIssueDates, setVehicleIssueDates] = useState(initialVehicleIssueDates);
  const [loadedRecord, setLoadedRecord] = useState<MaterialIssueWithDetails | null>(null);
  const [hasExistingRecord, setHasExistingRecord] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [vehicleId, setVehicleId] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [marginPct, setMarginPct] = useState("0");
  const debouncedMargin = useDebounce(marginPct, 300);
  const [rows, setRows] = useState<LineItemDraft[]>([newRow()]);
  const [isDirty, setIsDirty] = useState(false);
  // Stable dispatch for TransactionGrid — delegates to rowsReducer via functional setRows
  const gridDispatch = useCallback((action: RowAction): void => {
    setRows((prev) => rowsReducer(prev, action));
    if (action.type !== "SET_ALL") setIsDirty(true);
  }, []);
  const [pendingFY, setPendingFY] = useState<string | null>(null);

  // Dialog states
  const [issueConfirmOpen, setIssueConfirmOpen] = useState(false);
  const [reapplyConfirmOpen, setReapplyConfirmOpen] = useState(false);
  const [zeroRateDialogOpen, setZeroRateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // ── Section nav refs ───────────────────────────────────────────────────────
  const vehicleSectionRef = useRef<HTMLDivElement>(null);
  const dateSectionRef = useRef<HTMLDivElement>(null);
  const marginSectionRef = useRef<HTMLDivElement>(null);
  const marginInputRef = useRef<HTMLInputElement>(null);
  const gridSectionRef = useRef<HTMLDivElement>(null);
  const goToSectionRef = useRef<((index: number) => void) | null>(null);

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const gstType = selectedVehicle
    ? determineGstType(selectedVehicle.customer_gstin, selectedVehicle.customer_state)
    : "CGST_SGST";

  // ── Section nav ────────────────────────────────────────────────────────────
  const { goToSection, containerProps } = useFormSectionNav({
    sections: [
      {
        id: "vehicle",
        ref: vehicleSectionRef,
        onActivate: () => {
          vehicleSectionRef.current?.querySelector<HTMLElement>('[role="combobox"]')?.focus();
        },
      },
      {
        id: "date",
        ref: dateSectionRef,
        isDisabled: () => !vehicleId,
        onActivate: () => {
          dateSectionRef.current?.querySelector<HTMLInputElement>('input[type="date"]')?.focus();
        },
      },
      {
        id: "margin",
        ref: marginSectionRef,
        isDisabled: () => !vehicleId,
        autoActivate: true,
        onActivate: () => {
          marginInputRef.current?.focus();
          marginInputRef.current?.select();
        },
        onDeactivate: () => marginInputRef.current?.blur(),
      },
      {
        id: "grid",
        ref: gridSectionRef,
        isDisabled: () => !vehicleId || isLoading,
        onActivate: () => focusGridRowZero(gridSectionRef.current),
      },
    ],
    isLoading: isLoading || isPending,
    // Tab: record loaded → into the grid; none → focus the Vehicle box. Inside grid → native.
    onTab: (e) => {
      const inGrid = gridSectionRef.current?.contains(document.activeElement);
      if (inGrid) return;
      e.preventDefault();
      if (vehicleId && !isLoading) {
        focusGridRowZero(gridSectionRef.current);
      } else {
        vehicleSectionRef.current?.querySelector<HTMLElement>('[role="combobox"]')?.focus();
      }
    },
  });

  goToSectionRef.current = goToSection;

  // Deferred focus into the grid (Material row 1) after a vehicle record loads.
  const [pendingGridFocus, setPendingGridFocus] = useState(false);
  useEffect(() => {
    if (pendingGridFocus && vehicleId && !isLoading) {
      setPendingGridFocus(false);
      goToSectionRef.current?.(3); // grid section (vehicle=0, date=1, margin=2, grid=3)
    }
  }, [pendingGridFocus, vehicleId, isLoading]);

  // Auto-load if initial vehicle ID provided
  useEffect(() => {
    if (initialVehicleId) void loadVehicleRecord(initialVehicleId, initialFY);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // FY switch
  useEffect(() => {
    if (activeFY === loadedFY) return;
    if (isDirty) {
      setPendingFY(activeFY);
      setDiscardDialogOpen(true);
      return;
    }
    switchFY(activeFY);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFY, loadedFY]);

  // Margin recalculation
  useEffect(() => {
    if (rows.length === 0) return;
    const factor = 1 + parseFloat(debouncedMargin || "0") / 100;
    setRows((prev) =>
      prev.map((row) => {
        const base = parseFloat(row.baseRate || row.rate || "0");
        const newRate = (base * factor).toFixed(4);
        const qty = parseFloat(row.qty || "0");
        const taxPct = parseFloat(row.tax_percentage || "0");
        const newAmount = (parseFloat(newRate) * qty).toFixed(2);
        const amt = parseFloat(newAmount);
        let cgst = "0.00", sgst = "0.00", igst = "0.00";
        const gst = row.gst_type ?? gstType;
        if (gst === "CGST_SGST") {
          const half = ((amt * taxPct) / 100 / 2).toFixed(2);
          cgst = half; sgst = half;
        } else {
          igst = ((amt * taxPct) / 100).toFixed(2);
        }
        return { ...row, rate: newRate, amount: newAmount, cgst_amount: cgst, sgst_amount: sgst, igst_amount: igst };
      })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedMargin]);

  function switchFY(fy: string) {
    setLoadedFY(fy);
    clearForm();
    void getVehicleIssueDatesForFY(fy, "OLD").then(setVehicleIssueDates).catch(() => {});
  }

  function clearForm() {
    setLoadedRecord(null);
    setHasExistingRecord(false);
    setVehicleId("");
    setIssueDate("");
    setMarginPct("0");
    setRows([newRow()]);
    setIsDirty(false);
  }

  function populateForm(record: MaterialIssueWithDetails) {
    setLoadedRecord(record);
    setHasExistingRecord(true);
    setVehicleId(record.vehicle_id);
    setIssueDate(toISODate(record.issue_date));
    setMarginPct(record.margin_percentage ?? "0");
    setRows(miItemsToRows(record, record.margin_percentage ?? "0"));
    setIsDirty(false);
    setVehicleIssueDates((prev) => [
      ...prev.filter((d) => d.vehicleId !== record.vehicle_id),
      { vehicleId: record.vehicle_id, issue_date: toISODate(record.issue_date) },
    ]);
  }

  async function loadVehicleRecord(vehId: string, fy: string) {
    setIsLoading(true);
    try {
      const record = await getVehicleMaterialIssue(vehId, "OLD", fy);
      if (record) {
        populateForm(record);
      } else {
        setVehicleId(vehId);
        setHasExistingRecord(false);
        setLoadedRecord(null);
        setIssueDate(todayISO);
        setMarginPct("0");
        setRows([newRow()]);
        setIsDirty(false);
      }
    } catch {
      toast.error("Failed to load vehicle record");
    } finally {
      setIsLoading(false);
      setPendingGridFocus(true); // drop into the grid (Material row 1) once state flushes
    }
  }

  function validate(): string | null {
    if (!vehicleId) return "Please select a vehicle.";
    if (!issueDate) return "Please enter a date.";
    if (!isDateInFY(issueDate, loadedFY)) return `Date is outside FY ${loadedFY}.`;
    if (rows.filter((r) => r.material_id).length === 0) return "Add at least one material.";
    return null;
  }

  function hasZeroRateItems(): boolean {
    return rows.some((r) => r.material_id && r.rate === "0" && !r.rateBlank && !r.zeroRateConfirmed);
  }

  function buildPayload() {
    const filled = rows.filter((r) => r.material_id);
    const { grand } = calcTotals(filled);
    return {
      vehicle_id: vehicleId,
      issue_date: issueDate,
      financial_year: loadedFY,
      margin_percentage: marginPct || "0",
      total_amount: grand.toFixed(2),
      issue_type: "OLD" as const,
      stage_id: null,
      items: buildItemsPayload(filled),
    };
  }

  function handleFormVehicleChange(val: string) {
    if (val === "") {
      if (loadedRecord && isDirty) {
        setPendingAction(() => () => clearForm());
        setDiscardDialogOpen(true);
        return;
      }
      clearForm();
      return;
    }
    // Switching to a different vehicle while dirty
    if (val !== vehicleId && (loadedRecord || isDirty)) {
      setPendingAction(() => () => void loadVehicleRecord(val, loadedFY));
      setDiscardDialogOpen(true);
      return;
    }
    void loadVehicleRecord(val, loadedFY);
  }

  function handleSave() {
    const err = validate();
    if (err) { toast.error(err); return; }
    if (hasZeroRateItems()) { setZeroRateDialogOpen(true); return; }
    if (!hasExistingRecord) {
      setIssueConfirmOpen(true);
    } else {
      setReapplyConfirmOpen(true);
    }
  }

  function confirmIssue() {
    setIssueConfirmOpen(false);
    startTransition(async () => {
      try {
        await saveVehicleMaterialIssue(vehicleId, "OLD", buildPayload());
        toast.success("Materials issued — stock deducted");
        await loadVehicleRecord(vehicleId, loadedFY);
      } catch (e: unknown) {
        toast.error(formatActionError(e, "Save failed"));
      }
    });
  }

  function confirmReapply() {
    setReapplyConfirmOpen(false);
    startTransition(async () => {
      try {
        await saveVehicleMaterialIssue(vehicleId, "OLD", buildPayload());
        toast.success("Stock reversed and reapplied successfully");
        await loadVehicleRecord(vehicleId, loadedFY);
      } catch (e: unknown) {
        toast.error(formatActionError(e, "Save failed"));
      }
    });
  }

  function handleDelete() {
    if (!loadedRecord) return;
    setDeleteDialogOpen(true);
  }

  function confirmDelete() {
    if (!loadedRecord) return;
    const deletedVehicleId = loadedRecord.vehicle_id;
    startTransition(async () => {
      try {
        await deleteMaterialIssue(loadedRecord.id);
        toast.success("Record deleted — stock fully reversed");
        setDeleteDialogOpen(false);
        setVehicleIssueDates((prev) => prev.filter((d) => d.vehicleId !== deletedVehicleId));
        clearForm();
      } catch (e: unknown) {
        toast.error(formatActionError(e, "Delete failed"));
        setDeleteDialogOpen(false);
      }
    });
  }

  function handleCancel() {
    if (isDirty) {
      setPendingAction(() => () => clearForm());
      setDiscardDialogOpen(true);
      return;
    }
    clearForm();
  }

  function confirmDiscard() {
    setDiscardDialogOpen(false);
    if (pendingFY) {
      switchFY(pendingFY);
      setPendingFY(null);
    } else {
      clearForm();
      pendingAction?.();
    }
    setPendingAction(null);
  }

  // Hotkeys (Mac-aware: mod = Cmd on macOS / Ctrl on Windows)
  const overlayOpen = () => !!document.querySelector('[role="dialog"], [cmdk-root]');
  useHotkeys("mod+s", (e) => { if (overlayOpen()) return; e.preventDefault(); handleSave(); }, { enableOnFormTags: true });
  // "/" jumps to + opens the Vehicle box (skip when typing in a field)
  useHotkeys(
    "/",
    (e) => {
      if (overlayOpen()) return; // a dialog/dropdown owns the keys
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      e.preventDefault();
      const trigger = vehicleSectionRef.current?.querySelector<HTMLElement>('[role="combobox"]');
      trigger?.focus();
      trigger?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    },
    { enableOnFormTags: false }
  );

  // Alt+C → Cancel (raw e.code so macOS Option+C doesn't emit ç). Attached on the root container.
  const handleAltShortcuts = (e: React.KeyboardEvent) => {
    if (!e.altKey || e.metaKey || e.ctrlKey) return;
    if (overlayOpen()) return;
    if (e.code === "KeyC") { e.preventDefault(); handleCancel(); }
  };

  const { subtotal, cgst, sgst, igst, grand } = calcTotals(rows);
  const hasFormContent = !!vehicleId;

  const vehicleOptions = useMemo(() => {
    const dateMap = new Map(vehicleIssueDates.map((d) => [d.vehicleId, d.issue_date]));
    return vehicles
      .filter((v) => v.type === "Old")
      .map((v) => {
        const dateSuffix = dateMap.has(v.id)
          ? ` — ${formatIssueDateShort(dateMap.get(v.id)!)}`
          : "";
        return {
          value: v.id,
          label: `${v.job_ref_no}${dateSuffix}`,
          displayLabel: v.job_ref_no + dateSuffix,
        };
      });
  }, [vehicles, vehicleIssueDates]);

  return (
    <div className="flex h-full flex-col" {...containerProps} onKeyDownCapture={handleAltShortcuts}>
      <div className="flex-1 overflow-y-auto p-6 pb-0">
        {/* Header card */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
          <div className="flex gap-6 items-stretch">
            {/* Left column */}
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-slate-600 w-28 shrink-0">Vehicle Name</span>
                <div className="w-56" ref={vehicleSectionRef}>
                  <Combobox
                    options={vehicleOptions}
                    value={vehicleId}
                    onChange={handleFormVehicleChange}
                    placeholder="Select vehicle…"
                    openOnArrowDown
                    onGridKeyDown={(e) => {
                      // Vehicle → Right → Date (Down still opens the dropdown via openOnArrowDown)
                      if (e.key === "ArrowRight") {
                        e.preventDefault();
                        e.stopPropagation();
                        dateSectionRef.current?.querySelector<HTMLInputElement>('input[type="date"]')?.focus();
                      }
                    }}
                  />
                </div>
                <span className="text-sm text-slate-600 shrink-0">Date</span>
                <div className="w-36" ref={dateSectionRef}>
                  <Input
                    type="date"
                    value={issueDate}
                    onChange={(e) => { setIssueDate(e.target.value); setIsDirty(true); }}
                    onKeyDown={(e) => {
                      // Native date input eats arrows, so route them explicitly.
                      // Date → Left → Vehicle · Date → Down → Margin
                      if (e.key === "ArrowLeft") {
                        e.preventDefault();
                        e.stopPropagation();
                        vehicleSectionRef.current?.querySelector<HTMLElement>('[role="combobox"]')?.focus();
                      } else if (e.key === "ArrowDown") {
                        e.preventDefault();
                        e.stopPropagation();
                        marginInputRef.current?.focus();
                        marginInputRef.current?.select();
                      }
                    }}
                    className="h-9 text-sm"
                    disabled={!vehicleId}
                    autoComplete="off"
                  />
                </div>
              </div>

              {vehicleId && (
                <div className="flex flex-wrap items-end gap-4">
                  <div className="space-y-1">
                    <label className="text-sm text-slate-600">Job No / Reg No</label>
                    <div className="w-28 h-9 px-3 flex items-center text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-md">
                      {selectedVehicle?.job_ref_no || "—"}
                    </div>
                  </div>
                  <div className="space-y-1" ref={marginSectionRef}>
                    <label className="text-sm text-slate-600">Margin %</label>
                    <div className="w-24">
                      <Input
                        ref={marginInputRef}
                        type="text"
                        inputMode="decimal"
                        value={marginPct}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "" || /^\d*\.?\d*$/.test(val)) {
                            setMarginPct(val);
                            setIsDirty(true);
                          }
                        }}
                        onFocus={(e) => e.target.select()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "ArrowDown") {
                            // Margin → Down / Enter → Material (grid row 1)
                            e.preventDefault();
                            e.stopPropagation();
                            goToSection(3); // advance to Grid
                          } else if (e.key === "ArrowUp") {
                            // Margin → Up → Vehicle
                            e.preventDefault();
                            e.stopPropagation();
                            vehicleSectionRef.current?.querySelector<HTMLElement>('[role="combobox"]')?.focus();
                          }
                        }}
                        className="h-9 text-sm"
                        placeholder="0"
                        autoComplete="off"
                      />
                    </div>
                  </div>
                </div>
              )}

              {hasExistingRecord && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800">
                    <span className="font-medium">Materials already issued for this vehicle.</span> Saving will reverse the current stock deductions and reapply them with the new values (atomic operation).
                  </p>
                </div>
              )}
            </div>

            {/* Right column — customer info + total */}
            {hasFormContent && (
              <div className="w-52 shrink-0 text-right flex flex-col justify-between">
                <div>
                  {selectedVehicle && (
                    <>
                      {selectedVehicle.customer_name && (
                        <p className="text-base font-semibold text-slate-800 leading-snug break-words mb-1">
                          {selectedVehicle.customer_name}
                        </p>
                      )}
                      {selectedVehicle.customer_gstin && (
                        <p className="text-xs text-slate-600 font-mono mb-1">
                          {selectedVehicle.customer_gstin}
                        </p>
                      )}
                      <p className="text-xs text-slate-600 mb-3">
                        {gstType === "CGST_SGST" ? "CGST + SGST" : "IGST"}
                      </p>
                      {selectedVehicle.customer_address && (
                        <p className="text-sm text-slate-600 break-words mb-3">
                          {selectedVehicle.customer_address}
                        </p>
                      )}
                    </>
                  )}
                </div>
                <div className="mt-4">
                  <p className="text-xs text-slate-700 uppercase tracking-wide">Total</p>
                  <p className="text-2xl font-bold text-slate-900">{formatAmount(grand)}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-700 text-sm">Loading…</div>
        ) : !vehicleId ? (
          <div className="bg-white rounded-lg border border-slate-200 p-5 text-center text-sm text-slate-700 mb-4">
            Select a vehicle above to load its material issue record.
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden mb-4" ref={gridSectionRef}>
            {!hasExistingRecord && (
              <div className="px-5 py-3 border-b border-slate-100 text-sm text-slate-700">
                No record exists yet for this vehicle in FY {loadedFY}. Add materials and save to create one.
              </div>
            )}
            <TransactionGrid
              rows={rows}
              dispatch={gridDispatch}
              suppliers={[]}
              materials={materials}
              taxRates={taxRates}
              units={units}
              contractors={contractors}
              gstType={gstType}
              mode="material-issue"
              marginFactor={1 + parseFloat(marginPct || "0") / 100}
            />
          </div>
        )}
      </div>

      {/* Sticky bottom bar */}
      <div className="border-t border-slate-200 bg-white shadow-lg shrink-0">
        <div className="px-6 py-2.5 flex items-center gap-6 text-sm border-b border-slate-100 flex-wrap">
          <span className="text-slate-600">Subtotal: <span className="font-medium text-slate-800">{formatAmount(subtotal)}</span></span>
          <span className="text-slate-600">CGST: <span className="font-medium text-slate-800">{formatAmount(cgst)}</span></span>
          <span className="text-slate-600">SGST: <span className="font-medium text-slate-800">{formatAmount(sgst)}</span></span>
          <span className="text-slate-600">IGST: <span className="font-medium text-slate-800">{formatAmount(igst)}</span></span>
          <span className="ml-auto text-slate-600 font-semibold text-base">
            Grand Total: <span className="text-2xl font-bold text-slate-900">{formatAmount(grand)}</span>
          </span>
        </div>

        <div className="px-6 py-3 flex items-center gap-4 flex-wrap">
          {hasFormContent && (
            <>
              <Button
                className="h-10 px-5 bg-blue-600 hover:bg-blue-700"
                onClick={handleSave}
                disabled={isPending || isLoading || !isDirty}
                data-testid="mi-save-btn"
              >
                {isPending ? "Saving…" : hasExistingRecord ? "Save & Reapply" : "Issue"}
              </Button>

              {loadedRecord && (
                <>
                  <PrintButton
                    getDocument={async () => {
                      const { MISlipDocument } = await import("@/components/pdf/mi-slip-pdf");
                      return <MISlipDocument slip={loadedRecord} companySetting={companySetting} />;
                    }}
                    label="Print"
                    hotkey="mod+p"
                  />
                  <Button variant="outline" className="h-10 px-5" onClick={() => setCloneDialogOpen(true)} disabled={isPending}>
                    Clone
                  </Button>
                  <Button
                    variant="outline"
                    className="h-10 px-5 text-red-600 border-red-200 hover:bg-red-50"
                    onClick={handleDelete}
                    disabled={isPending}
                  >
                    Delete
                  </Button>
                </>
              )}
            </>
          )}

          <Button variant="outline" className="h-10 px-5" onClick={handleCancel} disabled={isPending}>Cancel</Button>
        </div>
      </div>

      {/* Zero-rate confirmation */}
      <Dialog open={zeroRateDialogOpen} onOpenChange={setZeroRateDialogOpen}>
        <DialogContent className="max-w-md" confirmNav>
          <DialogHeader>
            <DialogTitle>Items with zero rate</DialogTitle>
            <DialogDescription>
              One or more items have a ₹0 rate. Confirm these are intentionally free or service items before proceeding.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setZeroRateDialogOpen(false)}>Go Back</Button>
            <Button
              onClick={() => {
                setZeroRateDialogOpen(false);
                setRows((prev) => prev.map((r) => ({ ...r, zeroRateConfirmed: r.rate === "0" ? true : r.zeroRateConfirmed })));
                if (!hasExistingRecord) setIssueConfirmOpen(true);
                else setReapplyConfirmOpen(true);
              }}
            >
              Confirm Zero Rates
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Issue confirmation (first save) */}
      <Dialog open={issueConfirmOpen} onOpenChange={setIssueConfirmOpen}>
        <DialogContent data-testid="issue-confirm-dialog" className="max-w-md" confirmNav>
          <DialogHeader>
            <DialogTitle>Issue & Deduct Stock?</DialogTitle>
            <DialogDescription>
              This will record the material issue for <strong>{selectedVehicle?.job_ref_no}</strong> and deduct stock for all inventory items. This action can be reversed by saving again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueConfirmOpen(false)} disabled={isPending}>Cancel</Button>
            <Button onClick={confirmIssue} disabled={isPending} className="bg-blue-600 hover:bg-blue-700" data-testid="issue-confirm-btn">
              {isPending ? "Processing…" : "Issue & Deduct Stock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reapply confirmation (subsequent saves) */}
      <Dialog open={reapplyConfirmOpen} onOpenChange={setReapplyConfirmOpen}>
        <DialogContent className="max-w-md" confirmNav>
          <DialogHeader>
            <DialogTitle>Reverse & Reapply Stock?</DialogTitle>
            <DialogDescription>
              This will reverse the current stock deductions for <strong>{selectedVehicle?.job_ref_no}</strong> and reapply them with the new values. All changes are atomic.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReapplyConfirmOpen(false)} disabled={isPending}>Cancel</Button>
            <Button onClick={confirmReapply} disabled={isPending} className="bg-amber-600 hover:bg-amber-700">
              {isPending ? "Processing…" : "Reverse & Reapply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete material issue record?"
        description={`This will permanently remove all material issue data for ${selectedVehicle?.job_ref_no ?? "this vehicle"} in FY ${loadedFY} and reverse ALL stock deductions.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        isPending={isPending}
      />

      {/* Discard confirm */}
      <ConfirmDialog
        open={discardDialogOpen}
        onOpenChange={(open) => {
          setDiscardDialogOpen(open);
          if (!open) { setPendingAction(null); setPendingFY(null); }
        }}
        title="Discard unsaved changes?"
        description="You have unsaved changes. They will be lost if you continue."
        confirmLabel="Discard"
        onConfirm={confirmDiscard}
        isPending={isPending}
        focusConfirm
      />

      {/* Clone vehicle dialog */}
      <CloneVehicleDialog
        open={cloneDialogOpen}
        onOpenChange={setCloneDialogOpen}
        sourceVehicleId={vehicleId}
        sourceVehicleType={(selectedVehicle?.type ?? "Old") as "Old" | "New"}
        issueType="OLD"
        financialYear={loadedFY}
        customers={customers}
        onSuccess={(newVehicleId) => {
          setCloneDialogOpen(false);
          void loadVehicleRecord(newVehicleId, loadedFY);
          toast.success("Vehicle cloned — verify rates before finalising");
        }}
      />
    </div>
  );
}
