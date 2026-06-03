"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { FileText, ShoppingCart, BarChart2, Building2 } from "lucide-react";
import { InvoiceSummaryReport } from "./invoice-summary";
import { PurchaseReport } from "./purchase-report";
import { MonthlyStockReport } from "./monthly-stock";
import { SupplierReport } from "./supplier-report";
import type { CompanySetting } from "@/lib/actions/settings.actions";
import { useFY } from "@/lib/financial-year";

type ReportTab = "invoice-summary" | "purchase" | "monthly-stock" | "supplier";

interface Props {
  vehicles: { id: string; vehicle_name: string; job_ref_no: string }[];
  suppliers: { id: string; name: string }[];
  materials: { id: string; name: string; material_no: number }[];
  customers: { id: string; customer_name: string; gstin: string | null }[];
  companySetting?: CompanySetting;
}

const NAV_ITEMS: { id: ReportTab; label: string; icon: React.ElementType }[] = [
  { id: "invoice-summary", label: "Invoice Summary", icon: FileText },
  { id: "purchase", label: "Purchase Report", icon: ShoppingCart },
  { id: "monthly-stock", label: "Monthly Stock Report", icon: BarChart2 },
  { id: "supplier", label: "Supplier Report", icon: Building2 },
];

export function ReportsClient({ vehicles, suppliers, materials, customers, companySetting }: Props) {
  const { activeFY } = useFY();
  const [activeTab, setActiveTab] = useState<ReportTab>("invoice-summary");

  return (
    <div className="flex h-full">
      {/* Left sub-nav */}
      <aside className="w-52 shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col py-4 px-2 gap-0.5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 mb-2">Reports</p>
        {NAV_ITEMS.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left w-full",
                active
                  ? "bg-slate-800 text-white font-medium"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </aside>

      {/* Report content area */}
      <div className="flex-1 min-w-0 overflow-auto">
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
        {activeTab === "supplier" && (
          <SupplierReport
            suppliers={suppliers}
            materials={materials}
            defaultFY={activeFY}
          />
        )}
      </div>
    </div>
  );
}
