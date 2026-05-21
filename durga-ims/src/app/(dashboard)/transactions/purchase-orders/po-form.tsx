"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useFY } from "@/lib/financial-year";
import {
  createPurchaseOrder,
  updatePurchaseOrder,
  receivePurchaseOrder,
  updateReceivedPurchaseOrder,
} from "@/lib/actions/purchase-orders.actions";
import { TransactionGrid, newRow, calcTotals } from "@/components/forms/TransactionGrid";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { formatCode } from "@/lib/utils";
import { determineGstType } from "@/types";
import type { PurchaseOrderWithDetails, LineItemDraft, GstType } from "@/types";
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
    hsn_code: item.hsn_code ?? "",
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
  }));
}

function formatAmount(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function POForm({ mode, po, nextPoNumber, suppliers, materials, taxRates, units }: Props) {
  const { activeFY } = useFY();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Header state
  const [supplierId, setSupplierId] = useState(po?.supplier_id ?? "");
  const [poDate, setPoDate] = useState(po ? toISODate(po.po_date) : toISODate(new Date()));
  const [rows, setRows] = useState<LineItemDraft[]>(po ? poItemsToRows(po) : [newRow()]);

  // Receive confirmation dialog
  const [showReceiveDialog, setShowReceiveDialog] = useState(false);

  const isReadOnly = mode === "view";
  const isEditReceived = mode === "edit-received";

  // Derived supplier info
  const supplier = suppliers.find((s) => s.id === supplierId);
  const gstType: GstType = determineGstType(supplier?.gstin, supplier?.state);

  // When supplier changes: recalculate tax amounts for all existing rows
  useEffect(() => {
    if (rows.length === 0) return;
    setRows((prev) =>
      prev.map((r) => {
        const q = parseFloat(r.qty) || 0;
        const rate = parseFloat(r.rate) || 0;
        const t = parseFloat(r.tax_percentage) || 0;
        const amount = q * rate;
        const roundTwo = (n: number) => Math.round(n * 100) / 100;
        if (gstType === "CGST_SGST") {
          const half = roundTwo((amount * (t / 100)) / 2);
          return { ...r, amount: amount.toFixed(2), cgst_amount: half.toFixed(2), sgst_amount: half.toFixed(2), igst_amount: "0.00" };
        } else {
          const igst = roundTwo(amount * (t / 100));
          return { ...r, amount: amount.toFixed(2), cgst_amount: "0.00", sgst_amount: "0.00", igst_amount: igst.toFixed(2) };
        }
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gstType]);

  const { subtotal, cgst, sgst, igst, grand } = calcTotals(rows, gstType);

  // Validation
  function validate(): string | null {
    if (!supplierId) return "Please select a supplier.";
    if (!poDate) return "Please enter a PO date.";
    const filledRows = rows.filter((r) => r.material_id);
    if (filledRows.length === 0) return "Add at least one material.";
    const zeroQty = filledRows.find((r) => !r.qty || parseFloat(r.qty) <= 0);
    if (zeroQty) return `Quantity must be greater than 0 for ${zeroQty.material_name}.`;
    const unconfirmedZeroRate = filledRows.find(
      (r) => (r.rate === "0" || r.rate === "") && !r.zeroRateConfirmed && !r.rateBlank
    );
    if (unconfirmedZeroRate) return `Confirm zero rate for ${unconfirmedZeroRate.material_name}.`;
    return null;
  }

  function buildSubmitData() {
    const filledRows = rows.filter((r) => r.material_id);
    return {
      supplier_id: supplierId,
      po_date: poDate,
      total_amount: grand.toFixed(2),
      items: filledRows.map((r) => ({
        material_id: r.material_id,
        qty: r.qty,
        unit_id: r.unit_id,
        rate: r.rate || "0",
        tax_percentage: r.tax_percentage || "0",
        cgst_amount: r.cgst_amount,
        sgst_amount: r.sgst_amount,
        igst_amount: r.igst_amount,
        amount: r.amount,
      })),
    };
  }

  function handleSaveDraft() {
    const err = validate();
    if (err) { toast.error(err); return; }

    startTransition(async () => {
      try {
        const data = buildSubmitData();
        if (mode === "new") {
          const newId = await createPurchaseOrder({ ...data, financial_year: activeFY });
          toast.success("Draft saved");
          router.push(`/transactions/purchase-orders/${newId}/edit`);
        } else {
          await updatePurchaseOrder(po!.id, data);
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
        const data = buildSubmitData();
        let poId = po?.id;

        if (mode === "new") {
          poId = await createPurchaseOrder({ ...data, financial_year: activeFY });
        } else if (mode === "edit-draft") {
          await updatePurchaseOrder(po!.id, data);
        }

        await receivePurchaseOrder(poId!);
        const poNum = po?.po_number ?? nextPoNumber ?? 0;
        const filledRows = rows.filter((r) => r.material_id);
        toast.success(`PO-${String(poNum).padStart(4, "0")} received. Stock updated for ${filledRows.length} material${filledRows.length !== 1 ? "s" : ""}.`);
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
          {mode === "new" ? "New PO" : mode === "view" ? `${displayPONumber} (View)` : `${displayPONumber}`}
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

      {/* Form + table scroll container */}
      <div className="flex-1 overflow-y-auto px-6 pb-40">
        {/* Header card */}
        <div className="bg-white rounded-lg border border-slate-200 p-5 mb-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 md:grid-cols-4">
            {/* PO Number */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">PO Number</label>
              <p className="font-mono text-sm font-medium text-slate-700 py-1">{displayPONumber}</p>
            </div>
            {/* PO Date */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">PO Date</label>
              {isReadOnly ? (
                <p className="text-sm text-slate-800 py-1">{new Date(poDate).toLocaleDateString("en-IN")}</p>
              ) : (
                <Input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} className="h-8 text-sm" />
              )}
            </div>
            {/* Financial Year */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">Financial Year</label>
              <p className="text-sm text-slate-700 py-1">{po?.financial_year ?? activeFY}</p>
            </div>
            {/* GST Type badge */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">GST Type</label>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                gstType === "CGST_SGST"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-blue-50 text-blue-700 border border-blue-200"
              }`}>
                {gstType === "CGST_SGST" ? "CGST + SGST" : "IGST"}
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Supplier */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">Supplier *</label>
              {isReadOnly ? (
                <p className="text-sm font-medium text-slate-800 py-1">{supplier?.name ?? po?.supplier_name}</p>
              ) : (
                <Combobox
                  options={suppliers.map((s) => ({
                    value: s.id,
                    label: `${formatCode("S", s.code_no)} — ${s.name}`,
                  }))}
                  value={supplierId}
                  onChange={setSupplierId}
                  placeholder="Select supplier..."
                  searchPlaceholder="Search suppliers..."
                />
              )}
            </div>
            {/* Supplier details (auto-filled) */}
            <div className="space-y-1">
              {supplier?.gstin && (
                <p className="text-xs text-slate-500">GSTIN: <span className="font-mono text-slate-700">{supplier.gstin}</span></p>
              )}
              {supplier?.address && (
                <p className="text-xs text-slate-500">Address: <span className="text-slate-700">{supplier.address}</span></p>
              )}
              {supplier?.state && (
                <p className="text-xs text-slate-500">State: <span className="text-slate-700">{supplier.state}</span></p>
              )}
            </div>
          </div>
        </div>

        {/* Line items card */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h2 className="text-sm font-medium text-slate-700">Line Items</h2>
          </div>
          <TransactionGrid
            rows={rows}
            onChange={setRows}
            gstType={gstType}
            materials={materials}
            taxRates={taxRates}
            units={units}
            readOnly={isReadOnly}
          />
        </div>
      </div>

      {/* Sticky totals + action bar */}
      <div className="fixed bottom-0 left-56 right-0 bg-white border-t border-slate-200 shadow-lg z-30">
        {/* Totals row */}
        <div className="px-6 py-2.5 flex items-center gap-6 text-sm border-b border-slate-100">
          <div>
            <span className="text-slate-500">Subtotal: </span>
            <span className="font-medium text-slate-800">{formatAmount(subtotal)}</span>
          </div>
          {gstType === "CGST_SGST" ? (
            <>
              <div>
                <span className="text-slate-500">CGST: </span>
                <span className="font-medium text-slate-800">{formatAmount(cgst)}</span>
              </div>
              <div>
                <span className="text-slate-500">SGST: </span>
                <span className="font-medium text-slate-800">{formatAmount(sgst)}</span>
              </div>
            </>
          ) : (
            <div>
              <span className="text-slate-500">IGST: </span>
              <span className="font-medium text-slate-800">{formatAmount(igst)}</span>
            </div>
          )}
          <div className="ml-auto">
            <span className="text-slate-600 font-medium">Grand Total: </span>
            <span className="text-lg font-bold text-slate-900">{formatAmount(grand)}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="px-6 py-3 flex items-center gap-3">
          <Link href="/transactions/purchase-orders">
            <Button variant="outline">
              {isReadOnly ? "Back" : "Cancel"}
            </Button>
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
            <DialogDescription>
              This will add the following quantities to stock:
            </DialogDescription>
          </DialogHeader>
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
          <p className="text-xs text-slate-500">Stock changes are permanent and recorded in the Stock Ledger.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReceiveDialog(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={confirmReceive} disabled={isPending} className="bg-emerald-600 hover:bg-emerald-700">
              {isPending ? "Processing…" : "Mark as Received"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
