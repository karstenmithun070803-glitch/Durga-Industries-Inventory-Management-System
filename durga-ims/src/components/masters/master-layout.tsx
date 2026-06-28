"use client";

import { ReactNode, useCallback } from "react";

interface Props {
  title: string;
  formPanel: ReactNode;
  tablePanel: ReactNode;
}

const FOCUSABLE =
  "input:not([disabled]), select:not([disabled]), [role='combobox']:not([disabled]), textarea:not([disabled])";

export function MasterLayout({ title, formPanel, tablePanel }: Props) {
  const handleFormKeyDown = useCallback((e: React.KeyboardEvent<HTMLFormElement>) => {
    // When combobox dropdown is open, pass all keys through to cmdk
    if (document.activeElement?.closest("[cmdk-root]")) return;

    if (e.key === "Tab") {
      e.preventDefault();
      return;
    }

    const isDown = e.key === "ArrowDown" || e.key === "Enter" || e.key === "ArrowRight";
    const isUp = e.key === "ArrowUp" || e.key === "ArrowLeft";
    if (!isDown && !isUp) return;

    // Let Enter fire normally on buttons (combobox triggers, submit, etc.)
    if (e.key === "Enter" && (e.target as HTMLElement).tagName === "BUTTON") return;

    e.preventDefault();

    const form = e.currentTarget;
    const focusables = Array.from(form.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => !el.closest("[hidden]") && (el as HTMLInputElement).type !== "hidden"
    );
    const current = document.activeElement as HTMLElement;
    const idx = focusables.indexOf(current);
    if (idx === -1) {
      focusables[0]?.focus();
      return;
    }

    if (isDown) {
      focusables[idx + 1]?.focus();
    } else {
      focusables[idx - 1]?.focus();
    }
  }, []);

  return (
    <div className="p-6 h-full flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
      <div className="flex gap-5 flex-1 min-h-0">
        {/* Left: form */}
        <div className="w-80 shrink-0 bg-white rounded-lg border border-slate-200 p-5 h-fit">
          <form autoComplete="off" onSubmit={(e) => e.preventDefault()} onKeyDown={handleFormKeyDown}>
            {formPanel}
          </form>
        </div>
        {/* Right: table */}
        <div className="flex-1 min-w-0 bg-white rounded-lg border border-slate-200 flex flex-col min-h-0">
          {tablePanel}
        </div>
      </div>
    </div>
  );
}
