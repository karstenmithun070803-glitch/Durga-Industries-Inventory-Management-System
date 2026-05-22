"use client";

import { useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReactElement } from "react";

interface PrintButtonProps {
  // A function that returns the React PDF document element — called lazily at click time
  getDocument: () => ReactElement;
  filename: string;
  disabled?: boolean;
  label?: string;
}

export function PrintButton({ getDocument, filename, disabled, label = "Print" }: PrintButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  async function handlePrint() {
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      const doc = getDocument();
      const blob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      // Delay revoke so the download has time to start
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      console.error("PDF generation failed", err);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5 text-xs h-8"
      onClick={handlePrint}
      disabled={disabled || isGenerating}
      title={label}
    >
      <Printer className="w-3.5 h-3.5" />
      {isGenerating ? "Generating…" : label}
    </Button>
  );
}
