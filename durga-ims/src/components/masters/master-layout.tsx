"use client";

import { ReactNode, useCallback } from "react";
import { handleVerticalFormKeyDown } from "@/hooks/use-vertical-form-nav";

interface Props {
  title: string;
  formPanel: ReactNode;
  tablePanel: ReactNode;
}

export function MasterLayout({ title, formPanel, tablePanel }: Props) {
  // Masters keep the original semantics: Tab trapped, no extra stops,
  // Enter on a combobox trigger fires natively (opens the dropdown).
  const handleFormKeyDown = useCallback((e: React.KeyboardEvent<HTMLFormElement>) => {
    handleVerticalFormKeyDown(e, { trapTab: true });
  }, []);

  return (
    <div className="p-4 lg:p-6 h-full flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-5 flex-1 min-h-0">
        {/* Left (desktop) / top (mobile): form */}
        <div className="w-full lg:w-80 shrink-0 bg-white rounded-lg border border-slate-200 shadow-sm p-5 h-fit">
          <form autoComplete="off" onSubmit={(e) => e.preventDefault()} onKeyDown={handleFormKeyDown}>
            {formPanel}
          </form>
        </div>
        {/* Right: table — overflow-hidden clips the full-width row-hover band to the
            card's rounded corners (the scroll container is the child below). */}
        <div className="flex-1 min-w-0 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col min-h-0 overflow-hidden">
          {tablePanel}
        </div>
      </div>
    </div>
  );
}
