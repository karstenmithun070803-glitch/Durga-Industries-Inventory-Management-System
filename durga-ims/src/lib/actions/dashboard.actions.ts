"use server";

import { db } from "@/lib/db";
import {
  invoices,
  purchaseOrders,
  materialIssues,
  materials,
  suppliers,
  vehicles,
} from "@/lib/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { INVOICE_STATUS, PO_STATUS } from "@/lib/constants";
import { CACHE_TAGS } from "@/lib/cache";

export interface DashboardStats {
  lowStockCount: number;
  totalStockValue: number;
  materialsExcludedFromValue: number;
  standardCostCount: number;
  fyTotalSales: number;
  fyTotalPurchases: number;
  recentPOs: { id: string; po_number: number; po_date: string; status: string; supplier_name: string | null }[];
  recentMIs: { id: string; vehicle_id: string; job_ref_no: string | null; issue_date: string; status: string; issue_type: string }[];
  recentInvoices: { id: string; bill_number: string; customer_name: string | null; bill_date: string }[];
}

export const getDashboardStats = unstable_cache(
  async (financialYear: string): Promise<DashboardStats> => {
  const fy = financialYear;

  const [
    salesRow,
    purchaseRow,
    stockRows,
    recentPORows,
    recentMIRows,
    recentInvoiceRows,
    latestRates,
  ] = await Promise.all([
    // This FY total sales
    db
      .select({ total: sql<string>`COALESCE(SUM(${invoices.net_amount}), 0)` })
      .from(invoices)
      .where(and(
        eq(invoices.financial_year, fy),
        eq(invoices.status, INVOICE_STATUS.FINALIZED),
      )),

    // This FY total purchases
    db
      .select({ total: sql<string>`COALESCE(SUM(${purchaseOrders.total_amount}), 0)` })
      .from(purchaseOrders)
      .where(and(
        eq(purchaseOrders.financial_year, fy),
        eq(purchaseOrders.status, PO_STATUS.RECEIVED),
      )),

    // Active materials — id needed for rate map join
    db
      .select({ id: materials.id, current_stock: materials.current_stock, min_level: materials.min_level, standard_cost: materials.standard_cost })
      .from(materials)
      .where(eq(materials.is_active, true)),

    // Recent 5 POs
    db
      .select({
        id: purchaseOrders.id,
        po_number: purchaseOrders.po_number,
        po_date: purchaseOrders.po_date,
        status: purchaseOrders.status,
        supplier_name: suppliers.name,
      })
      .from(purchaseOrders)
      .leftJoin(suppliers, eq(purchaseOrders.supplier_id, suppliers.id))
      .orderBy(desc(purchaseOrders.po_date), desc(purchaseOrders.po_number))
      .limit(5),

    // Recent 5 MI records
    db
      .select({
        id: materialIssues.id,
        slip_number: materialIssues.slip_number,
        vehicle_id: materialIssues.vehicle_id,
        issue_date: materialIssues.issue_date,
        status: materialIssues.status,
        issue_type: materialIssues.issue_type,
        job_ref_no: vehicles.job_ref_no,
      })
      .from(materialIssues)
      .leftJoin(vehicles, eq(materialIssues.vehicle_id, vehicles.id))
      .orderBy(desc(materialIssues.issue_date))
      .limit(5),

    // Recent 5 invoices
    db
      .select({
        id: invoices.id,
        bill_number: invoices.bill_number,
        bill_date: invoices.bill_date,
        customer_name: invoices.customer_name,
      })
      .from(invoices)
      .orderBy(desc(invoices.bill_date), desc(invoices.bill_number))
      .limit(5),

    // Most recent received PO rate per material (tax-inclusive) — identical formula to getStockDashboardMaterials()
    // so Home tab totalStockValue matches Stock tab totalStockValue exactly.
    db.execute<{ material_id: string; rate: string }>(sql`
      SELECT DISTINCT ON (poi.material_id)
        poi.material_id,
        (
          poi.amount
          + COALESCE(poi.cgst_amount, 0)
          + COALESCE(poi.sgst_amount, 0)
          + COALESCE(poi.igst_amount, 0)
        ) / NULLIF(poi.qty, 0) AS rate
      FROM purchase_order_items poi
      INNER JOIN purchase_orders po ON poi.po_id = po.id
      WHERE po.status = 'Received'
      ORDER BY poi.material_id, po.po_date DESC
    `),
  ]);

  const lowStockCount = stockRows.filter((r) => {
    const stock = parseFloat(r.current_stock);
    const min = r.min_level ? parseFloat(r.min_level) : 0;
    return stock > 0 && min > 0 && stock < min;
  }).length;

  // Compute totalStockValue using the same logic as getStockDashboardMaterials()
  const rateMap = new Map<string, string>(
    Array.from(latestRates).map((r) => [r.material_id, r.rate])
  );
  let totalStockValue = 0;
  let materialsExcludedFromValue = 0;
  let standardCostCount = 0;
  for (const r of stockRows) {
    const poRate = rateMap.get(r.id) ?? null;
    const effectiveRate = poRate ?? r.standard_cost;
    if (effectiveRate != null) {
      const rate = parseFloat(String(effectiveRate));
      const stock = parseFloat(String(r.current_stock));
      if (Number.isFinite(rate) && Number.isFinite(stock)) {
        totalStockValue += stock * rate;
        if (!poRate) standardCostCount++;
      }
    } else {
      materialsExcludedFromValue++;
    }
  }

  return {
    lowStockCount,
    totalStockValue,
    materialsExcludedFromValue,
    standardCostCount,
    fyTotalSales: parseFloat(salesRow[0]?.total ?? "0"),
    fyTotalPurchases: parseFloat(purchaseRow[0]?.total ?? "0"),
    recentPOs: recentPORows.map((r) => ({
      id: r.id,
      po_number: r.po_number,
      po_date: new Date(r.po_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
      status: r.status,
      supplier_name: r.supplier_name,
    })),
    recentMIs: recentMIRows.map((r) => ({
      id: r.id,
      vehicle_id: r.vehicle_id,
      issue_date: new Date(r.issue_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
      status: r.status,
      issue_type: r.issue_type,
      job_ref_no: r.job_ref_no,
    })),
    recentInvoices: recentInvoiceRows.map((r) => ({
      id: r.id,
      bill_number: r.bill_number,
      bill_date: new Date(r.bill_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
      customer_name: r.customer_name,
    })),
  };
},
["dashboard-stats"],
{ tags: [CACHE_TAGS.dashboard], revalidate: 120 }
);
