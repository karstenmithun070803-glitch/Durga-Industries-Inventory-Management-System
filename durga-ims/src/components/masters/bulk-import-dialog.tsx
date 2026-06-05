"use client";

import React, { useState, useTransition, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { bulkImportMaterials } from "@/lib/actions/materials.actions";
import type { Unit, TaxRate, Material } from "@/types";
import { Download, CheckCircle, XCircle, SkipForward } from "lucide-react";

interface ParsedRow {
  rowNum: number;
  displayName: string;
  status: "valid" | "error" | "skipped";
  errors: string[];
  name?: string;
  hsn_code?: string | null;
  tax_rate_id?: string | null;
  purchase_unit_id?: string;
  sales_unit_id?: string | null;
  conversion_value?: string;
  opening_stock?: string;
  min_level?: string;
  max_level?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  units: Unit[];
  taxRates: TaxRate[];
  existingMaterials: Material[];
}

export function BulkImportDialog({ open, onOpenChange, units, taxRates, existingMaterials }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fileName, setFileName] = useState<string>("");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [largeFileWarning, setLargeFileWarning] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const activeUnits = units.filter((u) => u.is_active);
  const activeTaxRates = taxRates.filter((t) => t.is_active);

  const validRows = parsedRows.filter((r) => r.status === "valid");
  const errorRows = parsedRows.filter((r) => r.status === "error");
  const skippedRows = parsedRows.filter((r) => r.status === "skipped");

  function resetDialog() {
    setStep(1);
    setFileName("");
    setParsedRows([]);
    setImportResult(null);
    setImportError(null);
    setLargeFileWarning(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleClose(v: boolean) {
    if (!v) resetDialog();
    onOpenChange(v);
  }

  async function handleDownloadTemplate() {
    const xlsx = await import("xlsx");

    const mainData = [
      [
        "Material Name",
        "HSN Code",
        "Tax Rate %",
        "Purchase Unit",
        "Sales Unit",
        "Conversion Value",
        "Opening Stock",
        "Min Stock Level",
        "Max Stock Level",
      ],
      ["(Example) ENGINE OIL 20W40", "27101990", "18", "LTR", "", "1", "50", "10", ""],
    ];
    const ws = xlsx.utils.aoa_to_sheet(mainData);
    ws["!cols"] = [{ wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 16 }];

    const refData: (string | number)[][] = [
      ["REFERENCE — do not edit this sheet"],
      [],
      ["Available Units (use exact name in Purchase Unit / Sales Unit column)"],
      ["Unit Name", "Code"],
      ...activeUnits.map((u) => [u.unit_name, `U-${String(u.unit_code).padStart(2, "0")}`]),
      [],
      ["Available Tax Rates (use the Tax % value in Tax Rate % column)"],
      ["Tax %", "Description"],
      ...activeTaxRates.map((t) => [parseFloat(t.tax_percentage), t.description]),
    ];
    const wsRef = xlsx.utils.aoa_to_sheet(refData);
    wsRef["!cols"] = [{ wch: 30 }, { wch: 20 }];

    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Materials");
    xlsx.utils.book_append_sheet(wb, wsRef, "Reference");
    xlsx.writeFile(wb, "materials-import-template.xlsx");
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
  }

  async function handleParseAndValidate() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setIsParsing(true);
    try {
      const xlsx = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = xlsx.read(buffer, { type: "array" });
      const wsName = wb.SheetNames[0];
      const ws = wb.Sheets[wsName];
      const rawRowsRaw: Record<string, unknown>[] = xlsx.utils.sheet_to_json(ws, { defval: "", raw: false });
      const rawRows = rawRowsRaw.map((row) => {
        const normalized: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
          normalized[key.trim()] = value;
        }
        return normalized;
      });

      const nonEmpty = rawRows.filter((row) =>
        Object.values(row).some((v) => v !== "" && v !== null && v !== undefined)
      );

      if (nonEmpty.length > 1000) setLargeFileWarning(true);
      else setLargeFileWarning(false);

      const existingNamesUpper = new Set(existingMaterials.map((m) => m.name.toUpperCase()));

      const parsed: ParsedRow[] = nonEmpty.map((row, i) => {
        const rowNum = i + 2;
        const errors: string[] = [];

        const rawName = String(row["Material Name"] ?? "").trim();
        const name = rawName.toUpperCase();
        if (!name) errors.push("Material Name is required");

        const hsn = String(row["HSN Code"] ?? "").trim();
        if (hsn && hsn.length > 8) errors.push("HSN Code must be 8 characters or less");

        const taxPctStr = String(row["Tax Rate %"] ?? "").trim();
        let taxRateId: string | null = null;
        if (taxPctStr) {
          const taxRate = activeTaxRates.find(
            (t) => parseFloat(t.tax_percentage) === parseFloat(taxPctStr)
          );
          if (!taxRate) errors.push(`Tax Rate "${taxPctStr}%" not found — check Reference sheet`);
          else taxRateId = taxRate.id;
        }

        const unitNameRaw = String(row["Purchase Unit"] ?? "").trim();
        const unitNameUpper = unitNameRaw.toUpperCase();
        let purchaseUnitId = "";
        if (!unitNameUpper) {
          errors.push("Purchase Unit is required");
        } else {
          const unit = activeUnits.find((u) => u.unit_name.toUpperCase() === unitNameUpper);
          if (!unit) errors.push(`Purchase Unit "${unitNameRaw}" not found — check Reference sheet`);
          else purchaseUnitId = unit.id;
        }

        const salesUnitRaw = String(row["Sales Unit"] ?? "").trim();
        const salesUnitUpper = salesUnitRaw.toUpperCase();
        let salesUnitId: string | null = null;
        if (salesUnitUpper) {
          const unit = activeUnits.find((u) => u.unit_name.toUpperCase() === salesUnitUpper);
          if (!unit) errors.push(`Sales Unit "${salesUnitRaw}" not found — check Reference sheet`);
          else salesUnitId = unit.id;
        }

        const convStr = String(row["Conversion Value"] ?? "").trim() || "1";
        const convVal = parseFloat(convStr);
        if (isNaN(convVal) || convVal <= 0) errors.push("Conversion Value must be a positive number");

        const openingStr = String(row["Opening Stock"] ?? "").trim() || "0";
        const openingVal = parseFloat(openingStr);
        if (isNaN(openingVal) || openingVal < 0) errors.push("Opening Stock must be ≥ 0");

        const minStr = String(row["Min Stock Level"] ?? "").trim() || "0";
        const minVal = parseFloat(minStr);
        if (isNaN(minVal) || minVal < 0) errors.push("Min Stock Level must be ≥ 0");

        const maxStr = String(row["Max Stock Level"] ?? "").trim();
        if (maxStr) {
          const maxVal = parseFloat(maxStr);
          if (isNaN(maxVal) || maxVal < 0) errors.push("Max Stock Level must be ≥ 0");
        }

        if (errors.length > 0) {
          return { rowNum, displayName: rawName || `Row ${rowNum}`, status: "error" as const, errors };
        }

        if (existingNamesUpper.has(name)) {
          return { rowNum, displayName: rawName, status: "skipped" as const, errors: [], name };
        }

        return {
          rowNum,
          displayName: rawName,
          status: "valid" as const,
          errors: [],
          name,
          hsn_code: hsn || null,
          tax_rate_id: taxRateId,
          purchase_unit_id: purchaseUnitId,
          sales_unit_id: salesUnitId,
          conversion_value: convStr,
          opening_stock: openingStr,
          min_level: minStr,
          max_level: maxStr || null,
        };
      });

      setParsedRows(parsed);
      setStep(2);
    } finally {
      setIsParsing(false);
    }
  }

  function handleImport() {
    const toImport = validRows.map((r) => ({
      name: r.name!,
      hsn_code: r.hsn_code,
      tax_rate_id: r.tax_rate_id,
      purchase_unit_id: r.purchase_unit_id!,
      sales_unit_id: r.sales_unit_id,
      conversion_value: r.conversion_value,
      opening_stock: r.opening_stock,
      min_level: r.min_level,
      max_level: r.max_level,
    }));

    setImportError(null);
    startTransition(async () => {
      try {
        const result = await bulkImportMaterials(toImport);
        setImportResult(result);
        setStep(3);
      } catch (e: unknown) {
        setImportError(e instanceof Error ? e.message : "Import failed — please try again");
        setStep(3);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        showCloseButton={true}
        className="sm:max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
      >
        <DialogHeader>
          <DialogTitle>
            {step === 1 && "Import Materials"}
            {step === 2 && "Preview & Validate"}
            {step === 3 && "Import Complete"}
          </DialogTitle>
          {/* Step indicator */}
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
            {(["1. Upload", "2. Preview", "3. Done"] as const).map((label, idx) => (
              <React.Fragment key={label}>
                <span className={step === idx + 1 ? "font-semibold text-slate-800" : ""}>{label}</span>
                {idx < 2 && <span>›</span>}
              </React.Fragment>
            ))}
          </div>
        </DialogHeader>

        {/* Step 1 — Upload */}
        {step === 1 && (
          <div className="space-y-5 py-2">
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 space-y-3">
              <p className="text-sm text-slate-600">
                Download the template, fill in your materials, then upload it back.
              </p>
              <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Download Template (.xlsx)
              </Button>
              <p className="text-xs text-slate-500">
                The template includes a <strong>Reference</strong> sheet listing all available unit names and tax rates.
              </p>
              <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1.5">
                <strong>Mac Numbers users:</strong> use <em>File → Export To → Excel (.xlsx)</em> after editing — do not just Save, as Numbers saves in .numbers format which cannot be uploaded here.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Upload filled template</label>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-slate-200 file:text-xs file:font-medium file:bg-white file:text-slate-700 hover:file:bg-slate-50 cursor-pointer"
              />
              {fileName && <p className="text-xs text-slate-500">Selected: {fileName}</p>}
            </div>
          </div>
        )}

        {/* Step 2 — Preview */}
        {step === 2 && (
          <div className="flex flex-col min-h-0 flex-1 gap-3">
            {/* Summary */}
            <div className="flex flex-wrap gap-2 py-1">
              <span className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium">
                <CheckCircle className="w-3.5 h-3.5" /> {validRows.length} valid
              </span>
              {errorRows.length > 0 && (
                <span className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-full bg-red-50 text-red-700 font-medium">
                  <XCircle className="w-3.5 h-3.5" /> {errorRows.length} error{errorRows.length !== 1 ? "s" : ""}
                </span>
              )}
              {skippedRows.length > 0 && (
                <span className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-medium">
                  <SkipForward className="w-3.5 h-3.5" /> {skippedRows.length} already exist (will skip)
                </span>
              )}
              {largeFileWarning && (
                <span className="text-xs text-amber-600 self-center">Large file — import may take a moment.</span>
              )}
            </div>

            {/* Table */}
            <div className="overflow-auto flex-1 border border-slate-200 rounded-lg">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-600 w-14">Row</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Material Name</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600 w-24">Status</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((row) => (
                    <tr key={row.rowNum} className={`border-t border-slate-100 ${row.status === "error" ? "bg-red-50/40" : row.status === "skipped" ? "bg-amber-50/30" : ""}`}>
                      <td className="px-3 py-2 text-slate-400 font-mono">{row.rowNum}</td>
                      <td className="px-3 py-2 font-medium text-slate-700">{row.displayName}</td>
                      <td className="px-3 py-2">
                        {row.status === "valid" && <Badge variant="default" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-xs">Valid</Badge>}
                        {row.status === "error" && <Badge variant="destructive" className="text-xs">Error</Badge>}
                        {row.status === "skipped" && <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-xs">Exists</Badge>}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {row.status === "error" && row.errors.join(" · ")}
                        {row.status === "skipped" && "Already in system — will be skipped"}
                        {row.status === "valid" && (
                          <span className="text-emerald-600">
                            {[row.opening_stock && `Opening: ${row.opening_stock}`, row.hsn_code && `HSN: ${row.hsn_code}`].filter(Boolean).join(" · ") || "Ready to import"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Step 3 — Result */}
        {step === 3 && (
          <div className="py-4 space-y-3">
            {importError ? (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 border border-red-200">
                <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-700">Import failed</p>
                  <p className="text-sm text-red-600 mt-0.5">{importError}</p>
                </div>
              </div>
            ) : importResult && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-emerald-50 border border-emerald-200">
                <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-emerald-700">
                    {importResult.imported === 0
                      ? "Nothing to import"
                      : `Successfully imported ${importResult.imported} material${importResult.imported !== 1 ? "s" : ""}`}
                  </p>
                  {importResult.skipped > 0 && (
                    <p className="text-sm text-emerald-600 mt-0.5">
                      {importResult.skipped} row{importResult.skipped !== 1 ? "s" : ""} skipped (already existed).
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="mt-auto">
          {step === 1 && (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button
                onClick={handleParseAndValidate}
                disabled={!fileName || isParsing}
              >
                {isParsing ? "Validating..." : "Validate File"}
              </Button>
            </>
          )}

          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => { setStep(1); setParsedRows([]); }}>
                Re-upload
              </Button>
              <Button
                onClick={handleImport}
                disabled={validRows.length === 0 || isPending}
              >
                {isPending
                  ? "Importing..."
                  : errorRows.length > 0
                    ? `Import ${validRows.length} valid row${validRows.length !== 1 ? "s" : ""}`
                    : `Import ${validRows.length} material${validRows.length !== 1 ? "s" : ""}`}
              </Button>
            </>
          )}

          {step === 3 && (
            <Button onClick={() => handleClose(false)}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
