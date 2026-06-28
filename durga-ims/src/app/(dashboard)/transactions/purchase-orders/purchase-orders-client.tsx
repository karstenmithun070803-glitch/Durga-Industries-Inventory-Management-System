"use client";

import { useState, useEffect, useTransition, useRef, useReducer, useCallback } from "react";
import { useFY } from "@/lib/financial-year";
import { isDateInFY } from "@/lib/fy";
import {
  getPurchaseOrderById,
  getPurchaseOrdersByIds,
  getPOsForDropdown,
  createPurchaseOrder,
  updatePurchaseOrder,
  updateReceivedPurchaseOrder,
  receivePurchaseOrder,
  deletePurchaseOrder,
  revertPOToDraft,
} from "@/lib/actions/purchase-orders.actions";
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
import { PrintButton } from "@/components/pdf/print-button";
import { useHotkeys } from "react-hotkeys-hook";
import { useFormSectionNav } from "@/hooks/use-form-section-nav";
import { toast } from "sonner";
import { formatCode } from "@/lib/utils";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PurchaseOrderWithDetails, LineItemDraft } from "@/types";
import type { CompanySetting } from "@/lib/actions/settings.actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DropdownItem {
  id: string;
  poNumber: number;
  supplierName: string | null;
  date: Date | string;
  status: string;
}

interface SupplierOption {
  id: string;
  code_no: number;
  name: string;
  gstin: string | null;
  state: string | null;
  address: string | null;
}

interface MaterialOption {
  id: string;
  material_no: number;
  name: string;
  hsn_code: string | null;
  tax_rate_id: string | null;
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

// PDF row shape expected by PORegisterDocument
type PDFItemRow = {
  id: string;
  po_number: number;
  po_date: Date | string;
  status: string;
  affects_stock: boolean;
  supplier_bill_no: string | null;
  supplier_bill_date: string | null;
  item_id: string | null;
  material_id: string | null;
  material_name: string | null;
  material_no: number | null;
  supplier_id: string | null;
  supplier_name: string | null;
  qty: string | null;
  unit_name: string | null;
  rate: string | null;
  tax_percentage: string | null;
  cgst_amount: string | null;
  sgst_amount: string | null;
  igst_amount: string | null;
  amount: string | null;
  gst_type: string | null;
};

interface Props {
  dropdownItems: DropdownItem[];
  suppliers: SupplierOption[];
  materials: MaterialOption[];
  taxRates: TaxRateOption[];
  units: UnitOption[];
  initialSelectedId?: string;
  initialFY: string;
  companySetting?: CompanySetting;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toISODate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().split("T")[0];
}

function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatAmount(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcAllTotals(rows: LineItemDraft[]) {
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

function poItemsToRows(po: PurchaseOrderWithDetails): LineItemDraft[] {
  if (po.items.length === 0) return [newRow()];
  return po.items.map((item) => ({
    _key: crypto.randomUUID(),
    material_id: item.material_id,
    material_name: item.material_name,
    material_no: item.material_no ?? 0,
    hsn_code: item.hsn_code ?? "",
    supplier_id: item.supplier_id ?? "",
    supplier_name: item.supplier_name ?? "",
    gst_type: item.gst_type ?? "IGST",
    qty: item.qty,
    unit_id: item.unit_id ?? "",
    unit_name: item.unit_name ?? "",
    rate: item.rate,
    tax_percentage: item.tax_percentage,
    cgst_amount: item.cgst_amount,
    sgst_amount: item.sgst_amount,
    igst_amount: item.igst_amount,
    amount: item.amount,
    rateBlank: false,
    zeroRateConfirmed: true,
    contractor_id: "",
    contractor_name: "",
    affects_inventory: true,
  }));
}

function buildItemsPayload(rows: LineItemDraft[]) {
  return rows.map((r) => ({
    material_id: r.material_id,
    supplier_id: r.supplier_id || null,
    qty: r.qty,
    unit_id: r.unit_id,
    rate: r.rate || "0",
    rate_blank: r.rateBlank,
    zero_rate_confirmed: r.zeroRateConfirmed,
    tax_percentage: r.tax_percentage || "0",
    cgst_amount: r.cgst_amount,
    sgst_amount: r.sgst_amount,
    igst_amount: r.igst_amount,
    amount: r.amount,
    gst_type: r.gst_type || null,
  }));
}

function groupBySupplier(rows: LineItemDraft[]): Map<string, LineItemDraft[]> {
  const map = new Map<string, LineItemDraft[]>();
  for (const row of rows) {
    const key = row.supplier_id || "__none__";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PurchaseOrdersClient({
  dropdownItems: initialDropdownItems,
  suppliers,
  materials,
  taxRates,
  units,
  initialSelectedId,
  initialFY,
  companySetting,
}: Props) {
  const { activeFY } = useFY();
  const [isPending, startTransition] = useTransition();

  // Dropdown state
  const [dropdownItems, setDropdownItems] = useState<DropdownItem[]>(initialDropdownItems);
  const [loadedFY, setLoadedFY] = useState(initialFY);

  // Loaded PO
  const [loadedPO, setLoadedPO] = useState<PurchaseOrderWithDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Form fields
  const [poDate, setPoDate] = useState("");
  const [affectsStock, setAffectsStock] = useState(true);
  const [supplierBillNo, setSupplierBillNo] = useState("");
  const [supplierBillDate, setSupplierBillDate] = useState("");
  const [rows, dispatch] = useReducer(rowsReducer, undefined, () => [newRow()]);
  const [isDirty, setIsDirty] = useState(false);
  const dispatchWithDirty = useCallback((action: RowAction) => {
    if (action.type !== "SET_ALL") setIsDirty(true);
    dispatch(action);
  }, [dispatch]);

  // Dialog state
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const [revertError, setRevertError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // Batch print range
  const [printByDate, setPrintByDate] = useState("");
  const [printFromId, setPrintFromId] = useState("");
  const [printToId, setPrintToId] = useState("");
  const [batchPOs, setBatchPOs] = useState<PurchaseOrderWithDetails[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);

  // Sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Filter state — both inputs always visible simultaneously
  const [filterSupplier, setFilterSupplier] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [isListOpen, setIsListOpen] = useState(false);

  // Auto-load on mount if deep-linked via ?id=
  useEffect(() => {
    if (initialSelectedId) {
      void loadPO(initialSelectedId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-fetch full PO data for batch print (date filter, range filter, or both as intersection)
  useEffect(() => {
    const dateActive  = !!printByDate;
    const rangeActive = !!(printFromId && printToId);

    if (!dateActive && !rangeActive) { setBatchPOs([]); return; }

    let targets = dropdownItems as DropdownItem[];

    if (dateActive) {
      targets = targets.filter((d) => toISODate(d.date) === printByDate);
    }

    if (rangeActive) {
      const from = dropdownItems.find((d) => d.id === printFromId)?.poNumber ?? 0;
      const to   = dropdownItems.find((d) => d.id === printToId)?.poNumber ?? 0;
      if (from && to) {
        const lo = Math.min(from, to), hi = Math.max(from, to);
        targets = targets.filter((d) => d.poNumber >= lo && d.poNumber <= hi);
      }
    }

    targets = [...targets].sort((a, b) => a.poNumber - b.poNumber);

    if (targets.length === 0) { setBatchPOs([]); setBatchLoading(false); return; }

    let cancelled = false;
    setBatchLoading(true);
    setBatchPOs([]);

    getPurchaseOrdersByIds(targets.map((d) => d.id))
      .then((results) => {
        if (!cancelled) setBatchPOs(results);
      })
      .finally(() => {
        if (!cancelled) setBatchLoading(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printByDate, printFromId, printToId]);

  // FY change: refresh dropdown + clear form + reset print state
  useEffect(() => {
    if (activeFY === loadedFY) return;
    getPOsForDropdown(activeFY).then((data) => {
      setDropdownItems(data as DropdownItem[]);
      setLoadedFY(activeFY);
      clearForm();
      setPrintByDate("");
      setPrintFromId("");
      setPrintToId("");
      setBatchPOs([]);
    });
  }, [activeFY, loadedFY]);

  // ---------------------------------------------------------------------------
  // Form helpers
  // ---------------------------------------------------------------------------

  const todayISO = new Date().toISOString().split("T")[0];

  function clearForm() {
    setLoadedPO(null);
    setPoDate(todayISO);
    setAffectsStock(true);
    setSupplierBillNo("");
    setSupplierBillDate("");
    dispatch({ type: "SET_ALL", rows: [newRow()] });
    setIsDirty(false);
  }

  function populateForm(po: PurchaseOrderWithDetails) {
    setLoadedPO(po);
    setPoDate(toISODate(po.po_date));
    setAffectsStock(po.affects_stock);
    setSupplierBillNo(po.supplier_bill_no ?? "");
    setSupplierBillDate(po.supplier_bill_date ? toISODate(po.supplier_bill_date) : "");
    dispatch({ type: "SET_ALL", rows: poItemsToRows(po) });
    setIsDirty(false);
  }

  async function loadPO(id: string) {
    setIsLoading(true);
    try {
      const po = await getPurchaseOrderById(id);
      if (po) {
        populateForm(po);
      } else {
        toast.error("Purchase order not found");
      }
    } catch {
      toast.error("Failed to load purchase order");
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshDropdown() {
    const data = await getPOsForDropdown(activeFY);
    setDropdownItems(data as DropdownItem[]);
  }

  function validate(): string | null {
    if (!poDate) return "Please enter a PO date.";
    if (!isDateInFY(poDate, activeFY)) return `PO date is outside FY ${activeFY} (1 Apr – 31 Mar).`;
    const filled = rows.filter((r) => r.material_id);
    if (filled.length === 0) return "Add at least one material.";
    const missingSupplier = filled.find((r) => !r.supplier_id);
    if (missingSupplier) return `Select a supplier for ${missingSupplier.material_name}.`;
    const zeroQty = filled.find((r) => !r.qty || parseFloat(r.qty) <= 0);
    if (zeroQty) return `Quantity must be greater than 0 for ${zeroQty.material_name}.`;
    return null;
  }

  function buildPayload(rowSet?: LineItemDraft[]) {
    const filled = (rowSet ?? rows).filter((r) => r.material_id);
    const { grand } = calcAllTotals(filled);
    return {
      po_date: poDate,
      financial_year: activeFY,
      total_amount: grand.toFixed(2),
      affects_stock: affectsStock,
      supplier_bill_no: supplierBillNo,
      supplier_bill_date: supplierBillDate,
      items: buildItemsPayload(filled),
    };
  }

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleSelect(id: string) {
    if (!id) { clearForm(); return; }
    if (isDirty) {
      setPendingAction(() => () => { setIsListOpen(false); void loadPO(id); });
      setDiscardDialogOpen(true);
      return;
    }
    setIsListOpen(false);
    void loadPO(id);
  }

  function handleNew() {
    const doNew = () => {
      clearForm();
      setFilterSupplier("");
      setFilterDate("");
      setIsListOpen(false);
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

    startTransition(async () => {
      try {
        if (!loadedPO) {
          // New PO — group by supplier, create one PO per supplier
          const filled = rows.filter((r) => r.material_id);
          const bySupplier = groupBySupplier(filled);
          let firstId: string | undefined;
          for (const [, supplierRows] of Array.from(bySupplier)) {
            const { grand } = calcAllTotals(supplierRows);
            const id = await createPurchaseOrder({
              po_date: poDate,
              financial_year: activeFY,
              total_amount: grand.toFixed(2),
              affects_stock: affectsStock,
              supplier_bill_no: supplierBillNo,
              supplier_bill_date: supplierBillDate,
              items: buildItemsPayload(supplierRows),
            });
            if (!firstId) firstId = id;
          }
          const count = bySupplier.size;
          toast.success(`${count} draft PO${count > 1 ? "s" : ""} created`);
          await refreshDropdown();
          clearForm();
        } else if (loadedPO.status === "Draft") {
          await updatePurchaseOrder(loadedPO.id, buildPayload());
          toast.success("Draft saved");
          const updated = await getPurchaseOrderById(loadedPO.id);
          if (updated) populateForm(updated);
          await refreshDropdown();
        } else {
          // Received — atomic reversal + reapply
          await updateReceivedPurchaseOrder(loadedPO.id, buildPayload());
          toast.success("Stock reversed and reapplied successfully");
          const updated = await getPurchaseOrderById(loadedPO.id);
          if (updated) populateForm(updated);
          await refreshDropdown();
        }
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  function handleMarkAsReceived() {
    const err = validate();
    if (err) { toast.error(err); return; }
    setReceiveDialogOpen(true);
  }

  function confirmReceive() {
    startTransition(async () => {
      try {
        if (!loadedPO) {
          // New → create all POs, then receive each
          const filled = rows.filter((r) => r.material_id);
          const bySupplier = groupBySupplier(filled);
          const poIds: string[] = [];
          for (const [, supplierRows] of Array.from(bySupplier)) {
            const { grand } = calcAllTotals(supplierRows);
            const id = await createPurchaseOrder({
              po_date: poDate,
              financial_year: activeFY,
              total_amount: grand.toFixed(2),
              affects_stock: affectsStock,
              supplier_bill_no: supplierBillNo,
              supplier_bill_date: supplierBillDate,
              items: buildItemsPayload(supplierRows),
            });
            poIds.push(id);
          }
          await Promise.all(poIds.map((id) => receivePurchaseOrder(id)));
          const count = bySupplier.size;
          const matCount = filled.length;
          toast.success(
            `${count} PO${count > 1 ? "s" : ""} created and received. Stock updated for ${matCount} material${matCount !== 1 ? "s" : ""}.`
          );
          await refreshDropdown();
          clearForm();
        } else {
          // Edit-draft: save then receive
          await updatePurchaseOrder(loadedPO.id, buildPayload());
          await receivePurchaseOrder(loadedPO.id);
          const matCount = rows.filter((r) => r.material_id).length;
          toast.success(
            `${formatCode("PO-", loadedPO.po_number, 4)} received. Stock updated for ${matCount} material${matCount !== 1 ? "s" : ""}.`
          );
          await refreshDropdown();
          const updated = await getPurchaseOrderById(loadedPO.id);
          if (updated) populateForm(updated);
        }
        setReceiveDialogOpen(false);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Receive failed");
        setReceiveDialogOpen(false);
      }
    });
  }

  function handleRevertToDraft() {
    setRevertError(null);
    setRevertDialogOpen(true);
  }

  function confirmRevert() {
    if (!loadedPO) return;
    startTransition(async () => {
      const result = await revertPOToDraft(loadedPO.id);
      if ("error" in result) {
        setRevertError(result.error);
        return;
      }
      toast.success(`${formatCode("PO-", loadedPO.po_number, 4)} reverted to Draft`);
      setRevertDialogOpen(false);
      await refreshDropdown();
      const updated = await getPurchaseOrderById(loadedPO.id);
      if (updated) populateForm(updated);
    });
  }

  function handleDelete() {
    setDeleteDialogOpen(true);
  }

  function confirmDelete() {
    if (!loadedPO) return;
    startTransition(async () => {
      try {
        await deletePurchaseOrder(loadedPO.id);
        toast.success("Purchase order deleted");
        await refreshDropdown();
        clearForm();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Delete failed");
      } finally {
        setDeleteDialogOpen(false);
      }
    });
  }

  function handleFilterSupplierChange(val: string) {
    if (val !== "") {
      setFilterSupplier(val);
      setIsListOpen(true);
      return;
    }
    if (loadedPO) {
      if (isDirty) {
        setPendingAction(() => () => setFilterSupplier(""));
        setDiscardDialogOpen(true);
        return;
      }
      clearForm();
      setFilterSupplier("");
      return;
    }
    setFilterSupplier("");
  }

  function handleCancel() {
    if (isDirty) {
      setPendingAction(() => () => {});
      setDiscardDialogOpen(true);
      return;
    }
    clearForm();
  }

  function confirmDiscard() {
    setDiscardDialogOpen(false);
    clearForm();
    pendingAction?.();
    setPendingAction(null);
  }

  // Hotkeys
  useHotkeys("ctrl+s", (e) => { e.preventDefault(); handleSave(); }, { enableOnFormTags: true });
  useHotkeys("alt+n", (e) => { e.preventDefault(); handleNew(); }, { enableOnFormTags: true });

  // ---------------------------------------------------------------------------
  // Computed
  // ---------------------------------------------------------------------------

  const { subtotal, cgst, sgst, igst, grand } = calcAllTotals(rows);
  const poStatus = loadedPO?.status ?? null;
  const filledRows = rows.filter((r) => r.material_id);
  const hasFormContent = loadedPO !== null || isDirty;

  // Combobox options for identifier dropdown
  const dropdownOptions = dropdownItems.map((item) => ({
    value: item.id,
    label: `${formatCode("PO-", item.poNumber, 4)} | ${item.supplierName ?? "Multi-supplier"} | ${formatDate(item.date)} [${item.status}]`,
    displayLabel: formatCode("PO-", item.poNumber, 4),
  }));

  // Batch print: filter POs in range by po_number

  // PDF adapter: convert loadedPO → flat rows for PORegisterDocument
  function buildPDFRows(): PDFItemRow[] {
    if (!loadedPO) return [];
    return loadedPO.items.map((item) => ({
      id: loadedPO.id,
      po_number: loadedPO.po_number,
      po_date: loadedPO.po_date,
      status: loadedPO.status,
      affects_stock: loadedPO.affects_stock,
      supplier_bill_no: loadedPO.supplier_bill_no ?? null,
      supplier_bill_date: loadedPO.supplier_bill_date ?? null,
      item_id: item.id,
      material_id: item.material_id,
      material_name: item.material_name,
      material_no: item.material_no ?? null,
      supplier_id: item.supplier_id ?? null,
      supplier_name: item.supplier_name ?? null,
      qty: item.qty,
      unit_name: item.unit_name ?? null,
      rate: item.rate,
      tax_percentage: item.tax_percentage,
      cgst_amount: item.cgst_amount,
      sgst_amount: item.sgst_amount,
      igst_amount: item.igst_amount,
      amount: item.amount,
      gst_type: item.gst_type ?? null,
    }));
  }

  // Batch PDF rows (all POs in range) — uses pre-fetched batchPOs with full item data
  function buildBatchPDFRows(): PDFItemRow[] {
    return batchPOs.flatMap((po) =>
      po.items.map((item) => ({
        id: po.id,
        po_number: po.po_number,
        po_date: po.po_date,
        status: po.status,
        affects_stock: po.affects_stock,
        supplier_bill_no: po.supplier_bill_no ?? null,
        supplier_bill_date: po.supplier_bill_date ?? null,
        item_id: item.id,
        material_id: item.material_id,
        material_name: item.material_name,
        material_no: item.material_no ?? null,
        supplier_id: item.supplier_id ?? null,
        supplier_name: item.supplier_name ?? null,
        qty: item.qty,
        unit_name: item.unit_name ?? null,
        rate: item.rate,
        tax_percentage: item.tax_percentage,
        cgst_amount: item.cgst_amount,
        sgst_amount: item.sgst_amount,
        igst_amount: item.igst_amount,
        amount: item.amount,
        gst_type: item.gst_type ?? null,
      }))
    );
  }

  // ── Section nav refs ───────────────────────────────────────────────────────
  const dateSectionRef = useRef<HTMLDivElement>(null);
  const gridSectionRef = useRef<HTMLDivElement>(null);

  const { containerProps } = useFormSectionNav({
    sections: [
      {
        id: "date",
        ref: dateSectionRef,
        onActivate: () => {
          dateSectionRef.current?.querySelector<HTMLInputElement>('input[type="date"]')?.focus();
        },
      },
      {
        id: "grid",
        ref: gridSectionRef,
        isDisabled: () => isLoading,
        onActivate: () => {
          gridSectionRef.current
            ?.querySelector<HTMLElement>('[data-grid-row="0"][data-grid-col="0"]')
            ?.focus();
        },
      },
    ],
    isLoading: isLoading || isPending,
  });

  // Supplier filter options — unique supplier names from loaded dropdown
  const supplierFilterOptions = Array.from(
    new Set(dropdownItems.filter((d) => d.supplierName).map((d) => d.supplierName!))
  ).map((name) => ({ value: name, label: name }));

  // Filter results — AND intersection of both active filters
  const eitherFilterActive = filterSupplier !== "" || filterDate !== "";
  const filteredPOs = eitherFilterActive
    ? dropdownItems.filter((d) => {
        const supplierMatch = filterSupplier === "" || d.supplierName === filterSupplier;
        const dateMatch = filterDate === "" || toISODate(d.date) === filterDate;
        return supplierMatch && dateMatch;
      })
    : [];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-full" {...containerProps}>
      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="flex-1 overflow-y-auto p-6 pb-0">
          {/* Header card */}
          <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
            {/* Filter panel — always visible */}
            <div>
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-slate-700 uppercase tracking-wide">Supplier</label>
                  <div className="relative w-64">
                    <Combobox
                      options={supplierFilterOptions}
                      value={filterSupplier}
                      onChange={handleFilterSupplierChange}
                      placeholder="Select supplier…"
                      openOnArrowDown
                    />
                    {eitherFilterActive && !isListOpen && (
                      <div
                        className="absolute inset-0 z-10 cursor-pointer"
                        onClick={() => setIsListOpen(true)}
                      />
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-700 uppercase tracking-wide">Date</label>
                  <div className="w-44">
                    <Input
                      type="date"
                      value={filterDate}
                      onChange={(e) => { setFilterDate(e.target.value); setIsListOpen(true); }}
                      className="h-9 text-sm"
                    />
                  </div>
                </div>
              </div>

              {isListOpen && filteredPOs.length > 0 && (
                <div className="mt-2 max-h-52 overflow-y-auto border border-slate-200 rounded-md divide-y divide-slate-100">
                  {filteredPOs.map((po) => (
                    <button
                      key={po.id}
                      onClick={() => handleSelect(po.id)}
                      className={`w-full flex items-center gap-4 px-3 py-2 text-sm text-left transition-colors ${
                        po.id === loadedPO?.id
                          ? "bg-blue-50 border-l-2 border-blue-400"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <span className="font-mono font-medium text-slate-800 w-16 shrink-0">
                        {formatCode("PO-", po.poNumber, 4)}
                      </span>
                      <span className="flex-1 text-slate-600 truncate">
                        {po.supplierName ?? "—"}
                      </span>
                      <span className="text-slate-700 shrink-0 text-xs">{formatDate(po.date)}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
                        po.status === "Received"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}>
                        {po.status}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {isListOpen && eitherFilterActive && filteredPOs.length === 0 && (
                <p className="mt-2 text-sm text-slate-700">No purchase orders found.</p>
              )}

              {/* PO No + Status — shown inline below results when a PO is loaded */}
              {loadedPO && (
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-sm text-slate-600 shrink-0">PO No</span>
                  <div className="h-9 px-3 flex items-center text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-md min-w-[80px]">
                    {formatCode("PO-", loadedPO.po_number, 4)}
                  </div>
                  {poStatus && (
                    <span className={`px-2 py-0.5 rounded text-sm font-medium ${
                      poStatus === "Received" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                    }`}>
                      {poStatus}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Row 2: always-visible header fields */}
            <div className="mt-4 flex flex-wrap items-end gap-4">
              <div className="space-y-1" ref={dateSectionRef}>
                <label className="text-sm text-slate-600">PO Date</label>
                <div className="w-40">
                  <Input
                    type="date"
                    value={poDate}
                    onChange={(e) => { setPoDate(e.target.value); setIsDirty(true); }}
                    className="h-9 text-sm"
                    autoComplete="off"
                    autoFocus
                  />
                </div>
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={affectsStock}
                    onChange={(e) => { setAffectsStock(e.target.checked); setIsDirty(true); }}
                    className="w-4 h-4 accent-slate-700"
                  />
                  <span className="text-sm text-slate-700">Update Stock</span>
                </label>
              </div>
            </div>

            {/* Received PO edit warning */}
            {hasFormContent && poStatus === "Received" && (
              <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                  <span className="font-medium">This PO has been received.</span> Saving will reverse the current stock additions and reapply them with the new values (atomic operation).
                </p>
              </div>
            )}
          </div>

          {/* Grid */}
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-slate-700 text-sm">
              Loading…
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden mb-4" ref={gridSectionRef}>
              {!hasFormContent && (
                <div className="px-5 py-3 border-b border-slate-100 text-sm text-slate-700">
                  Enter a PO date and add materials to create a new PO, or use the filters above to find an existing PO.
                </div>
              )}
              <TransactionGrid
                rows={rows}
                dispatch={dispatchWithDirty}
                suppliers={suppliers}
                materials={materials}
                taxRates={taxRates}
                units={units}
                mode="purchase-order"
              />
            </div>
          )}

        </div>

        {/* ── Sticky bottom bar ── */}
        <div className="border-t border-slate-200 bg-white shadow-lg shrink-0">
          {/* Totals */}
          <div className="px-6 py-2.5 flex items-center gap-6 text-sm border-b border-slate-100 flex-wrap">
            <span className="text-slate-600">Subtotal: <span className="font-medium text-slate-800">{formatAmount(subtotal)}</span></span>
            <span className="text-slate-600">CGST: <span className="font-medium text-slate-800">{formatAmount(cgst)}</span></span>
            <span className="text-slate-600">SGST: <span className="font-medium text-slate-800">{formatAmount(sgst)}</span></span>
            <span className="text-slate-600">IGST: <span className="font-medium text-slate-800">{formatAmount(igst)}</span></span>
            <span className="ml-auto text-slate-600 font-semibold text-base">
              Grand Total: <span className="text-2xl font-bold text-slate-900">{formatAmount(grand)}</span>
            </span>
          </div>

          {/* Action buttons */}
          <div className="px-6 py-3 flex items-center gap-4 flex-wrap">
            <Button variant="outline" className="h-10 px-5" onClick={handleNew} disabled={isPending}>
              New
            </Button>

            {hasFormContent && (
              <>
                <Button
                  variant="outline"
                  className="h-10 px-5"
                  onClick={handleSave}
                  disabled={isPending || isLoading}
                >
                  {isPending ? "Saving…" : "Save"}
                </Button>

                {loadedPO && (
                  <Button
                    variant="outline"
                    className="h-10 px-5 text-red-600 border-red-200 hover:bg-red-50"
                    onClick={handleDelete}
                    disabled={isPending}
                  >
                    Delete
                  </Button>
                )}

                {/* Mark as Received: shown when Draft or no PO yet */}
                {(!loadedPO || poStatus === "Draft") && (
                  <Button
                    className="h-10 px-5 bg-emerald-600 hover:bg-emerald-700"
                    onClick={handleMarkAsReceived}
                    disabled={isPending}
                  >
                    {isPending ? "Processing…" : "Mark as Received"}
                  </Button>
                )}

                {/* Revert to Draft: shown only for Received POs */}
                {poStatus === "Received" && (
                  <Button
                    variant="outline"
                    className="h-10 px-5 text-amber-700 border-amber-300 hover:bg-amber-50"
                    onClick={handleRevertToDraft}
                    disabled={isPending}
                  >
                    Revert to Draft
                  </Button>
                )}

                {loadedPO && (
                  <PrintButton
                    getDocument={async () => {
                      const { PORegisterDocument } = await import("@/components/pdf/po-register-pdf");
                      return (
                        <PORegisterDocument
                          rows={buildPDFRows()}
                          fy={activeFY}
                          showRates
                          companySetting={companySetting}
                        />
                      );
                    }}
                    label="Print"
                  />
                )}

                <Button variant="outline" className="h-10 px-5" onClick={handleCancel} disabled={isPending}>
                  Cancel
                </Button>
              </>
            )}

          </div>
        </div>
      </div>

      {/* ── Right panel: collapsible batch print range ── */}
      <div className={cn("shrink-0 border-l border-slate-200 bg-slate-50 flex flex-col transition-all duration-200", sidebarOpen ? "w-52" : "w-10")}>
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="p-2 hover:bg-slate-100 self-end text-slate-600 hover:text-slate-700"
          title={sidebarOpen ? "Collapse" : "Print PO Range"}
        >
          {sidebarOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
        {sidebarOpen && (
          <div className="px-4 pb-4 flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Print POs</h3>
            <div className="space-y-1">
              <label className="text-sm text-slate-600">Date</label>
              <Input
                type="date"
                value={printByDate}
                onChange={(e) => setPrintByDate(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-slate-600">PO No From</label>
              <Combobox
                options={dropdownOptions}
                value={printFromId}
                onChange={setPrintFromId}
                placeholder="From…"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-slate-600">PO No To</label>
              <Combobox
                options={dropdownOptions}
                value={printToId}
                onChange={setPrintToId}
                placeholder="To…"
              />
            </div>
            <PrintButton
              getDocument={async () => {
                const { PORegisterDocument } = await import("@/components/pdf/po-register-pdf");
                return (
                  <PORegisterDocument
                    rows={buildBatchPDFRows()}
                    fy={activeFY}
                    showRates
                    companySetting={companySetting}
                  />
                );
              }}
              disabled={(!printByDate && (!printFromId || !printToId)) || batchLoading}
              label={batchLoading ? "Loading…" : `Print POs${batchPOs.length > 0 ? ` (${batchPOs.length})` : ""}`}
            />
          </div>
        )}
      </div>

      {/* ── Mark as Received dialog ── */}
      <Dialog open={receiveDialogOpen} onOpenChange={setReceiveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Mark {loadedPO ? formatCode("PO-", loadedPO.po_number, 4) : "new PO"} as Received?
            </DialogTitle>
            <DialogDescription>
              {affectsStock
                ? "This will add the following quantities to stock:"
                : "Stock update is OFF — no warehouse quantities will change."}
            </DialogDescription>
          </DialogHeader>
          {affectsStock && (
            <div className="max-h-48 overflow-y-auto space-y-1 py-2">
              {filledRows.map((r) => (
                <div key={r._key} className="flex justify-between text-sm py-0.5">
                  <span className="text-slate-700">{r.material_name}</span>
                  <span className="font-medium text-emerald-700">
                    +{r.qty} {r.unit_name || ""}
                  </span>
                </div>
              ))}
            </div>
          )}
          {affectsStock && (
            <p className="text-xs text-slate-600">Stock changes are permanent and recorded in the Stock Ledger.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveDialogOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              onClick={confirmReceive}
              disabled={isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {isPending ? "Processing…" : "Mark as Received"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Revert to Draft dialog ── */}
      <Dialog
        open={revertDialogOpen}
        onOpenChange={(open) => { setRevertDialogOpen(open); if (!open) setRevertError(null); }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Revert {loadedPO ? formatCode("PO-", loadedPO.po_number, 4) : ""} to Draft?
            </DialogTitle>
            <DialogDescription>
              {loadedPO?.affects_stock
                ? "This will reverse all stock additions from this PO. The action is recorded in the Stock Ledger."
                : "This PO did not affect stock. Status will be set back to Draft."}
            </DialogDescription>
          </DialogHeader>
          {revertError && (
            <div className="bg-red-50 border border-red-200 rounded px-3 py-2 text-sm text-red-800 whitespace-pre-line">
              {revertError}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRevertDialogOpen(false); setRevertError(null); }} disabled={isPending}>
              Cancel
            </Button>
            <Button
              onClick={confirmRevert}
              disabled={isPending}
              variant="outline"
              className="text-amber-700 border-amber-300 hover:bg-amber-50"
            >
              {isPending ? "Processing…" : "Revert to Draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ── */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={loadedPO?.status === "Received" ? "Delete received purchase order?" : "Delete draft purchase order?"}
        description={
          loadedPO?.status === "Received"
            ? "This will permanently delete the PO and reverse all stock additions. This cannot be undone."
            : "This draft PO will be permanently deleted. No stock was added."
        }
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        isPending={isPending}
      />

      {/* ── Discard unsaved changes ── */}
      <ConfirmDialog
        open={discardDialogOpen}
        onOpenChange={(open) => { setDiscardDialogOpen(open); if (!open) setPendingAction(null); }}
        title="Discard unsaved changes?"
        description="You have unsaved changes. They will be lost if you continue."
        confirmLabel="Discard"
        onConfirm={confirmDiscard}
        isPending={isPending}
      />
    </div>
  );
}
