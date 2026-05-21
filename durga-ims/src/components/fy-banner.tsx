"use client";

import { useFY } from "@/lib/financial-year";

export function FYBanner() {
  const { activeFY, isCurrentFY } = useFY();

  if (isCurrentFY) return null;

  return (
    <div className="w-full bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2 shrink-0">
      <span className="text-amber-600 text-sm">📅</span>
      <p className="text-amber-800 text-sm font-medium">
        Viewing Historical Data — FY {activeFY}.{" "}
        <span className="font-normal">All new entries will be saved to this year. Switch back to the current year to resume normal operations.</span>
      </p>
    </div>
  );
}
