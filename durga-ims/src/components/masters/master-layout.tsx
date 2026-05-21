"use client";

import { ReactNode } from "react";

interface Props {
  title: string;
  formPanel: ReactNode;
  tablePanel: ReactNode;
}

export function MasterLayout({ title, formPanel, tablePanel }: Props) {
  return (
    <div className="p-6 h-full flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
      <div className="flex gap-5 flex-1 min-h-0">
        {/* Left: form */}
        <div className="w-80 shrink-0 bg-white rounded-lg border border-slate-200 p-5 h-fit">
          {formPanel}
        </div>
        {/* Right: table */}
        <div className="flex-1 bg-white rounded-lg border border-slate-200 flex flex-col min-h-0">
          {tablePanel}
        </div>
      </div>
    </div>
  );
}
