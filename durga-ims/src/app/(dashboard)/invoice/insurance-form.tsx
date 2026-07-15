"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { useHotkeys } from "react-hotkeys-hook";
import { toast } from "sonner";
import { Trash2, ChevronLeft, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { useKeyboardGrid } from "@/hooks/use-keyboard-grid";
import { isOverlayOpen } from "@/lib/overlay";
import type { LineItemDraft } from "@/types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PrintButton } from "@/components/pdf/print-button";
import type { InsuranceBillWithItems } from "@/types";
import {
  saveInsuranceBill,
  finalizeInsuranceBill,
  revertInsuranceBillToDraft,
  deleteInsuranceBill,
} from "@/lib/actions/invoices.actions";
import { insuranceBillToInvoiceRows } from "@/lib/utils/insurance-pdf-adapter";
import { formatCode } from "@/lib/utils";
import type { CompanySetting } from "@/lib/actions/settings.actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MaterialOption {
  id: string;
  material_no: number;
  name: string;
  hsn_code: string | null;
  tax_rate_id: string | null;
  tax_percentage?: string | null;
  purchase_unit_id: string | null;
}

interface UnitOption {
  id: string;
  unit_name: string;
}

interface ParentInvoiceInfo {
  billNumber: string;
  jobRefNo: string;
  customerName: string | null;
  gstin: string | null;
  state: string | null;
  gstType: string;
}

interface Props {
  invoiceId: string;
  insuranceBillId: string;
  parentInvoice: ParentInvoiceInfo;
  initialInsuranceBill: InsuranceBillWithItems;
  onBack: () => void;
  onSaved: (status: string) => void;
  onDeleted: () => void;
  companySetting?: CompanySetting;
  materials: MaterialOption[];
  units: UnitOption[];
  fy: string;
}

interface InsuranceRow {
  _key: string;
  useCustomName: boolean;
  material_id: string | null;
  material_name: string;
  material_name_override: string;
  material_no: number | null;
  hsn_code: string;
  qty: string;
  unit_id: string;
  unit_name: string;
  rate: string;
  baseRate: string;
  amount: string;
  tax_percentage: string;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  gst_type: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toISODate(d: string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toISOString().split("T")[0];
}

function fmt2(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcRowAmounts(qty: string, rate: string, taxPct: string, gstType: string) {
  const q = parseFloat(qty) || 0;
  const r = parseFloat(rate) || 0;
  const t = parseFloat(taxPct) || 0;
  const amount = (q * r).toFixed(2);
  const amt = parseFloat(amount);
  let cgst = "0.00", sgst = "0.00", igst = "0.00";
  if (gstType === "CGST_SGST") {
    const half = ((amt * t) / 100 / 2).toFixed(2);
    cgst = half; sgst = half;
  } else {
    igst = ((amt * t) / 100).toFixed(2);
  }
  return { amount, cgst_amount: cgst, sgst_amount: sgst, igst_amount: igst };
}

function initialRows(bill: InsuranceBillWithItems, gstType: string): InsuranceRow[] {
  if (bill.items.length === 0) return [blankRow(gstType)];
  return bill.items.map((item) => ({
    _key: crypto.randomUUID(),
    useCustomName: !!item.material_name_override && !item.material_id,
    material_id: item.material_id,
    material_name: item.material_name ?? "",
    material_name_override: item.material_name_override ?? "",
    material_no: item.material_no,
    hsn_code: item.hsn_code ?? "",
    qty: item.qty,
    unit_id: item.unit_id ?? "",
    unit_name: item.unit_name ?? "",
    rate: item.rate,
    baseRate: item.rate,
    amount: item.amount,
    tax_percentage: item.tax_percentage,
    cgst_amount: item.cgst_amount,
    sgst_amount: item.sgst_amount,
    igst_amount: item.igst_amount,
    gst_type: item.gst_type,
  }));
}

function blankRow(gstType: string): InsuranceRow {
  return {
    _key: crypto.randomUUID(),
    useCustomName: false,
    material_id: null,
    material_name: "",
    material_name_override: "",
    material_no: null,
    hsn_code: "",
    qty: "",
    unit_id: "",
    unit_name: "",
    rate: "",
    baseRate: "",
    amount: "0.00",
    tax_percentage: "18",
    cgst_amount: "0.00",
    sgst_amount: "0.00",
    igst_amount: "0.00",
    gst_type: gstType,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InsuranceForm({
  invoiceId,
  insuranceBillId,
  parentInvoice,
  initialInsuranceBill,
  onBack,
  onSaved,
  onDeleted,
  companySetting,
  materials,
  units,
  fy,
}: Props) {
  const gstType = parentInvoice.gstType;
  const h = initialInsuranceBill.header;

  // ── Header state ──────────────────────────────────────────────────────────
  const [status, setStatus] = useState<"Draft" | "Finalized">(h.status as "Draft" | "Finalized");
  const [billDate, setBillDate] = useState(toISODate(h.bill_date));
  const [taxPercentage, setTaxPercentage] = useState(h.tax_percentage);
  const [materialMargin, setMaterialMargin] = useState(h.material_margin);
  const [discount, setDiscount] = useState(h.discount);
  const [includeTax, setIncludeTax] = useState(h.include_tax);
  const debouncedMargin = useDebounce(materialMargin, 300);

  // ── Item rows state ───────────────────────────────────────────────────────
  const [rows, setRows] = useState<InsuranceRow[]>(() => initialRows(initialInsuranceBill, gstType));

  // ── Saving ────────────────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);

  // ── Dialog state ──────────────────────────────────────────────────────────
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRevertDialog, setShowRevertDialog] = useState(false);

  const isFinalized = status === "Finalized";

  // ── Derived totals ────────────────────────────────────────────────────────
  const subtotal = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const totalCgst = rows.reduce((s, r) => s + (parseFloat(r.cgst_amount) || 0), 0);
  const totalSgst = rows.reduce((s, r) => s + (parseFloat(r.sgst_amount) || 0), 0);
  const totalIgst = rows.reduce((s, r) => s + (parseFloat(r.igst_amount) || 0), 0);
  const totalTax = totalCgst + totalSgst + totalIgst;
  const netAmount = (subtotal + totalTax - (parseFloat(discount) || 0)).toFixed(2);

  // ── Margin recalculation (debounced) ──────────────────────────────────────
  useEffect(() => {
    const factor = 1 + parseFloat(debouncedMargin || "0") / 100;
    setRows((prev) =>
      prev.map((row) => {
        const base = parseFloat(row.baseRate || row.rate || "0");
        const newRate = (base * factor).toFixed(4);
        const calcs = calcRowAmounts(row.qty, newRate, row.tax_percentage, gstType);
        return { ...row, rate: newRate, ...calcs };
      })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedMargin]);

  // ── Row helpers ───────────────────────────────────────────────────────────
  const updateRow = useCallback((key: string, patch: Partial<InsuranceRow>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r._key !== key) return r;
        const merged = { ...r, ...patch };
        // Recalculate amounts when qty or rate changes
        if ("qty" in patch || "rate" in patch || "tax_percentage" in patch) {
          const calcs = calcRowAmounts(merged.qty, merged.rate, merged.tax_percentage, gstType);
          return { ...merged, ...calcs };
        }
        return merged;
      })
    );
  }, [gstType]);

  function handleMaterialSelect(key: string, materialId: string) {
    const mat = materials.find((m) => m.id === materialId);
    if (!mat) return;
    const taxPct = mat.tax_percentage ?? "18";
    const unit = mat.purchase_unit_id
      ? units.find((u) => u.id === mat.purchase_unit_id)
      : undefined;
    setRows((prev) =>
      prev.map((r) => {
        if (r._key !== key) return r;
        const calcs = calcRowAmounts(r.qty, r.rate || "0", taxPct, gstType);
        return {
          ...r,
          material_id: materialId,
          material_name: mat.name,
          material_no: mat.material_no,
          hsn_code: mat.hsn_code ?? "",
          tax_percentage: taxPct,
          unit_id: unit?.id ?? "",
          unit_name: unit?.unit_name ?? "",
          ...calcs,
        };
      })
    );
  }

  function deleteRow(key: string) {
    setRows((prev) => {
      const next = prev.filter((r) => r._key !== key);
      return next.length ? next : [blankRow(gstType)];
    });
  }

  // ── Grid keyboard nav (mirrors TransactionGrid) ─────────────────────────────
  // Uniform column map. HSN is intentionally NOT a grid column, so custom vs
  // lookup rows keep identical focusables and ↑/↓ stay column-aligned.
  const colMaterial = 0;
  const colQty = 1;
  const colRate = 3;
  const colTax = includeTax ? 4 : -1;
  const columnCount = includeTax ? 6 : 5; // Material,Qty,Unit,Rate,[Tax],Delete
  const lastDataColIndex = includeTax ? 4 : 3;
  const colDelete = columnCount - 1;
  const enterChainCols = [colMaterial, colQty, colRate];

  const gridRef = useRef<HTMLTableElement>(null);
  const [openComboboxCell, setOpenComboboxCell] = useState<{ row: number; col: number } | null>(null);
  const appendEmptyRow = useCallback(() => setRows((prev) => [...prev, blankRow(gstType)]), [gstType]);

  const { handleKeyDown, focusCell, advanceChain } = useKeyboardGrid({
    gridRef,
    // Runtime-safe: the hook only reads material_id/qty/rate/.length. InsuranceRow
    // has those; the cast avoids editing the shared hook for a single caller.
    rows: rows as unknown as LineItemDraft[],
    columnCount,
    appendEmptyRow,
    enterChainCols,
    lastDataColIndex,
  });

  // Space/Delete deletes; keep the keyboard flow alive by refocusing the row above.
  function handleRowDelete(key: string, idx: number) {
    deleteRow(key);
    requestAnimationFrame(() => focusCell(Math.max(0, idx - 1), colMaterial));
  }

  // Numeric-only guard for text inputs (needed so ←/→ caret-boundary works —
  // type=number reports null selectionStart).
  const numericChange = (key: string, field: "qty" | "rate" | "tax_percentage") => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const v = e.target.value;
    if (v === "" || /^\d*\.?\d*$/.test(v)) updateRow(key, { [field]: v });
  };

  // ── Build payload ─────────────────────────────────────────────────────────
  function buildPayload() {
    return {
      bill_date: billDate,
      tax_percentage: taxPercentage,
      material_margin: materialMargin || "0",
      discount: discount || "0",
      net_amount: netAmount,
      include_tax: includeTax,
      items: rows
        .filter((r) => r.material_id || r.material_name_override)
        .map((r, idx) => ({
          material_id: r.useCustomName ? null : (r.material_id || null),
          material_name_override: r.useCustomName ? (r.material_name_override || null) : null,
          hsn_code: r.hsn_code || null,
          qty: r.qty || "0",
          unit_id: r.unit_id || null,
          rate: r.rate || "0",
          amount: r.amount,
          tax_percentage: r.tax_percentage || "0",
          cgst_amount: r.cgst_amount,
          sgst_amount: r.sgst_amount,
          igst_amount: r.igst_amount,
          gst_type: gstType,
          sort_order: idx,
        })),
    };
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  async function handleSave() {
    if (isSavingRef.current) return;
    const filledRows = rows.filter(r => r.material_id || r.material_name_override);
    if (filledRows.length === 0) {
      toast.error("Add at least one material item.");
      return;
    }
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      await saveInsuranceBill(insuranceBillId, buildPayload());
      toast.success("Insurance bill saved.");
      onSaved("Draft");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save insurance bill.");
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }

  async function handleFinalize() {
    if (isSavingRef.current) return;
    const filledRows = rows.filter(r => r.material_id || r.material_name_override);
    if (filledRows.length === 0) {
      toast.error("Add at least one material item.");
      return;
    }
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      await saveInsuranceBill(insuranceBillId, buildPayload());
      await finalizeInsuranceBill(insuranceBillId);
      setStatus("Finalized");
      toast.success("Insurance bill finalized.");
      onSaved("Finalized");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to finalize insurance bill.");
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }

  async function handleRevert() {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      await revertInsuranceBillToDraft(insuranceBillId);
      setStatus("Draft");
      toast.success("Insurance bill reverted to Draft.");
      onSaved("Draft");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to revert insurance bill.");
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
      setShowRevertDialog(false);
    }
  }

  async function handleDelete() {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      await deleteInsuranceBill(insuranceBillId);
      toast.success("Insurance bill deleted.");
      onDeleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete insurance bill.");
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
      setShowDeleteDialog(false);
    }
  }

  // ── Hotkeys ───────────────────────────────────────────────────────────────
  useHotkeys("mod+s", (e) => { if (isOverlayOpen()) return; e.preventDefault(); if (!isFinalized) void handleSave(); }, { enableOnFormTags: true });
  useHotkeys("escape", () => onBack(), { enableOnFormTags: true });

  // ── PDF rows ──────────────────────────────────────────────────────────────
  const currentBillForPdf: InsuranceBillWithItems = {
    header: {
      ...initialInsuranceBill.header,
      bill_date: billDate,
      tax_percentage: taxPercentage,
      material_margin: materialMargin,
      discount: discount,
      net_amount: netAmount,
      include_tax: includeTax,
      status,
    },
    items: rows
      .filter((r) => r.material_id || r.material_name_override)
      .map((r, idx) => ({
        id: "",
        insurance_id: insuranceBillId,
        material_id: r.useCustomName ? null : (r.material_id || null),
        material_name_override: r.useCustomName ? (r.material_name_override || null) : null,
        hsn_code: r.hsn_code || null,
        qty: r.qty || "0",
        unit_id: r.unit_id || null,
        unit_name: r.unit_name || null,
        rate: r.rate || "0",
        amount: r.amount,
        tax_percentage: r.tax_percentage || "0",
        cgst_amount: r.cgst_amount,
        sgst_amount: r.sgst_amount,
        igst_amount: r.igst_amount,
        gst_type: gstType,
        sort_order: idx,
        material_name: r.useCustomName ? null : (r.material_name || null),
        material_no: r.material_no,
      })),
  };

  const pdfRows = insuranceBillToInvoiceRows(currentBillForPdf, {
    id: invoiceId,
    billNumber: parentInvoice.billNumber,
    jobRefNo: parentInvoice.jobRefNo,
    customerName: parentInvoice.customerName,
    customerGstin: parentInvoice.gstin,
    customerState: parentInvoice.state,
    customerAddress: null,
  });

  // ── Combobox options ──────────────────────────────────────────────────────
  const materialOptions = materials.map((m) => ({ value: m.id, label: m.name }));

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full">
      {/* Back header */}
      <div className="flex items-center gap-2 px-6 pt-5 pb-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-800"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Customer Bill ({parentInvoice.billNumber})
        </button>
        <span className="text-slate-300 ml-1">/</span>
        <span className="text-sm text-slate-700 font-medium">Insurance Bill</span>
        <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium border ${
          isFinalized
            ? "bg-purple-50 text-purple-700 border-purple-200"
            : "bg-amber-50 text-amber-700 border-amber-200"
        }`}>
          {status}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-32">
        {/* Header card */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 mb-4 space-y-4">
          {/* Bill info row */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="text-xs text-slate-600 block mb-1">Bill Date</label>
              {isFinalized ? (
                <div className="h-9 px-3 flex items-center text-sm text-slate-700">
                  {new Date(billDate).toLocaleDateString("en-IN")}
                </div>
              ) : (
                <Input
                  type="date"
                  value={billDate}
                  onChange={(e) => setBillDate(e.target.value)}
                  className="h-9 text-sm"
                />
              )}
            </div>
            <div>
              <label className="text-xs text-slate-600 block mb-1">Tax %</label>
              {isFinalized ? (
                <div className="h-9 px-3 flex items-center text-sm text-slate-700">{taxPercentage}</div>
              ) : (
                <Input
                  type="number"
                  value={taxPercentage}
                  onChange={(e) => setTaxPercentage(e.target.value)}
                  className="h-9 text-sm"
                  min="0"
                  step="any"
                />
              )}
            </div>
            <div>
              <label className="text-xs text-slate-600 block mb-1">Material Margin %</label>
              {isFinalized ? (
                <div className="h-9 px-3 flex items-center text-sm text-slate-700">{materialMargin || "—"}</div>
              ) : (
                <Input
                  type="number"
                  value={materialMargin}
                  onChange={(e) => setMaterialMargin(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className="h-9 text-sm"
                  min="0"
                  step="any"
                  placeholder="0"
                />
              )}
            </div>
            <div>
              <label className="text-xs text-slate-600 block mb-1">Discount</label>
              {isFinalized ? (
                <div className="h-9 px-3 flex items-center text-sm text-slate-700">{discount || "0"}</div>
              ) : (
                <Input
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className="h-9 text-sm"
                  min="0"
                  step="any"
                  placeholder="0"
                />
              )}
            </div>
          </div>

          {/* Customer info + include_tax */}
          <div className="grid grid-cols-4 gap-4 border-t border-slate-100 pt-3">
            <div>
              <span className="text-xs text-slate-700 block">Customer</span>
              <span className="text-sm text-slate-700">{parentInvoice.customerName ?? "—"}</span>
            </div>
            <div>
              <span className="text-xs text-slate-700 block">GSTIN</span>
              <span className="font-mono text-sm text-slate-600">{parentInvoice.gstin ?? "—"}</span>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <input
                type="checkbox"
                id="ins-include-tax"
                checked={includeTax}
                onChange={(e) => setIncludeTax(e.target.checked)}
                className="w-4 h-4 accent-slate-700"
              />
              <label htmlFor="ins-include-tax" className="text-sm text-slate-600 cursor-pointer select-none">
                Show Tax Columns
              </label>
            </div>
          </div>
        </div>

        {/* Items table */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-4">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-medium text-slate-700">Insurance Bill Items</h2>
          </div>
          <div className="overflow-x-auto">
            <table ref={gridRef} className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 w-8">#</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 w-20">Mat. Code</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-600">Material</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 w-24">HSN</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 w-20">Qty</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 w-28">Unit</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 w-24">Rate</th>
                  {includeTax && <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 w-16">Tax %</th>}
                  {includeTax && <th className="px-3 py-2 text-right text-xs font-medium text-slate-600 w-24">Tax Amt</th>}
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-600 w-28">Amount</th>
                  {!isFinalized && <th className="px-3 py-2 w-8" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, idx) => {
                  const taxAmt = parseFloat(row.cgst_amount) + parseFloat(row.sgst_amount) + parseFloat(row.igst_amount);
                  const grossAmt = parseFloat(row.amount || "0") + taxAmt;
                  const isOpen = (col: number) => openComboboxCell?.row === idx && openComboboxCell?.col === col;
                  return (
                    <tr key={row._key} className="hover:bg-slate-50">
                      <td className="px-3 py-1.5 text-slate-700 text-xs">{idx + 1}</td>
                      <td className="px-3 py-1.5 font-mono text-xs text-slate-500">
                        {row.material_no ? formatCode("M-", row.material_no) : "—"}
                      </td>
                      <td className="px-3 py-1.5">
                        {isFinalized ? (
                          <span className="text-slate-800">
                            {row.useCustomName ? row.material_name_override : row.material_name}
                          </span>
                        ) : row.useCustomName ? (
                          <div className="flex items-center gap-1">
                            <Input
                              value={row.material_name_override}
                              onChange={(e) => updateRow(row._key, { material_name_override: e.target.value })}
                              onKeyDown={(e) => handleKeyDown(e, idx, colMaterial, false)}
                              data-grid-row={idx}
                              data-grid-col={colMaterial}
                              placeholder="Enter material name…"
                              className="h-8 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => updateRow(row._key, { useCustomName: false, material_name_override: "" })}
                              className="p-1 rounded text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                              title="Pick from list"
                              tabIndex={-1}
                            >
                              <List className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <Combobox
                            options={materialOptions}
                            value={row.material_id ?? ""}
                            onChange={(v) => { handleMaterialSelect(row._key, v); requestAnimationFrame(() => advanceChain(idx, colMaterial)); }}
                            placeholder="Select material…"
                            searchPlaceholder="Search materials…"
                            gridRow={idx}
                            gridCol={colMaterial}
                            onGridKeyDown={(e) => handleKeyDown(e, idx, colMaterial, false)}
                            onOpenChange={(open) => setOpenComboboxCell(open ? { row: idx, col: colMaterial } : null)}
                          />
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        {/* HSN is read-only (auto-filled from the material). Editable only on a
                            custom row, which has no material to source it from. */}
                        {!isFinalized && row.useCustomName ? (
                          <Input
                            value={row.hsn_code}
                            onChange={(e) => updateRow(row._key, { hsn_code: e.target.value })}
                            className="h-8 text-sm w-20 font-mono"
                          />
                        ) : (
                          <span className="font-mono text-xs text-slate-600">{row.hsn_code || "—"}</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        {isFinalized ? (
                          <span className="text-slate-800">{row.qty}</span>
                        ) : (
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={row.qty}
                            onChange={numericChange(row._key, "qty")}
                            onKeyDown={(e) => handleKeyDown(e, idx, colQty, isOpen(colQty))}
                            data-grid-row={idx}
                            data-grid-col={colQty}
                            className="h-8 text-sm w-16"
                          />
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="text-slate-600">{row.unit_name || "—"}</span>
                      </td>
                      <td className="px-3 py-1.5">
                        {isFinalized ? (
                          <span className="text-slate-800">{row.rate}</span>
                        ) : (
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={row.rate}
                            onChange={numericChange(row._key, "rate")}
                            onKeyDown={(e) => handleKeyDown(e, idx, colRate, isOpen(colRate))}
                            data-grid-row={idx}
                            data-grid-col={colRate}
                            className="h-8 text-sm w-20"
                          />
                        )}
                      </td>
                      {includeTax && (
                        <td className="px-3 py-1.5">
                          {isFinalized ? (
                            <span className="text-slate-800">{row.tax_percentage}</span>
                          ) : (
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={row.tax_percentage}
                              onChange={numericChange(row._key, "tax_percentage")}
                              onKeyDown={(e) => handleKeyDown(e, idx, colTax, isOpen(colTax))}
                              data-grid-row={idx}
                              data-grid-col={colTax}
                              className="h-8 text-sm w-14"
                            />
                          )}
                        </td>
                      )}
                      {includeTax && (
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                          {fmt2(taxAmt)}
                        </td>
                      )}
                      <td className="px-3 py-1.5 text-right tabular-nums font-medium text-slate-800">
                        {fmt2(grossAmt)}
                      </td>
                      {!isFinalized && (
                        <td className="px-3 py-1.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-700 hover:text-red-500 hover:bg-red-50"
                            onClick={() => handleRowDelete(row._key, idx)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); return; }
                              if (e.key === " " || e.key === "Delete") {
                                e.preventDefault(); e.stopPropagation(); handleRowDelete(row._key, idx); return;
                              }
                              handleKeyDown(e, idx, colDelete, false);
                            }}
                            data-grid-row={idx}
                            data-grid-col={colDelete}
                            type="button"
                            tabIndex={-1}
                            title="Delete row (Space / Delete)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!isFinalized && (
            <div className="px-4 py-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRows((prev) => [...prev, blankRow(gstType)])}
                className="text-sm text-slate-700 hover:text-slate-700"
              >
                + Add row
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sticky totals + action bar */}
      <div className="fixed bottom-0 left-64 right-0 z-30 bg-white border-t border-slate-200 shadow-lg">
        <div className="flex items-center gap-6 px-6 py-2 border-b border-slate-100 text-sm">
          <span className="text-slate-600">
            Taxable: <strong className="text-slate-800">₹{fmt2(subtotal)}</strong>
          </span>
          {totalCgst > 0 && (
            <span className="text-slate-600">CGST: <strong className="text-slate-800">₹{fmt2(totalCgst)}</strong></span>
          )}
          {totalSgst > 0 && (
            <span className="text-slate-600">SGST: <strong className="text-slate-800">₹{fmt2(totalSgst)}</strong></span>
          )}
          {totalIgst > 0 && (
            <span className="text-slate-600">IGST: <strong className="text-slate-800">₹{fmt2(totalIgst)}</strong></span>
          )}
          {(parseFloat(discount) || 0) > 0 && (
            <span className="text-slate-600">Discount: <strong className="text-red-600">-₹{fmt2(parseFloat(discount))}</strong></span>
          )}
          <span className="ml-auto text-base font-semibold text-slate-900">Net: ₹{fmt2(parseFloat(netAmount))}</span>
        </div>

        <div className="flex items-center gap-2 px-6 py-3 justify-end">
          {!isFinalized && (
            <Button
              variant="ghost"
              size="sm"
              className="mr-auto text-red-500 hover:text-red-700 hover:bg-red-50"
              onClick={() => setShowDeleteDialog(true)}
              disabled={isSaving}
            >
              Delete
            </Button>
          )}

          <Button variant="outline" size="sm" onClick={onBack}>
            ← Customer Bill
          </Button>

          {!isFinalized && (
            <>
              <Button variant="outline" size="sm" onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving…" : "Save Draft"}
              </Button>
              <Button
                size="sm"
                onClick={handleFinalize}
                disabled={isSaving}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                Finalize
              </Button>
            </>
          )}

          {isFinalized && (
            <Button variant="outline" size="sm" onClick={() => setShowRevertDialog(true)} disabled={isSaving}>
              Revert to Draft
            </Button>
          )}

          <PrintButton
            label="Print Insurance"
            getDocument={async () => {
              const { InsuranceInvoiceDocument } = await import("@/components/pdf/insurance-invoice-pdf");
              return (
                <InsuranceInvoiceDocument
                  groups={[pdfRows]}
                  fy={fy}
                  companySetting={companySetting}
                  showTaxColumns={includeTax}
                />
              );
            }}
          />
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Insurance Bill?"
        description="Delete this insurance bill? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={showRevertDialog}
        onOpenChange={setShowRevertDialog}
        title="Revert to Draft?"
        description="Revert this finalized insurance bill to Draft to make further edits."
        confirmLabel="Revert to Draft"
        onConfirm={handleRevert}
      />
    </div>
  );
}
