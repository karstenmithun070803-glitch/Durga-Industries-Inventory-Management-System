"use client";

import { useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReactElement } from "react";

interface PrintButtonProps {
  getDocument: () => ReactElement;
  disabled?: boolean;
  label?: string;
}

export function PrintButton({ getDocument, disabled, label = "Print" }: PrintButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  async function handlePrint() {
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      const doc = getDocument();
      const blob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error("PDF generation failed", err);
      toast.error("Failed to generate PDF. Please try again.");
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
