"use client";

import { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { FileText, ShoppingCart, BarChart2, Search, TrendingUp, GitCompare } from "lucide-react";
import { InvoiceSummaryReport } from "./invoice-summary";
import { PurchaseReport } from "./purchase-report";
import { MonthlyStockReport } from "./monthly-stock";
import { StageWiseCostingReport } from "./stage-wise-costing";
import { VehicleComparisonReport } from "./vehicle-comparison";
import { JobCostPanel } from "@/components/job-cost-panel";
import type { CompanySetting } from "@/lib/actions/settings.actions";
import type { VehicleSearchRow } from "@/lib/actions/stock.actions";
import { useFY } from "@/lib/financial-year";

type ReportTab = "invoice-summary" | "purchase" | "monthly-stock" | "job-cost" | "stage-costing" | "vehicle-comparison";

interface Props {
  vehicles: { id: string; job_ref_no: string }[];
  stageVehicles: { id: string; job_ref_no: string }[];
  suppliers: { id: string; code_no: number; name: string; gstin: string | null }[];
  materials: { id: string; name: string; material_no: number }[];
  customers: { id: string; customer_name: string; gstin: string | null }[];
  stages: { id: string; stage_code: string; stage_name: string }[];
  jobCostVehicles: VehicleSearchRow[];
  companySetting?: CompanySetting;
}

const NAV_ITEMS: { id: ReportTab; label: string; icon: React.ElementType }[] = [
  { id: "invoice-summary",     label: "Invoice Summary",     icon: FileText    },
  { id: "purchase",            label: "Purchase Report",     icon: ShoppingCart },
  { id: "monthly-stock",       label: "Monthly Stock Report", icon: BarChart2   },
  { id: "job-cost",            label: "Job Cost",            icon: Search       },
  { id: "stage-costing",       label: "Stage Costing",       icon: TrendingUp   },
  { id: "vehicle-comparison",  label: "Vehicle Comparison",  icon: GitCompare   },
];

export function ReportsClient({ vehicles, stageVehicles, suppliers, materials, customers, stages, jobCostVehicles, companySetting }: Props) {
  const { activeFY } = useFY();
  const [activeTab, setActiveTab] = useState<ReportTab>("invoice-summary");
  const [navHighlight, setNavHighlight] = useState(-1);
  const asideRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  function focusNavItem(index: number) {
    const buttons = asideRef.current?.querySelectorAll<HTMLButtonElement>("button[data-nav-item]");
    buttons?.[index]?.focus();
  }

  function handleAsideKeyDown(e: React.KeyboardEvent) {
    const count = NAV_ITEMS.length;
    const currentIdx = NAV_ITEMS.findIndex((item) => item.id === activeTab);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(navHighlight < 0 ? currentIdx + 1 : navHighlight + 1, count - 1);
      setNavHighlight(next);
      focusNavItem(next);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = Math.max(navHighlight < 0 ? currentIdx - 1 : navHighlight - 1, 0);
      setNavHighlight(prev);
      focusNavItem(prev);
    } else if (e.key === "Enter" || e.key === "ArrowRight") {
      e.preventDefault();
      const idx = navHighlight >= 0 ? navHighlight : currentIdx;
      setActiveTab(NAV_ITEMS[idx].id);
      setNavHighlight(-1);
      contentRef.current?.focus();
    } else if (e.key === "Escape") {
      setNavHighlight(-1);
    }
  }

  function handleContentKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft" && document.activeElement === contentRef.current) {
      e.preventDefault();
      const currentIdx = NAV_ITEMS.findIndex((item) => item.id === activeTab);
      setNavHighlight(currentIdx);
      focusNavItem(currentIdx);
    }
  }

  return (
    <div className="flex h-full">
      {/* Left sub-nav */}
      <aside
        ref={asideRef}
        className="w-52 shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col py-4 px-2 gap-0.5"
        onKeyDown={handleAsideKeyDown}
      >
        <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider px-3 mb-2">Reports</p>
        {NAV_ITEMS.map((item, idx) => {
          const active = activeTab === item.id;
          const highlighted = navHighlight === idx;
          return (
            <button
              key={item.id}
              data-nav-item
              onClick={() => { setActiveTab(item.id); setNavHighlight(-1); contentRef.current?.focus(); }}
              onFocus={() => setNavHighlight(idx)}
              onBlur={() => setNavHighlight(-1)}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left w-full",
                active
                  ? "bg-slate-800 text-white font-medium"
                  : highlighted
                  ? "bg-slate-200 text-slate-800"
                  : "text-slate-600 hover:text-slate-800 hover:bg-slate-100"
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </aside>

      {/* Report content area */}
      <div
        ref={contentRef}
        tabIndex={-1}
        className="flex-1 min-w-0 overflow-auto outline-none"
        onKeyDown={handleContentKeyDown}
      >
        {activeTab === "invoice-summary" && (
          <InvoiceSummaryReport
            vehicles={vehicles}
            customers={customers}
            defaultFY={activeFY}
            companySetting={companySetting}
          />
        )}
        {activeTab === "purchase" && (
          <PurchaseReport
            suppliers={suppliers}
            materials={materials}
            defaultFY={activeFY}
            companySetting={companySetting}
          />
        )}
        {activeTab === "monthly-stock" && (
          <MonthlyStockReport
            materials={materials}
            defaultFY={activeFY}
            companySetting={companySetting}
          />
        )}
        {activeTab === "job-cost" && (
          <div className="p-6">
            <JobCostPanel vehicles={jobCostVehicles} companySetting={companySetting} />
          </div>
        )}
        {activeTab === "stage-costing" && (
          <StageWiseCostingReport
            vehicles={stageVehicles}
            defaultFY={activeFY}
            companySetting={companySetting}
          />
        )}
        {activeTab === "vehicle-comparison" && (
          <VehicleComparisonReport
            vehicles={vehicles}
            stages={stages}
            defaultFY={activeFY}
            companySetting={companySetting}
          />
        )}
      </div>
    </div>
  );
}
