"use server";

import { db } from "@/lib/db";
import {
  invoices,
  purchaseOrders,
  materialIssues,
  suppliers,
  vehicles,
} from "@/lib/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { MI_STATUS, PO_STATUS } from "@/lib/constants";
import { CACHE_TAGS } from "@/lib/cache";

export interface DashboardStats {
  fyTotalSales: number;
  fyVMINewTotal: number;
  fyVMIOldTotal: number;
  fyTotalPurchases: number;
  recentPOs: { id: string; po_number: number; po_date: string; status: string; supplier_name: string | null }[];
  recentMIs: { id: string; vehicle_id: string; job_ref_no: string | null; issue_date: string; status: string; issue_type: string }[];
  recentInvoices: { id: string; bill_number: string; customer_name: string | null; bill_date: string }[];
}

export const getDashboardStats = unstable_cache(
  async (financialYear: string): Promise<DashboardStats> => {
  const fy = financialYear;

  const [
    miSalesRows,
    purchaseRow,
    recentPORows,
    recentMIRows,
    recentInvoiceRows,
  ] = await Promise.all([
    // This FY total sales — VMI New + VMI Old material issues (Issued status only)
    db
      .select({
        issue_type: materialIssues.issue_type,
        total: sql<string>`COALESCE(SUM(${materialIssues.total_amount}), 0)`,
      })
      .from(materialIssues)
      .where(and(
        eq(materialIssues.financial_year, fy),
        eq(materialIssues.status, MI_STATUS.ISSUED),
      ))
      .groupBy(materialIssues.issue_type),

    // This FY total purchases
    db
      .select({ total: sql<string>`COALESCE(SUM(${purchaseOrders.total_amount}), 0)` })
      .from(purchaseOrders)
      .where(and(
        eq(purchaseOrders.financial_year, fy),
        eq(purchaseOrders.status, PO_STATUS.RECEIVED),
      )),

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
  ]);

  const fyVMINewTotal = parseFloat(miSalesRows.find((r) => r.issue_type === "NEW")?.total ?? "0");
  const fyVMIOldTotal = parseFloat(miSalesRows.find((r) => r.issue_type === "OLD")?.total ?? "0");

  return {
    fyTotalSales: fyVMINewTotal + fyVMIOldTotal,
    fyVMINewTotal,
    fyVMIOldTotal,
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
