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
import { Download, CheckCircle, XCircle, SkipForward } from "lucide-react";

export type ImportRow = Record<string, string | null | undefined>;

export interface ProcessedRow {
  errors: string[];
  displayName: string;
  dedupKey: string;
  data?: ImportRow;
}

interface InternalRow {
  rowNum: number;
  displayName: string;
  status: "valid" | "error" | "skipped";
  errors: string[];
  data?: ImportRow;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  templateFileName: string;
  templateColumns: string[];
  exampleRow: string[];
  referenceSheet?: { rows: (string | number | undefined)[][] };
  existingKeys: Set<string>;
  processRow: (row: Record<string, string>, rowNum: number) => ProcessedRow;
  onImport: (rows: ImportRow[]) => Promise<{ imported: number; skipped: number }>;
}

export function GenericBulkImportDialog({
  open,
  onOpenChange,
  title,
  templateFileName,
  templateColumns,
  exampleRow,
  referenceSheet,
  existingKeys,
  processRow,
  onImport,
}: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fileName, setFileName] = useState("");
  const [parsedRows, setParsedRows] = useState<InternalRow[]>([]);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [largeFileWarning, setLargeFileWarning] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

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
    const mainData = [templateColumns, exampleRow];
    const ws = xlsx.utils.aoa_to_sheet(mainData);
    ws["!cols"] = templateColumns.map(() => ({ wch: 22 }));

    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Data");

    if (referenceSheet) {
      const wsRef = xlsx.utils.aoa_to_sheet(referenceSheet.rows as (string | number)[][]);
      wsRef["!cols"] = [{ wch: 38 }, { wch: 20 }];
      xlsx.utils.book_append_sheet(wb, wsRef, "Reference");
    }

    xlsx.writeFile(wb, templateFileName);
  }

  async function handleParseAndValidate() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setIsParsing(true);
    try {
      const xlsx = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = xlsx.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRowsRaw: Record<string, unknown>[] = xlsx.utils.sheet_to_json(ws, {
        defval: "",
        raw: false,
      });

      const rawRows: Record<string, string>[] = rawRowsRaw.map((row) => {
        const normalized: Record<string, string> = {};
        for (const [key, value] of Object.entries(row)) {
          normalized[key.trim()] = String(value ?? "");
        }
        return normalized;
      });

      const nonEmpty = rawRows.filter((row) =>
        Object.values(row).some((v) => v !== "")
      );

      setLargeFileWarning(nonEmpty.length > 1000);

      const internal: InternalRow[] = nonEmpty.map((row, i) => {
        const rowNum = i + 2;
        const result = processRow(row, rowNum);

        if (result.errors.length > 0) {
          return {
            rowNum,
            displayName: result.displayName,
            status: "error" as const,
            errors: result.errors,
          };
        }

        if (existingKeys.has(result.dedupKey.toUpperCase())) {
          return {
            rowNum,
            displayName: result.displayName,
            status: "skipped" as const,
            errors: [],
          };
        }

        return {
          rowNum,
          displayName: result.displayName,
          status: "valid" as const,
          errors: [],
          data: result.data,
        };
      });

      setParsedRows(internal);
      setStep(2);
    } finally {
      setIsParsing(false);
    }
  }

  function handleImport() {
    const toImport = validRows.map((r) => r.data!);
    setImportError(null);
    startTransition(async () => {
      try {
        const result = await onImport(toImport);
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
        showCloseButton
        className="sm:max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
      >
        <DialogHeader>
          <DialogTitle>
            {step === 1 && title}
            {step === 2 && "Preview & Validate"}
            {step === 3 && "Import Complete"}
          </DialogTitle>
          <div className="flex items-center gap-2 text-xs text-slate-600 mt-1">
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
                Download the template, fill in your data, then upload it back.
              </p>
              <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Download Template (.xlsx)
              </Button>
              {referenceSheet && (
                <p className="text-xs text-slate-600">
                  The template includes a <strong>Reference</strong> sheet with valid lookup values.
                </p>
              )}
              <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1.5">
                <strong>Mac Numbers users:</strong> use <em>File → Export To → Excel (.xlsx)</em> — do not just Save, as Numbers saves in .numbers format which cannot be uploaded.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Upload filled template</label>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
                className="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-slate-200 file:text-xs file:font-medium file:bg-white file:text-slate-700 hover:file:bg-slate-50 cursor-pointer"
              />
              {fileName && <p className="text-xs text-slate-600">Selected: {fileName}</p>}
            </div>
          </div>
        )}

        {/* Step 2 — Preview */}
        {step === 2 && (
          <div className="flex flex-col min-h-0 flex-1 gap-3">
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
                <span className="text-xs text-amber-600 self-center">
                  Large file — import may take a moment.
                </span>
              )}
            </div>

            <div className="overflow-auto flex-1 border border-slate-200 rounded-lg">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-600 w-14">Row</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Name</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600 w-24">Status</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((row) => (
                    <tr
                      key={row.rowNum}
                      className={`border-t border-slate-100 ${
                        row.status === "error"
                          ? "bg-red-50/40"
                          : row.status === "skipped"
                          ? "bg-amber-50/30"
                          : ""
                      }`}
                    >
                      <td className="px-3 py-2 text-slate-700 font-mono">{row.rowNum}</td>
                      <td className="px-3 py-2 font-medium text-slate-700">{row.displayName}</td>
                      <td className="px-3 py-2">
                        {row.status === "valid" && (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-xs">
                            Valid
                          </Badge>
                        )}
                        {row.status === "error" && (
                          <Badge variant="destructive" className="text-xs">
                            Error
                          </Badge>
                        )}
                        {row.status === "skipped" && (
                          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-xs">
                            Exists
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {row.status === "error" && row.errors.join(" · ")}
                        {row.status === "skipped" && "Already in system — will be skipped"}
                        {row.status === "valid" && (
                          <span className="text-emerald-600">Ready to import</span>
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
          <div className="py-4">
            {importError ? (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 border border-red-200">
                <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-700">Import failed</p>
                  <p className="text-sm text-red-600 mt-0.5">{importError}</p>
                </div>
              </div>
            ) : (
              importResult && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-emerald-50 border border-emerald-200">
                  <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-emerald-700">
                      {importResult.imported === 0
                        ? "Nothing to import"
                        : `Successfully imported ${importResult.imported} record${importResult.imported !== 1 ? "s" : ""}`}
                    </p>
                    {importResult.skipped > 0 && (
                      <p className="text-sm text-emerald-600 mt-0.5">
                        {importResult.skipped} row{importResult.skipped !== 1 ? "s" : ""} skipped (already existed).
                      </p>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        )}

        <DialogFooter className="mt-auto">
          {step === 1 && (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button onClick={handleParseAndValidate} disabled={!fileName || isParsing}>
                {isParsing ? "Validating..." : "Validate File"}
              </Button>
            </>
          )}
          {step === 2 && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setStep(1);
                  setParsedRows([]);
                }}
              >
                Re-upload
              </Button>
              <Button onClick={handleImport} disabled={validRows.length === 0 || isPending}>
                {isPending
                  ? "Importing..."
                  : errorRows.length > 0
                  ? `Import ${validRows.length} valid row${validRows.length !== 1 ? "s" : ""}`
                  : `Import ${validRows.length} record${validRows.length !== 1 ? "s" : ""}`}
              </Button>
            </>
          )}
          {step === 3 && <Button onClick={() => handleClose(false)}>Close</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
