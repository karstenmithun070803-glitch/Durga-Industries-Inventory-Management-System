"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHotkeys } from "react-hotkeys-hook";
import type { ReactElement } from "react";
import type { TableKind, TableKindProps } from "@/lib/pdf-engine/kinds";

/** A tabular report rendered by the direct-draw engine in a Web Worker. */
export type PrintJob = {
  [K in TableKind]: { kind: K; props: TableKindProps[K] };
}[TableKind];

interface PrintButtonProps {
  /** Fast path: tabular reports (worker + direct-draw engine, no main-thread block). */
  getJob?: () => PrintJob | Promise<PrintJob>;
  /** Legacy path: react-pdf element (invoices, slips). Used when `getJob` is absent. */
  getDocument?: () => Promise<ReactElement>;
  disabled?: boolean;
  label?: string;
  hotkey?: string;
}

const PLACEHOLDER_HTML =
  "<!doctype html><title>Generating PDF…</title><body style=\"margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font:15px system-ui;color:#475569\">Generating PDF…</body>";

export function PrintButton({ getJob, getDocument, disabled, label = "Print", hotkey }: PrintButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const isGeneratingRef = useRef(false);

  // Spin the worker up while the browser is idle so the first print has no startup cost.
  useEffect(() => {
    if (!getJob) return;
    void import("@/lib/pdf-engine/client").then((m) => m.warmPdfWorker());
  }, [getJob]);

  async function handlePrint() {
    if (isGeneratingRef.current) return;
    isGeneratingRef.current = true;
    setIsGenerating(true);
    // Open the tab synchronously inside the click so popup blockers allow it, then point it
    // at the PDF once ready. (window.open after an await is commonly blocked.)
    const tab = window.open("", "_blank");
    try {
      tab?.document.write(PLACEHOLDER_HTML);
      tab?.document.close();
    } catch { /* cross-origin / blocked — ignore */ }
    try {
      let blob: Blob;
      if (getJob) {
        const job = await getJob();
        const { generateTablePdf } = await import("@/lib/pdf-engine/client");
        blob = await generateTablePdf(job.kind, job.props as never);
      } else if (getDocument) {
        // Let "Generating…" paint before the (synchronous, heavy) react-pdf layout starts.
        await new Promise((r) => setTimeout(r, 0));
        const { pdf } = await import("@react-pdf/renderer");
        blob = await pdf(await getDocument()).toBlob();
      } else {
        throw new Error("PrintButton needs getJob or getDocument");
      }
      const url = URL.createObjectURL(blob);
      if (tab && !tab.closed) tab.location.href = url;
      else window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error("PDF generation failed", err);
      tab?.close();
      toast.error("Failed to generate PDF. Please try again.");
    } finally {
      isGeneratingRef.current = false;
      setIsGenerating(false);
    }
  }

  useHotkeys(
    hotkey ?? "mod+f24",
    (e) => { e.preventDefault(); void handlePrint(); },
    {
      enabled: !!hotkey && !disabled && !isGenerating,
      preventDefault: true,
      enableOnFormTags: true,
    }
  );

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5 text-xs h-8"
      onClick={handlePrint}
      disabled={disabled || isGenerating}
      title={label}
      data-testid="print-btn"
    >
      <Printer className="w-3.5 h-3.5" />
      {isGenerating ? "Generating…" : label}
    </Button>
  );
}
