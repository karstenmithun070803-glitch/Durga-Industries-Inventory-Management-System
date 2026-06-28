"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReactElement } from "react";

interface PrintButtonProps {
  getDocument: () => Promise<ReactElement>;
  disabled?: boolean;
  label?: string;
}

export function PrintButton({ getDocument, disabled, label = "Print" }: PrintButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const isGeneratingRef = useRef(false);

  async function handlePrint() {
    if (isGeneratingRef.current) return;
    isGeneratingRef.current = true;
    setIsGenerating(true);
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const doc = await getDocument();
      const blob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error("PDF generation failed", err);
      toast.error("Failed to generate PDF. Please try again.");
    } finally {
      isGeneratingRef.current = false;
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
