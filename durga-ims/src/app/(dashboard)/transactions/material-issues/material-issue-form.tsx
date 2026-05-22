"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useFY } from "@/lib/financial-year";
import {
  createMaterialIssue,
  updateMaterialIssue,
  issueMaterialIssue,
  updateIssuedMaterialIssue,
  deleteMaterialIssue,
} from "@/lib/actions/material-issues.actions";
import { TransactionGrid, newRow, calcRowTotals } from "@/components/forms/TransactionGrid";
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
import { formatCode } from "@/lib/utils";
import { determineGstType } from "@/types";
import type { MaterialIssueWithDetails, LineItemDraft } from "@/types";
import { Combobox } from "@/components/ui/combobox";
import { AlertTriangle, ChevronLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Mode = "new" | "edit-draft" | "edit-issued" | "view";

interface VehicleOption {
  id: string;
  job_ref_no: number;
  vehicle_name: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_gstin: string | null;
  customer_state: string | null;
}

interface ContractorOption {
  id: string;
  code_no: number;
  name: string;
  role: string | null;
}

interface MaterialOption {
  id: string;
  material_no: number;
  name: string;
  hsn_code: string | null;
  tax_rate_id: string | null;
  tax_percentage?: string | null;
  purchase_unit_id: string | null;
  sales_unit_id: string | null;
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
  issue?: MaterialIssueWithDetails | null;
  nextSlipNumber?: number;
  vehicles: VehicleOption[];
  contractors: ContractorOption[];
  materials: MaterialOption[];
  taxRates: TaxRateOption[];
  units: UnitOption[];
}

function toISODate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().split("T")[0];
}

function issueItemsToRows(issue: MaterialIssueWithDetails): LineItemDraft[] {
  if (issue.items.length === 0) return [newRow()];
  return issue.items.map((item) => ({
    _key: crypto.randomUUID(),
    material_id: item.material_id,
    material_name: item.material_name,
    material_no: item.material_no,
    hsn_code: item.hsn_code ?? "",
    supplier_id: "",
    supplier_name: "",
    gst_type: item.gst_type ?? "CGST_SGST",
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
    contractor_id: item.contractor_id ?? "",
    contractor_name: item.contractor_name ?? "",
    affects_inventory: item.affects_inventory,
  }));
}

export function MaterialIssueForm({
  mode,
  issue,
  nextSlipNumber,
  vehicles,
  contractors,
  materials,
  taxRates,
  units,
}: Props) {
  const router = useRouter();
  const { activeFY } = useFY();
  const [isPending, startTransition] = useTransition();

  const isReadOnly = mode === "view";
  const isIssued = mode === "edit-issued";

  // Determine initial vehicle from issue data
  const initVehicle = issue
    ? vehicles.find((v) => v.id === issue.vehicle_id) ?? null
    : null;

  // Derive initial GST type from stored customer data
  const initGstType = issue
    ? determineGstType(issue.customer_gstin, issue.customer_state)
    : "CGST_SGST";

  // ---- State ----
  const [vehicleId, setVehicleId] = useState(issue?.vehicle_id ?? "");
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleOption | null>(initVehicle);
  const [issueDate, setIssueDate] = useState(
    issue ? toISODate(issue.issue_date) : new Date().toISOString().split("T")[0]
  );
  const [marginPct, setMarginPct] = useState(issue?.margin_percentage ?? "0");
  const [gstType, setGstType] = useState<"CGST_SGST" | "IGST">(initGstType);
  const [rows, setRows] = useState<LineItemDraft[]>(
    issue ? issueItemsToRows(issue) : [newRow()]
  );

  // Dialog states
  const [showIssueDialog, setShowIssueDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // ---- Vehicle change handler ----
  function handleVehicleChange(vid: string) {
    const v = vehicles.find((x) => x.id === vid) ?? null;
    setVehicleId(vid);
    setSelectedVehicle(v);
    if (v) {
      const newGst = determineGstType(v.customer_gstin, v.customer_state);
      setGstType(newGst);
    }
  }

  // ---- Row helpers ----
  const totals = calcRowTotals(rows);

  const fmt2 = (n: number) =>
    n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ---- Build submit payload ----
  function buildSubmitData() {
    const filledRows = rows.filter((r) => r.material_id);
    return {
      vehicle_id: vehicleId,
      issue_date: issueDate,
      financial_year: activeFY,
      margin_percentage: marginPct || "0",
      total_amount: totals.grand.toFixed(2),
      items: filledRows.map((r) => ({
        material_id: r.material_id,
        contractor_id: r.contractor_id || null,
        hsn_code: r.hsn_code ?? "",
        qty: r.qty,
        unit_id: r.unit_id,
        rate: r.rate || "0",
        rate_blank: r.rateBlank,
        tax_percentage: r.tax_percentage || "0",
        cgst_amount: r.cgst_amount,
        sgst_amount: r.sgst_amount,
        igst_amount: r.igst_amount,
        amount: r.amount,
        gst_type: gstType,
        affects_inventory: r.affects_inventory,
        zero_rate_confirmed: r.zeroRateConfirmed,
      })),
    };
  }

  // ---- Actions ----
  function handleSaveDraft() {
    startTransition(async () => {
      try {
        const data = buildSubmitData();
        if (mode === "new") {
          const id = await createMaterialIssue(data);
          toast.success("Draft saved.");
          router.push(`/transactions/material-issues/${id}/edit`);
        } else {
          await updateMaterialIssue(issue!.id, data);
          toast.success("Draft saved.");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save draft.");
      }
    });
  }

  function handleSaveReapply() {
    startTransition(async () => {
      try {
        const data = buildSubmitData();
        await updateIssuedMaterialIssue(issue!.id, data);
        toast.success("Issue slip updated. Stock reversed and reapplied.");
        router.push("/transactions/material-issues");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update issue slip.");
      }
    });
  }

  function handleConfirmIssue() {
    startTransition(async () => {
      try {
        // For new: save draft first, then issue
        let targetId = issue?.id;
        if (mode === "new") {
          targetId = await createMaterialIssue(buildSubmitData());
        } else if (mode === "edit-draft") {
          await updateMaterialIssue(issue!.id, buildSubmitData());
        }
        const slipNumber = await issueMaterialIssue(targetId!);
        toast.success(`MI-${String(slipNumber).padStart(4, "0")} issued. Stock updated.`);
        router.push("/transactions/material-issues");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to confirm issue.");
        setShowIssueDialog(false);
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteMaterialIssue(issue!.id);
        toast.success("Issue slip deleted.");
        router.push("/transactions/material-issues");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete.");
        setShowDeleteDialog(false);
      }
    });
  }

  const slipDisplay = issue
    ? `MI-${String(issue.slip_number).padStart(4, "0")}`
    : nextSlipNumber
    ? `MI-${String(nextSlipNumber).padStart(4, "0")}`
    : "MI-—";

  // Rows for confirmation dialog
  const stockRows = rows.filter((r) => r.material_id && r.affects_inventory);
  const passRows = rows.filter((r) => r.material_id && !r.affects_inventory);

  // Client-side stock pre-check (approximate — server re-validates)
  const stockWarnings = stockRows
    .map((r) => {
      const mat = materials.find((m) => m.id === r.material_id);
      if (!mat) return null;
      const available = parseFloat(mat.current_stock);
      const requested = parseFloat(r.qty || "0");
      if (requested > available) {
        return `${r.material_name}: need ${requested} ${r.unit_name || ""}, only ${available.toFixed(2)} available`;
      }
      return null;
    })
    .filter(Boolean) as string[];

  const vehicleOptions = vehicles.map((v) => ({
    value: v.id,
    label: `${formatCode("J", v.job_ref_no, 5)} — ${v.vehicle_name}${v.customer_name ? ` — ${v.customer_name}` : ""}`,
  }));

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 px-6 pt-5 pb-1">
        <Link
          href="/transactions/material-issues"
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
        >
          <ChevronLeft className="w-4 h-4" />
          Material Issues
        </Link>
        <span className="text-slate-300">/</span>
        <span className="text-sm text-slate-700">
          {mode === "new" ? "New Issue Slip" : slipDisplay}
        </span>
      </div>

      {/* Edit-Issued amber banner */}
      {isIssued && (
        <div className="mx-6 mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800">
            This slip has been confirmed. Saving will reverse current stock deductions and reapply them with the new values.
          </p>
        </div>
      )}

      {/* Main content scroll area */}
      <div className="flex-1 overflow-auto px-6 pb-4">
        {/* Header card */}
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-5 space-y-4">
          {/* Row 1: Slip, Date, FY */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Slip No.</label>
              <div className="h-9 px-3 flex items-center rounded-md border border-slate-200 bg-slate-50 text-sm font-mono text-slate-700">
                {slipDisplay}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Issue Date</label>
              {isReadOnly ? (
                <div className="h-9 px-3 flex items-center rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-700">
                  {issueDate}
                </div>
              ) : (
                <Input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="h-9 text-sm"
                />
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Financial Year</label>
              <div className="h-9 px-3 flex items-center rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-600">
                {issue?.financial_year ?? activeFY}
              </div>
            </div>
          </div>

          {/* Row 2: Vehicle / Job */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Vehicle / Job <span className="text-red-500">*</span>
              </label>
              {isReadOnly ? (
                <div className="h-9 px-3 flex items-center rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-700">
                  {selectedVehicle
                    ? `${formatCode("J", selectedVehicle.job_ref_no, 5)} — ${selectedVehicle.vehicle_name}`
                    : issue?.vehicle_name ?? "—"}
                </div>
              ) : (
                <Combobox
                  options={vehicleOptions}
                  value={vehicleId}
                  onChange={handleVehicleChange}
                  placeholder="Select vehicle / job..."
                  searchPlaceholder="Search by job no or vehicle..."
                />
              )}
            </div>
            <div className="flex items-end gap-3">
              {/* GST Type badge */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">GST Type</label>
                <div
                  className={`h-9 px-3 flex items-center rounded-md border text-sm font-medium gap-2 ${
                    gstType === "CGST_SGST"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-blue-200 bg-blue-50 text-blue-700"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-current inline-block" />
                  {gstType === "CGST_SGST" ? "CGST + SGST" : "IGST"}
                </div>
              </div>
              {/* Margin % */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Margin %
                  <span className="ml-1 font-normal text-slate-400">(applied at invoicing)</span>
                </label>
                {isReadOnly ? (
                  <div className="h-9 px-3 w-24 flex items-center rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-700">
                    {marginPct}
                  </div>
                ) : (
                  <Input
                    type="number"
                    value={marginPct}
                    onChange={(e) => setMarginPct(e.target.value)}
                    className="h-9 w-24 text-sm"
                    min="0"
                    step="any"
                    placeholder="0"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Row 3: Customer info (auto-filled, read-only) */}
          {selectedVehicle?.customer_name && (
            <div className="grid grid-cols-3 gap-4 pt-1 border-t border-slate-100">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Customer</label>
                <div className="text-sm text-slate-700 font-medium">
                  {selectedVehicle.customer_name}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">GSTIN</label>
                <div className="text-sm text-slate-600 font-mono">
                  {selectedVehicle.customer_gstin ?? "—"}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">State</label>
                <div className="text-sm text-slate-600">
                  {selectedVehicle.customer_state ?? "—"}
                </div>
              </div>
            </div>
          )}
          {/* Customer info for view mode (from issue data) */}
          {isReadOnly && issue?.customer_name && !selectedVehicle && (
            <div className="grid grid-cols-3 gap-4 pt-1 border-t border-slate-100">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Customer</label>
                <div className="text-sm text-slate-700 font-medium">{issue.customer_name}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">GSTIN</label>
                <div className="text-sm text-slate-600 font-mono">{issue.customer_gstin ?? "—"}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">State</label>
                <div className="text-sm text-slate-600">{issue.customer_state ?? "—"}</div>
              </div>
            </div>
          )}
        </div>

        {/* Line items grid */}
        <div className="mt-4 rounded-lg border border-slate-200 bg-white overflow-hidden">
          <TransactionGrid
            mode="material-issue"
            rows={rows}
            onChange={setRows}
            suppliers={[]}
            materials={materials}
            taxRates={taxRates}
            units={units}
            contractors={contractors}
            gstType={gstType}
            readOnly={isReadOnly}
          />
        </div>
      </div>

      {/* Sticky totals + action bar */}
      <div className="border-t border-slate-200 bg-white px-6 py-3 flex items-center justify-between gap-4">
        {/* Totals */}
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-slate-500">Subtotal</span>
            <span className="ml-2 font-medium text-slate-800">₹{fmt2(totals.subtotal)}</span>
          </div>
          {totals.cgst > 0 && (
            <>
              <div>
                <span className="text-slate-500">CGST</span>
                <span className="ml-2 font-medium text-slate-700">₹{fmt2(totals.cgst)}</span>
              </div>
              <div>
                <span className="text-slate-500">SGST</span>
                <span className="ml-2 font-medium text-slate-700">₹{fmt2(totals.sgst)}</span>
              </div>
            </>
          )}
          {totals.igst > 0 && (
            <div>
              <span className="text-slate-500">IGST</span>
              <span className="ml-2 font-medium text-slate-700">₹{fmt2(totals.igst)}</span>
            </div>
          )}
          <div>
            <span className="text-slate-500">Grand Total</span>
            <span className="ml-2 text-base font-bold text-slate-900">₹{fmt2(totals.grand)}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {/* view mode */}
          {mode === "view" && (
            <Button
              variant="default"
              onClick={() => router.push(`/transactions/material-issues/${issue!.id}/edit`)}
            >
              Edit
            </Button>
          )}

          {/* edit-issued mode */}
          {mode === "edit-issued" && (
            <>
              <Button variant="outline" onClick={() => router.push("/transactions/material-issues")}>
                Cancel
              </Button>
              <Button
                variant="default"
                onClick={handleSaveReapply}
                disabled={isPending}
              >
                {isPending ? "Saving…" : "Save & Reapply"}
              </Button>
            </>
          )}

          {/* new / edit-draft mode */}
          {(mode === "new" || mode === "edit-draft") && (
            <>
              <Button
                variant="outline"
                onClick={() => router.push("/transactions/material-issues")}
              >
                Cancel
              </Button>
              {/* Delete — only for existing drafts */}
              {mode === "edit-draft" && (
                <Button
                  variant="ghost"
                  className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={isPending}
                  type="button"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete
                </Button>
              )}
              <Button
                variant="outline"
                onClick={handleSaveDraft}
                disabled={isPending}
              >
                {isPending ? "Saving…" : "Save Draft"}
              </Button>
              <Button
                variant="default"
                onClick={() => setShowIssueDialog(true)}
                disabled={isPending || !vehicleId}
              >
                Issue Materials
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ---- Confirm Issue Dialog ---- */}
      <Dialog open={showIssueDialog} onOpenChange={setShowIssueDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Issue Slip {slipDisplay}?</DialogTitle>
            <DialogDescription>
              Review stock changes before confirming.
            </DialogDescription>
          </DialogHeader>

          {stockRows.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-slate-500 mb-2">Quantities removed from stock:</p>
              <ul className="space-y-1">
                {stockRows.map((r) => (
                  <li key={r._key} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">
                      <span className="font-mono text-xs text-slate-500 mr-1">
                        {formatCode("M", r.material_no)}
                      </span>
                      {r.material_name}
                    </span>
                    <span className="text-red-600 font-medium ml-4">
                      −{r.qty} {r.unit_name}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {passRows.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-slate-500 mb-2">Pass-through (no stock change):</p>
              <ul className="space-y-1">
                {passRows.map((r) => (
                  <li key={r._key} className="text-sm text-slate-500">
                    {r.material_name} — {r.qty} {r.unit_name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {stockWarnings.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 space-y-1">
              <p className="text-xs font-medium text-amber-700">⚠ Insufficient stock (based on current levels):</p>
              {stockWarnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700">{w}</p>
              ))}
            </div>
          )}

          <p className="text-xs text-slate-400 mt-3">
            Stock changes are permanent and recorded in the Stock Ledger.
          </p>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowIssueDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={handleConfirmIssue}
              disabled={isPending || stockWarnings.length > 0}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
            >
              {isPending ? "Issuing…" : "Issue Materials"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Delete Dialog ---- */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {slipDisplay}?</DialogTitle>
            <DialogDescription>
              This draft issue slip will be permanently deleted. No stock changes will occur.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
