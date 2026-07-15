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
  ClipboardCheck,
  FileText,
  BarChart2,
  Settings,
  ChevronDown,
  ChevronRight,
  Building2,
  LogOut,
  Warehouse,
  Layers,
  ShieldCheck,
  IndianRupee,
} from "lucide-react";
import { logout } from "@/lib/actions/auth.actions";
import { getFYOptions } from "@/lib/fy";
import { useFY } from "@/lib/financial-year";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useHotkeys } from "react-hotkeys-hook";
import { useRouter } from "next/navigation";
import { PwaInstall } from "@/components/pwa-install";

interface NavLeaf {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
}

interface NavItem {
  label: string;
  href?: string;
  icon: typeof LayoutDashboard;
  children?: NavLeaf[];
  adminOnly?: boolean;
}

const nav: NavItem[] = [
  {
    label: "Home",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    label: "Admin",
    icon: ShieldCheck,
    adminOnly: true,
    children: [
      { label: "Material Rate Master", href: "/admin/material-rates", icon: IndianRupee },
    ],
  },
  {
    label: "Masters",
    icon: Package,
    children: [
      { label: "Customers", href: "/masters/customers", icon: Users },
      { label: "Vehicle", href: "/masters/vehicles", icon: Truck },
      { label: "Suppliers", href: "/masters/suppliers", icon: Building2 },
      { label: "Materials", href: "/masters/materials", icon: Package },
      { label: "Units", href: "/masters/units", icon: Ruler },
      { label: "Tax Rates", href: "/masters/tax", icon: Percent },
      { label: "Stages", href: "/masters/stages", icon: Layers },
      { label: "Contractors", href: "/masters/contractors", icon: HardHat },
    ],
  },
  {
    label: "Transactions",
    icon: ShoppingCart,
    children: [
      { label: "Purchase Orders", href: "/transactions/purchase-orders", icon: ShoppingCart },
      { label: "Veh. Issue (Old)", href: "/transactions/material-issues", icon: ClipboardList },
      { label: "Veh. Issue (New)", href: "/transactions/material-issues/new", icon: ClipboardCheck },
    ],
  },
  { label: "Invoice", href: "/invoice", icon: FileText },
  { label: "Stock", href: "/stock", icon: Warehouse },
  { label: "Reports", href: "/reports", icon: BarChart2 },
  { label: "Settings", href: "/settings", icon: Settings },
];

const fyOptions = getFYOptions(5);

export function Sidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { activeFY, setActiveFY, isCurrentFY } = useFY();
  const [openSections, setOpenSections] = useState<string[]>(["Masters"]);
  const [fyOpen, setFyOpen] = useState(false);

  const visibleNav = nav.filter((item) => !item.adminOnly || isAdmin);

  const toggle = (label: string) =>
    setOpenSections((prev) =>
      prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label]
    );

  // Sidebar Alt+ shortcuts
  useHotkeys("alt+m", (e) => { e.preventDefault(); toggle("Masters"); }, { enableOnFormTags: true });
  useHotkeys("alt+t", (e) => { e.preventDefault(); toggle("Transactions"); }, { enableOnFormTags: true });
  useHotkeys("alt+i", (e) => { e.preventDefault(); router.push("/invoice"); }, { enableOnFormTags: true });
  useHotkeys("alt+k", (e) => { e.preventDefault(); router.push("/stock"); }, { enableOnFormTags: true });
  useHotkeys("alt+r", (e) => { e.preventDefault(); router.push("/reports"); }, { enableOnFormTags: true });
  useHotkeys("alt+g", (e) => { e.preventDefault(); router.push("/settings"); }, { enableOnFormTags: true });

  return (
    <aside className="w-56 shrink-0 bg-slate-900 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-slate-700">
        <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">Durga Industries</p>
        <p className="text-white font-semibold text-sm mt-0.5">Inventory System</p>
      </div>

      {/* Nav. `font-nav` (Poppins) is applied to the label <span>s below — NOT here — so the
          font can only ever touch the tab and sub-tab label text. Icons are SVG, and the
          title block / Financial Year / Sign out are siblings outside this <nav>. */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {visibleNav.map((item) => {
          if (item.children) {
            const isOpen = openSections.includes(item.label);
            const isActive = item.children.some((c) => pathname.startsWith(c.href));
            return (
              <div key={item.label}>
                <button
                  onClick={() => toggle(item.label)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[15px] [font-weight:450] transition-colors",
                    isActive
                      ? "text-white bg-slate-700"
                      : "text-white hover:bg-slate-800"
                  )}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span className="font-nav flex-1 text-left whitespace-nowrap">{item.label}</span>
                  {isOpen ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                </button>
                {isOpen && (
                  <div className="ml-3 mt-0.5 space-y-0.5 border-l border-slate-700 pl-3">
                    {item.children.map((child) => {
                      const active = pathname === child.href;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            "flex items-center gap-2 px-2 py-1.5 rounded-md text-[15px] [font-weight:450] transition-colors",
                            active
                              ? "text-white bg-slate-700"
                              : "text-white hover:bg-slate-800"
                          )}
                        >
                          <child.icon className="w-3.5 h-3.5 shrink-0" />
                          <span className="font-nav whitespace-nowrap">{child.label}</span>
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
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-[15px] [font-weight:450] transition-colors",
                active
                  ? "text-white bg-slate-700"
                  : "text-white hover:bg-slate-800"
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span className="font-nav whitespace-nowrap">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-700 space-y-2">
        <div>
          <p className="text-slate-400 text-xs mb-1 flex items-center gap-1.5">
            Financial Year
            {!isCurrentFY && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" title="Viewing historical data" />
            )}
          </p>
          <div className="relative">
            <button
              onClick={() => setFyOpen((v) => !v)}
              data-testid="fy-selector"
              className="w-full flex items-center justify-between bg-slate-800 border border-slate-600 text-slate-200 text-xs rounded px-2 py-1 hover:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              <span>FY {activeFY}</span>
              <ChevronDown className={cn("w-3 h-3 text-slate-400 transition-transform", fyOpen && "rotate-180")} />
            </button>
            {fyOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setFyOpen(false)} />
                <div className="absolute bottom-full mb-1 left-0 w-full bg-slate-800 border border-slate-600 rounded shadow-lg z-20 overflow-hidden">
                  {fyOptions.map((fy) => (
                    <button
                      key={fy}
                      onClick={() => { setActiveFY(fy); setFyOpen(false); }}
                      className={cn(
                        "w-full text-left px-2 py-1.5 text-xs hover:bg-slate-700 transition-colors",
                        activeFY === fy ? "text-white font-medium bg-slate-700" : "text-slate-300"
                      )}
                    >
                      FY {fy}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <PwaInstall />
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
