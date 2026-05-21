"use client";

import { useRef, useCallback } from "react";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getLastMaterialRate } from "@/lib/actions/purchase-orders.actions";
import { formatCode } from "@/lib/utils";
import type { LineItemDraft, GstType } from "@/types";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

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
  gstType: GstType;
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
    hsn_code: "",
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

function calcAmounts(
  qty: string,
  rate: string,
  taxPct: string,
  gstType: GstType
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

export function TransactionGrid({ rows, onChange, gstType, materials, taxRates, units, readOnly = false }: Props) {
  const gridRef = useRef<HTMLTableElement>(null);

  const update = useCallback(
    (key: string, patch: Partial<LineItemDraft>) => {
      onChange(
        rows.map((r) => {
          if (r._key !== key) return r;
          const updated = { ...r, ...patch };
          // Recalculate amounts whenever qty, rate, or tax changes
          const amounts = calcAmounts(updated.qty, updated.rate, updated.tax_percentage, gstType);
          return { ...updated, ...amounts };
        })
      );
    },
    [rows, onChange, gstType]
  );

  async function handleMaterialSelect(key: string, materialId: string) {
    const mat = materials.find((m) => m.id === materialId);
    if (!mat) return;

    // Check for duplicate
    const existing = rows.find((r) => r._key !== key && r.material_id === materialId);
    if (existing) {
      toast.warning(`${mat.name} is already in this PO`);
    }

    const unit = mat.purchase_unit_id ? units.find((u) => u.id === mat.purchase_unit_id) : null;
    const taxRate = mat.tax_rate_id ? taxRates.find((t) => t.id === mat.tax_rate_id) : null;
    const taxPct = taxRate?.tax_percentage ?? "0";

    // Fetch last rate from received POs
    const lastRate = await getLastMaterialRate(materialId);
    const rateBlank = lastRate === null;

    const patch: Partial<LineItemDraft> = {
      material_id: materialId,
      material_name: mat.name,
      hsn_code: mat.hsn_code ?? "",
      unit_id: mat.purchase_unit_id ?? "",
      unit_name: unit?.unit_name ?? "",
      tax_percentage: taxPct,
      rate: lastRate ?? "",
      rateBlank,
      zeroRateConfirmed: false,
    };

    update(key, patch);
  }

  function handleTabOnLastCell(e: React.KeyboardEvent, isLastRow: boolean) {
    if (e.key === "Tab" && !e.shiftKey && isLastRow) {
      e.preventDefault();
      const newRows = [...rows, newRow()];
      onChange(newRows);
      // Focus will naturally move to the new row's first input
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

  return (
    <div className="overflow-auto">
      <table ref={gridRef} className="min-w-max text-sm w-full">
        <thead className="bg-slate-50 sticky top-0 z-10">
          <tr>
            <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-10">S.No</th>
            <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-56">Material</th>
            <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-20">HSN</th>
            <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-24">Qty</th>
            <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-20">Unit</th>
            <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-28">Rate</th>
            <th className="px-3 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap w-20">Tax %</th>
            {gstType === "CGST_SGST" ? (
              <>
                <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap w-24">CGST</th>
                <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap w-24">SGST</th>
              </>
            ) : (
              <th className="px-3 py-2.5 text-right font-medium text-slate-600 whitespace-nowrap w-28">IGST</th>
            )}
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
                <td className="px-3 py-1.5 text-slate-500 font-mono text-xs">{row.hsn_code || "—"}</td>
                <td className="px-3 py-1.5">
                  {readOnly ? (
                    <span className="text-slate-800">{row.qty}</span>
                  ) : (
                    <Input
                      type="number"
                      className={`w-20 h-8 text-sm ${!row.qty || parseFloat(row.qty) <= 0 ? "border-red-300 focus-visible:ring-red-400" : ""}`}
                      value={row.qty}
                      onChange={(e) => update(row._key, { qty: e.target.value })}
                      onKeyDown={(e) => handleTabOnLastCell(e, isLastRow && e.currentTarget === e.currentTarget)}
                      min="0"
                      step="any"
                    />
                  )}
                </td>
                <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{row.unit_name || "—"}</td>
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
                {gstType === "CGST_SGST" ? (
                  <>
                    <td className="px-3 py-1.5 text-right text-slate-600 tabular-nums">
                      {parseFloat(row.cgst_amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-1.5 text-right text-slate-600 tabular-nums">
                      {parseFloat(row.sgst_amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </>
                ) : (
                  <td className="px-3 py-1.5 text-right text-slate-600 tabular-nums">
                    {parseFloat(row.igst_amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                )}
                <td className="px-3 py-1.5 text-right font-medium text-slate-800 tabular-nums">
                  {parseFloat(row.amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

// Totals calculation helper — exported for use in PO form
export function calcTotals(rows: LineItemDraft[], gstType: GstType) {
  let subtotal = 0, cgst = 0, sgst = 0, igst = 0, grand = 0;
  for (const r of rows) {
    subtotal += parseFloat(r.amount) || 0;
    cgst += parseFloat(r.cgst_amount) || 0;
    sgst += parseFloat(r.sgst_amount) || 0;
    igst += parseFloat(r.igst_amount) || 0;
  }
  grand = subtotal + (gstType === "CGST_SGST" ? cgst + sgst : igst);
  return { subtotal, cgst, sgst, igst, grand };
}
