"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Truck,
  Package,
  Ruler,
  Percent,
  HardHat,
  ShoppingCart,
  ClipboardList,
  FileText,
  BarChart2,
  Settings,
  ChevronDown,
  ChevronRight,
  Building2,
  LogOut,
} from "lucide-react";
import { logout } from "@/lib/actions/auth.actions";
import { useState } from "react";
import { cn } from "@/lib/utils";

const nav = [
  {
    label: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    label: "Masters",
    icon: Package,
    children: [
      { label: "Customers", href: "/masters/customers", icon: Users },
      { label: "Vehicles / Jobs", href: "/masters/vehicles", icon: Truck },
      { label: "Suppliers", href: "/masters/suppliers", icon: Building2 },
      { label: "Materials", href: "/masters/materials", icon: Package },
      { label: "Units", href: "/masters/units", icon: Ruler },
      { label: "Tax Rates", href: "/masters/tax", icon: Percent },
      { label: "Contractors", href: "/masters/contractors", icon: HardHat },
    ],
  },
  {
    label: "Transactions",
    icon: ShoppingCart,
    children: [
      { label: "Purchase Orders", href: "/transactions/purchase-orders", icon: ShoppingCart },
      { label: "Material Issue", href: "/transactions/material-issues", icon: ClipboardList },
    ],
  },
  { label: "Invoice", href: "/invoice", icon: FileText },
  { label: "Reports", href: "/reports", icon: BarChart2 },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [openSections, setOpenSections] = useState<string[]>(["Masters"]);

  const toggle = (label: string) =>
    setOpenSections((prev) =>
      prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label]
    );

  return (
    <aside className="w-56 shrink-0 bg-slate-900 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-slate-700">
        <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">Durga Industries</p>
        <p className="text-white font-semibold text-sm mt-0.5">Inventory System</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {nav.map((item) => {
          if (item.children) {
            const isOpen = openSections.includes(item.label);
            const isActive = item.children.some((c) => pathname.startsWith(c.href));
            return (
              <div key={item.label}>
                <button
                  onClick={() => toggle(item.label)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "text-white bg-slate-700"
                      : "text-slate-400 hover:text-white hover:bg-slate-800"
                  )}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {isOpen ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                </button>
                {isOpen && (
                  <div className="ml-3 mt-0.5 space-y-0.5 border-l border-slate-700 pl-3">
                    {item.children.map((child) => {
                      const active = pathname === child.href || pathname.startsWith(child.href + "/");
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors",
                            active
                              ? "text-white bg-slate-700 font-medium"
                              : "text-slate-400 hover:text-white hover:bg-slate-800"
                          )}
                        >
                          <child.icon className="w-3.5 h-3.5 shrink-0" />
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href!}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                active
                  ? "text-white bg-slate-700"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-700 space-y-2">
        <p className="text-slate-500 text-xs">FY 2026-2027</p>
        <form action={logout}>
          <button
            type="submit"
            className="flex items-center gap-2 text-slate-400 hover:text-white text-xs transition-colors w-full"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
