export const dynamic = "force-dynamic";

import Link from "next/link";
import { getDashboardStats } from "@/lib/actions/dashboard.actions";
import { getCurrentFY } from "@/lib/fy";
import { cn } from "@/lib/utils";

function fmtAmt(v: number) {
  return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatCard({
  label, value, sub, href, color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
  color?: "red" | "amber" | "green" | "blue" | "slate";
}) {
  const colorMap = {
    red: "bg-red-50 border-red-200",
    amber: "bg-amber-50 border-amber-200",
    green: "bg-emerald-50 border-emerald-200",
    blue: "bg-blue-50 border-blue-200",
    slate: "bg-white border-slate-200",
  };
  const inner = (
    <div className={cn("border rounded-lg p-5 space-y-1", colorMap[color ?? "slate"])}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-slate-600 mt-6 mb-2">{children}</h2>;
}

function RecentTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-slate-50">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-3 py-4 text-center text-slate-400">None yet</td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-2 whitespace-nowrap text-slate-700">{cell}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default async function HomePage() {
  const fy = getCurrentFY();
  const stats = await getDashboardStats();

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-baseline gap-3 mb-6">
        <h1 className="text-xl font-semibold text-slate-800">Home</h1>
        <span className="text-sm text-slate-400">FY {fy}</span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Outstanding"
          value={stats.outstandingCount}
          sub={fmtAmt(stats.outstandingTotal)}
          href="/invoice"
          color={stats.outstandingCount > 0 ? "amber" : "slate"}
        />
        <StatCard
          label="Out of Stock"
          value={stats.outStockCount}
          sub={`${stats.lowStockCount} below min`}
          href="/stock"
          color={stats.outStockCount > 0 ? "red" : stats.lowStockCount > 0 ? "amber" : "slate"}
        />
        <StatCard
          label={`FY ${fy} Sales`}
          value={fmtAmt(stats.fyTotalSales)}
          color="green"
        />
        <StatCard
          label={`FY ${fy} Purchases`}
          value={fmtAmt(stats.fyTotalPurchases)}
          color="blue"
        />
      </div>

      {/* Recent activity */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-2">
        <div>
          <SectionTitle>Recent Purchase Orders</SectionTitle>
          <RecentTable
            headers={["PO #", "Date", "Supplier", "Status"]}
            rows={stats.recentPOs.map((r) => [
              <Link key={r.id} href={`/transactions/purchase-orders/${r.id}/view`} className="font-mono text-blue-600 hover:underline">
                PO-{String(r.po_number).padStart(4, "0")}
              </Link>,
              r.po_date,
              r.supplier_name ?? "—",
              <span key="s" className={cn(
                "px-1.5 py-0.5 rounded text-xs font-medium",
                r.status === "Received" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
              )}>{r.status}</span>,
            ])}
          />
        </div>

        <div>
          <SectionTitle>Recent Material Issues</SectionTitle>
          <RecentTable
            headers={["Slip #", "Date", "Vehicle", "Status"]}
            rows={stats.recentMIs.map((r) => [
              <Link key={r.id} href={`/transactions/material-issues/${r.id}/view`} className="font-mono text-blue-600 hover:underline">
                MI-{String(r.slip_number).padStart(4, "0")}
              </Link>,
              r.issue_date,
              r.vehicle_name ?? "—",
              <span key="s" className={cn(
                "px-1.5 py-0.5 rounded text-xs font-medium",
                r.status === "Issued" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
              )}>{r.status}</span>,
            ])}
          />
        </div>

        <div>
          <SectionTitle>Recent Invoices</SectionTitle>
          <RecentTable
            headers={["Bill #", "Date", "Customer", "Payment"]}
            rows={stats.recentInvoices.map((r) => [
              <Link key={r.id} href={`/invoice/${r.id}/view`} className="font-mono text-blue-600 hover:underline">
                {r.bill_number}
              </Link>,
              r.bill_date,
              r.customer_name ?? "—",
              <span key="s" className={cn(
                "px-1.5 py-0.5 rounded text-xs font-medium",
                r.payment_status === "Paid" ? "bg-green-100 text-green-700"
                : r.payment_status === "Partial" ? "bg-amber-100 text-amber-700"
                : "bg-red-100 text-red-700"
              )}>{r.payment_status}</span>,
            ])}
          />
        </div>
      </div>
    </div>
  );
}
