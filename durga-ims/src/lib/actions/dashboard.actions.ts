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
import { getCurrentFY } from "@/lib/fy";
import { INVOICE_STATUS, PO_STATUS } from "@/lib/constants";

export interface DashboardStats {
  lowStockCount: number;
  outStockCount: number;
  fyTotalSales: number;
  fyTotalPurchases: number;
  recentPOs: { id: string; po_number: number; po_date: string; status: string; supplier_name: string | null }[];
  recentMIs: { id: string; slip_number: number; vehicle_name: string | null; issue_date: string; status: string; issue_type: string }[];
  recentInvoices: { id: string; bill_number: string; customer_name: string | null; bill_date: string }[];
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const fy = getCurrentFY();

  const [
    salesRow,
    purchaseRow,
    stockRows,
    recentPORows,
    recentMIRows,
    recentInvoiceRows,
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

    // Active materials with current_stock and min_level
    db
      .select({ current_stock: materials.current_stock, min_level: materials.min_level })
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

    // Recent 5 MI slips
    db
      .select({
        id: materialIssues.id,
        slip_number: materialIssues.slip_number,
        issue_date: materialIssues.issue_date,
        status: materialIssues.status,
        issue_type: materialIssues.issue_type,
        vehicle_name: vehicles.vehicle_name,
      })
      .from(materialIssues)
      .leftJoin(vehicles, eq(materialIssues.vehicle_id, vehicles.id))
      .orderBy(desc(materialIssues.issue_date), desc(materialIssues.slip_number))
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

  const outStockCount = stockRows.filter((r) => parseFloat(r.current_stock) <= 0).length;
  const lowStockCount = stockRows.filter((r) => {
    const stock = parseFloat(r.current_stock);
    const min = r.min_level ? parseFloat(r.min_level) : 0;
    return stock > 0 && min > 0 && stock < min;
  }).length;

  return {
    lowStockCount,
    outStockCount,
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
      slip_number: r.slip_number,
      issue_date: new Date(r.issue_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
      status: r.status,
      issue_type: r.issue_type,
      vehicle_name: r.vehicle_name,
    })),
    recentInvoices: recentInvoiceRows.map((r) => ({
      id: r.id,
      bill_number: r.bill_number,
      bill_date: new Date(r.bill_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
      customer_name: r.customer_name,
    })),
  };
}
