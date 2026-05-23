"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { TransactionGrid, newRow, calcRowTotals } from "@/components/forms/TransactionGrid";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PrintButton } from "@/components/pdf/print-button";
import { InsuranceInvoiceDocument } from "@/components/pdf/insurance-invoice-pdf";
import { CustomerInvoiceDocument } from "@/components/pdf/customer-invoice-pdf";
import { useFY } from "@/lib/financial-year";
import { formatCode } from "@/lib/utils";

function toISODate(d: string | Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toISOString().split("T")[0];
}
import { determineGstType } from "@/types";
import type { LineItemDraft, InvoiceWithDetails, InvoiceItemWithDetails, InvoiceRow } from "@/types";
import {
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
} from "@/lib/actions/invoices.actions";
import type { CompanySetting } from "@/lib/actions/settings.actions";

type Mode = "new" | "edit" | "view";

interface VehicleOption {
  id: string;
  job_ref_no: number;
  vehicle_name: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_gstin: string | null;
  customer_state: string | null;
}

interface TaxRateOption {
  id: string;
  vat_code: number;
  tax_percentage: string;
  description: string;
  inv_prefix: string | null;
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
  current_stock?: string;
}

interface UnitOption {
  id: string;
  unit_name: string;
}

interface Props {
  mode: Mode;
  invoice?: InvoiceWithDetails | null;
  nextBillNumber?: string;
  vehicles: VehicleOption[];
  taxRates: TaxRateOption[];
  materials: MaterialOption[];
  units: UnitOption[];
  companySetting?: CompanySetting;
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

function itemsFromMISlips(slips: MISlipWithItems[], gstType: string): LineItemDraft[] {
  const raw = slips.flatMap((slip) =>
    slip.items.map((item) => ({
      _key: crypto.randomUUID(),
      _slip_id: slip.slip_id,
      material_id: item.material_id,
      material_name: item.material_name,
      material_no: item.material_no,
      hsn_code: item.hsn_code ?? "",
      supplier_id: "",
      supplier_name: "",
      gst_type: gstType,
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
      zeroRateConfirmed: parseFloat(item.rate) === 0,
      contractor_id: "",
      contractor_name: "",
      affects_inventory: true,
    }))
  );
  return mergeSlipRows(raw);
}

function itemsFromInvoice(invoiceItems: InvoiceItemWithDetails[]): LineItemDraft[] {
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
    issue_id: inv.issue_id,
    vehicle_id: inv.vehicle_id,
    vehicle_name: inv.vehicle_name,
    job_ref_no: inv.job_ref_no,
    customer_id: inv.customer_id,
    customer_name: inv.customer_name,
    customer_gstin: inv.customer_gstin,
    customer_state: inv.customer_state,
    customer_address: inv.customer_address,
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

export function InvoiceForm({ mode, invoice, vehicles, taxRates, materials, units, companySetting }: Props) {
  const router = useRouter();
  const { activeFY: fy } = useFY();
  const [isSaving, setIsSaving] = useState(false);
  const isReadOnly = mode === "view";

  // ── Header state ──────────────────────────────────────────────────────────
  const [vehicleId, setVehicleId] = useState(invoice?.vehicle_id ?? "");
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleOption | null>(
    invoice ? vehicles.find((v) => v.id === invoice.vehicle_id) ?? null : null
  );
  const [gstType, setGstType] = useState<string>(
    invoice
      ? (invoice.items[0]?.gst_type ??
          determineGstType(
            vehicles.find((v) => v.id === invoice.vehicle_id)?.customer_gstin,
            vehicles.find((v) => v.id === invoice.vehicle_id)?.customer_state
          ))
      : "CGST_SGST"
  );

  const [billDate, setBillDate] = useState(
    invoice ? toISODate(invoice.bill_date) : new Date().toISOString().slice(0, 10)
  );
  const [rateDate, setRateDate] = useState(invoice?.rate_date ? toISODate(invoice.rate_date) : "");

  // Tax rate selection (determines bill number prefix)
  const [taxRateId, setTaxRateId] = useState("");
  const [invPrefix, setInvPrefix] = useState<string | null>(null);
  const [billNumber, setBillNumber] = useState(invoice?.bill_number ?? "—");

  // MI slip checklist state
  const [miSlipsMeta, setMiSlipsMeta] = useState<MISlipMeta[]>([]);
  const [miSlipsItems, setMiSlipsItems] = useState<MISlipWithItems[]>([]);
  const [selectedSlipIds, setSelectedSlipIds] = useState<Set<string>>(new Set());
  const [miLoading, setMiLoading] = useState(false);

  const [materialMargin, setMaterialMargin] = useState(invoice?.material_margin ?? "0");
  const [discount, setDiscount] = useState(invoice?.discount ?? "0");
  const [revCharge, setRevCharge] = useState(invoice?.rev_charge_status ?? false);

  // ── Line items state ──────────────────────────────────────────────────────
  const [rows, setRows] = useState<LineItemDraft[]>(
    invoice?.items.length ? itemsFromInvoice(invoice.items) : [newRow()]
  );

  // ── Dialog state ──────────────────────────────────────────────────────────
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  // ── Linked slips for view mode (read-only checklist) ─────────────────────
  const [linkedSlips, setLinkedSlips] = useState<MISlipMeta[]>([]);

  // ── Derived totals ────────────────────────────────────────────────────────
  const totals = calcRowTotals(rows);
  const grossTotal = totals.grand;
  const discountAmt = parseFloat(discount || "0");
  const netAmount = Math.max(0, grossTotal - discountAmt);

  // Rebuild rows from currently selected slips + any manually added rows
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

  // When vehicle changes: load all MI slips + items, auto-populate grid
  async function handleVehicleChange(vid: string) {
    const v = vehicles.find((x) => x.id === vid);
    setVehicleId(vid);
    setSelectedVehicle(v ?? null);
    setMiSlipsMeta([]);
    setMiSlipsItems([]);
    setSelectedSlipIds(new Set());
    setRows([newRow()]);

    if (!v) return;

    const newGst = determineGstType(v.customer_gstin, v.customer_state);
    setGstType(newGst);

    setMiLoading(true);
    try {
      const [slipsMeta, slipsWithItems] = await Promise.all([
        getIssuedMIsForVehicle(vid, invoice?.id),
        getAllIssuedMIItemsForVehicle(vid, invoice?.id),
      ]);
      setMiSlipsMeta(slipsMeta);
      setMiSlipsItems(slipsWithItems);

      if (slipsWithItems.length > 0) {
        const allIds = new Set(slipsWithItems.map((s) => s.slip_id));
        setSelectedSlipIds(allIds);
        const populated = itemsFromMISlips(slipsWithItems, newGst);
        setRows(populated.length ? populated : [newRow()]);
        toast.info(`Auto-populated ${populated.length} item${populated.length !== 1 ? "s" : ""} from ${slipsWithItems.length} issue slip${slipsWithItems.length !== 1 ? "s" : ""}.`);
      }
    } catch {
      toast.error("Failed to load issue slips.");
    } finally {
      setMiLoading(false);
    }
  }

  // Toggle a slip on/off in the checklist
  function handleSlipToggle(slipId: string, checked: boolean) {
    setSelectedSlipIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(slipId); else next.delete(slipId);
      // Rebuild rows: replace slip rows, keep manual rows
      setRows((currentRows) => rebuildRowsFromSlips(miSlipsItems, next, currentRows, gstType));
      return next;
    });
  }

  // When tax rate / prefix changes: update bill number preview
  async function handleTaxRateChange(trId: string) {
    setTaxRateId(trId);
    const tr = taxRates.find((t) => t.id === trId);
    const prefix = tr?.inv_prefix?.trim().toUpperCase() ?? null;
    setInvPrefix(prefix);

    if (!invoice) {
      try {
        const next = await peekNextBillNumber(prefix, fy);
        setBillNumber(next);
      } catch {
        setBillNumber(prefix ? `${prefix}-00001` : "00001");
      }
    }
  }

  // Load initial MIs if editing an existing invoice
  useEffect(() => {
    if (invoice?.vehicle_id && !isReadOnly) {
      Promise.all([
        getIssuedMIsForVehicle(invoice.vehicle_id, invoice.id),
        getAllIssuedMIItemsForVehicle(invoice.vehicle_id, invoice.id),
      ])
        .then(([meta, items]) => {
          setMiSlipsMeta(meta);
          setMiSlipsItems(items);
          // For existing invoice, don't auto-check slips — items already loaded from DB
        })
        .catch(() => {});
    }
  }, [invoice?.vehicle_id, isReadOnly]);

  // Load linked slips for view mode
  useEffect(() => {
    if (mode === "view" && invoice?.id) {
      getLinkedSlipsForInvoice(invoice.id).then(setLinkedSlips).catch(() => {});
    }
  }, [mode, invoice?.id]);

  // ── Build submit payload ───────────────────────────────────────────────────
  function buildPayload() {
    const filledRows = rows.filter((r) => r.material_id);
    return {
      vehicle_id: vehicleId,
      issue_id: null, // multi-slip — no single issue_id
      slip_ids: Array.from(selectedSlipIds),
      bill_date: billDate,
      rate_date: rateDate || null,
      inv_prefix: invPrefix ?? "",
      financial_year: fy,
      tax_percentage: "0",
      material_margin: materialMargin,
      discount: discount,
      net_amount: netAmount.toFixed(2),
      rev_charge_status: revCharge,
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

  async function handleSaveDraft() {
    setIsSaving(true);
    try {
      const payload = buildPayload();
      if (invoice) {
        await updateInvoice(invoice.id, payload);
        toast.success("Invoice saved.");
      } else {
        const id = await createInvoice(payload);
        toast.success(`${billNumber} created.`);
        router.push(`/invoice/${id}/edit`);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save invoice.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleFinalize() {
    setIsSaving(true);
    try {
      if (invoice) {
        await updateInvoice(invoice.id, buildPayload());
        await finalizeInvoice(invoice.id);
        toast.success(`${invoice.bill_number} finalized.`);
        router.refresh();
      } else {
        const id = await createInvoice(buildPayload());
        await finalizeInvoice(id);
        toast.success(`Invoice created and finalized.`);
        router.push(`/invoice/${id}/view`);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to finalize invoice.");
    } finally {
      setIsSaving(false);
      setShowFinalizeDialog(false);
    }
  }

  async function handleRevertToDraft() {
    if (!invoice) return;
    setIsSaving(true);
    try {
      await revertInvoiceToDraft(invoice.id);
      toast.success("Reverted to Draft.");
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to revert.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!invoice) return;
    setIsSaving(true);
    try {
      await deleteInvoice(invoice.id);
      toast.success("Invoice deleted.");
      router.push("/invoice");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete.");
    } finally {
      setIsSaving(false);
      setShowDeleteDialog(false);
    }
  }

  async function handleCancel() {
    if (!invoice) return;
    setIsSaving(true);
    try {
      await cancelInvoice(invoice.id);
      toast.success(`${invoice.bill_number} cancelled.`);
      router.push("/invoice");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel.");
    } finally {
      setIsSaving(false);
      setShowCancelDialog(false);
    }
  }

  const isFinalized = invoice?.status === "Finalized";
  const isCancelled = invoice?.status === "Cancelled";
  const fmt2 = (n: number) =>
    n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const vehicleOptions = vehicles.map((v) => ({
    value: v.id,
    label: `${formatCode("J", v.job_ref_no, 5)} — ${v.vehicle_name}${v.customer_name ? ` — ${v.customer_name}` : ""}`,
  }));

  const taxRateOptions = taxRates.map((t) => ({
    value: t.id,
    label: t.inv_prefix ? `${t.description} (${t.inv_prefix})` : t.description,
  }));

  const selectedTaxRate = taxRates.find((t) => t.id === taxRateId);
  const noPrefixWarning = taxRateId && !selectedTaxRate?.inv_prefix;

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb */}
      <div className="px-6 pt-5 pb-3">
        <p className="text-xs text-slate-400">
          Transactions &rsaquo; Invoices &rsaquo;{" "}
          {invoice ? invoice.bill_number : "New Invoice"}
        </p>
        <h1 className="text-lg font-semibold text-slate-800 mt-0.5">
          {mode === "new" ? "New Invoice" : invoice?.bill_number ?? "Invoice"}
        </h1>
      </div>

      {/* Finalized amber warning (edit mode only) */}
      {isFinalized && mode === "edit" && (
        <div className="mx-6 mb-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded px-4 py-3 text-sm text-amber-800">
          <span className="mt-0.5">⚠</span>
          <span>
            This invoice is <strong>Finalized</strong>. Editing will update the stored record.
            Since invoices do not affect stock, no stock reversal is needed.
          </span>
        </div>
      )}

      {/* Cancelled banner */}
      {isCancelled && (
        <div className="mx-6 mb-3 flex items-start gap-2 bg-rose-50 border border-rose-200 rounded px-4 py-3 text-sm text-rose-800">
          <span className="mt-0.5">✕</span>
          <span>
            This invoice is <strong>Cancelled</strong>. It is a permanent record and cannot be edited or deleted.
            The MI slips linked to it have been freed and can be used in a corrective invoice.
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 pb-32">
        {/* ── Header card ─────────────────────────────────────────────────── */}
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
              {isReadOnly ? (
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
              <label className="text-xs text-slate-500 block mb-1">Financial Year</label>
              <div className="h-9 px-3 flex items-center bg-slate-50 rounded border border-slate-200 text-sm text-slate-700">
                {fy}
              </div>
            </div>
          </div>

          {/* Row 2: Vehicle dropdown */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Vehicle / Job</label>
              {isReadOnly ? (
                <div className="h-9 px-3 flex items-center text-sm text-slate-700">
                  {formatCode("J", invoice?.job_ref_no ?? 0, 5)} — {invoice?.vehicle_name}
                </div>
              ) : (
                <Combobox
                  options={vehicleOptions}
                  value={vehicleId}
                  onChange={handleVehicleChange}
                  placeholder="Select vehicle / job..."
                  searchPlaceholder="Search by job no or vehicle name..."
                />
              )}
            </div>
            <div>
              {selectedVehicle && (
                <div className="mt-5">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                      gstType === "CGST_SGST"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-blue-50 text-blue-700 border border-blue-200"
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {gstType === "CGST_SGST" ? "CGST + SGST" : "IGST"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Customer info (auto-filled from vehicle) */}
          {(selectedVehicle?.customer_name || invoice?.customer_name) && (
            <div className="border-t border-slate-100 pt-3 grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-xs text-slate-400 block">Customer</span>
                <span className="text-slate-700">{selectedVehicle?.customer_name ?? invoice?.customer_name}</span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block">GSTIN</span>
                <span className="font-mono text-slate-600">
                  {selectedVehicle?.customer_gstin ?? invoice?.customer_gstin ?? "—"}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block">State</span>
                <span className="text-slate-600">{selectedVehicle?.customer_state ?? invoice?.customer_state ?? "—"}</span>
              </div>
            </div>
          )}

          {/* MI Slip checklist — editable in edit/new, read-only in view if any slips linked */}
          {isReadOnly && linkedSlips.length > 0 && (
            <div>
              <label className="text-xs text-slate-500 block mb-1.5">Sourced from Issue Slips</label>
              <div className="border border-slate-200 rounded-md divide-y divide-slate-100">
                {linkedSlips.map((slip) => (
                  <div key={slip.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <input type="checkbox" checked readOnly disabled className="w-4 h-4 accent-slate-700 flex-shrink-0 opacity-60" />
                    <span className="font-mono text-slate-700 text-xs">
                      MI-{String(slip.slip_number).padStart(4, "0")}
                    </span>
                    <span className="text-slate-500 text-xs">
                      {new Date(slip.issue_date).toLocaleDateString("en-IN")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isReadOnly && vehicleId && (
            <div>
              <label className="text-xs text-slate-500 block mb-1.5">
                Auto-fill from Issue Slips
              </label>
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
                      <label
                        key={slip.id}
                        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => handleSlipToggle(slip.id, e.target.checked)}
                          className="w-4 h-4 accent-slate-700 flex-shrink-0"
                        />
                        <span className="font-mono text-slate-700 text-xs">
                          MI-{String(slip.slip_number).padStart(4, "0")}
                        </span>
                        <span className="text-slate-500 text-xs">
                          {new Date(slip.issue_date).toLocaleDateString("en-IN")}
                        </span>
                        <span className="text-slate-400 text-xs ml-auto">
                          {slip.item_count} item{slip.item_count !== 1 ? "s" : ""}
                        </span>
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

          {/* Row 3: Tax Rate / Bill Series, Rate Date */}
          <div className="grid grid-cols-3 gap-4">
            {invoice ? (
              <div>
                <label className="text-xs text-slate-500 block mb-1">Bill Series</label>
                <div className="h-9 px-3 flex items-center bg-slate-50 rounded border border-slate-200 text-sm text-slate-500">
                  {invoice.bill_number.includes("-")
                    ? invoice.bill_number.split("-")[0]
                    : "Numeric only"}
                  <span className="ml-2 text-xs text-slate-400">(locked at creation)</span>
                </div>
              </div>
            ) : (
              <div>
                <label className="text-xs text-slate-500 block mb-1">Tax Rate (Bill Series)</label>
                <Combobox
                  options={taxRateOptions}
                  value={taxRateId}
                  onChange={handleTaxRateChange}
                  placeholder="Select tax rate..."
                  searchPlaceholder="Search..."
                />
                {noPrefixWarning ? (
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠ No Invoice Prefix on this rate — bill number will be numeric only. Set one in Tax Master if needed.
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 mt-1">Determines bill number prefix</p>
                )}
              </div>
            )}
            <div>
              <label className="text-xs text-slate-500 block mb-1">Rate Date (optional)</label>
              {isReadOnly ? (
                <div className="h-9 px-3 flex items-center text-sm text-slate-600">
                  {rateDate ? new Date(rateDate).toLocaleDateString("en-IN") : "—"}
                </div>
              ) : (
                <Input
                  type="date"
                  value={rateDate}
                  onChange={(e) => setRateDate(e.target.value)}
                  className="h-9 text-sm"
                />
              )}
            </div>
          </div>

          {/* Row 4: Margin / Discount / Reverse Charge */}
          <div className="grid grid-cols-4 gap-4 items-end">
            <div>
              <label className="text-xs text-slate-500 block mb-1">
                Material Margin %
                <span className="ml-1 text-amber-600 text-xs">(pending client confirmation)</span>
              </label>
              {isReadOnly ? (
                <div className="h-9 px-3 flex items-center text-sm text-slate-700">{materialMargin}</div>
              ) : (
                <Input
                  type="number"
                  value={materialMargin}
                  onChange={(e) => setMaterialMargin(e.target.value)}
                  className="h-9 text-sm"
                  min="0"
                  step="any"
                />
              )}
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Discount (₹)</label>
              {isReadOnly ? (
                <div className="h-9 px-3 flex items-center text-sm text-slate-700">{discount}</div>
              ) : (
                <Input
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className={`h-9 text-sm ${
                    discountAmt > grossTotal ? "border-red-400 focus-visible:ring-red-400" : ""
                  }`}
                  min="0"
                  step="any"
                />
              )}
              {discountAmt > grossTotal && (
                <p className="text-xs text-red-600 mt-0.5">Exceeds total</p>
              )}
            </div>
            <div className="flex items-center gap-2 pb-1">
              <input
                type="checkbox"
                id="rev_charge"
                checked={revCharge}
                onChange={(e) => setRevCharge(e.target.checked)}
                disabled={isReadOnly}
                className="w-4 h-4 accent-slate-700"
              />
              <label htmlFor="rev_charge" className="text-sm text-slate-700 cursor-pointer">
                Reverse Charge
              </label>
            </div>
          </div>

          {/* Reverse charge alert */}
          {revCharge && (
            <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-800">
              ⚠ Reverse charge is ON. Tax liability shifts to the recipient. PDF will show
              "Tax to be paid on reverse charge basis."
            </div>
          )}
        </div>

        {/* ── Line Items grid ────────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-4">
          <div className="px-4 py-2.5 border-b border-slate-100">
            <h2 className="text-sm font-medium text-slate-700">Line Items</h2>
          </div>
          <TransactionGrid
            rows={rows}
            onChange={setRows}
            suppliers={[]}
            materials={materials}
            taxRates={[]}
            units={units}
            readOnly={isReadOnly}
            mode="invoice"
            gstType={gstType}
          />
        </div>
      </div>

      {/* ── Sticky totals + action bar ─────────────────────────────────── */}
      <div className="fixed bottom-0 left-64 right-0 z-30 bg-white border-t border-slate-200 shadow-lg">
        <div className="flex items-center gap-6 px-6 py-2 border-b border-slate-100 text-sm">
          <span className="text-slate-500">
            Subtotal: <strong className="text-slate-800">₹{fmt2(totals.subtotal)}</strong>
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
          {discountAmt > 0 && (
            <span className="text-slate-500">
              Discount: <strong className="text-red-600">−₹{fmt2(discountAmt)}</strong>
            </span>
          )}
          <span className="ml-auto text-base font-semibold text-slate-900">
            Net Amount: ₹{fmt2(netAmount)}
          </span>
        </div>

        <div className="flex items-center gap-3 px-6 py-3">
          {isCancelled ? (
            // Cancelled: read-only, no actions except PDF print and back
            <>
              {invoice && (
                <>
                  <PrintButton
                    label="Insurance PDF"
                    getDocument={() => (
                      <InsuranceInvoiceDocument groups={[buildPdfRows(invoice)]} fy={fy} companySetting={companySetting} />
                    )}
                  />
                  <PrintButton
                    label="Customer PDF"
                    getDocument={() => (
                      <CustomerInvoiceDocument groups={[buildPdfRows(invoice)]} fy={fy} companySetting={companySetting} />
                    )}
                  />
                </>
              )}
              <Button variant="outline" size="sm" onClick={() => router.push("/invoice")}>
                Back to Invoices
              </Button>
            </>
          ) : mode === "view" ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/invoice/${invoice?.id}/edit`)}
              >
                Edit
              </Button>
              {invoice && (
                <>
                  <PrintButton
                    label="Insurance PDF"
                    getDocument={() => (
                      <InsuranceInvoiceDocument groups={[buildPdfRows(invoice)]} fy={fy} companySetting={companySetting} />
                    )}
                  />
                  <PrintButton
                    label="Customer PDF"
                    getDocument={() => (
                      <CustomerInvoiceDocument groups={[buildPdfRows(invoice)]} fy={fy} companySetting={companySetting} />
                    )}
                  />
                </>
              )}
            </>
          ) : isFinalized ? (
            <>
              <Button
                size="sm"
                onClick={handleSaveDraft}
                disabled={isSaving}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {isSaving ? "Saving…" : "Save Changes"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRevertToDraft}
                disabled={isSaving}
              >
                Revert to Draft
              </Button>
              {invoice && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 ml-auto"
                  onClick={() => setShowCancelDialog(true)}
                  disabled={isSaving}
                >
                  Cancel Invoice
                </Button>
              )}
            </>
          ) : (
            <>
              <Button size="sm" onClick={handleSaveDraft} disabled={isSaving} variant="outline">
                {isSaving ? "Saving…" : "Save Draft"}
              </Button>
              <Button
                size="sm"
                onClick={() => setShowFinalizeDialog(true)}
                disabled={isSaving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Finalize Invoice
              </Button>
              {invoice && (
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                    onClick={() => setShowCancelDialog(true)}
                    disabled={isSaving}
                  >
                    Cancel Invoice
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => setShowDeleteDialog(true)}
                    disabled={isSaving}
                  >
                    Delete
                  </Button>
                </div>
              )}
            </>
          )}
          {!isCancelled && mode !== "view" && (
            <Button
              variant="ghost"
              size="sm"
              className={isFinalized && !invoice ? "ml-auto" : ""}
              onClick={() => router.push("/invoice")}
              disabled={isSaving}
            >
              Back
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showFinalizeDialog}
        onOpenChange={setShowFinalizeDialog}
        title={`Finalize ${billNumber}?`}
        description={`Mark this invoice as Finalized (Net Amount: ₹${fmt2(netAmount)})? You can still edit it later if needed — no stock impact either way.${revCharge ? " ⚠ Reverse charge is enabled." : ""}`}
        confirmLabel="Finalize Invoice"
        onConfirm={handleFinalize}
      />

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title={`Delete ${invoice?.bill_number}?`}
        description="This will permanently delete the invoice and all its line items. This cannot be undone."
        confirmLabel="Delete Invoice"
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={showCancelDialog}
        onOpenChange={setShowCancelDialog}
        title={`Cancel ${invoice?.bill_number}?`}
        description="This will permanently cancel the invoice. It cannot be edited or deleted after cancellation. The linked MI slips will be freed for use in a corrective invoice."
        confirmLabel={isSaving ? "Cancelling…" : "Cancel Invoice"}
        onConfirm={handleCancel}
      />
    </div>
  );
}
