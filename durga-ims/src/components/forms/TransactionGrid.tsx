"use client";

import { useRef, useCallback, useEffect, useMemo, useState } from "react";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getLastMaterialRate } from "@/lib/actions/purchase-orders.actions";
import { formatCode } from "@/lib/utils";
import { determineGstType } from "@/types";
import type { LineItemDraft } from "@/types";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useKeyboardGrid } from "@/hooks/use-keyboard-grid";

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
  onChange: (rows: LineItemDraft[]) => void;
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
}

// Column indices per mode (only interactive/focusable elements counted)
// PO:                  Material=0, Supplier=1, Qty=2, Rate=3, Tax%=4
// MI:                  Material=0, Contractor=1, AffectsStock=2, Qty=3, Rate=4, Tax%=5
// Invoice:             Material=0, Qty=1, Rate=2
// Invoice+showTax:     Material=0, Qty=1, Rate=2, Tax%=3
const STATIC_COL_CONFIG = {
  "purchase-order": { columnCount: 5, qtyCol: 2 },
  "material-issue": { columnCount: 6, qtyCol: 3 },
  invoice:          { columnCount: 3, qtyCol: 1 },
} as const;

export function newRow(): LineItemDraft {
  return {
    _key: crypto.randomUUID(),
    material_id: "",
    material_name: "",
    material_no: 0,
    hsn_code: "",
    supplier_id: "",
    supplier_name: "",
    gst_type: "IGST",
    qty: "",
    unit_id: "",
    unit_name: "",
    rate: "",
    tax_percentage: "",
    cgst_amount: "0",
    sgst_amount: "0",
    igst_amount: "0",
    amount: "0",
    rateBlank: false,
    zeroRateConfirmed: false,
    contractor_id: "",
    contractor_name: "",
    affects_inventory: true,
  };
}

function calcAmountsForRow(
  qty: string,
  rate: string,
  taxPct: string,
  gstType: string
): { amount: string; cgst_amount: string; sgst_amount: string; igst_amount: string } {
  const q = parseFloat(qty) || 0;
  const r = parseFloat(rate) || 0;
  const t = parseFloat(taxPct) || 0;
  const amount = q * r;
  const roundTwo = (n: number) => Math.round(n * 100) / 100;

  if (gstType === "CGST_SGST") {
    const half = roundTwo((amount * (t / 100)) / 2);
    return {
      amount: amount.toFixed(2),
      cgst_amount: half.toFixed(2),
      sgst_amount: half.toFixed(2),
      igst_amount: "0.00",
    };
  } else {
    const igst = roundTwo(amount * (t / 100));
    return {
      amount: amount.toFixed(2),
      cgst_amount: "0.00",
      sgst_amount: "0.00",
      igst_amount: igst.toFixed(2),
    };
  }
}

export function TransactionGrid({
  rows,
  onChange,
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
    ? { columnCount: showTaxColumns ? 4 : 3, qtyCol: 1 }
    : STATIC_COL_CONFIG[mode];
  const { columnCount, qtyCol } = colConfig;

  // Track which combobox cell is open so the keyboard hook can yield to cmdk
  const [openComboboxCell, setOpenComboboxCell] = useState<{ row: number; col: number } | null>(null);

  const appendEmptyRow = useCallback(() => {
    onChange([...rows, newRow()]);
  }, [rows, onChange]);

  const { handleKeyDown, focusCell } = useKeyboardGrid({
    gridRef,
    rows,
    columnCount,
    appendEmptyRow,
  });

  // Recalculate all rows when header-level gstType changes (issue / invoice mode only)
  const prevGstTypeRef = useRef(effectiveGstType);
  useEffect(() => {
    if (!isHeaderGstMode || !effectiveGstType) return;
    if (effectiveGstType === prevGstTypeRef.current) return;
    prevGstTypeRef.current = effectiveGstType;
    const recalculated = rows.map((r) => {
      const amounts = calcAmountsForRow(r.qty, r.rate, r.tax_percentage, effectiveGstType);
      return { ...r, gst_type: effectiveGstType, ...amounts };
    });
    onChange(recalculated);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveGstType]); // intentionally excludes rows/onChange to prevent loop

  const update = useCallback(
    (key: string, patch: Partial<LineItemDraft>) => {
      onChange(
        rows.map((r) => {
          if (r._key !== key) return r;
          const updated = { ...r, ...patch };
          const gstForCalc = (isHeaderGstMode ? effectiveGstType : null) ?? updated.gst_type;
          const amounts = calcAmountsForRow(updated.qty, updated.rate, updated.tax_percentage, gstForCalc);
          return { ...updated, gst_type: gstForCalc, ...amounts };
        })
      );
    },
    [rows, onChange, effectiveGstType]
  );

  async function handleMaterialSelect(key: string, materialId: string, rowIndex: number) {
    const mat = materials.find((m) => m.id === materialId);
    if (!mat) return;

    // In PO mode warn on duplicate; in issue mode server validates (contractor+rate combo)
    if (!isIssueMode) {
      const existing = rows.find((r) => r._key !== key && r.material_id === materialId);
      if (existing) toast.warning(`${mat.name} is already in this PO`);
    }

    // Issue / invoice mode: prefer sales unit → fallback purchase unit → amber warning
    // PO mode: always use purchase unit
    const preferredUnitId = mat.purchase_unit_id;

    const unit = preferredUnitId ? units.find((u) => u.id === preferredUnitId) : null;
    // Prefer tax_percentage embedded on the material (issue mode, from DB JOIN)
    // Fall back to taxRates array lookup (PO mode)
    const taxPct =
      mat.tax_percentage ??
      (mat.tax_rate_id ? taxRates.find((t) => t.id === mat.tax_rate_id)?.tax_percentage : null) ??
      "0";

    const lastRate = await getLastMaterialRate(materialId);
    const rateBlank = lastRate === null;

    update(key, {
      material_id: materialId,
      material_name: mat.name,
      material_no: mat.material_no,
      hsn_code: mat.hsn_code ?? "",
      unit_id: preferredUnitId ?? "",
      unit_name: unit?.unit_name ?? "",
      tax_percentage: taxPct,
      rate: lastRate ?? "",
      baseRate: lastRate ?? "",
      rateBlank,
      zeroRateConfirmed: false,
      // In issue/invoice mode, apply header gstType; in PO mode gst_type set by supplier select
      ...(isHeaderGstMode && effectiveGstType ? { gst_type: effectiveGstType } : {}),
    });

    // Auto-focus Qty cell after async material load completes
    setTimeout(() => focusCell(rowIndex, qtyCol), 100);
  }

  function handleSupplierSelect(key: string, supplierId: string) {
    const sup = suppliers.find((s) => s.id === supplierId);
    if (!sup) return;
    const gstType = determineGstType(sup.gstin, sup.state);
    update(key, {
      supplier_id: supplierId,
      supplier_name: sup.name,
      gst_type: gstType,
    });
  }

  function handleContractorSelect(key: string, contractorId: string) {
    if (!contractorId) {
      update(key, { contractor_id: "", contractor_name: "" });
      return;
    }
    const con = contractors.find((c) => c.id === contractorId);
    if (!con) return;
    update(key, {
      contractor_id: contractorId,
      contractor_name: con.name,
    });
  }

  function deleteRow(key: string) {
    const next = rows.filter((r) => r._key !== key);
    onChange(next.length === 0 ? [newRow()] : next);
  }

  const materialOptions = useMemo(
    () => materials.map((m) => ({
      value: m.id,
      label: isInvoiceMode ? m.name : `${formatCode("M", m.material_no)} — ${m.name}`,
    })),
    [materials, isInvoiceMode]
  );

  const supplierOptions = useMemo(
    () => suppliers.map((s) => ({
      value: s.id,
      label: `${formatCode("S", s.code_no)} — ${s.name}`,
    })),
    [suppliers]
  );

  const contractorOptions = useMemo(
    () => [
      { value: "", label: "None" },
      ...contractors.map((c) => ({
        value: c.id,
        label: `${formatCode("CON", c.code_no, 2)} — ${c.name}`,
      })),
    ],
    [contractors]
  );

  const fmt2 = (v: string) =>
    parseFloat(v || "0").toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <div className="overflow-auto">
      <table ref={gridRef} className="min-w-max text-sm w-full">
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
            {isInvoiceMode && !showTaxColumns && <th className="px-3 py-2 text-right font-medium whitespace-nowrap w-24">Tax</th>}
            {isInvoiceMode && showTaxColumns && <th className="px-3 py-2 text-right font-medium whitespace-nowrap w-24">Tax Amt</th>}
            <th className="px-3 py-2 text-right font-medium whitespace-nowrap w-28">Amount</th>
            {!readOnly && <th className="px-3 py-2 w-10" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isOpen = (col: number) =>
              openComboboxCell?.row === i && openComboboxCell?.col === col;

            const showZeroWarning = !row.rateBlank && row.rate === "0" && !row.zeroRateConfirmed;

            // Column indices depend on mode (see COL_CONFIG at top of file)
            // PO:      Material=0, Supplier=1, Qty=2, Rate=3, Tax%=4
            // MI:      Material=0, Contractor=1, AffectsStock=2, Qty=3, Rate=4, Tax%=5
            // Invoice: Material=0, Qty=1, Rate=2
            const colMaterial = 0;
            const colSupplierOrContractor = 1;
            const colAffectsStock = isIssueMode ? 2 : -1;
            const colQty = qtyCol;
            const colRate = isInvoiceMode ? 2 : isIssueMode ? 4 : 3;
            const colTax = isIssueMode ? 5 : mode === "purchase-order" ? 4 : (isInvoiceMode && showTaxColumns) ? 3 : -1;

            return (
              <tr key={row._key} className="border-t border-slate-100">
                <td className="px-3 py-1.5 text-slate-500">{i + 1}</td>
                {showStageColumn && (
                  <td className="px-3 py-1.5 font-mono text-xs text-slate-400 whitespace-nowrap">
                    {row.stage_name || "—"}
                  </td>
                )}

                {/* Material Code — read-only, auto-filled */}
                <td className="px-3 py-1.5 font-mono text-sm text-slate-700 whitespace-nowrap">
                  {row.material_no ? formatCode("M", row.material_no) : "—"}
                </td>

                {/* Material Name combobox */}
                <td className="px-3 py-1.5">
                  {readOnly ? (
                    <span className="text-slate-800">{row.material_name}</span>
                  ) : (
                    <Combobox
                      options={materialOptions}
                      value={row.material_id}
                      onChange={(v) => handleMaterialSelect(row._key, v, i)}
                      placeholder="Select material..."
                      searchPlaceholder="Search materials..."
                      onOpenChange={(open) =>
                        setOpenComboboxCell(open ? { row: i, col: colMaterial } : null)
                      }
                      gridRow={i}
                      gridCol={colMaterial}
                      onGridKeyDown={(e) => handleKeyDown(e, i, colMaterial, false)}
                    />
                  )}
                </td>

                {/* HSN — read-only, auto-filled, issue mode and invoice mode */}
                {(isIssueMode || isInvoiceMode) && (
                  <td className="px-3 py-1.5 font-mono text-sm text-slate-500 whitespace-nowrap">
                    {row.hsn_code || "—"}
                  </td>
                )}

                {/* Supplier combobox — PO mode only */}
                {!isIssueMode && !isInvoiceMode && (
                  <td className="px-3 py-1.5">
                    {readOnly ? (
                      <span className="text-slate-600">{row.supplier_name || "—"}</span>
                    ) : (
                      <Combobox
                        options={supplierOptions}
                        value={row.supplier_id}
                        onChange={(v) => handleSupplierSelect(row._key, v)}
                        placeholder="Select supplier..."
                        searchPlaceholder="Search suppliers..."
                        onOpenChange={(open) =>
                          setOpenComboboxCell(open ? { row: i, col: colSupplierOrContractor } : null)
                        }
                        gridRow={i}
                        gridCol={colSupplierOrContractor}
                        onGridKeyDown={(e) => handleKeyDown(e, i, colSupplierOrContractor, false)}
                      />
                    )}
                  </td>
                )}

                {/* Contractor combobox — issue mode only (optional, nullable) */}
                {isIssueMode && (
                  <td className="px-3 py-1.5">
                    {readOnly ? (
                      <span className="text-slate-600">{row.contractor_name || "—"}</span>
                    ) : (
                      <Combobox
                        options={contractorOptions}
                        value={row.contractor_id}
                        onChange={(v) => handleContractorSelect(row._key, v)}
                        placeholder="None"
                        searchPlaceholder="Search contractors..."
                        onOpenChange={(open) =>
                          setOpenComboboxCell(open ? { row: i, col: colSupplierOrContractor } : null)
                        }
                        gridRow={i}
                        gridCol={colSupplierOrContractor}
                        onGridKeyDown={(e) => handleKeyDown(e, i, colSupplierOrContractor, false)}
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
                        onKeyDown={(e) => handleKeyDown(e, i, colAffectsStock, isOpen(colAffectsStock))}
                        data-grid-row={i}
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
                      type="number"
                      className={`w-20 h-8 text-sm ${
                        !row.qty || parseFloat(row.qty) <= 0
                          ? "border-red-300 focus-visible:ring-red-400"
                          : ""
                      }`}
                      value={row.qty}
                      onChange={(e) => update(row._key, { qty: e.target.value })}
                      onKeyDown={(e) => handleKeyDown(e, i, colQty, isOpen(colQty))}
                      data-grid-row={i}
                      data-grid-col={colQty}
                      min="0"
                      step="any"
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
                    <span className="text-slate-600">{row.unit_name || "—"}</span>
                  )}
                </td>

                {/* Rate */}
                <td className="px-3 py-1.5">
                  {readOnly ? (
                    <span className="text-slate-800">{row.rate}</span>
                  ) : (
                    <div className="space-y-0.5">
                      <Input
                        type="number"
                        className={`w-24 h-8 text-sm ${row.rateBlank ? "bg-yellow-50 border-yellow-300" : ""} ${
                          showZeroWarning ? "border-amber-400" : ""
                        }`}
                        value={row.rate}
                        onChange={(e) =>
                          update(row._key, { rate: e.target.value, baseRate: e.target.value, rateBlank: false })
                        }
                        onKeyDown={(e) => handleKeyDown(e, i, colRate, isOpen(colRate))}
                        data-grid-row={i}
                        data-grid-col={colRate}
                        min="0"
                        step="any"
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
                        type="number"
                        className="w-16 h-8 text-sm"
                        value={row.tax_percentage}
                        onChange={(e) => update(row._key, { tax_percentage: e.target.value })}
                        onKeyDown={(e) => handleKeyDown(e, i, colTax, isOpen(colTax))}
                        data-grid-row={i}
                        data-grid-col={colTax}
                        min="0"
                        max="100"
                        step="any"
                      />
                    )}
                  </td>
                )}

                {/* Tax — invoice mode without showTaxColumns: shows combined tax amount per line (read-only) */}
                {isInvoiceMode && !showTaxColumns && (
                  <td className="px-3 py-1.5 text-right text-slate-600 tabular-nums">
                    {fmt2(
                      (parseFloat(row.cgst_amount || "0") +
                       parseFloat(row.sgst_amount || "0") +
                       parseFloat(row.igst_amount || "0")).toFixed(2)
                    )}
                  </td>
                )}

                {/* Tax Amt — invoice mode with showTaxColumns: combined tax per line (read-only), shown before Amount */}
                {isInvoiceMode && showTaxColumns && (
                  <td className="px-3 py-1.5 text-right text-slate-600 tabular-nums">
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
                      className="h-7 w-7 text-slate-400 hover:text-red-500 hover:bg-red-50"
                      onClick={() => deleteRow(row._key)}
                      type="button"
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

      {!readOnly && (
        <div className="px-3 py-2 border-t border-slate-100">
          <Button
            variant="outline"
            size="sm"
            className="text-sm h-8"
            onClick={() => onChange([...rows, newRow()])}
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
