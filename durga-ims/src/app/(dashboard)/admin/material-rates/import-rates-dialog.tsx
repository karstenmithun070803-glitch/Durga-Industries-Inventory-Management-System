"use client";

import React, { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Material } from "@/types";
import { Download, CheckCircle, XCircle } from "lucide-react";

// Same normalisation as the uq_materials_name_lower index, so "MS SHEET " and
// "ms sheet" resolve to the one material the DB considers unique.
function normalise(name: string): string {
  return name.trim().toLowerCase();
}

interface MatchedRow {
  rowNum: number;
  name: string;
  materialId: string;
  base?: string;
  buffer?: string;
}

interface UnmatchedRow {
  rowNum: number;
  name: string;
  reason: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  materials: Material[];
  onApply: (matched: Record<string, { base?: string; buffer?: string }>) => void;
}

export function ImportRatesDialog({ open, onOpenChange, materials, onApply }: Props) {
  const [matched, setMatched] = useState<MatchedRow[]>([]);
  const [unmatched, setUnmatched] = useState<UnmatchedRow[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [parsed, setParsed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setMatched([]);
    setUnmatched([]);
    setFileError(null);
    setParsed(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleClose(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  async function handleDownloadTemplate() {
    const xlsx = await import("xlsx");
    const data = [
      ["Material Name", "Base Rate", "Buffer"],
      ...materials.slice(0, 3).map((m) => [m.name, "", ""]),
    ];
    const ws = xlsx.utils.aoa_to_sheet(data);
    ws["!cols"] = [{ wch: 34 }, { wch: 14 }, { wch: 14 }];
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Rates");
    xlsx.writeFile(wb, "material-rates-template.xlsx");
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    reset();

    let rows: Record<string, unknown>[];
    try {
      const xlsx = await import("xlsx");
      const wb = xlsx.read(await file.arrayBuffer(), { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet);
    } catch {
      setFileError("Could not read that file. Use the .xlsx template.");
      return;
    }

    if (rows.length === 0) {
      setFileError("The file has no rows.");
      return;
    }

    const byName = new Map(materials.map((m) => [normalise(m.name), m]));

    // Reject the whole file on an internal duplicate rather than silently last-wins.
    const seen = new Map<string, number>();
    for (let i = 0; i < rows.length; i++) {
      const name = String(rows[i]["Material Name"] ?? "").trim();
      if (!name) continue;
      const key = normalise(name);
      const first = seen.get(key);
      if (first !== undefined) {
        setFileError(
          `"${name}" appears twice — row ${first} and row ${i + 2}. Remove the duplicate and re-upload. Nothing was imported.`
        );
        return;
      }
      seen.set(key, i + 2); // +2: 1-based, plus the header row
    }

    const ok: MatchedRow[] = [];
    const bad: UnmatchedRow[] = [];

    rows.forEach((row, i) => {
      const rowNum = i + 2;
      const name = String(row["Material Name"] ?? "").trim();
      if (!name) return;

      // Accept "Base Rate" (new) or "Max Rate" (old templates) for the base column.
      const baseRaw = String(row["Base Rate"] ?? row["Max Rate"] ?? "").trim();
      const bufferRaw = String(row["Buffer"] ?? "").trim();
      // Blank in both leaves the row untouched — never clears an existing value.
      if (baseRaw === "" && bufferRaw === "") return;

      const mat = byName.get(normalise(name));
      if (!mat) {
        // Names matching an INACTIVE material land here too: this grid shows active
        // materials only, so filling a hidden row would be invisible to the admin.
        bad.push({ rowNum, name, reason: "No active material with this name" });
        return;
      }

      let base: string | undefined;
      let buffer: string | undefined;
      if (baseRaw !== "") {
        const n = Number(baseRaw);
        if (!Number.isFinite(n) || n <= 0) {
          bad.push({ rowNum, name, reason: "Base Rate must be a number greater than 0" });
          return;
        }
        base = String(n);
      }
      if (bufferRaw !== "") {
        const n = Number(bufferRaw);
        if (!Number.isFinite(n) || n < 0) {
          bad.push({ rowNum, name, reason: "Buffer must be a number ≥ 0" });
          return;
        }
        buffer = String(n);
      }

      ok.push({ rowNum, name, materialId: mat.id, base, buffer });
    });

    setMatched(ok);
    setUnmatched(bad);
    setParsed(true);
  }

  function handleApply() {
    onApply(Object.fromEntries(matched.map((m) => [m.materialId, { base: m.base, buffer: m.buffer }])));
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Rates</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Upload an .xlsx with columns <strong>Material Name</strong>, <strong>Base Rate</strong>{" "}
            and <strong>Buffer</strong>. Names are matched to existing materials, ignoring case and
            surrounding spaces. Nothing is saved until you review the grid and press{" "}
            <strong>Save All</strong>.
          </p>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Download template
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFile}
              className="text-sm file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm"
            />
          </div>

          {fileError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {fileError}
            </p>
          )}

          {parsed && (
            <div className="space-y-3">
              <div className="flex gap-4 text-sm">
                <span className="flex items-center gap-1.5 text-emerald-700">
                  <CheckCircle className="w-4 h-4" />
                  {matched.length} matched
                </span>
                {unmatched.length > 0 && (
                  <span className="flex items-center gap-1.5 text-red-600">
                    <XCircle className="w-4 h-4" />
                    {unmatched.length} unmatched
                  </span>
                )}
              </div>

              {unmatched.length > 0 && (
                <div className="max-h-40 overflow-auto border border-red-200 rounded-md">
                  <table className="min-w-full text-xs">
                    <tbody>
                      {unmatched.map((u) => (
                        <tr key={u.rowNum} className="border-b border-red-100 last:border-0">
                          <td className="px-2 py-1 text-slate-500 w-16">Row {u.rowNum}</td>
                          <td className="px-2 py-1 font-medium text-slate-800">{u.name}</td>
                          <td className="px-2 py-1 text-red-600">{u.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {unmatched.length > 0 && matched.length > 0 && (
                <p className="text-xs text-slate-600">
                  Unmatched rows are skipped — the {matched.length} matched rates will still be
                  filled in. Fix the rest by hand in the grid.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={!parsed || matched.length === 0}>
            Fill {matched.length} material{matched.length === 1 ? "" : "s"} into grid
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
