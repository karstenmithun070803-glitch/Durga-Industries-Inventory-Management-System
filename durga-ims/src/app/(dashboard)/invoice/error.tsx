"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function InvoiceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Invoice page error:", error);
  }, [error]);

  return (
    <div className="flex flex-col h-full items-center justify-center gap-4 text-slate-500">
      <p className="text-sm font-medium text-slate-700">Something went wrong.</p>
      <p className="text-xs text-slate-400 max-w-sm text-center">
        The page may be stale. Try refreshing — any unsaved changes will need to be re-entered.
      </p>
      <Button size="sm" variant="outline" onClick={reset}>
        Refresh
      </Button>
    </div>
  );
}
