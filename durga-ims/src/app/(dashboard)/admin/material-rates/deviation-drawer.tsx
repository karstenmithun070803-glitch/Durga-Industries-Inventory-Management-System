"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getRateDeviationHistory, type RateDeviationEntry } from "@/lib/actions/materials.actions";
import { formatCode } from "@/lib/utils";

function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmt2(v: string | number): string {
  return Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  /** The material whose history to show; null = drawer closed. */
  material: { id: string; name: string; code: string } | null;
  onClose: () => void;
}

/**
 * Admin price-deviation log for one material — same Sheet UX as the Stock history drawer,
 * but the reference point is the admin's base rate (frozen at PO save), not the previous PO.
 * Each row is a received purchase whose entered rate differed from that frozen base.
 */
export function DeviationDrawer({ material, onClose }: Props) {
  const [entries, setEntries] = useState<RateDeviationEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!material) return;
    let stale = false;
    setLoading(true);
    setEntries([]);
    getRateDeviationHistory(material.id)
      .then((rows) => {
        if (!stale) setEntries(rows);
      })
      .catch(() => {
        if (!stale) setEntries([]);
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [material]);

  return (
    <Sheet open={material !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        data-testid="deviation-drawer"
        className="w-[560px] sm:max-w-[560px] max-lg:!w-full max-lg:!max-w-full overflow-hidden flex flex-col"
      >
        <SheetHeader className="shrink-0">
          <SheetTitle className="text-base">
            {material ? `${material.name} — Price History` : "Price History"}
          </SheetTitle>
        </SheetHeader>

        <p className="text-xs text-slate-500 shrink-0">
          Received purchases entered at a price different from the base rate set at that time.
        </p>

        <div className="overflow-auto flex-1 mt-2">
          {loading ? (
            <p className="px-2 py-8 text-center text-sm text-slate-500">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-slate-500" data-testid="deviation-empty">
              No off-base purchases yet.
            </p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-slate-600 sticky top-0">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap">PO Date</th>
                  <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap">Ref</th>
                  <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap">Rate</th>
                  <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap">Base</th>
                  <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap">Deviation</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const dev = Number(e.deviation);
                  const up = dev > 0;
                  return (
                    <tr key={e.id} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 whitespace-nowrap text-slate-700">{fmtDate(e.po_date)}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap font-mono text-xs text-slate-600">
                        {formatCode("D-", e.po_number)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-800">₹{fmt2(e.po_rate)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">₹{fmt2(e.base_snapshot)}</td>
                      <td className={`px-2 py-1.5 text-right tabular-nums font-medium ${up ? "text-red-600" : "text-emerald-600"}`}>
                        {up ? "+" : "−"}₹{fmt2(Math.abs(dev))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
