"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

function friendlyMessage(error: Error): string {
  const m = error.message?.match(
    /^Insufficient stock for "([^"]+)": available ([\d.]+), requested ([\d.]+)\.?$/
  );
  if (m) return `Not enough stock — ${m[1]} (available: ${m[2]}, needed: ${m[3]})`;
  if (error.message) return error.message;
  return "Something went wrong. Please try again.";
}

export default function NewMaterialIssueError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8 min-h-[200px]">
      <div className="flex items-center gap-2 text-red-600">
        <AlertTriangle className="w-5 h-5 shrink-0" />
        <p className="font-medium">{friendlyMessage(error)}</p>
      </div>
      <p className="text-sm text-slate-600">Any unsaved changes may need to be re-entered.</p>
      <Button variant="outline" onClick={reset}>Try Again</Button>
    </div>
  );
}
