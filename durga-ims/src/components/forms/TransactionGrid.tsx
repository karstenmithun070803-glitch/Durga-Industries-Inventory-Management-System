"use client";

import { useRef, useCallback } from "react";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getLastMaterialRate } from "@/lib/actions/purchase-orders.actions";
import { formatCode } from "@/lib/utils";
import { determineGstType } from "@/types";
import type { LineItemDraft } from "@/types";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

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

interface Props {
  rows: LineItemDraft[];
  onChange: (rows: LineItemDraft[]) => void;
  suppliers: SupplierOption[];
  materials: MaterialOption[];
  taxRates: TaxRateOption[];
  units: UnitOption[];
  readOnly?: boolean;
}

export function newRow(): LineItemDraft {
  return {
    _key: crypto.randomUUID(),
    material_id: "",
    material_name: "",
    material_no: 0,
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

export function TransactionGrid({ rows, onChange, suppliers, materials, taxRates, units, readOnly = false }: Props) {
  const gridRef = useRef<HTMLTableElement>(null);

  const update = useCallback(
    (key: string, patch: Partial<LineItemDraft>) => {
      onChange(
        rows.map((r) => {
          if (r._key !== key) return r;
          const updated = { ...r, ...patch };
          // Recalculate amounts whenever qty, rate, tax, or gst_type changes
          const amounts = calcAmountsForRow(updated.qty, updated.rate, updated.tax_percentage, updated.gst_type);
          return { ...updated, ...amounts };
        })
      );
    },
    [rows, onChange]
  );

  async function handleMaterialSelect(key: string, materialId: string) {
    const mat = materials.find((m) => m.id === materialId);
    if (!mat) return;

    const existing = rows.find((r) => r._key !== key && r.material_id === materialId);
    if (existing) toast.warning(`${mat.name} is already in this PO`);

    const unit = mat.purchase_unit_id ? units.find((u) => u.id === mat.purchase_unit_id) : null;
    const taxRate = mat.tax_rate_id ? taxRates.find((t) => t.id === mat.tax_rate_id) : null;
    const taxPct = taxRate?.tax_percentage ?? "0";

    const lastRate = await getLastMaterialRate(materialId);
    const rateBlank = lastRate === null;

    update(key, {
      material_id: materialId,
      material_name: mat.name,
      material_no: mat.material_no,
      unit_id: mat.purchase_unit_id ?? "",
      unit_name: unit?.unit_name ?? "",
      tax_percentage: taxPct,
      rate: lastRate ?? "",
      rateBlank,
      zeroRateConfirmed: false,
    });
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

  function handleTabOnLastCell(e: React.KeyboardEvent, isLastRow: boolean) {
    if (e.key === "Tab" && !e.shiftKey && isLastRow) {
      e.preventDefault();
      const newRows = [...rows, newRow()];
      onChange(newRows);
      setTimeout(() => {
        const tds = gridRef.current?.querySelectorAll("tbody tr:last-child input");
        (tds?.[0] as HTMLInputElement)?.focus();
      }, 50);
    }
  }

  function deleteRow(key: string) {
    const next = rows.filter((r) => r._key !== key);
    onChange(next.length === 0 ? [newRow()] : next);
  }

  const materialOptions = materials.map((m) => ({
    value: m.id,
    label: `${formatCode("M", m.material_no)} — ${m.name}`,
  }));

  const supplierOptions = suppliers.map((s) => ({
    value: s.id,
    label: `${formatCode("S", s.code_no)} — ${s.name}`,
  }));

  const fmt2 = (v: string) => parseFloat(v || "0").toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="overflow-auto">
      <table ref={gridRef} className="min-w-max text-sm w-full">
        <thead className="bg-slate-50 sticky top-0 z-10">
          <tr>
            <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-10">S.No</th>
            <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-20">Mat. Code</th>
            <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-56">Material Name</th>
            <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-48">Supplier</th>
            <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-24">Qty</th>
            <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-20">Unit</th>
            <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-28">Rate</th>
            <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-20">Tax %</th>
            <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap w-24">CGST</th>
            <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap w-24">SGST</th>
            <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap w-24">IGST</th>
            <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap w-28">Amount</th>
            {!readOnly && <th className="px-3 py-2.5 w-10" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isLastRow = i === rows.length - 1;
            const showZeroWarning = !row.rateBlank && row.rate === "0" && !row.zeroRateConfirmed;

            return (
              <tr key={row._key} className="border-t border-slate-100">
                <td className="px-3 py-1.5 text-slate-500">{i + 1}</td>

                {/* Material Code — read-only, auto-filled */}
                <td className="px-3 py-1.5 font-mono text-xs text-slate-700 whitespace-nowrap">
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
                      onChange={(v) => handleMaterialSelect(row._key, v)}
                      placeholder="Select material..."
                      searchPlaceholder="Search materials..."
                    />
                  )}
                </td>

                {/* Supplier combobox */}
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
                    />
                  )}
                </td>

                {/* Qty */}
                <td className="px-3 py-1.5">
                  {readOnly ? (
                    <span className="text-slate-800">{row.qty}</span>
                  ) : (
                    <Input
                      type="number"
                      className={`w-20 h-8 text-sm ${!row.qty || parseFloat(row.qty) <= 0 ? "border-red-300 focus-visible:ring-red-400" : ""}`}
                      value={row.qty}
                      onChange={(e) => update(row._key, { qty: e.target.value })}
                      onKeyDown={(e) => handleTabOnLastCell(e, isLastRow)}
                      min="0"
                      step="any"
                    />
                  )}
                </td>

                {/* Unit — read-only, auto-filled */}
                <td className="px-3 py-1.5 whitespace-nowrap">
                  {row.material_id && !row.unit_name ? (
                    <span className="text-xs text-amber-600" title="No purchase unit set — edit in Materials master">
                      Not set
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
                        className={`w-24 h-8 text-sm ${row.rateBlank ? "bg-yellow-50 border-yellow-300" : ""} ${showZeroWarning ? "border-amber-400" : ""}`}
                        value={row.rate}
                        onChange={(e) => update(row._key, { rate: e.target.value, rateBlank: false })}
                        min="0"
                        step="any"
                        placeholder={row.rateBlank ? "No history" : ""}
                        title={row.rateBlank ? "No purchase history — enter rate manually" : ""}
                      />
                      {showZeroWarning && (
                        <label className="flex items-center gap-1 text-xs text-amber-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={row.zeroRateConfirmed}
                            onChange={(e) => update(row._key, { zeroRateConfirmed: e.target.checked })}
                            className="w-3 h-3"
                          />
                          Zero cost — confirm?
                        </label>
                      )}
                    </div>
                  )}
                </td>

                {/* Tax % */}
                <td className="px-3 py-1.5">
                  {readOnly ? (
                    <span className="text-slate-800">{row.tax_percentage}</span>
                  ) : (
                    <Input
                      type="number"
                      className="w-16 h-8 text-sm"
                      value={row.tax_percentage}
                      onChange={(e) => update(row._key, { tax_percentage: e.target.value })}
                      min="0"
                      max="100"
                      step="any"
                    />
                  )}
                </td>

                {/* CGST — always shown */}
                <td className="px-3 py-1.5 text-right text-slate-600 tabular-nums">{fmt2(row.cgst_amount)}</td>
                {/* SGST — always shown */}
                <td className="px-3 py-1.5 text-right text-slate-600 tabular-nums">{fmt2(row.sgst_amount)}</td>
                {/* IGST — always shown */}
                <td className="px-3 py-1.5 text-right text-slate-600 tabular-nums">{fmt2(row.igst_amount)}</td>

                {/* Amount */}
                <td className="px-3 py-1.5 text-right font-medium text-slate-800 tabular-nums">{fmt2(row.amount)}</td>

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
            className="text-xs h-7"
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
