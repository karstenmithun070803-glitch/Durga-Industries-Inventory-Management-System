"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { useHotkeys } from "react-hotkeys-hook";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TransactionGrid, newRow, calcRowTotals } from "@/components/forms/TransactionGrid";
import { PrintButton } from "@/components/pdf/print-button";
import dynamic from "next/dynamic";
import { useFY } from "@/lib/financial-year";
import { isDateInFY } from "@/lib/fy";
import { determineGstType } from "@/types";
import type {
  LineItemDraft,
  InvoiceWithDetails,
  InvoiceItemWithDetails,
  InvoiceRow,
  InvoiceDropdownItem,
  InsuranceBillWithItems,
} from "@/types";
import {
  getInvoiceById,
  createInvoice,
  updateInvoice,
  finalizeInvoice,
  revertInvoiceToDraft,
  deleteInvoice,
  cancelInvoice,
  getIssuedMIsForVehicle,
  getAllIssuedMIItemsForVehicle,
  getLinkedSlipsForInvoice,
  peekNextBillNumber,
  getInvoicesForDropdown,
  getInsuranceBillByInvoiceId,
  createInsuranceBill,
} from "@/lib/actions/invoices.actions";
import type { CompanySetting } from "@/lib/actions/settings.actions";
import { InsuranceForm } from "./insurance-form";

const CustomerInvoiceDocument = dynamic(
  () => import("@/components/pdf/customer-invoice-pdf").then((m) => ({ default: m.CustomerInvoiceDocument })),
  { ssr: false }
);
const InsuranceInvoiceDocument = dynamic(
  () => import("@/components/pdf/insurance-invoice-pdf").then((m) => ({ default: m.InsuranceInvoiceDocument })),
  { ssr: false }
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VehicleOption {
  id: string;
  job_ref_no: string;
  vehicle_name: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_gstin: string | null;
  customer_state: string | null;
  customer_address?: string | null;
}

interface MaterialOption {
  id: string;
  material_no: number;
  name: string;
  hsn_code: string | null;
  tax_rate_id: string | null;
  tax_percentage?: string | null;
  purchase_unit_id: string | null;
  sales_unit_id?: string | null;
}

interface TaxRateOption {
  id: string;
  vat_code?: number | string;
  tax_percentage: string;
  inv_prefix?: string | null;
}

interface UnitOption {
  id: string;
  unit_name: string;
}

interface MISlipMeta {
  id: string;
  slip_number: number;
  issue_date: string;
  item_count: number;
}

interface MISlipWithItems {
  slip_id: string;
  slip_number: number;
  issue_date: string;
  items: InvoiceItemWithDetails[];
}

interface Props {
  dropdownItems: InvoiceDropdownItem[];
  vehicles: VehicleOption[];
  taxRates: TaxRateOption[];
  materials: MaterialOption[];
  units: UnitOption[];
  companySetting?: CompanySetting;
  initialFY: string;
  initialSelectedId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toISODate(d: string | Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toISOString().split("T")[0];
}

function fmt2(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function mergeSlipRows(rows: LineItemDraft[]): LineItemDraft[] {
  const map = new Map<string, LineItemDraft>();
  for (const row of rows) {
    const key = `${row.material_id}|${row.rate}|${row.tax_percentage}`;
    if (map.has(key)) {
      const ex = map.get(key)!;
      map.set(key, {
        ...ex,
        _slip_id: undefined,
        qty: (parseFloat(ex.qty) + parseFloat(row.qty)).toString(),
        amount: (parseFloat(ex.amount) + parseFloat(row.amount)).toFixed(2),
        cgst_amount: (parseFloat(ex.cgst_amount) + parseFloat(row.cgst_amount)).toFixed(2),
        sgst_amount: (parseFloat(ex.sgst_amount) + parseFloat(row.sgst_amount)).toFixed(2),
        igst_amount: (parseFloat(ex.igst_amount) + parseFloat(row.igst_amount)).toFixed(2),
      });
    } else {
      map.set(key, { ...row });
    }
  }
  return Array.from(map.values());
}

function itemsFromInvoice(invoiceItems: InvoiceItemWithDetails[], storedMargin: string): LineItemDraft[] {
  const factor = 1 + parseFloat(storedMargin || "0") / 100;
  return invoiceItems.map((item) => ({
    _key: crypto.randomUUID(),
    material_id: item.material_id,
    material_name: item.material_name,
    material_no: item.material_no,
    hsn_code: item.hsn_code ?? "",
    supplier_id: "",
    supplier_name: "",
    gst_type: item.gst_type ?? "IGST",
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
    zeroRateConfirmed: parseFloat(item.rate) === 0,
    contractor_id: "",
    contractor_name: "",
    affects_inventory: true,
  }));
}

function buildPdfRows(inv: InvoiceWithDetails): InvoiceRow[] {
  return inv.items.map((item) => ({
    id: inv.id,
    bill_number: inv.bill_number,
    bill_date: inv.bill_date,
    rate_date: inv.rate_date,
    financial_year: inv.financial_year,
    status: inv.status,
    tax_percentage: inv.tax_percentage,
    material_margin: inv.material_margin,
    discount: inv.discount,
    net_amount: inv.net_amount,
    rev_charge_status: inv.rev_charge_status,
    payment_status: inv.payment_status ?? "Unpaid",
    payment_date: inv.payment_date ?? null,
    payment_notes: inv.payment_notes ?? null,
    cancelled_by: inv.cancelled_by ?? null,
    cancelled_at: inv.cancelled_at ?? null,
    vehicle_id: inv.vehicle_id,
    vehicle_name: inv.vehicle_name,
    job_ref_no: inv.job_ref_no,
    customer_id: inv.customer_id,
    customer_name: inv.customer_name,
    customer_gstin: inv.customer_gstin,
    customer_state: inv.customer_state,
    customer_address: inv.customer_address ?? null,
    item_id: item.id,
    material_id: item.material_id,
    material_name: item.material_name,
    material_no: item.material_no,
    hsn_code: item.hsn_code,
    qty: item.qty,
    unit_id: item.unit_id,
    unit_name: item.unit_name,
    rate: item.rate,
    tax_percentage_item: item.tax_percentage,
    cgst_amount: item.cgst_amount,
    sgst_amount: item.sgst_amount,
    igst_amount: item.igst_amount,
    amount: item.amount,
    gst_type: item.gst_type,
  }));
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function InvoiceClient({
  dropdownItems: initialDropdownItems,
  vehicles,
  taxRates,
  materials,
  units,
  companySetting,
  initialFY,
  initialSelectedId,
}: Props) {
  const { activeFY } = useFY();
  const identifierRef = useRef<HTMLButtonElement>(null);

  // ── Dropdown state ────────────────────────────────────────────────────────
  const [dropdownItems, setDropdownItems] = useState<InvoiceDropdownItem[]>(initialDropdownItems);
  const [loadedFY, setLoadedFY] = useState(initialFY);
  const [currentInvoiceId, setCurrentInvoiceId] = useState<string | null>(null);

  // ── Loading / saving ──────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // ── View ──────────────────────────────────────────────────────────────────
  const [activeView, setActiveView] = useState<"invoice" | "insurance">("invoice");
  const [isNewMode, setIsNewMode] = useState(false);

  // ── Loaded invoice ────────────────────────────────────────────────────────
  const [currentInvoice, setCurrentInvoice] = useState<InvoiceWithDetails | null>(null);

  // ── Invoice form state ────────────────────────────────────────────────────
  const [vehicleId, setVehicleId] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleOption | null>(null);
  const [gstType, setGstType] = useState<string>("CGST_SGST");
  const [billDate, setBillDate] = useState(new Date().toISOString().slice(0, 10));
  const [billNumber, setBillNumber] = useState("—");
  const [materialMargin, setMaterialMargin] = useState("");
  const debouncedMargin = useDebounce(materialMargin, 300);
  const [includeTax, setIncludeTax] = useState(false);
  const [rows, setRows] = useState<LineItemDraft[]>([newRow()]);

  // ── MI slip state ─────────────────────────────────────────────────────────
  const [miSlipsMeta, setMiSlipsMeta] = useState<MISlipMeta[]>([]);
  const [miSlipsItems, setMiSlipsItems] = useState<MISlipWithItems[]>([]);
  const [selectedSlipIds, setSelectedSlipIds] = useState<Set<string>>(new Set());
  const [miLoading, setMiLoading] = useState(false);
  const [linkedSlips, setLinkedSlips] = useState<MISlipMeta[]>([]);

  // ── Insurance state ───────────────────────────────────────────────────────
  const [insuranceBillId, setInsuranceBillId] = useState<string | null>(null);
  const [insuranceBillStatus, setInsuranceBillStatus] = useState<"Draft" | "Finalized" | null>(null);
  const [insuranceBill, setInsuranceBill] = useState<InsuranceBillWithItems | null>(null);

  // ── Dialog state ──────────────────────────────────────────────────────────
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // ── Derived state ─────────────────────────────────────────────────────────
  const totals = calcRowTotals(rows);
  const netAmount = totals.grand;
  const invoiceStatus = currentInvoice?.status ?? null;
  const isDraft = invoiceStatus === "Draft";
  const isFinalized = invoiceStatus === "Finalized";
  const hasInsurance = insuranceBillId !== null;

  // ── Auto-load on mount (deep link) ────────────────────────────────────────
  useEffect(() => {
    if (initialSelectedId) {
      void loadInvoice(initialSelectedId);
    } else {
      setTimeout(() => identifierRef.current?.focus(), 100);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── FY change: refresh dropdown ───────────────────────────────────────────
  useEffect(() => {
    if (activeFY === loadedFY) return;
    setLoadedFY(activeFY);
    getInvoicesForDropdown(activeFY)
      .then(setDropdownItems)
      .catch(() => toast.error("Failed to refresh invoice list."));
    // Dirty-check: if user has unsaved changes, warn
    if (isDirty) {
      toast.warning("Financial year changed. Unsaved changes may be lost.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFY]);

  // ── Margin recalculation (debounced) ──────────────────────────────────────
  useEffect(() => {
    if (rows.length === 0) return;
    const marginFactor = 1 + parseFloat(debouncedMargin || "0") / 100;
    setRows((prev) =>
      prev.map((row) => {
        const base = parseFloat(row.baseRate || row.rate || "0");
        const newRate = (base * marginFactor).toFixed(4);
        const qty = parseFloat(row.qty || "0");
        const taxPct = parseFloat(row.tax_percentage || "0");
        const newAmount = (parseFloat(newRate) * qty).toFixed(2);
        const amt = parseFloat(newAmount);
        let cgst = "0.00", sgst = "0.00", igst = "0.00";
        if (row.gst_type === "CGST_SGST") {
          const half = ((amt * taxPct) / 100 / 2).toFixed(2);
          cgst = half; sgst = half;
        } else if (row.gst_type === "IGST") {
          igst = ((amt * taxPct) / 100).toFixed(2);
        }
        return { ...row, rate: newRate, amount: newAmount, cgst_amount: cgst, sgst_amount: sgst, igst_amount: igst };
      })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedMargin]);

  // ── Load an invoice by ID ─────────────────────────────────────────────────
  async function loadInvoice(id: string) {
    setIsNewMode(false);
    setIsLoading(true);
    setActiveView("invoice");
    try {
      const inv = await getInvoiceById(id);
      if (!inv) throw new Error("Invoice not found.");
      setCurrentInvoice(inv);
      setCurrentInvoiceId(id);

      // Populate form
      setVehicleId(inv.vehicle_id);
      setSelectedVehicle(vehicles.find((v) => v.id === inv.vehicle_id) ?? null);
      setGstType(inv.items[0]?.gst_type ?? determineGstType(inv.customer_gstin, inv.customer_state));
      setBillDate(toISODate(inv.bill_date));
      setBillNumber(inv.bill_number);
      setMaterialMargin(inv.material_margin ?? "");
      setIncludeTax(inv.include_tax ?? false);
      setRows(inv.items.length ? itemsFromInvoice(inv.items, inv.material_margin ?? "0") : [newRow()]);
      setIsDirty(false);

      // Load insurance bill + MI data in parallel
      const [insuranceBillData, linkedSlipsData, miMeta, miItems] = await Promise.all([
        getInsuranceBillByInvoiceId(id),
        getLinkedSlipsForInvoice(id),
        getIssuedMIsForVehicle(inv.vehicle_id, id),
        getAllIssuedMIItemsForVehicle(inv.vehicle_id, id),
      ]);

      // Insurance
      if (insuranceBillData) {
        setInsuranceBillId(insuranceBillData.header.id);
        setInsuranceBillStatus(insuranceBillData.header.status as "Draft" | "Finalized");
        setInsuranceBill(insuranceBillData);
      } else {
        setInsuranceBillId(null);
        setInsuranceBillStatus(null);
        setInsuranceBill(null);
      }

      // Linked slips (read-only list for finalized invoice)
      setLinkedSlips(linkedSlipsData);

      // MI checklist (for Draft invoice editing)
      setMiSlipsMeta(miMeta);
      setMiSlipsItems(miItems);
      // Don't auto-check — items already loaded from DB
      setSelectedSlipIds(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load invoice.");
    } finally {
      setIsLoading(false);
    }
  }

  // ── Rebuild rows from slip selections ─────────────────────────────────────
  const rebuildRowsFromSlips = useCallback(
    (slipItems: MISlipWithItems[], checkedIds: Set<string>, existingRows: LineItemDraft[], currentGstType: string) => {
      const manualRows = existingRows.filter((r) => !r._slip_id);
      const slipRows = slipItems
        .filter((s) => checkedIds.has(s.slip_id))
        .flatMap((s) =>
          s.items.map((item) => ({
            _key: crypto.randomUUID(),
            _slip_id: s.slip_id,
            material_id: item.material_id,
            material_name: item.material_name,
            material_no: item.material_no,
            hsn_code: item.hsn_code ?? "",
            supplier_id: "",
            supplier_name: "",
            gst_type: currentGstType,
            qty: item.qty,
            unit_id: item.unit_id ?? "",
            unit_name: item.unit_name ?? "",
            rate: item.rate,
            baseRate: item.rate,
            tax_percentage: item.tax_percentage,
            cgst_amount: item.cgst_amount,
            sgst_amount: item.sgst_amount,
            igst_amount: item.igst_amount,
            amount: item.amount,
            rateBlank: false,
            zeroRateConfirmed: parseFloat(item.rate) === 0,
            contractor_id: "",
            contractor_name: "",
            affects_inventory: true,
          }))
        );
      const combined = [...mergeSlipRows(slipRows), ...manualRows];
      return combined.length ? combined : [newRow()];
    },
    []
  );

  // ── Vehicle selection ─────────────────────────────────────────────────────
  async function handleVehicleChange(vid: string) {
    const v = vehicles.find((x) => x.id === vid);
    setVehicleId(vid);
    setSelectedVehicle(v ?? null);
    setMiSlipsMeta([]);
    setMiSlipsItems([]);
    setSelectedSlipIds(new Set());
    setRows([newRow()]);
    setIsDirty(true);

    if (!v) return;

    const newGst = determineGstType(v.customer_gstin, v.customer_state);
    setGstType(newGst);

    setMiLoading(true);
    try {
      const [slipsMeta, slipsWithItems] = await Promise.all([
        getIssuedMIsForVehicle(vid, currentInvoiceId ?? undefined),
        getAllIssuedMIItemsForVehicle(vid, currentInvoiceId ?? undefined),
      ]);
      setMiSlipsMeta(slipsMeta);
      setMiSlipsItems(slipsWithItems);

      if (slipsWithItems.length > 0) {
        const allIds = new Set(slipsWithItems.map((s) => s.slip_id));
        setSelectedSlipIds(allIds);
        const populated = mergeSlipRows(
          slipsWithItems.flatMap((s) =>
            s.items.map((item) => ({
              _key: crypto.randomUUID(),
              _slip_id: s.slip_id,
              material_id: item.material_id,
              material_name: item.material_name,
              material_no: item.material_no,
              hsn_code: item.hsn_code ?? "",
              supplier_id: "", supplier_name: "",
              gst_type: newGst,
              qty: item.qty,
              unit_id: item.unit_id ?? "", unit_name: item.unit_name ?? "",
              rate: item.rate, baseRate: item.rate,
              tax_percentage: item.tax_percentage,
              cgst_amount: item.cgst_amount,
              sgst_amount: item.sgst_amount,
              igst_amount: item.igst_amount,
              amount: item.amount,
              rateBlank: false,
              zeroRateConfirmed: parseFloat(item.rate) === 0,
              contractor_id: "", contractor_name: "",
              affects_inventory: true,
            }))
          )
        );
        setRows(populated.length ? populated : [newRow()]);
        toast.info(`Auto-populated ${populated.length} item${populated.length !== 1 ? "s" : ""} from ${slipsWithItems.length} slip${slipsWithItems.length !== 1 ? "s" : ""}.`);
      }
    } catch {
      toast.error("Failed to load issue slips.");
    } finally {
      setMiLoading(false);
    }
  }

  function handleSlipToggle(slipId: string, checked: boolean) {
    setSelectedSlipIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(slipId); else next.delete(slipId);
      setRows((currentRows) => rebuildRowsFromSlips(miSlipsItems, next, currentRows, gstType));
      return next;
    });
    setIsDirty(true);
  }

  // ── Build payload ─────────────────────────────────────────────────────────
  function buildPayload() {
    const filledRows = rows.filter((r) => r.material_id);
    return {
      vehicle_id: vehicleId,
      slip_ids: Array.from(selectedSlipIds),
      bill_date: billDate,
      inv_prefix: "",
      financial_year: activeFY,
      tax_percentage: "0",
      material_margin: materialMargin || "0",
      net_amount: netAmount.toFixed(2),
      include_tax: includeTax,
      items: filledRows.map((r) => ({
        material_id: r.material_id,
        hsn_code: r.hsn_code,
        qty: r.qty,
        unit_id: r.unit_id,
        rate: r.rate || "0",
        rate_blank: r.rateBlank,
        zero_rate_confirmed: r.zeroRateConfirmed,
        tax_percentage: r.tax_percentage,
        cgst_amount: r.cgst_amount,
        sgst_amount: r.sgst_amount,
        igst_amount: r.igst_amount,
        amount: r.amount,
        gst_type: r.gst_type,
      })),
    };
  }

  // ── Dirty-check gate ──────────────────────────────────────────────────────
  function guardDirty(action: () => void) {
    if (isDirty) {
      setPendingAction(() => action);
      setDiscardDialogOpen(true);
    } else {
      action();
    }
  }

  // ── New ───────────────────────────────────────────────────────────────────
  function handleNew() {
    guardDirty(() => {
      setCurrentInvoiceId(null);
      setCurrentInvoice(null);
      setVehicleId("");
      setSelectedVehicle(null);
      setGstType("CGST_SGST");
      setBillDate(new Date().toISOString().slice(0, 10));
      setBillNumber("—");
      setMaterialMargin("");
      setIncludeTax(false);
      setRows([newRow()]);
      setMiSlipsMeta([]);
      setMiSlipsItems([]);
      setSelectedSlipIds(new Set());
      setLinkedSlips([]);
      setInsuranceBillId(null);
      setInsuranceBillStatus(null);
      setInsuranceBill(null);
      setActiveView("invoice");
      setIsDirty(false);
      setIsNewMode(true);
      // Peek next bill number
      peekNextBillNumber(null, activeFY).then(setBillNumber).catch(() => setBillNumber("—"));
      setTimeout(() => identifierRef.current?.focus(), 100);
    });
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!isDateInFY(billDate, activeFY)) {
      toast.error(`Bill date is outside FY ${activeFY} (1 Apr – 31 Mar).`);
      return;
    }
    setIsSaving(true);
    try {
      const payload = buildPayload();
      if (currentInvoiceId) {
        await updateInvoice(currentInvoiceId, payload);
        toast.success("Invoice saved.");
        // Refresh current invoice data
        const updated = await getInvoiceById(currentInvoiceId);
        if (!updated) throw new Error("Failed to reload invoice.");
        setCurrentInvoice(updated);
        // Update dropdown
        setDropdownItems((prev) =>
          prev.map((d) => d.id === currentInvoiceId ? { ...d, netAmount: updated.net_amount } : d)
        );
      } else {
        const newId = await createInvoice(payload);
        const created = await getInvoiceById(newId);
        if (!created) throw new Error("Failed to reload created invoice.");
        setCurrentInvoiceId(newId);
        setCurrentInvoice(created);
        setIsNewMode(false);
        setBillNumber(created.bill_number);
        toast.success(`${created.bill_number} created.`);
        // Refresh dropdown
        const newDropdown = await getInvoicesForDropdown(activeFY);
        setDropdownItems(newDropdown);
      }
      setIsDirty(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save invoice.");
    } finally {
      setIsSaving(false);
    }
  }

  // ── Finalize ──────────────────────────────────────────────────────────────
  async function handleFinalize() {
    if (!isDateInFY(billDate, activeFY)) {
      toast.error(`Bill date is outside FY ${activeFY} (1 Apr – 31 Mar).`);
      setShowFinalizeDialog(false);
      return;
    }
    setIsSaving(true);
    try {
      const payload = buildPayload();
      let id = currentInvoiceId;
      if (id) {
        await updateInvoice(id, payload);
      } else {
        id = await createInvoice(payload);
      }
      await finalizeInvoice(id);
      const updated = await getInvoiceById(id);
      if (!updated) throw new Error("Failed to reload finalized invoice.");
      setCurrentInvoiceId(id);
      setCurrentInvoice(updated);
      setBillNumber(updated.bill_number);
      setRows(itemsFromInvoice(updated.items, updated.material_margin ?? "0"));
      setIsDirty(false);
      toast.success(`${updated.bill_number} finalized.`);
      const newDropdown = await getInvoicesForDropdown(activeFY);
      setDropdownItems(newDropdown);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to finalize invoice.");
    } finally {
      setIsSaving(false);
      setShowFinalizeDialog(false);
    }
  }

  // ── Revert invoice to Draft ───────────────────────────────────────────────
  async function handleRevertToDraft() {
    if (!currentInvoiceId) return;
    setIsSaving(true);
    try {
      await revertInvoiceToDraft(currentInvoiceId);
      const updated = await getInvoiceById(currentInvoiceId);
      if (!updated) throw new Error("Failed to reload invoice.");
      setCurrentInvoice(updated);
      setIsDirty(false);
      toast.success("Invoice reverted to Draft.");
      const newDropdown = await getInvoicesForDropdown(activeFY);
      setDropdownItems(newDropdown);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to revert.");
    } finally {
      setIsSaving(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!currentInvoiceId) return;
    setIsSaving(true);
    try {
      await deleteInvoice(currentInvoiceId);
      toast.success("Invoice deleted.");
      const newDropdown = await getInvoicesForDropdown(activeFY);
      setDropdownItems(newDropdown);
      handleNew();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete invoice.");
    } finally {
      setIsSaving(false);
      setShowDeleteDialog(false);
    }
  }

  // ── Cancel invoice ────────────────────────────────────────────────────────
  async function handleCancelInvoice() {
    if (!currentInvoiceId) return;
    setIsSaving(true);
    try {
      await cancelInvoice(currentInvoiceId);
      toast.success("Invoice cancelled.");
      const newDropdown = await getInvoicesForDropdown(activeFY);
      setDropdownItems(newDropdown);
      // Reload to show CANCELLED status
      await loadInvoice(currentInvoiceId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel invoice.");
    } finally {
      setIsSaving(false);
      setShowCancelDialog(false);
    }
  }

  // ── Create insurance bill ─────────────────────────────────────────────────
  async function handleCreateInsuranceBill() {
    if (!currentInvoiceId) return;
    setIsSaving(true);
    try {
      await createInsuranceBill(currentInvoiceId);
      const bill = await getInsuranceBillByInvoiceId(currentInvoiceId);
      if (bill) {
        setInsuranceBillId(bill.header.id);
        setInsuranceBillStatus(bill.header.status as "Draft" | "Finalized");
        setInsuranceBill(bill);
        setActiveView("insurance");
      }
      toast.success("Insurance bill created.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create insurance bill.");
    } finally {
      setIsSaving(false);
    }
  }

  // ── Insurance view refresh (called after insurance form saves/finalizes/reverts) ──
  async function handleInsuranceSaved(newStatus: string) {
    if (!currentInvoiceId) return;
    const bill = await getInsuranceBillByInvoiceId(currentInvoiceId);
    if (bill) {
      setInsuranceBillId(bill.header.id);
      setInsuranceBillStatus(newStatus as "Draft" | "Finalized");
      setInsuranceBill(bill);
    }
  }

  async function handleInsuranceDeleted() {
    setInsuranceBillId(null);
    setInsuranceBillStatus(null);
    setInsuranceBill(null);
    setActiveView("invoice");
  }

  // ── Hotkeys ───────────────────────────────────────────────────────────────
  useHotkeys("ctrl+s", (e) => { e.preventDefault(); if (activeView === "invoice") void handleSave(); }, { enableOnFormTags: true });
  useHotkeys("alt+n", (e) => { e.preventDefault(); handleNew(); }, { enableOnFormTags: true });
  useHotkeys("escape", () => { if (activeView === "insurance") setActiveView("invoice"); }, { enableOnFormTags: true });

  // ── Dropdown options ──────────────────────────────────────────────────────
  const identifierOptions = dropdownItems.map((d) => ({
    value: d.id,
    label: `${d.billNumber}${d.vehicleName ? ` — ${d.vehicleName}` : ""} (${d.status})`,
  }));

  const vehicleOptions = vehicles.map((v) => ({
    value: v.id,
    label: `${v.job_ref_no}${v.vehicle_name ? ` — ${v.vehicle_name}` : ""}${v.customer_name ? ` — ${v.customer_name}` : ""}`,
  }));

  const isCancelled = invoiceStatus === "CANCELLED";
  const isEditable = !isFinalized && !isCancelled;

  // ── Insurance view ────────────────────────────────────────────────────────
  if (activeView === "insurance" && insuranceBill && currentInvoice) {
    return (
      <InsuranceForm
        invoiceId={currentInvoice.id}
        insuranceBillId={insuranceBill.header.id}
        parentInvoice={{
          billNumber: currentInvoice.bill_number,
          vehicleName: currentInvoice.vehicle_name,
          customerName: currentInvoice.customer_name,
          gstin: currentInvoice.customer_gstin,
          state: currentInvoice.customer_state,
          gstType: gstType,
        }}
        initialInsuranceBill={insuranceBill}
        onBack={() => setActiveView("invoice")}
        onSaved={handleInsuranceSaved}
        onDeleted={handleInsuranceDeleted}
        companySetting={companySetting}
        materials={materials}
        units={units}
        fy={activeFY}
      />
    );
  }

  // ── Invoice view ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Page header + identifier */}
      <div className="px-6 pt-5 pb-3 flex items-center gap-3">
        <h1 className="text-lg font-semibold text-slate-800 shrink-0">Invoices</h1>
        <div className="w-72">
          <Combobox
            options={identifierOptions}
            value={currentInvoiceId ?? ""}
            onChange={(id) => { if (id) void loadInvoice(id); }}
            placeholder="Search bill number…"
            searchPlaceholder="Search by bill no or vehicle…"
            openOnArrowDown
          />
        </div>
        {isLoading && <span className="text-sm text-slate-400 animate-pulse">Loading…</span>}
      </div>

      {/* Blank state */}
      {!currentInvoiceId && !isLoading && !isNewMode && (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-4">
          <p className="text-sm">Search for a bill number above, or create a new invoice.</p>
          <Button size="sm" onClick={handleNew} variant="outline">New Invoice</Button>
        </div>
      )}

      {/* Form body */}
      {(currentInvoiceId || isLoading || isNewMode) && (
        <>
          {/* Amber warning: insurance is finalized and user has edits */}
          {isFinalized && isDirty && insuranceBillStatus === "Finalized" && (
            <div className="mx-6 mb-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded px-4 py-3 text-sm text-amber-800">
              <span className="mt-0.5">⚠</span>
              <span>
                This invoice has a <strong>Finalized</strong> insurance bill. Edits to the customer invoice will not automatically update the insurance bill — revert the insurance bill to Draft to make matching changes.
              </span>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-6 pb-32">
            {/* Header card */}
            <div className="bg-white border border-slate-200 rounded-lg p-5 mb-4 space-y-4">
              {/* Row 1: Bill No / Bill Date / FY */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Bill No.</label>
                  <div className="h-9 px-3 flex items-center bg-slate-50 rounded border border-slate-200 font-mono text-sm text-slate-700">
                    {billNumber}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Bill Date</label>
                  {!isEditable ? (
                    <div className="h-9 px-3 flex items-center text-sm text-slate-700">
                      {new Date(billDate).toLocaleDateString("en-IN")}
                    </div>
                  ) : (
                    <Input
                      type="date"
                      value={billDate}
                      onChange={(e) => { setBillDate(e.target.value); setIsDirty(true); }}
                      className="h-9 text-sm"
                    />
                  )}
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Status</label>
                  <div className={`h-9 px-3 flex items-center rounded border text-sm font-medium ${
                    isDraft ? "bg-slate-50 border-slate-200 text-slate-600" :
                    isFinalized ? "bg-blue-50 border-blue-200 text-blue-700" :
                    isCancelled ? "bg-red-50 border-red-200 text-red-700" :
                    "bg-slate-50 border-slate-200 text-slate-600"
                  }`}>
                    {invoiceStatus ?? "New"}
                  </div>
                </div>
              </div>

              {/* Row 2: Vehicle */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Vehicle / Job</label>
                  {!isEditable ? (
                    <div className="h-9 px-3 flex items-center text-sm text-slate-700">
                      {currentInvoice?.job_ref_no ?? ""}{currentInvoice?.vehicle_name ? ` — ${currentInvoice.vehicle_name}` : ""}
                    </div>
                  ) : (
                    <Combobox
                      options={vehicleOptions}
                      value={vehicleId}
                      onChange={handleVehicleChange}
                      placeholder="Select vehicle / job…"
                      searchPlaceholder="Search by job no or vehicle…"
                    />
                  )}
                </div>
                <div className="flex items-end pb-1 gap-3">
                  {selectedVehicle && (
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                      gstType === "CGST_SGST"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-blue-50 text-blue-700 border border-blue-200"
                    }`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {gstType === "CGST_SGST" ? "CGST + SGST" : "IGST"}
                    </span>
                  )}
                  {/* Insurance status badge */}
                  {isFinalized && (
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
                      !hasInsurance ? "bg-slate-50 text-slate-500 border-slate-200" :
                      insuranceBillStatus === "Finalized" ? "bg-purple-50 text-purple-700 border-purple-200" :
                      "bg-amber-50 text-amber-700 border-amber-200"
                    }`}>
                      {!hasInsurance ? "No Insurance Bill" :
                       insuranceBillStatus === "Finalized" ? "Insurance ✓ Finalized" :
                       "Insurance (Draft)"}
                    </span>
                  )}
                </div>
              </div>

              {/* Customer info */}
              {(selectedVehicle?.customer_name || currentInvoice?.customer_name) && (
                <div className="border-t border-slate-100 pt-3 grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-xs text-slate-400 block">Customer</span>
                    <span className="text-slate-700">
                      {selectedVehicle?.customer_name ?? currentInvoice?.customer_name}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">GSTIN</span>
                    <span className="font-mono text-slate-600">
                      {selectedVehicle?.customer_gstin ?? currentInvoice?.customer_gstin ?? "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">State</span>
                    <span className="text-slate-600">
                      {selectedVehicle?.customer_state ?? currentInvoice?.customer_state ?? "—"}
                    </span>
                  </div>
                </div>
              )}

              {/* Linked slips — read-only (Finalized / Cancelled) */}
              {!isEditable && linkedSlips.length > 0 && (
                <div>
                  <label className="text-xs text-slate-500 block mb-1.5">Sourced from Issue Slips</label>
                  <div className="border border-slate-200 rounded-md divide-y divide-slate-100">
                    {linkedSlips.map((slip) => (
                      <div key={slip.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <input type="checkbox" checked readOnly disabled className="w-4 h-4 accent-slate-700 flex-shrink-0 opacity-60" />
                        <span className="font-mono text-slate-700 text-xs">MI-{String(slip.slip_number).padStart(4, "0")}</span>
                        <span className="text-slate-500 text-xs">{new Date(slip.issue_date).toLocaleDateString("en-IN")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* MI slip checklist — edit / new mode */}
              {isEditable && vehicleId && (
                <div>
                  <label className="text-xs text-slate-500 block mb-1.5">Auto-fill from Issue Slips</label>
                  {miLoading ? (
                    <div className="text-xs text-slate-400 px-1">Loading issue slips…</div>
                  ) : miSlipsMeta.length === 0 ? (
                    <div className="text-xs text-slate-400 px-1 py-2 bg-slate-50 rounded border border-slate-200">
                      No confirmed issue slips for this vehicle. Enter items manually below.
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-md divide-y divide-slate-100 max-h-40 overflow-y-auto">
                      {miSlipsMeta.map((slip) => {
                        const checked = selectedSlipIds.has(slip.id);
                        return (
                          <label key={slip.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 text-sm">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => handleSlipToggle(slip.id, e.target.checked)}
                              className="w-4 h-4 accent-slate-700 flex-shrink-0"
                            />
                            <span className="font-mono text-slate-700 text-xs">MI-{String(slip.slip_number).padStart(4, "0")}</span>
                            <span className="text-slate-500 text-xs">{new Date(slip.issue_date).toLocaleDateString("en-IN")}</span>
                            <span className="text-slate-400 text-xs ml-auto">{slip.item_count} item{slip.item_count !== 1 ? "s" : ""}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {selectedSlipIds.size > 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      ⚠ Items from {selectedSlipIds.size} slip{selectedSlipIds.size !== 1 ? "s" : ""} auto-populated. You can add, edit, or remove rows.
                    </p>
                  )}
                </div>
              )}

              {/* Material Margin + Include Tax */}
              <div className="grid grid-cols-3 gap-4 items-end">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Material Margin %</label>
                  {!isEditable ? (
                    <div className="h-9 px-3 flex items-center text-sm text-slate-700">{materialMargin || "—"}</div>
                  ) : (
                    <Input
                      type="number"
                      value={materialMargin}
                      onChange={(e) => { setMaterialMargin(e.target.value); setIsDirty(true); }}
                      className="h-9 text-sm"
                      min="0"
                      step="any"
                      placeholder="0"
                    />
                  )}
                </div>
                <div className="flex items-center gap-2 pb-1">
                  <input
                    type="checkbox"
                    id="include-tax"
                    checked={includeTax}
                    onChange={(e) => { setIncludeTax(e.target.checked); setIsDirty(true); }}
                    disabled={!isEditable}
                    className="w-4 h-4 accent-slate-700"
                  />
                  <label htmlFor="include-tax" className="text-sm text-slate-600 cursor-pointer select-none">
                    Show Tax Columns
                  </label>
                </div>
              </div>
            </div>

            {/* Line items grid */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-4">
              <div className="px-4 py-2.5 border-b border-slate-100">
                <h2 className="text-sm font-medium text-slate-700">Line Items</h2>
              </div>
              <TransactionGrid
                rows={rows}
                onChange={(r) => { setRows(r); setIsDirty(true); }}
                suppliers={[]}
                materials={materials}
                taxRates={taxRates}
                units={units}
                readOnly={!isEditable}
                mode="invoice"
                gstType={gstType}
                showTaxColumns={includeTax}
              />
            </div>
          </div>

          {/* Sticky totals + action bar */}
          <div className="fixed bottom-0 left-64 right-0 z-30 bg-white border-t border-slate-200 shadow-lg">
            <div className="flex items-center gap-6 px-6 py-2 border-b border-slate-100 text-sm">
              <span className="text-slate-500">
                Taxable: <strong className="text-slate-800">₹{fmt2(totals.subtotal)}</strong>
              </span>
              {totals.cgst > 0 && (
                <span className="text-slate-500">
                  CGST: <strong className="text-slate-800">₹{fmt2(totals.cgst)}</strong>
                </span>
              )}
              {totals.sgst > 0 && (
                <span className="text-slate-500">
                  SGST: <strong className="text-slate-800">₹{fmt2(totals.sgst)}</strong>
                </span>
              )}
              {totals.igst > 0 && (
                <span className="text-slate-500">
                  IGST: <strong className="text-slate-800">₹{fmt2(totals.igst)}</strong>
                </span>
              )}
              <span className="ml-auto text-base font-semibold text-slate-900">
                Net: ₹{fmt2(netAmount)}
              </span>
            </div>

            <div className="flex items-center gap-2 px-6 py-3">
              {/* Left: destructive actions */}
              <div className="flex gap-2">
                {isDraft && currentInvoiceId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => setShowDeleteDialog(true)}
                    disabled={isSaving}
                  >
                    Delete
                  </Button>
                )}
                {currentInvoiceId && !isCancelled && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-400 hover:text-red-600 hover:bg-red-50"
                    onClick={() => setShowCancelDialog(true)}
                    disabled={isSaving}
                  >
                    Cancel Bill
                  </Button>
                )}
              </div>

              {/* Right: primary actions */}
              <div className="ml-auto flex gap-2">
                <Button variant="outline" size="sm" onClick={handleNew} disabled={isSaving}>
                  New
                </Button>

                {!isCancelled && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving…" : "Save"}
                  </Button>
                )}

                {isDraft && (
                  <Button
                    size="sm"
                    onClick={() => setShowFinalizeDialog(true)}
                    disabled={isSaving}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    Finalize
                  </Button>
                )}

                {isFinalized && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRevertToDraft}
                    disabled={isSaving}
                  >
                    Revert to Draft
                  </Button>
                )}

                {/* Print customer invoice */}
                {currentInvoice && currentInvoice.items.length > 0 && (
                  <PrintButton
                    label="Print Customer"
                    getDocument={() => (
                      <CustomerInvoiceDocument
                        groups={[buildPdfRows(currentInvoice)]}
                        fy={activeFY}
                        companySetting={companySetting}
                      />
                    )}
                  />
                )}

                {/* Insurance bill actions */}
                {isFinalized && !hasInsurance && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCreateInsuranceBill}
                    disabled={isSaving}
                  >
                    Create Insurance Bill
                  </Button>
                )}

                {isFinalized && hasInsurance && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setActiveView("insurance")}
                    >
                      {insuranceBillStatus === "Finalized" ? "View Insurance Bill" : "Edit Insurance Bill"}
                    </Button>
                    {insuranceBill && currentInvoice && (
                      <PrintButton
                        label="Print Insurance"
                        getDocument={() => (
                          <InsuranceInvoiceDocument
                            groups={[buildPdfRows(currentInvoice)]}
                            fy={activeFY}
                            companySetting={companySetting}
                          />
                        )}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Dialogs */}
      <ConfirmDialog
        open={showFinalizeDialog}
        onOpenChange={setShowFinalizeDialog}
        title={`Finalize ${billNumber}?`}
        description={`Mark this invoice as Finalized (Net: ₹${fmt2(netAmount)})? You can revert to Draft if needed.`}
        confirmLabel="Finalize Invoice"
        onConfirm={handleFinalize}
      />

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title={`Delete ${billNumber}?`}
        description="This will permanently delete the invoice and all its line items. This cannot be undone."
        confirmLabel="Delete Invoice"
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={showCancelDialog}
        onOpenChange={setShowCancelDialog}
        title={`Cancel ${billNumber}?`}
        description="This will mark the invoice as CANCELLED. Any linked Draft insurance bill will also be deleted. Finalized insurance bills must be reverted to Draft first."
        confirmLabel="Cancel Invoice"
        onConfirm={handleCancelInvoice}
      />

      <ConfirmDialog
        open={discardDialogOpen}
        onOpenChange={setDiscardDialogOpen}
        title="Discard unsaved changes?"
        description="You have unsaved changes that will be lost."
        confirmLabel="Discard Changes"
        onConfirm={() => {
          setDiscardDialogOpen(false);
          if (pendingAction) { pendingAction(); setPendingAction(null); }
        }}
      />
    </div>
  );
}
