"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFY } from "@/lib/financial-year";
import { isDateInFY } from "@/lib/fy";
import {
  getMaterialIssueById,
  createMaterialIssue,
  updateMaterialIssue,
  updateIssuedMaterialIssue,
  issueMaterialIssue,
  deleteMaterialIssue,
  cloneOldMaterialIssue,
  getSlipsForDropdown,
} from "@/lib/actions/material-issues.actions";
import { useDebounce } from "@/hooks/use-debounce";
import { TransactionGrid, newRow } from "@/components/forms/TransactionGrid";
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
import { toast } from "sonner";
import { formatCode } from "@/lib/utils";

const todayISO = new Date().toISOString().split("T")[0];
import { AlertTriangle } from "lucide-react";
import { determineGstType } from "@/types";
import type { MaterialIssueWithDetails, LineItemDraft } from "@/types";
import type { CompanySetting } from "@/lib/actions/settings.actions";
import { PrintButton } from "@/components/pdf/print-button";
import { MISlipDocument } from "@/components/pdf/mi-slip-pdf";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VehicleOption {
  id: string;
  job_ref_no: string;
  vehicle_name: string | null;
  customer_gstin: string | null;
  customer_state: string | null;
  customer_address: string | null;
  type: string;
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

interface SlipSummary {
  id: string;
  slipNumber: number;
  vehicleId: string;
  vehicleName: string | null;
  date: string;
  status: string;
}

interface Props {
  initialSlips: SlipSummary[];
  vehicles: VehicleOption[];
  contractors: ContractorOption[];
  materials: MaterialOption[];
  taxRates: TaxRateOption[];
  units: UnitOption[];
  companySetting?: CompanySetting;
  initialSelectedId?: string;
  initialFY: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  initialSlips,
  vehicles,
  contractors,
  materials,
  taxRates,
  units,
  companySetting,
  initialSelectedId,
  initialFY,
}: Props) {
  const router = useRouter();
  const { activeFY } = useFY();
  const [isPending, startTransition] = useTransition();

  const [loadedFY, setLoadedFY] = useState(initialFY);
  const [loadedSlip, setLoadedSlip] = useState<MaterialIssueWithDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [browseMode, setBrowseMode] = useState(!initialSelectedId);
  const [browseVehicleId, setBrowseVehicleId] = useState("");
  const [allSlips, setAllSlips] = useState<SlipSummary[]>(initialSlips);

  const [vehicleId, setVehicleId] = useState("");
  const [issueDate, setIssueDate] = useState(todayISO);
  const [marginPct, setMarginPct] = useState("0");
  const debouncedMargin = useDebounce(marginPct, 300);
  const [rows, setRows] = useState<LineItemDraft[]>([newRow()]);
  const [isDirty, setIsDirty] = useState(false);
  const [pendingFY, setPendingFY] = useState<string | null>(null);

  const [saveReapplyDialogOpen, setSaveReapplyDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [cloneResult, setCloneResult] = useState<{ newSlipId: string; newSlipNumber: number } | null>(null);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const gstType = selectedVehicle
    ? determineGstType(selectedVehicle.customer_gstin, selectedVehicle.customer_state)
    : "CGST_SGST";

  useEffect(() => {
    if (initialSelectedId) void loadSlip(initialSelectedId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeFY === loadedFY) return;
    if (isDirty) {
      setPendingFY(activeFY);
      setDiscardDialogOpen(true);
      return;
    }
    switchFY(activeFY);
    getSlipsForDropdown(activeFY, "OLD").then(setAllSlips).catch(() => {});
    setBrowseVehicleId("");
    setBrowseMode(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFY, loadedFY]);

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
  }

  function clearForm() {
    setLoadedSlip(null);
    setVehicleId("");
    setIssueDate(todayISO);
    setMarginPct("0");
    setRows([newRow()]);
    setIsDirty(false);
  }

  function populateForm(slip: MaterialIssueWithDetails) {
    setLoadedSlip(slip);
    setVehicleId(slip.vehicle_id);
    setIssueDate(toISODate(slip.issue_date));
    setMarginPct(slip.margin_percentage ?? "0");
    setRows(miItemsToRows(slip, slip.margin_percentage ?? "0"));
    setIsDirty(false);
  }

  async function refreshSlips() {
    try {
      const fresh = await getSlipsForDropdown(loadedFY, "OLD");
      setAllSlips(fresh);
    } catch { /* silent */ }
  }

  async function loadSlip(id: string) {
    setIsLoading(true);
    try {
      const slip = await getMaterialIssueById(id);
      if (!slip) { toast.error("Slip not found"); return; }
      if (slip.issue_type === "NEW") {
        router.replace(`/transactions/material-issues/new?id=${id}`);
        return;
      }
      populateForm(slip);
    } catch {
      toast.error("Failed to load slip");
    } finally {
      setIsLoading(false);
    }
  }

  function validate(): string | null {
    if (!vehicleId) return "Please select a vehicle.";
    if (!issueDate) return "Please enter a date.";
    if (!isDateInFY(issueDate, loadedFY)) return `Date is outside FY ${loadedFY}.`;
    if (rows.filter((r) => r.material_id).length === 0) return "Add at least one material.";
    return null;
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
    if (val !== "") {
      setVehicleId(val);
      setIsDirty(true);
      return;
    }
    if (loadedSlip) {
      if (isDirty) {
        setPendingAction(() => () => {});
        setDiscardDialogOpen(true);
        return;
      }
      clearForm();
      return;
    }
    setVehicleId("");
    setIsDirty(true);
  }

  function handleNew() {
    const doNew = () => {
      clearForm();
      setBrowseMode(false);
    };
    if (isDirty) {
      setPendingAction(() => doNew);
      setDiscardDialogOpen(true);
      return;
    }
    doNew();
  }

  function handleSave() {
    const err = validate();
    if (err) { toast.error(err); return; }

    if (!loadedSlip) {
      startTransition(async () => {
        try {
          const id = await createMaterialIssue(buildPayload());
          toast.success("Draft slip created");
          await loadSlip(id);
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : "Save failed");
        }
      });
    } else if (loadedSlip.status === "Draft") {
      startTransition(async () => {
        try {
          await updateMaterialIssue(loadedSlip.id, buildPayload());
          toast.success("Draft saved");
          const updated = await getMaterialIssueById(loadedSlip.id);
          if (updated) populateForm(updated);
          await refreshSlips();
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : "Save failed");
        }
      });
    } else if (loadedSlip.status === "Issued") {
      setSaveReapplyDialogOpen(true);
    }
  }

  function confirmSaveReapply() {
    if (!loadedSlip) return;
    startTransition(async () => {
      try {
        await updateIssuedMaterialIssue(loadedSlip.id, buildPayload());
        toast.success("Stock reversed and reapplied successfully");
        setSaveReapplyDialogOpen(false);
        const updated = await getMaterialIssueById(loadedSlip.id);
        if (updated) populateForm(updated);
        await refreshSlips();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Save & Reapply failed");
        setSaveReapplyDialogOpen(false);
      }
    });
  }

  function handleIssue() {
    const err = validate();
    if (err) { toast.error(err); return; }
    startTransition(async () => {
      try {
        let targetId: string;
        if (!loadedSlip) {
          targetId = await createMaterialIssue(buildPayload());
        } else {
          await updateMaterialIssue(loadedSlip.id, buildPayload());
          targetId = loadedSlip.id;
        }
        const slipNum = await issueMaterialIssue(targetId);
        toast.success(`${formatCode("MI-", slipNum, 4)} issued — stock deducted`);
        await refreshSlips();
        clearForm();
        setBrowseMode(true);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Issue failed");
      }
    });
  }

  function handleDelete() {
    if (!loadedSlip) return;
    setDeleteDialogOpen(true);
  }

  function confirmDelete() {
    if (!loadedSlip) return;
    startTransition(async () => {
      try {
        await deleteMaterialIssue(loadedSlip.id);
        toast.success("Slip deleted");
        setDeleteDialogOpen(false);
        clearForm();
        setBrowseMode(true);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Delete failed");
        setDeleteDialogOpen(false);
      }
    });
  }

  function handleClone() {
    if (!loadedSlip) return;
    startTransition(async () => {
      try {
        const result = await cloneOldMaterialIssue(loadedSlip.id);
        setCloneResult(result);
        setCloneDialogOpen(true);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Clone failed");
      }
    });
  }

  function handleLoadClone() {
    if (!cloneResult) return;
    setCloneDialogOpen(false);
    void loadSlip(cloneResult.newSlipId);
    toast.info("Rates copied from original — verify before issuing");
  }

  function handleCancel() {
    if (isDirty) {
      setPendingAction(() => () => setBrowseMode(true));
      setDiscardDialogOpen(true);
      return;
    }
    clearForm();
    setBrowseMode(true);
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

  useHotkeys("ctrl+s", (e) => { e.preventDefault(); handleSave(); }, { enableOnFormTags: true });
  useHotkeys("alt+n", (e) => { e.preventDefault(); handleNew(); }, { enableOnFormTags: true });
  useHotkeys("escape", () => handleCancel(), { enableOnFormTags: true });

  const { subtotal, cgst, sgst, igst, grand } = calcTotals(rows);
  const miStatus = loadedSlip?.status ?? null;
  const hasFormContent = loadedSlip !== null || isDirty;

  const browsedSlips = browseVehicleId
    ? allSlips.filter((s) => s.vehicleId === browseVehicleId)
    : [];

  const browseVehicleOptions = vehicles
    .filter((v) => v.type === "Old")
    .map((v) => ({
      value: v.id,
      label: `${v.job_ref_no} — ${v.vehicle_name ?? ""}`,
      displayLabel: v.vehicle_name ?? v.job_ref_no,
    }));

  const formVehicleOptions = (() => {
    if (!vehicleId || browseVehicleOptions.some((o) => o.value === vehicleId)) {
      return browseVehicleOptions;
    }
    const current = vehicles.find((v) => v.id === vehicleId);
    if (!current) return browseVehicleOptions;
    return [
      {
        value: current.id,
        label: `${current.job_ref_no} — ${current.vehicle_name ?? ""}`,
        displayLabel: current.vehicle_name ?? current.job_ref_no,
      },
      ...browseVehicleOptions,
    ];
  })();

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-6 pb-0">
        {/* Header card */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
          <div className="flex gap-6 items-stretch">
            {/* Left column */}
            <div className="flex-1 space-y-3">
              {browseMode ? (
                <>
                  {/* Browse panel */}
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-500 w-28 shrink-0">Vehicle Name</span>
                    <div className="w-56">
                      <Combobox
                        options={browseVehicleOptions}
                        value={browseVehicleId}
                        onChange={setBrowseVehicleId}
                        placeholder="Search vehicle…"
                      />
                    </div>
                  </div>
                  {(browsedSlips.length > 0 || browseVehicleId) && (
                    <div className="flex items-start gap-3">
                      <span className="w-28 shrink-0" />
                      <div className="w-56">
                        {browsedSlips.length > 0 ? (
                          <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-md divide-y divide-slate-100">
                            {browsedSlips.map((s) => (
                              <button
                                key={s.id}
                                onClick={() => {
                                  if (s.id === loadedSlip?.id) return;
                                  if (isDirty) {
                                    setPendingAction(() => () => void loadSlip(s.id));
                                    setDiscardDialogOpen(true);
                                    return;
                                  }
                                  void loadSlip(s.id);
                                }}
                                className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors ${
                                  s.id === loadedSlip?.id
                                    ? "bg-blue-50 border-l-2 border-blue-400"
                                    : "hover:bg-slate-50"
                                }`}
                              >
                                <span className="font-mono font-medium text-slate-800 w-20 shrink-0">
                                  {formatCode("MI-", s.slipNumber, 4)}
                                </span>
                                <span className={`ml-auto px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
                                  s.status === "Issued" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"
                                }`}>
                                  {s.status}
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-400 py-2">No slips found for this vehicle.</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Inline form — shown when a slip is loaded in browse mode */}
                  {loadedSlip && (
                    <div className="flex items-start gap-3">
                      <span className="w-28 shrink-0" />
                      <div className="w-56 space-y-2 pt-2 border-t border-slate-100">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm font-medium text-slate-800">
                            {formatCode("MI-", loadedSlip.slip_number, 4)}
                          </span>
                          {miStatus && (
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              miStatus === "Issued" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"
                            }`}>
                              {miStatus}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-3 items-end">
                          <div className="space-y-1">
                            <label className="text-xs text-slate-500">Date</label>
                            <Input
                              type="date"
                              value={issueDate}
                              onChange={(e) => { setIssueDate(e.target.value); setIsDirty(true); }}
                              className="h-8 text-sm w-36"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-slate-500">Margin %</label>
                            <Input
                              type="number"
                              value={marginPct}
                              onChange={(e) => { setMarginPct(e.target.value); setIsDirty(true); }}
                              onFocus={(e) => e.target.select()}
                              className="h-8 text-sm w-20"
                              min="0"
                              step="0.01"
                            />
                          </div>
                        </div>
                        {miStatus === "Issued" && (
                          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-800">
                              <span className="font-medium">Issued.</span> Saving reverses and reapplies stock.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Form mode */}
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-500 w-28 shrink-0">Vehicle Name</span>
                    <div className="w-56">
                      <Combobox
                        options={formVehicleOptions}
                        value={vehicleId}
                        onChange={handleFormVehicleChange}
                        placeholder="Select vehicle…"
                      />
                    </div>
                    {miStatus && (
                      <span className={`px-2 py-0.5 rounded text-sm font-medium ${
                        miStatus === "Issued" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"
                      }`}>
                        {miStatus}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-500 w-28 shrink-0">Slip No</span>
                    <div className="w-56 h-9 px-3 flex items-center text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-md">
                      {loadedSlip ? formatCode("MI-", loadedSlip.slip_number, 4) : "—"}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-end gap-4">
                    <div className="space-y-1">
                      <label className="text-sm text-slate-500">Date</label>
                      <div className="w-40">
                        <Input
                          type="date"
                          value={issueDate}
                          onChange={(e) => { setIssueDate(e.target.value); setIsDirty(true); }}
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm text-slate-500">Job No</label>
                      <div className="w-28 h-9 px-3 flex items-center text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-md">
                        {selectedVehicle?.job_ref_no || "—"}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm text-slate-500">Margin %</label>
                      <div className="w-24">
                        <Input
                          type="number"
                          value={marginPct}
                          onChange={(e) => { setMarginPct(e.target.value); setIsDirty(true); }}
                          onFocus={(e) => e.target.select()}
                          className="h-9 text-sm"
                          min="0"
                          step="0.01"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  </div>

                  {miStatus === "Issued" && (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-800">
                        <span className="font-medium">This slip has been issued.</span> Saving will reverse the current stock deductions and reapply them with the new values (atomic operation).
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Right column — customer info + total */}
            {(!browseMode || !!loadedSlip) && (
              <div className="w-52 shrink-0 text-right flex flex-col justify-between">
                <div>
                  {selectedVehicle ? (
                    <>
                      <p className="text-base font-semibold text-slate-800 leading-snug break-words mb-4">
                        {selectedVehicle.customer_address || "—"}
                      </p>
                      <p className="text-sm text-slate-700">
                        {gstType === "CGST_SGST" ? "CGST + SGST" : "IGST"}
                      </p>
                    </>
                  ) : null}
                </div>
                <div className="mt-4">
                  <p className="text-xs text-slate-400 uppercase tracking-wide">Total</p>
                  <p className="text-2xl font-bold text-slate-900">{formatAmount(grand)}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading…</div>
        ) : (browseMode && !loadedSlip) ? (
          <div className="bg-white rounded-lg border border-slate-200 p-5 text-center text-sm text-slate-400 mb-4">
            Select a vehicle above to find existing slips, or click <strong>New</strong> to create one.
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden mb-4">
            {!hasFormContent && (
              <div className="px-5 py-3 border-b border-slate-100 text-sm text-slate-400">
                Select a vehicle above and add materials to create a new slip.
              </div>
            )}
            <TransactionGrid
              rows={rows}
              onChange={(r) => { setRows(r); setIsDirty(true); }}
              suppliers={[]}
              materials={materials}
              taxRates={taxRates}
              units={units}
              contractors={contractors}
              gstType={gstType}
              mode="material-issue"
            />
          </div>
        )}
      </div>

      {/* Sticky bottom bar */}
      <div className="border-t border-slate-200 bg-white shadow-lg shrink-0">
        <div className="px-6 py-2.5 flex items-center gap-6 text-sm border-b border-slate-100 flex-wrap">
          <span className="text-slate-500">Subtotal: <span className="font-medium text-slate-800">{formatAmount(subtotal)}</span></span>
          <span className="text-slate-500">CGST: <span className="font-medium text-slate-800">{formatAmount(cgst)}</span></span>
          <span className="text-slate-500">SGST: <span className="font-medium text-slate-800">{formatAmount(sgst)}</span></span>
          <span className="text-slate-500">IGST: <span className="font-medium text-slate-800">{formatAmount(igst)}</span></span>
          <span className="ml-auto text-slate-600 font-semibold text-base">
            Grand Total: <span className="text-2xl font-bold text-slate-900">{formatAmount(grand)}</span>
          </span>
        </div>

        <div className="px-6 py-3 flex items-center gap-4 flex-wrap">
          <Button variant="outline" className="h-10 px-5" onClick={handleNew} disabled={isPending}>New</Button>

          {(!browseMode || !!loadedSlip) && (
            <>
              {hasFormContent && (
                <>
                  <Button variant="outline" className="h-10 px-5" onClick={handleSave} disabled={isPending || isLoading}>
                    {isPending ? "Saving…" : !loadedSlip ? "Save Draft" : miStatus === "Issued" ? "Save & Reapply" : "Save"}
                  </Button>

                  {(!loadedSlip || miStatus === "Draft") && (
                    <Button className="h-10 px-5 bg-blue-600 hover:bg-blue-700" onClick={handleIssue} disabled={isPending}>
                      {isPending ? "Processing…" : "Issue"}
                    </Button>
                  )}

                  {loadedSlip && (
                    <>
                      <PrintButton
                        getDocument={() => <MISlipDocument slip={loadedSlip} companySetting={companySetting} />}
                        label="Print"
                      />
                      <Button variant="outline" className="h-10 px-5" onClick={handleClone} disabled={isPending}>Clone</Button>
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
            </>
          )}
        </div>
      </div>

      {/* Save & Reapply confirm */}
      <Dialog open={saveReapplyDialogOpen} onOpenChange={setSaveReapplyDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save & Reapply Stock?</DialogTitle>
            <DialogDescription>
              This will reverse the current stock deductions and reapply them with the new values. All changes are atomic.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveReapplyDialogOpen(false)} disabled={isPending}>Cancel</Button>
            <Button onClick={confirmSaveReapply} disabled={isPending} className="bg-amber-600 hover:bg-amber-700">
              {isPending ? "Processing…" : "Save & Reapply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={miStatus === "Issued" ? "Delete issued slip?" : "Delete draft slip?"}
        description={
          miStatus === "Issued"
            ? "This will permanently delete the slip and reverse all stock deductions."
            : "This draft slip will be permanently deleted. No stock was affected."
        }
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
      />

      {/* Clone result */}
      <Dialog open={cloneDialogOpen} onOpenChange={setCloneDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Slip Cloned</DialogTitle>
            <DialogDescription>
              New draft {cloneResult ? formatCode("MI-", cloneResult.newSlipNumber, 4) : "—"} created.
              Rates copied from original — verify before issuing.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneDialogOpen(false)}>Stay Here</Button>
            <Button onClick={handleLoadClone}>Load Clone</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
