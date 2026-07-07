"use client";

import { useState, useEffect, useTransition, useMemo, useRef, useCallback } from "react";
import { useFY } from "@/lib/financial-year";
import { isDateInFY } from "@/lib/fy";
import {
  getVehicleMaterialIssue,
  saveVehicleMaterialIssue,
  saveVehicleStage,
  issueDraftRecord,
  deleteSavedStage,
  deleteMaterialIssue,
  getVehicleIssueDatesForFY,
} from "@/lib/actions/material-issues.actions";
import { useDebounce } from "@/hooks/use-debounce";
import { getStageMaterials, getAllStageMaterials } from "@/lib/actions/stages.actions";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useHotkeys } from "react-hotkeys-hook";
import { useFormSectionNav } from "@/hooks/use-form-section-nav";
import { toast } from "sonner";
import { formatActionError, cn } from "@/lib/utils";
import { AlertTriangle, ChevronLeft, ChevronRight, Trash2, ChevronsUpDown, Plus } from "lucide-react";
import { determineGstType } from "@/types";
import type { MaterialIssueWithDetails, LineItemDraft, GstType } from "@/types";
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

interface StageOption {
  id: string;
  stage_code: string;
  stage_name: string;
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
  stages: StageOption[];
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

function computeRowAmounts(
  qty: string,
  rate: string,
  taxPct: string,
  gstType: GstType
): Pick<LineItemDraft, "cgst_amount" | "sgst_amount" | "igst_amount" | "amount"> {
  const q = parseFloat(qty) || 0;
  const r = parseFloat(rate) || 0;
  const t = parseFloat(taxPct) || 0;
  const base = q * r;
  const taxAmt = base * (t / 100);
  if (gstType === "CGST_SGST") {
    return {
      cgst_amount: (taxAmt / 2).toFixed(2),
      sgst_amount: (taxAmt / 2).toFixed(2),
      igst_amount: "0.00",
      amount: base.toFixed(2),
    };
  }
  return {
    cgst_amount: "0.00",
    sgst_amount: "0.00",
    igst_amount: taxAmt.toFixed(2),
    amount: base.toFixed(2),
  };
}

function miItemsToRows(record: MaterialIssueWithDetails, marginPct: string): LineItemDraft[] {
  const factor = 1 + parseFloat(marginPct || "0") / 100;
  if (record.items.length === 0) return [newRow()];
  return record.items.map((item) => ({
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
    stage_id: item.stage_id ?? undefined,
    stage_name: item.stage_name ?? undefined,
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
      stage_id: r.stage_id ?? null,
    }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NewVMIClient({
  vehicles,
  customers,
  stages,
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
  const [selectedStageIds, setSelectedStageIds] = useState<string[]>([]);
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [stageDropOpen, setStageDropOpen] = useState(false);
  const [loadingStageIds, setLoadingStageIds] = useState<Set<string>>(new Set());
  const [issueDate, setIssueDate] = useState("");
  const [marginPct, setMarginPct] = useState("0");
  const debouncedMargin = useDebounce(marginPct, 300);
  const [rows, setRows] = useState<LineItemDraft[]>([newRow()]);
  const [isDirty, setIsDirty] = useState(false);

  // Refs for stable gridDispatch without stale closures in async handlers
  const activeStageIdRef = useRef(activeStageId);
  activeStageIdRef.current = activeStageId;
  const stagesRef = useRef(stages);
  stagesRef.current = stages;

  // Stable dispatch passed to TransactionGrid — handles stage-aware APPEND and DELETE
  const gridDispatch = useCallback((action: RowAction): void => {
    setRows((prev) => {
      if (action.type === "APPEND") {
        const stageId = activeStageIdRef.current;
        const stageName = stagesRef.current.find((s) => s.id === stageId)?.stage_name ?? "";
        return [...prev, stageId ? { ...action.row, stage_id: stageId, stage_name: stageName } : action.row];
      }
      if (action.type === "DELETE") {
        const stageId = activeStageIdRef.current;
        const next = prev.filter((r) => r._key !== action.key);
        if (stageId) {
          const stageRows = next.filter((r) => r.stage_id === stageId);
          if (stageRows.length === 0) {
            const stageName = stagesRef.current.find((s) => s.id === stageId)?.stage_name ?? "";
            return [...next, { ...newRow(), stage_id: stageId, stage_name: stageName }];
          }
        }
        return next.length ? next : [newRow()];
      }
      return rowsReducer(prev, action);
    });
    if (action.type !== "SET_ALL") setIsDirty(true);
  }, []); // stable — all mutable values read via refs
  const [pendingFY, setPendingFY] = useState<string | null>(null);

  // Draft / stage-save state
  const [f2Mode, setF2Mode] = useState(false);
  const [savedStageIds, setSavedStageIds] = useState<string[]>([]);
  const [recordStatus, setRecordStatus] = useState<"Draft" | "Issued" | null>(null);

  // Dialog states
  const [issueConfirmOpen, setIssueConfirmOpen] = useState(false);
  const [reapplyConfirmOpen, setReapplyConfirmOpen] = useState(false);
  const [stageSaveConfirmOpen, setStageSaveConfirmOpen] = useState(false);
  const [issueAllConfirmOpen, setIssueAllConfirmOpen] = useState(false);
  const [zeroRateDialogOpen, setZeroRateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // ── Section nav refs ───────────────────────────────────────────────────────
  const vehicleSectionRef = useRef<HTMLDivElement>(null);
  const dateSectionRef = useRef<HTMLDivElement>(null);
  const stageSectionRef = useRef<HTMLDivElement>(null);
  const gridSectionRef = useRef<HTMLDivElement>(null);
  // Ref to goToSection so async callbacks (loadVehicleRecord) can call it
  const goToSectionRef = useRef<((index: number) => void) | null>(null);

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const gstType: GstType = selectedVehicle
    ? determineGstType(selectedVehicle.customer_gstin, selectedVehicle.customer_state)
    : "CGST_SGST";

  // Stages in master list order — main: unsaved only; F2: saved only
  const orderedStageIds = useMemo(() => {
    if (f2Mode) {
      return stages.filter((s) => savedStageIds.includes(s.id)).map((s) => s.id);
    }
    return stages
      .filter((s) => selectedStageIds.includes(s.id) && !savedStageIds.includes(s.id))
      .map((s) => s.id);
  }, [stages, selectedStageIds, savedStageIds, f2Mode]);

  const isAnyStageLoading = loadingStageIds.size > 0;

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
        id: "stage",
        ref: stageSectionRef,
        isDisabled: () => !vehicleId,
        onActivate: () => {
          stageSectionRef.current?.querySelector<HTMLElement>("button")?.focus();
        },
      },
      {
        id: "grid",
        ref: gridSectionRef,
        isDisabled: () => !vehicleId || isLoading,
        onActivate: () => {
          gridSectionRef.current
            ?.querySelector<HTMLElement>('[data-grid-row="0"][data-grid-col="0"]')
            ?.focus();
        },
      },
    ],
    isLoading: isLoading || isPending,
  });

  // Keep goToSectionRef in sync so async callbacks can call it
  goToSectionRef.current = goToSection;

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
    void getVehicleIssueDatesForFY(fy, "NEW").then(setVehicleIssueDates).catch(() => {});
  }

  function clearForm() {
    setLoadedRecord(null);
    setHasExistingRecord(false);
    setVehicleId("");
    setSelectedStageIds([]);
    setActiveStageId(null);
    setIssueDate("");
    setMarginPct("0");
    setRows([newRow()]);
    setIsDirty(false);
    setF2Mode(false);
    setSavedStageIds([]);
    setRecordStatus(null);
  }

  function populateForm(record: MaterialIssueWithDetails) {
    setLoadedRecord(record);
    setHasExistingRecord(true);
    setRecordStatus("Issued");
    setSavedStageIds(record.saved_stage_ids ?? []);
    setVehicleId(record.vehicle_id);
    const seen = new Set<string>();
    const stageIds: string[] = [];
    for (const item of record.items) {
      if (item.stage_id && !seen.has(item.stage_id)) {
        seen.add(item.stage_id);
        stageIds.push(item.stage_id);
      }
    }
    setSelectedStageIds(stageIds);
    setActiveStageId(stageIds[0] ?? null);
    setIssueDate(toISODate(record.issue_date));
    setMarginPct(record.margin_percentage ?? "0");
    setRows(miItemsToRows(record, record.margin_percentage ?? "0"));
    setIsDirty(false);
    setVehicleIssueDates((prev) => [
      ...prev.filter((d) => d.vehicleId !== record.vehicle_id),
      { vehicleId: record.vehicle_id, issue_date: toISODate(record.issue_date) },
    ]);
  }

  async function populateDraftForm(record: MaterialIssueWithDetails) {
    const marginPctVal = record.margin_percentage ?? "0";
    const factor = 1 + parseFloat(marginPctVal) / 100;
    const dbRows = miItemsToRows(record, marginPctVal);

    setSavedStageIds(record.saved_stage_ids ?? []);
    setRecordStatus("Draft");
    setLoadedRecord(record);
    setHasExistingRecord(true);
    setVehicleId(record.vehicle_id);
    setIssueDate(toISODate(record.issue_date));
    setMarginPct(marginPctVal);
    setIsDirty(false);
    setVehicleIssueDates((prev) => [
      ...prev.filter((d) => d.vehicleId !== record.vehicle_id),
      { vehicleId: record.vehicle_id, issue_date: toISODate(record.issue_date) },
    ]);

    const unsavedStages = stages.filter((s) => !record.saved_stage_ids.includes(s.id));
    const allStageIds = stages.map((s) => s.id);
    setSelectedStageIds(allStageIds);

    if (unsavedStages.length === 0) {
      // All stages saved — auto-enter F2 mode
      setF2Mode(true);
      setActiveStageId(record.saved_stage_ids[0] ?? null);
      setRows(dbRows);
    } else {
      // Load unsaved stage materials
      setLoadingStageIds((prev) => { const s = new Set(prev); unsavedStages.forEach((st) => s.add(st.id)); return s; });
      try {
        const grouped = await getAllStageMaterials();
        const autoRows: typeof dbRows = unsavedStages.flatMap((stage) => {
          const mats = grouped[stage.id] ?? [];
          return mats.map((m) => {
            const baseRate = m.last_po_rate ?? "0";
            const displayRate = factor > 1 ? (parseFloat(baseRate) * factor).toFixed(4) : baseRate;
            const taxPct = m.tax_percentage ?? "0";
            return {
              _key: crypto.randomUUID(),
              stage_id: stage.id,
              stage_name: stage.stage_name,
              material_id: m.material_id,
              material_name: m.material_name,
              material_no: m.material_no,
              hsn_code: m.hsn_code ?? "",
              supplier_id: "",
              supplier_name: "",
              gst_type: gstType,
              qty: m.default_qty,
              unit_id: m.unit_id,
              unit_name: m.unit_name,
              rate: displayRate,
              baseRate: baseRate,
              tax_percentage: taxPct,
              rateBlank: m.last_po_rate === null,
              zeroRateConfirmed: false,
              contractor_id: "",
              contractor_name: "",
              affects_inventory: true,
              ...computeRowAmounts(m.default_qty, displayRate, taxPct, gstType),
            };
          });
        });
        setRows([...dbRows, ...autoRows]);
        // Focus first unsaved stage
        const firstUnsaved = stages.find((s) => !record.saved_stage_ids.includes(s.id));
        setActiveStageId(firstUnsaved?.id ?? null);
      } catch {
        toast.error("Failed to auto-load unsaved stage materials");
        setRows(dbRows);
        setActiveStageId(stages.find((s) => !record.saved_stage_ids.includes(s.id))?.id ?? null);
      } finally {
        setLoadingStageIds((prev) => { const s = new Set(prev); unsavedStages.forEach((st) => s.delete(st.id)); return s; });
      }
    }
  }

  async function loadVehicleRecord(vehId: string, fy: string) {
    setF2Mode(false);
    setSavedStageIds([]);
    setRecordStatus(null);
    setIsLoading(true);
    try {
      const record = await getVehicleMaterialIssue(vehId, "NEW", fy);
      if (record) {
        if (record.status === "Draft") {
          await populateDraftForm(record);
        } else {
          populateForm(record);
        }
      } else {
        setVehicleId(vehId);
        setHasExistingRecord(false);
        setLoadedRecord(null);
        setSelectedStageIds([]);
        setActiveStageId(null);
        setIssueDate(todayISO);
        setMarginPct("0");
        setRows([newRow()]);
        setIsDirty(false);
        setRecordStatus(null);
        // Auto-load all stages for new record
        void handleSelectAllStagesFor(vehId);
      }
    } catch {
      toast.error("Failed to load vehicle record");
    } finally {
      setIsLoading(false);
      // Advance ring to Date section after vehicle loads
      goToSectionRef.current?.(1);
    }
  }

  // ─── Stage navigator ───────────────────────────────────────────────────────

  async function handleStageToggle(stageId: string, checked: boolean) {
    if (checked) {
      if (selectedStageIds.includes(stageId)) return;
      setLoadingStageIds((prev) => { const s = new Set(prev); s.add(stageId); return s; });
      try {
        const stageMats = await getStageMaterials(stageId);
        const stage = stages.find((s) => s.id === stageId);
        const factor = 1 + parseFloat(marginPct || "0") / 100;
        const newRows: LineItemDraft[] = stageMats.map((m) => {
          const baseRate = m.last_po_rate ?? "0";
          const displayRate = factor > 1 ? (parseFloat(baseRate) * factor).toFixed(4) : baseRate;
          const taxPct = m.tax_percentage ?? "0";
          const amounts = computeRowAmounts(m.default_qty, displayRate, taxPct, gstType);
          return {
            _key: crypto.randomUUID(),
            stage_id: stageId,
            stage_name: stage?.stage_name ?? "",
            material_id: m.material_id,
            material_name: m.material_name,
            material_no: m.material_no,
            hsn_code: m.hsn_code ?? "",
            supplier_id: "",
            supplier_name: "",
            gst_type: gstType,
            qty: m.default_qty,
            unit_id: m.unit_id,
            unit_name: m.unit_name,
            rate: displayRate,
            baseRate: baseRate,
            tax_percentage: taxPct,
            rateBlank: m.last_po_rate === null,
            zeroRateConfirmed: false,
            contractor_id: "",
            contractor_name: "",
            affects_inventory: true,
            ...amounts,
          };
        });
        setRows((prev) => {
          const cleaned = prev.filter((r) => r.material_id);
          const combined = [...cleaned, ...newRows];
          return combined.length > 0
            ? combined
            : [{ ...newRow(), stage_id: stageId, stage_name: stage?.stage_name ?? "" }];
        });
        setSelectedStageIds((prev) => [...prev, stageId]);
        setActiveStageId(stageId);
        setIsDirty(true);
      } catch {
        toast.error("Failed to load stage materials");
      } finally {
        setLoadingStageIds((prev) => { const s = new Set(prev); s.delete(stageId); return s; });
      }
    } else {
      setRows((prev) => {
        const remaining = prev.filter((r) => r.stage_id !== stageId);
        return remaining.length > 0 ? remaining : [newRow()];
      });
      setSelectedStageIds((prev) => prev.filter((id) => id !== stageId));
      setIsDirty(true);
    }
  }

  function navigateStage(dir: -1 | 1) {
    if (!activeStageId) return;
    const idx = orderedStageIds.indexOf(activeStageId);
    const next = idx + dir;
    if (next >= 0 && next < orderedStageIds.length)
      setActiveStageId(orderedStageIds[next]);
  }

  function handleStageNavChange(val: string) {
    if (!val) return;
    if (selectedStageIds.includes(val)) {
      setActiveStageId(val);
    } else {
      void handleStageToggle(val, true);
    }
  }

  function handleRemoveCurrentStage() {
    if (!activeStageId) return;
    const idx = orderedStageIds.indexOf(activeStageId);
    const remaining = orderedStageIds.filter((id) => id !== activeStageId);
    const nextId = remaining[idx - 1] ?? remaining[0] ?? null;

    if (savedStageIds.includes(activeStageId) && loadedRecord) {
      const removingStageId = activeStageId;
      startTransition(async () => {
        try {
          await deleteSavedStage(loadedRecord.id, removingStageId);
          const newSaved = savedStageIds.filter((id) => id !== removingStageId);
          setSavedStageIds(newSaved);
          setRows((prev) => prev.filter((r) => r.stage_id !== removingStageId));
          if (newSaved.length === 0) {
            setLoadedRecord(null);
            setHasExistingRecord(false);
            setRecordStatus(null);
            setF2Mode(false);
            const fallback = stages.find((s) => selectedStageIds.includes(s.id) && s.id !== removingStageId);
            setActiveStageId(fallback?.id ?? null);
          } else {
            setActiveStageId(nextId);
          }
          toast.success("Stage removed");
        } catch (e) {
          toast.error(formatActionError(e, "Remove failed"));
        }
      });
    } else {
      void handleStageToggle(activeStageId, false);
      setActiveStageId(nextId);
    }
  }

  async function handleSelectAllStages() {
    const unchecked = stages.filter((s) => !selectedStageIds.includes(s.id));
    if (unchecked.length === 0) return;
    setLoadingStageIds((prev) => { const s = new Set(prev); unchecked.forEach((st) => s.add(st.id)); return s; });
    try {
      const grouped = await getAllStageMaterials();
      const results = unchecked.map((st) => ({ stage: st, mats: grouped[st.id] ?? [] }));
      const factor = 1 + parseFloat(marginPct || "0") / 100;
      const newRows: LineItemDraft[] = results.flatMap(({ stage, mats }) =>
        mats.map((m) => {
          const baseRate = m.last_po_rate ?? "0";
          const displayRate = factor > 1 ? (parseFloat(baseRate) * factor).toFixed(4) : baseRate;
          const taxPct = m.tax_percentage ?? "0";
          return {
            _key: crypto.randomUUID(),
            stage_id: stage.id,
            stage_name: stage.stage_name,
            material_id: m.material_id,
            material_name: m.material_name,
            material_no: m.material_no,
            hsn_code: m.hsn_code ?? "",
            supplier_id: "",
            supplier_name: "",
            gst_type: gstType,
            qty: m.default_qty,
            unit_id: m.unit_id,
            unit_name: m.unit_name,
            rate: displayRate,
            baseRate: baseRate,
            tax_percentage: taxPct,
            rateBlank: m.last_po_rate === null,
            zeroRateConfirmed: false,
            contractor_id: "",
            contractor_name: "",
            affects_inventory: true,
            ...computeRowAmounts(m.default_qty, displayRate, taxPct, gstType),
          };
        })
      );
      setRows((prev) => {
        const cleaned = prev.filter((r) => r.material_id);
        const combined = [...cleaned, ...newRows];
        return combined.length > 0
          ? combined
          : [{ ...newRow(), stage_id: unchecked[0].id, stage_name: unchecked[0].stage_name }];
      });
      setSelectedStageIds((prev) => [...prev, ...unchecked.map((s) => s.id)]);
      setActiveStageId((prev) => prev ?? unchecked[0].id);
      setIsDirty(true);
    } catch {
      toast.error("Failed to load stage materials");
    } finally {
      setLoadingStageIds((prev) => { const s = new Set(prev); unchecked.forEach((st) => s.delete(st.id)); return s; });
    }
  }

  // Called after loadVehicleRecord finds no existing record — doesn't set isDirty
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function handleSelectAllStagesFor(_vehId: string) {
    if (stages.length === 0) return;
    setLoadingStageIds((prev) => { const s = new Set(prev); stages.forEach((st) => s.add(st.id)); return s; });
    try {
      const grouped = await getAllStageMaterials();
      const results = stages.map((st) => ({ stage: st, mats: grouped[st.id] ?? [] }));
      const newRows: LineItemDraft[] = results.flatMap(({ stage, mats }) =>
        mats.map((m) => {
          const baseRate = m.last_po_rate ?? "0";
          const taxPct = m.tax_percentage ?? "0";
          return {
            _key: crypto.randomUUID(),
            stage_id: stage.id,
            stage_name: stage.stage_name,
            material_id: m.material_id,
            material_name: m.material_name,
            material_no: m.material_no,
            hsn_code: m.hsn_code ?? "",
            supplier_id: "",
            supplier_name: "",
            gst_type: gstType,
            qty: m.default_qty,
            unit_id: m.unit_id,
            unit_name: m.unit_name,
            rate: baseRate,
            baseRate: baseRate,
            tax_percentage: taxPct,
            rateBlank: m.last_po_rate === null,
            zeroRateConfirmed: false,
            contractor_id: "",
            contractor_name: "",
            affects_inventory: true,
            ...computeRowAmounts(m.default_qty, baseRate, taxPct, gstType),
          };
        })
      );
      setRows(newRows.length > 0 ? newRows : [newRow()]);
      setSelectedStageIds(stages.map((s) => s.id));
      setActiveStageId(stages[0]?.id ?? null);
      // no setIsDirty(true) — this is auto-populated, not user-edited
    } catch {
      toast.error("Failed to auto-load stage materials");
    } finally {
      setLoadingStageIds((prev) => { const s = new Set(prev); stages.forEach((st) => s.delete(st.id)); return s; });
    }
  }

  // ─── Form actions ──────────────────────────────────────────────────────────

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
      issue_type: "NEW" as const,
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
    // Issued path: existing reverse+reapply flow
    if (recordStatus === "Issued") {
      const err = validate();
      if (err) { toast.error(err); return; }
      if (hasZeroRateItems()) { setZeroRateDialogOpen(true); return; }
      setReapplyConfirmOpen(true);
      return;
    }

    // Draft / new path: per-stage save
    if (!vehicleId) { toast.error("Please select a vehicle."); return; }
    if (!issueDate) { toast.error("Please enter a date."); return; }
    if (!isDateInFY(issueDate, loadedFY)) { toast.error(`Date is outside FY ${loadedFY}.`); return; }
    if (!activeStageId) { toast.error("No stage selected."); return; }
    const activeRows = rows.filter((r) => r.stage_id === activeStageId && r.material_id);
    if (activeRows.length === 0) { toast.error("Add at least one material for this stage."); return; }
    const hasStageZeroRate = activeRows.some((r) => r.rate === "0" && !r.rateBlank && !r.zeroRateConfirmed);
    if (hasStageZeroRate) { setZeroRateDialogOpen(true); return; }
    setStageSaveConfirmOpen(true);
  }

  function confirmIssue() {
    setIssueConfirmOpen(false);
    startTransition(async () => {
      try {
        await saveVehicleMaterialIssue(vehicleId, "NEW", buildPayload());
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
        await saveVehicleMaterialIssue(vehicleId, "NEW", buildPayload());
        toast.success("Stock reversed and reapplied successfully");
        await loadVehicleRecord(vehicleId, loadedFY);
      } catch (e: unknown) {
        toast.error(formatActionError(e, "Save failed"));
      }
    });
  }

  function confirmSaveStage() {
    setStageSaveConfirmOpen(false);
    const savedStageId = activeStageId!;
    const stageItems = buildItemsPayload(rows.filter((r) => r.stage_id === savedStageId && r.material_id));
    startTransition(async () => {
      try {
        await saveVehicleStage(vehicleId, savedStageId, stageItems, issueDate, marginPct, loadedFY);
      } catch (e) {
        toast.error(formatActionError(e, "Save failed"));
        return;
      }

      const newSaved = Array.from(new Set([...savedStageIds, savedStageId]));
      setSavedStageIds(newSaved);
      setHasExistingRecord(true);
      setRecordStatus("Draft");
      setIsDirty(false);
      toast.success("Stage saved");

      try {
        const updatedRecord = await getVehicleMaterialIssue(vehicleId, "NEW", loadedFY);
        if (updatedRecord) {
          setLoadedRecord(updatedRecord);
          setSavedStageIds(updatedRecord.saved_stage_ids);
        }
      } catch {
        // non-fatal refresh failure
      }

      if (!f2Mode) {
        const nextUnsaved = stages.find(
          (s) => selectedStageIds.includes(s.id) && !newSaved.includes(s.id)
        );
        if (nextUnsaved) {
          setActiveStageId(nextUnsaved.id);
        } else {
          setF2Mode(true);
          setActiveStageId(newSaved[0] ?? savedStageId);
          toast.info("All stages saved — review and click Issue when ready");
        }
      }
    });
  }

  function handleIssueAll() {
    setIssueAllConfirmOpen(true);
  }

  function confirmIssueAll() {
    setIssueAllConfirmOpen(false);
    startTransition(async () => {
      try {
        await issueDraftRecord(vehicleId, loadedFY, issueDate);
        toast.success("Materials issued — stock deducted");
        await loadVehicleRecord(vehicleId, loadedFY);
      } catch (e) {
        toast.error(formatActionError(e, "Issue failed"));
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

  useHotkeys("ctrl+s", (e) => { e.preventDefault(); handleSave(); }, { enableOnFormTags: true });

  useHotkeys(["f2", "meta+f2"], (e) => {
    e.preventDefault();
    if (savedStageIds.length === 0) return;
    setF2Mode((prev) => {
      const next = !prev;
      if (next) {
        setActiveStageId(savedStageIds[0]);
      } else {
        const firstUnsaved = stages.find(
          (s) => selectedStageIds.includes(s.id) && !savedStageIds.includes(s.id)
        );
        setActiveStageId(firstUnsaved?.id ?? null);
      }
      return next;
    });
  }, { enableOnFormTags: true });

  const { subtotal, cgst, sgst, igst, grand } = calcTotals(rows);
  const hasFormContent = !!vehicleId;

  const vehicleOptions = useMemo(() => {
    const dateMap = new Map(vehicleIssueDates.map((d) => [d.vehicleId, d.issue_date]));
    return vehicles
      .filter((v) => v.type === "New")
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
    <div className="flex h-full flex-col" {...containerProps}>
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
                  />
                </div>
                <span className="px-2 py-0.5 rounded text-sm font-medium bg-emerald-100 text-emerald-800">NEW</span>
                <span className="text-sm text-slate-600 shrink-0">Date</span>
                <div className="w-36" ref={dateSectionRef}>
                  <Input
                    type="date"
                    value={issueDate}
                    onChange={(e) => { setIssueDate(e.target.value); setIsDirty(true); }}
                    className="h-9 text-sm"
                    disabled={!vehicleId}
                    autoComplete="off"
                  />
                </div>
              </div>

              {/* Stage navigator */}
              {vehicleId && (
                <div className="flex items-center gap-2" ref={stageSectionRef}>
                  <span className="text-sm text-slate-600 w-28 shrink-0">Stage</span>
                  {f2Mode && (
                    <span className="text-xs font-semibold text-amber-700 bg-amber-100 rounded px-2 py-0.5">
                      Saved (F2)
                    </span>
                  )}
                  <button
                    onClick={() => navigateStage(-1)}
                    disabled={isPending || isAnyStageLoading || !activeStageId || orderedStageIds.indexOf(activeStageId) === 0}
                    className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4 text-slate-600" />
                  </button>
                  <Popover open={stageDropOpen} onOpenChange={setStageDropOpen}>
                    <PopoverTrigger
                      disabled={isAnyStageLoading}
                      className="w-52 flex items-center justify-between rounded-md border border-input bg-background px-3 h-9 text-sm hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <span className="truncate text-left text-muted-foreground">
                        {activeStageId
                          ? (() => { const s = stages.find((st) => st.id === activeStageId); return s ? `${s.stage_code} — ${s.stage_name}` : "Select stage"; })()
                          : "Select stage"}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </PopoverTrigger>
                    <PopoverContent className="w-52 p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search stage..." />
                        <CommandList>
                          <CommandEmpty>No stages found.</CommandEmpty>
                          {orderedStageIds.length > 0 && (
                            <CommandGroup heading={f2Mode ? "Saved stages" : "In this record"}>
                              {orderedStageIds.map((id) => {
                                const s = stages.find((st) => st.id === id);
                                if (!s) return null;
                                return (
                                  <CommandItem
                                    key={id}
                                    value={`${s.stage_code} ${s.stage_name}`}
                                    onSelect={() => { handleStageNavChange(id); setStageDropOpen(false); }}
                                    data-checked={id === activeStageId}
                                    className={cn(id === activeStageId ? "font-medium" : "")}
                                  >
                                    {s.stage_code} — {s.stage_name}
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          )}
                          {!f2Mode && stages.filter((s) => !selectedStageIds.includes(s.id)).length > 0 && (
                            <CommandGroup heading="Add stage">
                              {stages.filter((s) => !selectedStageIds.includes(s.id)).map((s) => (
                                <CommandItem
                                  key={s.id}
                                  value={`${s.stage_code} ${s.stage_name}`}
                                  onSelect={() => { handleStageNavChange(s.id); setStageDropOpen(false); }}
                                >
                                  <Plus className="mr-2 h-4 w-4 opacity-40" />
                                  {s.stage_code} — {s.stage_name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <button
                    onClick={() => navigateStage(1)}
                    disabled={isPending || isAnyStageLoading || !activeStageId || orderedStageIds.indexOf(activeStageId) === orderedStageIds.length - 1}
                    className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                  </button>
                  {orderedStageIds.length > 0 && activeStageId && (
                    <span className="text-xs text-slate-700 tabular-nums shrink-0">
                      {orderedStageIds.indexOf(activeStageId) + 1} / {orderedStageIds.length}
                    </span>
                  )}
                  {activeStageId && (
                    <button
                      onClick={handleRemoveCurrentStage}
                      disabled={isPending || isAnyStageLoading}
                      title="Remove this stage and its materials"
                      className="p-1.5 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 disabled:opacity-30 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {!f2Mode && stages.length > 0 && selectedStageIds.length < stages.length && (
                    <button
                      onClick={() => void handleSelectAllStages()}
                      disabled={isAnyStageLoading}
                      className="text-xs text-slate-700 hover:text-slate-600 shrink-0 transition-colors"
                    >
                      Add all
                    </button>
                  )}
                  {isAnyStageLoading && (
                    <span className="text-xs text-slate-700 shrink-0">loading…</span>
                  )}
                </div>
              )}

              {vehicleId && (
                <div className="flex flex-wrap items-end gap-4">
                  <div className="space-y-1">
                    <label className="text-sm text-slate-600">Job No</label>
                    <div className="w-28 h-9 px-3 flex items-center text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-md">
                      {selectedVehicle?.job_ref_no || "—"}
                    </div>
                  </div>
                </div>
              )}

              {recordStatus === "Issued" && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800">
                    <span className="font-medium">Materials already issued for this vehicle.</span> Saving will reverse the current stock deductions and reapply them with the new values (atomic operation).
                  </p>
                </div>
              )}
              {recordStatus === "Draft" && (
                <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded px-3 py-2">
                  <p className="text-sm text-blue-800">
                    <span className="font-medium">Draft in progress.</span> {savedStageIds.length} stage{savedStageIds.length !== 1 ? "s" : ""} saved.{savedStageIds.length > 0 ? " Press F2 to review saved stages." : ""}
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
              rows={activeStageId !== null ? rows.filter((r) => r.stage_id === activeStageId) : rows}
              dispatch={gridDispatch}
              suppliers={[]}
              materials={materials}
              taxRates={taxRates}
              units={units}
              contractors={contractors}
              gstType={gstType}
              mode="material-issue"
              showStageColumn={false}
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
                disabled={
                  isPending || isLoading || isAnyStageLoading ||
                  (recordStatus === "Issued"
                    ? !isDirty
                    : rows.filter((r) => r.stage_id === activeStageId && r.material_id).length === 0)
                }
              >
                {isPending ? "Saving…" : recordStatus === "Issued" ? "Save & Reapply" : "Save Stage"}
              </Button>

              {recordStatus === "Draft" && savedStageIds.length > 0 && (
                <Button
                  className="h-10 px-5 bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleIssueAll}
                  disabled={isPending || isLoading}
                >
                  Issue All
                </Button>
              )}

              {f2Mode && (
                <Button
                  variant="outline"
                  className="h-10 px-5"
                  onClick={clearForm}
                  disabled={isPending}
                >
                  Exit
                </Button>
              )}

              {loadedRecord && recordStatus === "Issued" && (
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
                </>
              )}

              {loadedRecord && (
                <Button
                  variant="outline"
                  className="h-10 px-5 text-red-600 border-red-200 hover:bg-red-50"
                  onClick={handleDelete}
                  disabled={isPending}
                >
                  Delete
                </Button>
              )}
            </>
          )}

          <Button variant="outline" className="h-10 px-5" onClick={handleCancel} disabled={isPending}>Cancel</Button>
        </div>
      </div>

      {/* Zero-rate confirmation */}
      <Dialog open={zeroRateDialogOpen} onOpenChange={setZeroRateDialogOpen}>
        <DialogContent className="max-w-md">
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
                if (recordStatus === "Issued") setReapplyConfirmOpen(true);
                else setStageSaveConfirmOpen(true);
              }}
            >
              Confirm Zero Rates
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Issue confirmation (first save) */}
      <Dialog open={issueConfirmOpen} onOpenChange={setIssueConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Issue & Deduct Stock?</DialogTitle>
            <DialogDescription>
              This will record the material issue for <strong>{selectedVehicle?.job_ref_no}</strong> and deduct stock for all inventory items. This action can be reversed by saving again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueConfirmOpen(false)} disabled={isPending}>Cancel</Button>
            <Button onClick={confirmIssue} disabled={isPending} className="bg-blue-600 hover:bg-blue-700">
              {isPending ? "Processing…" : "Issue & Deduct Stock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reapply confirmation (subsequent saves) */}
      <Dialog open={reapplyConfirmOpen} onOpenChange={setReapplyConfirmOpen}>
        <DialogContent className="max-w-md">
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

      {/* Stage save confirmation */}
      <Dialog open={stageSaveConfirmOpen} onOpenChange={setStageSaveConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save this stage?</DialogTitle>
            <DialogDescription>
              This will save the current stage as a draft. No stock will be deducted yet. Use &quot;Issue All&quot; when all stages are ready to finalize.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStageSaveConfirmOpen(false)} disabled={isPending}>Cancel</Button>
            <Button onClick={confirmSaveStage} disabled={isPending} className="bg-blue-600 hover:bg-blue-700">
              {isPending ? "Saving…" : "Save Stage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Issue All confirmation */}
      <Dialog open={issueAllConfirmOpen} onOpenChange={setIssueAllConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Issue all saved stages?</DialogTitle>
            <DialogDescription>
              This will finalize all {savedStageIds.length} saved stage{savedStageIds.length !== 1 ? "s" : ""} for <strong>{selectedVehicle?.job_ref_no}</strong> and deduct stock for all inventory items.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueAllConfirmOpen(false)} disabled={isPending}>Cancel</Button>
            <Button onClick={confirmIssueAll} disabled={isPending} className="bg-emerald-600 hover:bg-emerald-700">
              {isPending ? "Processing…" : "Issue All & Deduct Stock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete material issue record?"
        description={recordStatus === "Draft"
          ? `This will permanently remove all saved stage data for ${selectedVehicle?.job_ref_no ?? "this vehicle"} in FY ${loadedFY}. No stock has been deducted.`
          : `This will permanently remove all material issue data for ${selectedVehicle?.job_ref_no ?? "this vehicle"} in FY ${loadedFY} and reverse ALL stock deductions.`}
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

      {/* Clone vehicle dialog */}
      <CloneVehicleDialog
        open={cloneDialogOpen}
        onOpenChange={setCloneDialogOpen}
        sourceVehicleId={vehicleId}
        sourceVehicleType={(selectedVehicle?.type ?? "New") as "Old" | "New"}
        issueType="NEW"
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
