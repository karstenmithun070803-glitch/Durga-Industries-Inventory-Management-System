"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  LogOut,
  Menu,
} from "lucide-react";
import { logout } from "@/lib/actions/auth.actions";
import { getFYOptions } from "@/lib/fy";
import { useFY } from "@/lib/financial-year";
import { cn } from "@/lib/utils";
import { nav, type NavItem } from "@/lib/nav";
import { PwaInstall } from "@/components/pwa-install";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";

const fyOptions = getFYOptions(5);

/** Human-readable title for the current route, from the nav tree. */
function usePageTitle(pathname: string): string {
  return useMemo(() => {
    for (const item of nav) {
      if (item.href && item.href === pathname) return item.label;
      if (item.children) {
        const leaf = item.children.find((c) => c.href === pathname);
        if (leaf) return leaf.label;
      }
    }
    // Fallback: longest-prefix match on leaves (handles nested/detail routes).
    let best: { label: string; len: number } | null = null;
    for (const item of nav) {
      const candidates = item.children ?? (item.href ? [{ label: item.label, href: item.href }] : []);
      for (const c of candidates) {
        if (c.href !== "/" && pathname.startsWith(c.href) && c.href.length > (best?.len ?? 0)) {
          best = { label: c.label, len: c.href.length };
        }
      }
    }
    return best?.label ?? "Menu";
  }, [pathname]);
}

export function MobileNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const { activeFY, setActiveFY, isCurrentFY } = useFY();
  const [open, setOpen] = useState(false);
  const [openSections, setOpenSections] = useState<string[]>(["Masters"]);
  const [fyOpen, setFyOpen] = useState(false);
  const title = usePageTitle(pathname);

  // Same role filtering as the desktop sidebar — adminOnly items are hidden for non-admins.
  const visibleNav = nav.filter((item: NavItem) => !item.adminOnly || isAdmin);

  const toggleSection = (label: string) =>
    setOpenSections((prev) =>
      prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label]
    );

  return (
    <header className="lg:hidden shrink-0 bg-slate-900 pt-safe">
      <div className="flex h-14 items-center gap-2 px-3">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            aria-label="Open navigation menu"
            className="flex size-11 shrink-0 items-center justify-center rounded-md text-white hover:bg-slate-800"
          >
            <Menu className="size-5" />
          </SheetTrigger>
          <SheetContent
            side="left"
            showCloseButton={false}
            className="w-[17rem] max-w-[85%] bg-slate-900 p-0 text-white gap-0"
          >
            <SheetTitle className="sr-only">Navigation</SheetTitle>

            {/* Drawer header */}
            <div className="px-4 py-4 border-b border-slate-700 pt-safe">
              <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">
                Durga Industries
              </p>
              <p className="text-white font-semibold text-sm mt-0.5">Inventory System</p>
            </div>

            {/* Nav */}
            <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
              {visibleNav.map((item) => {
                if (item.children) {
                  const isOpen = openSections.includes(item.label);
                  const isActive = item.children.some((c) => pathname.startsWith(c.href));
                  return (
                    <div key={item.label}>
                      <button
                        onClick={() => toggleSection(item.label)}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-3 rounded-md text-[15px] [font-weight:450] transition-colors",
                          isActive ? "text-white bg-slate-700" : "text-white hover:bg-slate-800"
                        )}
                      >
                        <item.icon className="w-4 h-4 shrink-0" />
                        <span className="font-nav flex-1 text-left whitespace-nowrap">{item.label}</span>
                        {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                      {isOpen && (
                        <div className="ml-3 mt-0.5 space-y-0.5 border-l border-slate-700 pl-3">
                          {item.children.map((child) => {
                            const active = pathname === child.href;
                            return (
                              <Link
                                key={child.href}
                                href={child.href}
                                onClick={() => setOpen(false)}
                                className={cn(
                                  "flex items-center gap-2 px-2 py-2.5 rounded-md text-[15px] [font-weight:450] transition-colors",
                                  active ? "text-white bg-slate-700" : "text-white hover:bg-slate-800"
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
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-3 rounded-md text-[15px] [font-weight:450] transition-colors",
                      active ? "text-white bg-slate-700" : "text-white hover:bg-slate-800"
                    )}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    <span className="font-nav whitespace-nowrap">{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Footer: FY selector + sign out */}
            <div className="px-4 py-3 border-t border-slate-700 space-y-2 pb-safe">
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
                    className="w-full flex items-center justify-between bg-slate-800 border border-slate-600 text-slate-200 text-sm rounded px-3 py-2.5 hover:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  >
                    <span>FY {activeFY}</span>
                    <ChevronDown className={cn("w-3.5 h-3.5 text-slate-400 transition-transform", fyOpen && "rotate-180")} />
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
                              "w-full text-left px-3 py-2.5 text-sm hover:bg-slate-700 transition-colors",
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
                  className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors w-full py-2"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </form>
            </div>
          </SheetContent>
        </Sheet>

        <span className="font-nav text-white font-semibold text-base truncate">{title}</span>
      </div>
    </header>
  );
}
