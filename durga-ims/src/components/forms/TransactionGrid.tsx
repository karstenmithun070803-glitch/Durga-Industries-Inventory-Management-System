"use client";

import React, { useRef, useCallback, useEffect, useMemo, useState } from "react";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCode } from "@/lib/utils";
import { determineGstType } from "@/types";
import type { LineItemDraft } from "@/types";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useKeyboardGrid } from "@/hooks/use-keyboard-grid";
import { newRow } from "@/lib/utils/row-calc";
import type { RowAction } from "@/lib/utils/rows-reducer";

// Re-export so parent components that haven't migrated yet still compile
export { newRow };

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
  tax_percentage?: string | null; // direct from DB join when available (issue mode)
  purchase_unit_id: string | null;
  sales_unit_id?: string | null;
  current_stock?: string;
  lastRate?: string | null; // pre-fetched last purchase rate — avoids per-selection server round-trip
}

interface TaxRateOption {
  id: string;
  tax_percentage: string;
}

interface UnitOption {
  id: string;
  unit_name: string;
}

interface ContractorOption {
  id: string;
  code_no: number;
  name: string;
  role: string | null;
}

interface Props {
  rows: LineItemDraft[];
  dispatch: React.Dispatch<RowAction>;
  suppliers: SupplierOption[];
  materials: MaterialOption[];
  taxRates: TaxRateOption[];
  units: UnitOption[];
  readOnly?: boolean;
  // Material issue / invoice mode props
  mode?: "purchase-order" | "material-issue" | "invoice";
  contractors?: ContractorOption[];
  gstType?: string; // header-level GST type (all rows share it in material-issue / invoice mode)
  // When true (invoice mode only): shows editable Tax% column + read-only Tax Amt column
  showTaxColumns?: boolean;
  // When true (VMI New only): shows read-only Stage column after S.No
  showStageColumn?: boolean;
  // Margin factor (1 + margin%/100) applied to the last-PO rate when a material is
  // selected (VMI modes). Defaults to 1 (no margin) for PO / invoice modes.
  marginFactor?: number;
}

// Column indices per mode (interactive/focusable elements, including delete button)
// PO:                  Material=0, Supplier=1, Qty=2, Rate=3, Tax%=4, Delete=5
// MI:                  Material=0, Contractor=1, AffectsStock=2, Qty=3, Rate=4, Tax%=5, Delete=6
// Invoice:             Material=0, Qty=1, Rate=2, Delete=3
// Invoice+showTax:     Material=0, Qty=1, Rate=2, Tax%=3, Delete=4
//
// lastDataColIndex = the column BEFORE delete (Enter from here wraps to next row col 0)
const STATIC_COL_CONFIG = {
  "purchase-order": { columnCount: 6, qtyCol: 2, lastDataColIndex: 4 },
  "material-issue": { columnCount: 7, qtyCol: 3, lastDataColIndex: 5 },
  invoice:          { columnCount: 4, qtyCol: 1, lastDataColIndex: 2 },
} as const;

// ─── TransactionRow ──────────────────────────────────────────────────────────

interface RowProps {
  row: LineItemDraft;
  rowIndex: number;
  // which column (if any) has an open combobox in this row; null = none
  openComboboxCol: number | null;
  dispatch: React.Dispatch<RowAction>;
  // pre-computed label lists (stable useMemo refs from parent)
  materialOptions: { value: string; label: string }[];
  supplierOptions: { value: string; label: string }[];
  contractorOptions: { value: string; label: string }[];
  // raw arrays for handlers
  materials: MaterialOption[];
  suppliers: SupplierOption[];
  contractors: ContractorOption[];
  taxRates: TaxRateOption[];
  units: UnitOption[];
  usedMaterialIds: Set<string>;
  // config (stable for the lifetime of the form)
  isIssueMode: boolean;
  isInvoiceMode: boolean;
  isHeaderGstMode: boolean;
  effectiveGstType: string | undefined;
  readOnly: boolean;
  showTaxColumns: boolean;
  showStageColumn: boolean;
  marginFactor: number;
  // pre-computed column indices (stable)
  colMaterial: number;
  colSupplierOrContractor: number;
  colAffectsStock: number;
  colQty: number;
  colRate: number;
  colTax: number;
  colDelete: number;
  // stable callbacks from parent
  onKeyDown: (e: React.KeyboardEvent<Element>, rowIndex: number, colIndex: number, comboboxOpen: boolean) => void;
  focusCell: (row: number, col: number) => void;
  advanceChain: (rowIndex: number, colIndex: number) => void;
  setOpenComboboxCell: React.Dispatch<React.SetStateAction<{ row: number; col: number } | null>>;
}

const TransactionRow = React.memo(
  function TransactionRow({
    row,
    rowIndex,
    openComboboxCol,
    dispatch,
    materialOptions,
    supplierOptions,
    contractorOptions,
    materials,
    suppliers,
    contractors,
    taxRates,
    units,
    usedMaterialIds,
    isIssueMode,
    isInvoiceMode,
    isHeaderGstMode,
    effectiveGstType,
    readOnly,
    showTaxColumns,
    showStageColumn,
    marginFactor,
    colMaterial,
    colSupplierOrContractor,
    colAffectsStock,
    colQty,
    colRate,
    colTax,
    colDelete,
    onKeyDown,
    focusCell,
    advanceChain,
    setOpenComboboxCell,
  }: RowProps) {
    const isOpen = (col: number) => openComboboxCol === col;

    // Stable — dispatch is stable from useReducer; isHeaderGstMode and effectiveGstType
    // are derived from mode/gstType props that don't change during the form's lifetime
    const update = useCallback(
      (key: string, patch: Partial<LineItemDraft>) => {
        dispatch({
          type: "UPDATE",
          key,
          patch,
          gstForCalc: isHeaderGstMode ? (effectiveGstType ?? null) : null,
        });
      },
      [dispatch, isHeaderGstMode, effectiveGstType]
    );

    function handleMaterialSelect(key: string, materialId: string) {
      const mat = materials.find((m) => m.id === materialId);
      if (!mat) return;

      if (!isIssueMode && usedMaterialIds.has(materialId)) {
        toast.warning(`${mat.name} is already in this PO`);
      }

      const preferredUnitId = mat.purchase_unit_id;
      const unit = preferredUnitId ? units.find((u) => u.id === preferredUnitId) : null;
      const taxPct =
        mat.tax_percentage ??
        (mat.tax_rate_id ? taxRates.find((t) => t.id === mat.tax_rate_id)?.tax_percentage : null) ??
        "0";

      const lastRate = mat.lastRate ?? null;
      const rateBlank = lastRate === null;
      // Apply the current margin (VMI modes) so the popped-in rate already reflects it.
      // baseRate stays raw so the debounced margin recalc remains consistent.
      const displayRate =
        lastRate != null && marginFactor > 1
          ? (parseFloat(lastRate) * marginFactor).toFixed(4)
          : (lastRate ?? "");

      update(key, {
        material_id: materialId,
        material_name: mat.name,
        material_no: mat.material_no,
        hsn_code: mat.hsn_code ?? "",
        unit_id: preferredUnitId ?? "",
        unit_name: unit?.unit_name ?? "",
        tax_percentage: taxPct,
        rate: displayRate,
        baseRate: lastRate ?? "",
        rateBlank,
        zeroRateConfirmed: false,
        ...(isHeaderGstMode && effectiveGstType ? { gst_type: effectiveGstType } : {}),
      });
      // Enter/select AND advance — defer past the popover's focus-return on close.
      requestAnimationFrame(() => advanceChain(rowIndex, colMaterial));
    }

    function handleSupplierSelect(key: string, supplierId: string) {
      const sup = suppliers.find((s) => s.id === supplierId);
      if (!sup) return;
      const gst = determineGstType(sup.gstin, sup.state);
      update(key, {
        supplier_id: supplierId,
        supplier_name: sup.name,
        gst_type: gst,
      });
      requestAnimationFrame(() => advanceChain(rowIndex, colSupplierOrContractor));
    }

    function handleContractorSelect(key: string, contractorId: string) {
      if (!contractorId) {
        // "None"/clear — do not auto-advance (user is clearing, not committing).
        update(key, { contractor_id: "", contractor_name: "" });
        return;
      }
      const con = contractors.find((c) => c.id === contractorId);
      if (!con) return;
      update(key, {
        contractor_id: contractorId,
        contractor_name: con.name,
      });
      requestAnimationFrame(() => advanceChain(rowIndex, colSupplierOrContractor));
    }

    function handleDelete() {
      dispatch({ type: "DELETE", key: row._key });
      setTimeout(() => focusCell(Math.max(0, rowIndex - 1), 0), 10);
    }

    const showZeroWarning = !row.rateBlank && row.rate === "0" && !row.zeroRateConfirmed;

    const fmt2 = (v: string) =>
      parseFloat(v || "0").toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    return (
      <tr className="border-t border-slate-200">
        <td className="px-3 py-1.5 text-slate-800">{rowIndex + 1}</td>
        {showStageColumn && (
          <td className="px-3 py-1.5 font-mono text-xs text-slate-700 whitespace-nowrap">
            {row.stage_name || "—"}
          </td>
        )}

        {/* Material Code — read-only, auto-filled */}
        <td className="px-3 py-1.5 font-mono text-sm text-slate-700 whitespace-nowrap">
          {row.material_no ? formatCode("M-",row.material_no) : "—"}
        </td>

        {/* Material Name combobox */}
        <td className="px-3 py-1.5">
          {readOnly ? (
            <span className="text-slate-800">{row.material_name}</span>
          ) : (
            <Combobox
              options={materialOptions}
              value={row.material_id}
              onChange={(v) => handleMaterialSelect(row._key, v)}
              placeholder="Select material..."
              searchPlaceholder="Search materials..."
              onOpenChange={(open) =>
                setOpenComboboxCell(open ? { row: rowIndex, col: colMaterial } : null)
              }
              gridRow={rowIndex}
              gridCol={colMaterial}
              onGridKeyDown={(e) => onKeyDown(e, rowIndex, colMaterial, false)}
            />
          )}
        </td>

        {/* HSN — read-only, auto-filled, issue mode and invoice mode */}
        {(isIssueMode || isInvoiceMode) && (
          <td className="px-3 py-1.5 font-mono text-sm text-slate-800 whitespace-nowrap">
            {row.hsn_code || "—"}
          </td>
        )}

        {/* Supplier combobox — PO mode only */}
        {!isIssueMode && !isInvoiceMode && (
          <td className="px-3 py-1.5">
            {readOnly ? (
              <span className="text-slate-800">{row.supplier_name || "—"}</span>
            ) : (
              <Combobox
                options={supplierOptions}
                value={row.supplier_id}
                onChange={(v) => handleSupplierSelect(row._key, v)}
                placeholder="Select supplier..."
                searchPlaceholder="Search suppliers..."
                onOpenChange={(open) =>
                  setOpenComboboxCell(open ? { row: rowIndex, col: colSupplierOrContractor } : null)
                }
                gridRow={rowIndex}
                gridCol={colSupplierOrContractor}
                onGridKeyDown={(e) => onKeyDown(e, rowIndex, colSupplierOrContractor, false)}
              />
            )}
          </td>
        )}

        {/* Contractor combobox — issue mode only (optional, nullable) */}
        {isIssueMode && (
          <td className="px-3 py-1.5">
            {readOnly ? (
              <span className="text-slate-800">{row.contractor_name || "—"}</span>
            ) : (
              <Combobox
                options={contractorOptions}
                value={row.contractor_id}
                onChange={(v) => handleContractorSelect(row._key, v)}
                placeholder="None"
                searchPlaceholder="Search contractors..."
                onOpenChange={(open) =>
                  setOpenComboboxCell(open ? { row: rowIndex, col: colSupplierOrContractor } : null)
                }
                gridRow={rowIndex}
                gridCol={colSupplierOrContractor}
                onGridKeyDown={(e) => onKeyDown(e, rowIndex, colSupplierOrContractor, false)}
              />
            )}
          </td>
        )}

        {/* Affects Stock checkbox — issue mode only */}
        {isIssueMode && (
          <td className="px-3 py-1.5 text-center">
            {readOnly ? (
              <span
                className={`inline-block w-4 h-4 rounded-sm border ${
                  row.affects_inventory
                    ? "bg-emerald-500 border-emerald-600"
                    : "bg-slate-100 border-slate-300"
                }`}
                title={row.affects_inventory ? "Affects stock" : "Does not affect stock"}
              />
            ) : (
              <input
                type="checkbox"
                checked={row.affects_inventory}
                onChange={(e) =>
                  update(row._key, { affects_inventory: e.target.checked })
                }
                onKeyDown={(e) => onKeyDown(e, rowIndex, colAffectsStock, isOpen(colAffectsStock))}
                data-grid-row={rowIndex}
                data-grid-col={colAffectsStock}
                className="w-4 h-4 accent-emerald-600 cursor-pointer"
                title="Uncheck if this item should not reduce warehouse stock"
              />
            )}
          </td>
        )}

        {/* Qty */}
        <td className="px-3 py-1.5">
          {readOnly ? (
            <span className="text-slate-800">{row.qty}</span>
          ) : (
            <Input
              type="text"
              inputMode="decimal"
              className={`w-20 h-8 text-sm ${
                !row.qty || parseFloat(row.qty) <= 0
                  ? "border-red-300 focus-visible:ring-red-400"
                  : ""
              }`}
              value={row.qty}
              onChange={(e) => update(row._key, { qty: e.target.value })}
              onKeyDown={(e) => onKeyDown(e, rowIndex, colQty, isOpen(colQty))}
              data-grid-row={rowIndex}
              data-grid-col={colQty}
            />
          )}
        </td>

        {/* Unit — read-only, auto-filled */}
        <td className="px-3 py-1.5 whitespace-nowrap">
          {row.material_id && !row.unit_name ? (
            <span
              className="text-sm text-amber-600"
              title={
                isHeaderGstMode
                  ? "No sales or purchase unit set — edit in Materials master"
                  : "No purchase unit set — edit in Materials master"
              }
            >
              ⚠ Not set
            </span>
          ) : (
            <span className="text-slate-800">{row.unit_name || "—"}</span>
          )}
        </td>

        {/* Rate */}
        <td className="px-3 py-1.5">
          {readOnly ? (
            <span className="text-slate-800">{row.rate}</span>
          ) : (
            <div className="space-y-0.5">
              <Input
                type="text"
                inputMode="decimal"
                className={`w-24 h-8 text-sm ${row.rateBlank ? "bg-yellow-50 border-yellow-300" : ""} ${
                  showZeroWarning ? "border-amber-400" : ""
                }`}
                value={row.rate}
                onChange={(e) =>
                  update(row._key, { rate: e.target.value, baseRate: e.target.value, rateBlank: false })
                }
                onKeyDown={(e) => onKeyDown(e, rowIndex, colRate, isOpen(colRate))}
                data-grid-row={rowIndex}
                data-grid-col={colRate}
                placeholder={row.rateBlank ? "No history" : ""}
                title={row.rateBlank ? "No purchase history — enter rate manually" : ""}
              />
              {row.rateBlank && (
                <p className="text-sm text-amber-600 whitespace-nowrap">First purchase — enter rate</p>
              )}
              {showZeroWarning && (
                <label className="flex items-center gap-1 text-sm text-amber-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={row.zeroRateConfirmed}
                    onChange={(e) =>
                      update(row._key, { zeroRateConfirmed: e.target.checked })
                    }
                    className="w-3 h-3"
                  />
                  Zero cost — confirm?
                </label>
              )}
            </div>
          )}
        </td>

        {/* Tax % — hidden in invoice mode unless showTaxColumns */}
        {(!isInvoiceMode || showTaxColumns) && (
          <td className="px-3 py-1.5">
            {readOnly ? (
              <span className="text-slate-800">{row.tax_percentage}</span>
            ) : (
              <Input
                type="text"
                inputMode="decimal"
                className="w-16 h-8 text-sm"
                value={row.tax_percentage}
                onChange={(e) => update(row._key, { tax_percentage: e.target.value })}
                onKeyDown={(e) => onKeyDown(e, rowIndex, colTax, isOpen(colTax))}
                data-grid-row={rowIndex}
                data-grid-col={colTax}
              />
            )}
          </td>
        )}

        {/* Tax Amt — invoice mode with showTaxColumns: combined tax per line (read-only), shown before Amount */}
        {isInvoiceMode && showTaxColumns && (
          <td className="px-3 py-1.5 text-right text-slate-800 tabular-nums">
            {fmt2(
              (parseFloat(row.cgst_amount || "0") +
               parseFloat(row.sgst_amount || "0") +
               parseFloat(row.igst_amount || "0")).toFixed(2)
            )}
          </td>
        )}

        {/* Amount — tax-inclusive display; stored amount is pre-tax */}
        <td className="px-3 py-1.5 text-right font-medium text-slate-800 tabular-nums">
          {fmt2(
            (parseFloat(row.amount || "0") +
             parseFloat(row.cgst_amount || "0") +
             parseFloat(row.sgst_amount || "0") +
             parseFloat(row.igst_amount || "0")).toFixed(2)
          )}
        </td>

        {!readOnly && (
          <td className="px-3 py-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-700 hover:text-red-500 hover:bg-red-50"
              onClick={handleDelete}
              onKeyDown={(e) => {
                // Enter must NEVER delete (accidental row-loss guard).
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  return;
                }
                // Space / Delete remove the row immediately (no confirm — matches the icon).
                if (e.key === " " || e.key === "Delete") {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDelete();
                  return;
                }
                onKeyDown(e, rowIndex, colDelete, false);
              }}
              data-grid-row={rowIndex}
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
  },
  (prev, next) =>
    prev.row === next.row &&
    prev.openComboboxCol === next.openComboboxCol &&
    prev.rowIndex === next.rowIndex &&
    prev.showTaxColumns === next.showTaxColumns &&
    prev.marginFactor === next.marginFactor &&
    prev.readOnly === next.readOnly
);

// ─── TransactionGrid ─────────────────────────────────────────────────────────

export function TransactionGrid({
  rows,
  dispatch,
  suppliers,
  materials,
  taxRates,
  units,
  readOnly = false,
  mode = "purchase-order",
  contractors = [],
  gstType,
  showTaxColumns = false,
  showStageColumn = false,
  marginFactor = 1,
}: Props) {
  const gridRef = useRef<HTMLTableElement>(null);
  const isIssueMode = mode === "material-issue";
  const isInvoiceMode = mode === "invoice";
  // Both issue and invoice modes use header-level GST type
  const isHeaderGstMode = isIssueMode || isInvoiceMode;

  // In material-issue / invoice mode, gstType is header-level (same for all rows)
  const effectiveGstType = isHeaderGstMode ? (gstType ?? "CGST_SGST") : undefined;

  // Dynamic column config — invoice mode gains extra columns when showTaxColumns=true
  const colConfig = isInvoiceMode
    ? {
        columnCount: showTaxColumns ? 5 : 4,
        qtyCol: 1,
        lastDataColIndex: showTaxColumns ? 3 : 2,
      }
    : STATIC_COL_CONFIG[mode];
  const { columnCount, qtyCol, lastDataColIndex } = colConfig;

  // Track which combobox cell is open so the keyboard hook can yield to cmdk
  const [openComboboxCell, setOpenComboboxCell] = useState<{ row: number; col: number } | null>(null);

  // Live record of the last-focused cell (mouse or keyboard), so re-entry from the
  // section ring returns to the SAME column the user left. One capturing handler on
  // the table catches focus of any descendant cell — no per-cell onFocus needed.
  const lastFocusedCellRef = useRef<{ row: number; col: number }>({ row: 0, col: 0 });
  const handleGridFocusCapture = useCallback((e: React.FocusEvent) => {
    const el = e.target as HTMLElement;
    const r = el.getAttribute?.("data-grid-row");
    const c = el.getAttribute?.("data-grid-col");
    if (r != null && c != null) {
      lastFocusedCellRef.current = { row: Number(r), col: Number(c) };
      // Expose the entry column so the page's grid-section onActivate can restore it.
      gridRef.current?.setAttribute("data-entry-col", c);
    }
  }, []);

  const appendEmptyRow = useCallback(() => {
    dispatch({ type: "APPEND", row: newRow() });
  }, [dispatch]);

  // Stable column indices per mode (derived once from mode + showTaxColumns)
  const colMaterial = 0;
  const colSupplierOrContractor = 1;
  const colAffectsStock = isIssueMode ? 2 : -1;
  const colQty = qtyCol;
  const colRate = isInvoiceMode ? 2 : isIssueMode ? 4 : 3;
  const colTax = isIssueMode ? 5 : mode === "purchase-order" ? 4 : (isInvoiceMode && showTaxColumns) ? 3 : -1;
  const colDelete = lastDataColIndex + 1;

  // Ordered Enter chain per mode. Note MI intentionally skips the Affects-Stock
  // checkbox (col 2): Material → Contractor → Qty → Rate. Enter on the last entry
  // (Rate) appends a new row.
  const enterChainCols = isInvoiceMode
    ? [colMaterial, colQty, colRate]
    : [colMaterial, colSupplierOrContractor, colQty, colRate];

  const { handleKeyDown, focusCell, advanceChain } = useKeyboardGrid({
    gridRef,
    rows,
    columnCount,
    appendEmptyRow,
    enterChainCols,
    lastDataColIndex,
  });

  // Recalculate all rows when header-level gstType changes (issue / invoice mode only)
  const prevGstTypeRef = useRef(effectiveGstType);
  useEffect(() => {
    if (!isHeaderGstMode || !effectiveGstType) return;
    if (effectiveGstType === prevGstTypeRef.current) return;
    prevGstTypeRef.current = effectiveGstType;
    dispatch({ type: "RECALC_GST", gstType: effectiveGstType });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveGstType]); // intentionally excludes dispatch to prevent loop

  const materialOptions = useMemo(
    () =>
      [...materials]
        .sort((a, b) => a.material_no - b.material_no)
        .map((m) => ({
          value: m.id,
          label: isInvoiceMode ? m.name : `${formatCode("M-",m.material_no)} — ${m.name}`,
        })),
    [materials, isInvoiceMode]
  );

  const supplierOptions = useMemo(
    () =>
      [...suppliers]
        .sort((a, b) => a.code_no - b.code_no)
        .map((s) => ({
          value: s.id,
          label: `${formatCode("S-", s.code_no)} — ${s.name}`,
        })),
    [suppliers]
  );

  const contractorOptions = useMemo(
    () => [
      { value: "", label: "None" },
      ...[...contractors]
        .sort((a, b) => a.code_no - b.code_no)
        .map((c) => ({
          value: c.id,
          label: `${formatCode("CON-", c.code_no, 2)} — ${c.name}`,
        })),
    ],
    [contractors]
  );

  // For duplicate-material warning in PO mode — only re-computed when rows change
  const usedMaterialIds = useMemo(
    () => new Set(rows.filter((r) => r.material_id).map((r) => r.material_id)),
    [rows]
  );

  return (
    <div className="overflow-auto">
      <table ref={gridRef} className="min-w-max text-sm w-full" onFocusCapture={handleGridFocusCapture}>
        <thead className="bg-slate-700 text-white sticky top-0 z-10">
          <tr>
            <th className="px-3 py-2 text-left font-medium whitespace-nowrap w-10">S.No</th>
            {showStageColumn && (
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap w-24">Stage</th>
            )}
            <th className="px-3 py-2 text-left font-medium whitespace-nowrap w-20">Mat. Code</th>
            <th className="px-3 py-2 text-left font-medium whitespace-nowrap w-56">Material Name</th>

            {/* Supplier column — PO mode only */}
            {!isIssueMode && !isInvoiceMode && (
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap w-48">Supplier</th>
            )}

            {/* HSN column — issue mode and invoice mode */}
            {(isIssueMode || isInvoiceMode) && (
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap w-28">HSN</th>
            )}

            {/* Contractor column — issue mode only (not invoice mode) */}
            {isIssueMode && (
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap w-44">Contractor</th>
            )}

            {/* Affects Stock column — issue mode only (not invoice mode) */}
            {isIssueMode && (
              <th className="px-3 py-2 text-center font-medium whitespace-nowrap w-24">Affects Stock</th>
            )}

            <th className="px-3 py-2 text-left font-medium whitespace-nowrap w-24">Qty</th>
            <th className="px-3 py-2 text-left font-medium whitespace-nowrap w-20">Unit</th>
            <th className="px-3 py-2 text-left font-medium whitespace-nowrap w-28">Rate</th>
            {(!isInvoiceMode || showTaxColumns) && <th className="px-3 py-2 text-left font-medium whitespace-nowrap w-20">Tax %</th>}
            {isInvoiceMode && showTaxColumns && <th className="px-3 py-2 text-right font-medium whitespace-nowrap w-24">Tax Amt</th>}
            <th className="px-3 py-2 text-right font-medium whitespace-nowrap w-28">Amount</th>
            {!readOnly && <th className="px-3 py-2 w-10" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <TransactionRow
              key={row._key}
              row={row}
              rowIndex={i}
              openComboboxCol={
                openComboboxCell?.row === i ? openComboboxCell.col : null
              }
              dispatch={dispatch}
              materialOptions={materialOptions}
              supplierOptions={supplierOptions}
              contractorOptions={contractorOptions}
              materials={materials}
              suppliers={suppliers}
              contractors={contractors}
              taxRates={taxRates}
              units={units}
              usedMaterialIds={usedMaterialIds}
              isIssueMode={isIssueMode}
              isInvoiceMode={isInvoiceMode}
              isHeaderGstMode={isHeaderGstMode}
              effectiveGstType={effectiveGstType}
              readOnly={readOnly}
              showTaxColumns={showTaxColumns}
              showStageColumn={showStageColumn}
              marginFactor={marginFactor}
              colMaterial={colMaterial}
              colSupplierOrContractor={colSupplierOrContractor}
              colAffectsStock={colAffectsStock}
              colQty={colQty}
              colRate={colRate}
              colTax={colTax}
              colDelete={colDelete}
              onKeyDown={handleKeyDown}
              focusCell={focusCell}
              advanceChain={advanceChain}
              setOpenComboboxCell={setOpenComboboxCell}
            />
          ))}
        </tbody>
      </table>

      {!readOnly && (
        <div className="px-3 py-2 border-t border-slate-100">
          <Button
            variant="outline"
            size="sm"
            className="text-sm h-8"
            onClick={appendEmptyRow}
            type="button"
          >
            + Add Row
          </Button>
        </div>
      )}
    </div>
  );
}

// Exported for compatibility — per-row totals helper
export function calcRowTotals(rows: LineItemDraft[]) {
  let subtotal = 0,
    cgst = 0,
    sgst = 0,
    igst = 0;
  for (const r of rows) {
    if (!r.material_id) continue;
    subtotal += parseFloat(r.amount) || 0;
    cgst += parseFloat(r.cgst_amount) || 0;
    sgst += parseFloat(r.sgst_amount) || 0;
    igst += parseFloat(r.igst_amount) || 0;
  }
  return { subtotal, cgst, sgst, igst, grand: subtotal + cgst + sgst + igst };
}
