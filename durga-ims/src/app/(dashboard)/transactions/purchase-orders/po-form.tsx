"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useFY } from "@/lib/financial-year";
import { isDateInFY } from "@/lib/fy";
import {
  createPurchaseOrder,
  updatePurchaseOrder,
  receivePurchaseOrder,
  updateReceivedPurchaseOrder,
} from "@/lib/actions/purchase-orders.actions";
import { TransactionGrid, newRow } from "@/components/forms/TransactionGrid";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { formatCode } from "@/lib/utils";
import type { PurchaseOrderWithDetails, LineItemDraft } from "@/types";
import { AlertTriangle, ChevronLeft } from "lucide-react";
import { toast } from "sonner";

type Mode = "new" | "edit-draft" | "edit-received" | "view";

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
  sales_unit_id?: string | null;
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
  mode: Mode;
  po?: PurchaseOrderWithDetails;
  nextPoNumber?: number;
  suppliers: SupplierOption[];
  materials: MaterialOption[];
  taxRates: TaxRateOption[];
  units: UnitOption[];
  prefillMaterialId?: string;
}

function toISODate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().split("T")[0];
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
  const grand = subtotal + cgst + sgst + igst;
  return { subtotal, cgst, sgst, igst, grand };
}

export function POForm({ mode, po, nextPoNumber, suppliers, materials, taxRates, units, prefillMaterialId }: Props) {
  const { activeFY } = useFY();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [poDate, setPoDate] = useState(po ? toISODate(po.po_date) : toISODate(new Date()));
  const [affectsStock, setAffectsStock] = useState(po?.affects_stock ?? true);
  const [rows, setRows] = useState<LineItemDraft[]>(() => {
    if (po) return poItemsToRows(po);
    if (prefillMaterialId) {
      const m = materials.find((mat) => mat.id === prefillMaterialId);
      if (m) {
        return [{
          ...newRow(),
          material_id: m.id,
          material_name: m.name,
          material_no: m.material_no,
          hsn_code: m.hsn_code ?? "",
        }];
      }
    }
    return [newRow()];
  });

  const [showReceiveDialog, setShowReceiveDialog] = useState(false);

  const isReadOnly = mode === "view";
  const isEditReceived = mode === "edit-received";

  const { subtotal, cgst, sgst, igst, grand } = calcAllTotals(rows);

  function validate(): string | null {
    if (!poDate) return "Please enter a PO date.";
    if (!isDateInFY(poDate, activeFY)) return `PO date is outside FY ${activeFY} (1 Apr – 31 Mar).`;
    const filledRows = rows.filter((r) => r.material_id);
    if (filledRows.length === 0) return "Add at least one material.";
    const missingSupplier = filledRows.find((r) => !r.supplier_id);
    if (missingSupplier) return `Select a supplier for ${missingSupplier.material_name}.`;
    const zeroQty = filledRows.find((r) => !r.qty || parseFloat(r.qty) <= 0);
    if (zeroQty) return `Quantity must be greater than 0 for ${zeroQty.material_name}.`;
    return null;
  }

  function buildItemsPayload(rowSet: LineItemDraft[]) {
    return rowSet.map((r) => ({
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

  function groupBySupplier(rowSet: LineItemDraft[]): Map<string, LineItemDraft[]> {
    const map = new Map<string, LineItemDraft[]>();
    for (const row of rowSet) {
      const key = row.supplier_id || "__none__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return map;
  }

  function buildSubmitData() {
    const filledRows = rows.filter((r) => r.material_id);
    return {
      po_date: poDate,
      total_amount: grand.toFixed(2),
      affects_stock: affectsStock,
      supplier_bill_no: po?.supplier_bill_no ?? "",
      supplier_bill_date: po?.supplier_bill_date ?? "",
      items: buildItemsPayload(filledRows),
    };
  }

  function handleSaveDraft() {
    const err = validate();
    if (err) { toast.error(err); return; }

    startTransition(async () => {
      try {
        if (mode === "new") {
          const filledRows = rows.filter((r) => r.material_id);
          const bySupplier = groupBySupplier(filledRows);
          let firstId: string | undefined;
          for (const [, supplierRows] of Array.from(bySupplier)) {
            const { grand: g } = calcAllTotals(supplierRows);
            const newId = await createPurchaseOrder({
              po_date: poDate,
              financial_year: activeFY,
              total_amount: g.toFixed(2),
              affects_stock: affectsStock,
              supplier_bill_no: "",
              supplier_bill_date: "",
              items: buildItemsPayload(supplierRows),
            });
            if (!firstId) firstId = newId;
          }
          const count = bySupplier.size;
          toast.success(`${count} draft PO${count > 1 ? "s" : ""} created`);
          if (count === 1 && firstId) {
            router.push(`/transactions/purchase-orders/${firstId}/edit`);
          } else {
            router.push("/transactions/purchase-orders");
          }
        } else {
          await updatePurchaseOrder(po!.id, buildSubmitData());
          toast.success("Draft saved");
        }
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  function handleMarkAsReceived() {
    const err = validate();
    if (err) { toast.error(err); return; }
    setShowReceiveDialog(true);
  }

  function confirmReceive() {
    startTransition(async () => {
      try {
        if (mode === "new") {
          const filledRows = rows.filter((r) => r.material_id);
          const bySupplier = groupBySupplier(filledRows);
          for (const [, supplierRows] of Array.from(bySupplier)) {
            const { grand: g } = calcAllTotals(supplierRows);
            const newId = await createPurchaseOrder({
              po_date: poDate,
              financial_year: activeFY,
              total_amount: g.toFixed(2),
              affects_stock: affectsStock,
              supplier_bill_no: "",
              supplier_bill_date: "",
              items: buildItemsPayload(supplierRows),
            });
            await receivePurchaseOrder(newId);
          }
          const count = bySupplier.size;
          const matCount = filledRows.length;
          toast.success(`${count} PO${count > 1 ? "s" : ""} created and received. Stock updated for ${matCount} material${matCount !== 1 ? "s" : ""}.`);
        } else {
          const data = buildSubmitData();
          let poId = po?.id;
          if (mode === "edit-draft") {
            await updatePurchaseOrder(po!.id, data);
          }
          await receivePurchaseOrder(poId!);
          const poNum = po?.po_number ?? nextPoNumber ?? 0;
          const matCount = rows.filter((r) => r.material_id).length;
          toast.success(`PO-${String(poNum).padStart(4, "0")} received. Stock updated for ${matCount} material${matCount !== 1 ? "s" : ""}.`);
        }
        setShowReceiveDialog(false);
        router.push("/transactions/purchase-orders");
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Receive failed");
        setShowReceiveDialog(false);
      }
    });
  }

  function handleSaveReapply() {
    const err = validate();
    if (err) { toast.error(err); return; }

    startTransition(async () => {
      try {
        const data = buildSubmitData();
        await updateReceivedPurchaseOrder(po!.id, data);
        toast.success("Stock reversed and reapplied successfully");
        router.push("/transactions/purchase-orders");
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  const poNumber = po?.po_number ?? nextPoNumber;
  const displayPONumber = poNumber ? formatCode("PO-", poNumber, 4) : "Pending";
  const filledRows = rows.filter((r) => r.material_id);

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb */}
      <div className="px-6 pt-4 pb-2 flex items-center gap-2 text-sm text-slate-500">
        <Link href="/transactions/purchase-orders" className="hover:text-slate-800 flex items-center gap-1">
          <ChevronLeft className="w-3.5 h-3.5" />Purchase Orders
        </Link>
        <span>/</span>
        <span className="text-slate-800 font-medium">
          {mode === "new" ? "New PO" : mode === "view" ? `${displayPONumber} (View)` : displayPONumber}
        </span>
      </div>

      {/* Amber banner for edit-received */}
      {isEditReceived && (
        <div className="mx-6 mb-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            <span className="font-medium">This PO has already been received.</span> Any changes will reverse the current stock additions and reapply them with the new values. This is an atomic operation.
          </p>
        </div>
      )}

      {/* Form scroll container */}
      <div className="flex-1 overflow-y-auto px-6 pb-40">
        {/* Header card — PO# / Date / FY only, no supplier at header level */}
        <div className="bg-white rounded-lg border border-slate-200 p-5 mb-4">
          <div className="grid grid-cols-3 gap-x-8 gap-y-4">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">PO Number</label>
              <p className="font-mono text-sm font-medium text-slate-700 py-1">{displayPONumber}</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">PO Date</label>
              {isReadOnly ? (
                <p className="text-sm text-slate-800 py-1">{new Date(poDate).toLocaleDateString("en-IN")}</p>
              ) : (
                <Input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} className="h-8 text-sm" />
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">Financial Year</label>
              <p className="text-sm text-slate-700 py-1">{po?.financial_year ?? activeFY}</p>
            </div>
          </div>

          {/* Update Stock checkbox */}
          <div className="mt-4 pt-3 border-t border-slate-100">
            <label className={`flex items-center gap-2.5 ${isReadOnly ? "cursor-default" : "cursor-pointer"}`}>
              <input
                type="checkbox"
                checked={affectsStock}
                onChange={(e) => setAffectsStock(e.target.checked)}
                disabled={isReadOnly}
                className="w-4 h-4 accent-slate-700"
              />
              <span className="text-sm font-medium text-slate-700">Update Stock</span>
              <span className="text-xs text-slate-400">
                {affectsStock
                  ? "Receiving this PO will add quantities to warehouse stock"
                  : "Receiving this PO will NOT update warehouse stock (accounting record only)"}
              </span>
            </label>
          </div>
        </div>

        {/* Line items card */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h2 className="text-sm font-medium text-slate-700">Line Items</h2>
            <p className="text-xs text-slate-400 mt-0.5">Each row has its own supplier — different materials can come from different suppliers.</p>
          </div>
          <TransactionGrid
            rows={rows}
            onChange={setRows}
            suppliers={suppliers}
            materials={materials}
            taxRates={taxRates}
            units={units}
            readOnly={isReadOnly}
          />
        </div>

        {/* Per-supplier split preview — only for new POs with multiple suppliers */}
        {mode === "new" && (() => {
          const filled = rows.filter((r) => r.material_id && r.supplier_id);
          const groups = new Map<string, { name: string; count: number }>();
          for (const r of filled) {
            if (!groups.has(r.supplier_id)) groups.set(r.supplier_id, { name: r.supplier_name || r.supplier_id, count: 0 });
            groups.get(r.supplier_id)!.count++;
          }
          if (groups.size < 2) return null;
          return (
            <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
              <span className="font-medium">Will create {groups.size} POs on save: </span>
              {Array.from(groups.values()).map((g, i) => (
                <span key={i}>{i > 0 ? " · " : ""}{g.name} ({g.count} item{g.count !== 1 ? "s" : ""})</span>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Sticky totals + action bar */}
      <div className="fixed bottom-0 left-56 right-0 bg-white border-t border-slate-200 shadow-lg z-30">
        {/* Totals row — always show all 3 tax columns */}
        <div className="px-6 py-2.5 flex items-center gap-6 text-sm border-b border-slate-100 flex-wrap">
          <div>
            <span className="text-slate-500">Subtotal: </span>
            <span className="font-medium text-slate-800">{formatAmount(subtotal)}</span>
          </div>
          <div>
            <span className="text-slate-500">CGST: </span>
            <span className="font-medium text-slate-800">{formatAmount(cgst)}</span>
          </div>
          <div>
            <span className="text-slate-500">SGST: </span>
            <span className="font-medium text-slate-800">{formatAmount(sgst)}</span>
          </div>
          <div>
            <span className="text-slate-500">IGST: </span>
            <span className="font-medium text-slate-800">{formatAmount(igst)}</span>
          </div>
          <div className="ml-auto">
            <span className="text-slate-600 font-medium">Grand Total: </span>
            <span className="text-lg font-bold text-slate-900">{formatAmount(grand)}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="px-6 py-3 flex items-center gap-3">
          <Link href="/transactions/purchase-orders">
            <Button variant="outline">{isReadOnly ? "Back" : "Cancel"}</Button>
          </Link>

          {mode === "view" && (
            <Link href={`/transactions/purchase-orders/${po!.id}/edit`} className="ml-auto">
              <Button variant="outline" className="text-amber-700 border-amber-300 hover:bg-amber-50">Edit PO</Button>
            </Link>
          )}

          {(mode === "new" || mode === "edit-draft") && (
            <>
              <Button variant="outline" onClick={handleSaveDraft} disabled={isPending}>
                {isPending ? "Saving…" : "Save as Draft"}
              </Button>
              <Button onClick={handleMarkAsReceived} disabled={isPending} className="bg-emerald-600 hover:bg-emerald-700">
                {isPending ? "Processing…" : "Mark as Received"}
              </Button>
            </>
          )}

          {mode === "edit-received" && (
            <Button onClick={handleSaveReapply} disabled={isPending} className="bg-amber-600 hover:bg-amber-700 ml-auto">
              {isPending ? "Processing…" : "Save & Reapply Stock"}
            </Button>
          )}
        </div>
      </div>

      {/* Mark as Received confirmation dialog */}
      <Dialog open={showReceiveDialog} onOpenChange={setShowReceiveDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark {displayPONumber} as Received?</DialogTitle>
            <DialogDescription>This will add the following quantities to stock:</DialogDescription>
          </DialogHeader>
          <div className="max-h-48 overflow-y-auto space-y-1 py-2">
            {filledRows.map((r) => (
              <div key={r._key} className="flex justify-between text-sm py-0.5">
                <span className="text-slate-700">{r.material_name}</span>
                <span className="font-medium text-emerald-700">+{r.qty} {r.unit_name || ""}</span>
              </div>
            ))}
          </div>
          {!affectsStock && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded">
              Stock update is OFF — quantities will NOT be added to warehouse stock.
            </p>
          )}
          {affectsStock && (
            <p className="text-xs text-slate-500">Stock changes are permanent and recorded in the Stock Ledger.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReceiveDialog(false)} disabled={isPending}>Cancel</Button>
            <Button onClick={confirmReceive} disabled={isPending} className="bg-emerald-600 hover:bg-emerald-700">
              {isPending ? "Processing…" : "Mark as Received"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
