"use server";

import { db } from "@/lib/db";
import {
  invoices,
  invoiceItems,
  vehicles,
  purchaseOrders,
  purchaseOrderItems,
  suppliers,
  materials,
  units,
  stockLedger,
  customers,
} from "@/lib/db/schema";
import { eq, and, gte, lte, sql, desc, asc } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Invoice Summary Report
// ---------------------------------------------------------------------------

export interface InvoiceSummaryRow {
  id: string;
  bill_number: string;
  bill_date: string;
  vehicle_name: string | null;
  vehicle_type: string | null;
  job_ref_no: string | null;
  customer_name: string | null;
  customer_gstin: string | null;
  status: string;
  taxable_value: number;
  total_cgst: number;
  total_sgst: number;
  total_igst: number;
  gross_total: number;
  discount: number;
  net_amount: number;
}

export async function getInvoiceSummaryReport(params: {
  fy: string;
  status?: string;
  vehicleId?: string;
  customerId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<InvoiceSummaryRow[]> {
  const { fy, status, vehicleId, customerId, dateFrom, dateTo } = params;

  const rows = await db
    .select({
      id: invoices.id,
      bill_number: invoices.bill_number,
      bill_date: invoices.bill_date,
      vehicle_name: vehicles.vehicle_name,
      vehicle_type: vehicles.type,
      job_ref_no: vehicles.job_ref_no,
      customer_name: invoices.customer_name,
      customer_gstin: invoices.customer_gstin,
      status: invoices.status,
      discount: invoices.discount,
      net_amount: invoices.net_amount,
      taxable_value: sql<string>`SUM(${invoiceItems.amount})`,
      total_cgst: sql<string>`SUM(${invoiceItems.cgst_amount})`,
      total_sgst: sql<string>`SUM(${invoiceItems.sgst_amount})`,
      total_igst: sql<string>`SUM(${invoiceItems.igst_amount})`,
    })
    .from(invoices)
    .innerJoin(invoiceItems, eq(invoiceItems.invoice_id, invoices.id))
    .leftJoin(vehicles, eq(invoices.vehicle_id, vehicles.id))
    .where(
      and(
        eq(invoices.financial_year, fy),
        status && status !== "All" ? eq(invoices.status, status) : undefined,
        vehicleId ? eq(invoices.vehicle_id, vehicleId) : undefined,
        customerId ? eq(vehicles.customer_id, customerId) : undefined,
        dateFrom ? gte(invoices.bill_date, new Date(dateFrom + "T00:00:00+05:30")) : undefined,
        dateTo ? lte(invoices.bill_date, new Date(dateTo + "T23:59:59+05:30")) : undefined,
      )
    )
    .groupBy(
      invoices.id,
      invoices.bill_number,
      invoices.bill_date,
      invoices.customer_name,
      invoices.customer_gstin,
      invoices.status,
      invoices.discount,
      invoices.net_amount,
      vehicles.vehicle_name,
      vehicles.type,
      vehicles.job_ref_no,
      vehicles.customer_id
    )
    .orderBy(asc(invoices.bill_date), asc(invoices.bill_number));

  return rows.map((r) => {
    const taxable = parseFloat(r.taxable_value ?? "0");
    const cgst = parseFloat(r.total_cgst ?? "0");
    const sgst = parseFloat(r.total_sgst ?? "0");
    const igst = parseFloat(r.total_igst ?? "0");
    return {
      id: r.id,
      bill_number: r.bill_number,
      bill_date: new Date(r.bill_date).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }),
      vehicle_name: r.vehicle_name ?? null,
      vehicle_type: r.vehicle_type ?? null,
      job_ref_no: r.job_ref_no ?? null,
      customer_name: r.customer_name ?? null,
      customer_gstin: r.customer_gstin ?? null,
      status: r.status,
      taxable_value: taxable,
      total_cgst: cgst,
      total_sgst: sgst,
      total_igst: igst,
      gross_total: taxable + cgst + sgst + igst,
      discount: parseFloat(r.discount ?? "0"),
      net_amount: parseFloat(r.net_amount ?? "0"),
    };
  });
}

// ---------------------------------------------------------------------------
// Purchase Report
// ---------------------------------------------------------------------------

export interface PurchaseReportRow {
  id: string;
  po_number: number;
  po_date: string;
  supplier_name: string | null;
  supplier_bill_no: string | null;
  supplier_bill_date: string | null;
  material_name: string;
  material_no: number;
  qty: number;
  unit_name: string | null;
  rate: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
  affects_stock: boolean;
  status: string;
}

export async function getPurchaseReport(params: {
  fy: string;
  status?: string;
  supplierId?: string;
  materialId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<PurchaseReportRow[]> {
  const { fy, status, supplierId, materialId, dateFrom, dateTo } = params;

  const rows = await db
    .select({
      id: purchaseOrders.id,
      po_number: purchaseOrders.po_number,
      po_date: purchaseOrders.po_date,
      status: purchaseOrders.status,
      affects_stock: purchaseOrders.affects_stock,
      supplier_bill_no: purchaseOrders.supplier_bill_no,
      supplier_bill_date: purchaseOrders.supplier_bill_date,
      supplier_name: suppliers.name,
      material_name: materials.name,
      material_no: materials.material_no,
      qty: purchaseOrderItems.qty,
      unit_name: units.unit_name,
      rate: purchaseOrderItems.rate,
      taxable_amount: purchaseOrderItems.amount,
      cgst_amount: purchaseOrderItems.cgst_amount,
      sgst_amount: purchaseOrderItems.sgst_amount,
      igst_amount: purchaseOrderItems.igst_amount,
    })
    .from(purchaseOrders)
    .innerJoin(purchaseOrderItems, eq(purchaseOrderItems.po_id, purchaseOrders.id))
    .innerJoin(materials, eq(purchaseOrderItems.material_id, materials.id))
    .leftJoin(suppliers, eq(purchaseOrderItems.supplier_id, suppliers.id))
    .leftJoin(units, eq(purchaseOrderItems.unit_id, units.id))
    .where(
      and(
        eq(purchaseOrders.financial_year, fy),
        status && status !== "All" ? eq(purchaseOrders.status, status) : undefined,
        supplierId ? eq(purchaseOrderItems.supplier_id, supplierId) : undefined,
        materialId ? eq(purchaseOrderItems.material_id, materialId) : undefined,
        dateFrom ? gte(purchaseOrders.po_date, new Date(dateFrom + "T00:00:00+05:30")) : undefined,
        dateTo ? lte(purchaseOrders.po_date, new Date(dateTo + "T23:59:59+05:30")) : undefined,
      )
    )
    .orderBy(asc(purchaseOrders.po_date), asc(purchaseOrders.po_number));

  return rows.map((r) => {
    const taxable = parseFloat(r.taxable_amount ?? "0");
    const cgst = parseFloat(r.cgst_amount ?? "0");
    const sgst = parseFloat(r.sgst_amount ?? "0");
    const igst = parseFloat(r.igst_amount ?? "0");
    return {
      id: r.id,
      po_number: r.po_number,
      po_date: new Date(r.po_date).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }),
      supplier_name: r.supplier_name ?? null,
      supplier_bill_no: r.supplier_bill_no ?? null,
      supplier_bill_date: r.supplier_bill_date
        ? new Date(r.supplier_bill_date as unknown as string).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })
        : null,
      material_name: r.material_name,
      material_no: r.material_no,
      qty: parseFloat(r.qty ?? "0"),
      unit_name: r.unit_name ?? null,
      rate: parseFloat(r.rate ?? "0"),
      taxable_amount: taxable,
      cgst_amount: cgst,
      sgst_amount: sgst,
      igst_amount: igst,
      total_amount: taxable + cgst + sgst + igst,
      affects_stock: r.affects_stock,
      status: r.status,
    };
  });
}

// ---------------------------------------------------------------------------
// Monthly Stock Report
// ---------------------------------------------------------------------------

export interface MonthlyStockRow {
  material_id: string;
  material_no: number;
  material_name: string;
  unit_name: string | null;
  opening_stock: number;
  po_inward: number;
  issues: number;
  reversals: number;
  adjustments: number;
  closing_stock: number;
  last_po_rate: number | null;
}

export async function getMonthlyStockReport(params: {
  fromDate: string; // e.g. "2026-05-01"
  toDate: string;   // e.g. "2026-05-31"
  materialId?: string;
}): Promise<MonthlyStockRow[]> {
  const { fromDate, toDate, materialId } = params;
  const from = new Date(fromDate + "T00:00:00+05:30");
  const to = new Date(toDate + "T23:59:59+05:30");

  // Get all active materials (+ filter if specified)
  const matRows = await db
    .select({
      id: materials.id,
      material_no: materials.material_no,
      name: materials.name,
      opening_stock: materials.opening_stock,
      unit_id: materials.sales_unit_id,
    })
    .from(materials)
    .where(
      and(
        eq(materials.is_active, true),
        materialId ? eq(materials.id, materialId) : undefined
      )
    )
    .orderBy(materials.material_no);

  if (matRows.length === 0) return [];

  // Unit names
  const unitRows = await db.select({ id: units.id, unit_name: units.unit_name }).from(units);
  const unitMap = new Map(unitRows.map((u) => [u.id, u.unit_name]));

  // Last PO rates
  const poRates = await db
    .select({
      material_id: purchaseOrderItems.material_id,
      rate: purchaseOrderItems.rate,
      po_date: purchaseOrders.po_date,
    })
    .from(purchaseOrderItems)
    .innerJoin(purchaseOrders, eq(purchaseOrderItems.po_id, purchaseOrders.id))
    .where(eq(purchaseOrders.status, "Received"))
    .orderBy(desc(purchaseOrders.po_date))
    .limit(2000);

  const rateMap = new Map<string, number>();
  for (const row of poRates) {
    if (row.material_id && !rateMap.has(row.material_id)) {
      rateMap.set(row.material_id, parseFloat(row.rate));
    }
  }

  // Ledger entries before period start (for opening stock).
  // Capped at 10000 rows — deduplication in JS keeps only the latest per material.
  // Sufficient for ~300 materials × 30 entries of history before the period.
  const preLedger = await db
    .select({
      material_id: stockLedger.material_id,
      stock_after: stockLedger.stock_after,
      created_at: stockLedger.created_at,
    })
    .from(stockLedger)
    .where(
      and(
        lte(stockLedger.created_at, from),
        materialId ? eq(stockLedger.material_id, materialId) : undefined
      )
    )
    .orderBy(desc(stockLedger.created_at))
    .limit(10000);

  // Keep last entry before period per material
  const openingMap = new Map<string, number>();
  for (const e of preLedger) {
    if (!openingMap.has(e.material_id)) {
      openingMap.set(e.material_id, parseFloat(e.stock_after));
    }
  }

  // Aggregate period movements in SQL — returns at most (materials × 4) rows regardless of history depth
  const periodAggRows = await db
    .select({
      material_id: stockLedger.material_id,
      transaction_type: stockLedger.transaction_type,
      total: sql<string>`SUM(${stockLedger.qty_change})`,
    })
    .from(stockLedger)
    .where(
      and(
        gte(stockLedger.created_at, from),
        lte(stockLedger.created_at, to),
        materialId ? eq(stockLedger.material_id, materialId) : undefined
      )
    )
    .groupBy(stockLedger.material_id, stockLedger.transaction_type);

  // Build movement map from aggregated results
  const movementMap = new Map<string, { inward: number; issues: number; reversals: number; adjustments: number }>();
  for (const e of periodAggRows) {
    if (!movementMap.has(e.material_id)) {
      movementMap.set(e.material_id, { inward: 0, issues: 0, reversals: 0, adjustments: 0 });
    }
    const m = movementMap.get(e.material_id)!;
    const qty = parseFloat(e.total ?? "0");
    if (e.transaction_type === "PO_INWARD") m.inward += qty;
    else if (e.transaction_type === "ISSUE") m.issues += Math.abs(qty);
    else if (e.transaction_type === "REVERSAL") m.reversals += qty;
    else if (e.transaction_type === "ADJUSTMENT") m.adjustments += qty;
  }

  return matRows.map((mat) => {
    const openingStock = openingMap.has(mat.id)
      ? openingMap.get(mat.id)!
      : parseFloat(mat.opening_stock ?? "0");

    const mov = movementMap.get(mat.id) ?? { inward: 0, issues: 0, reversals: 0, adjustments: 0 };
    const closing = openingStock + mov.inward - mov.issues + mov.reversals + mov.adjustments;

    return {
      material_id: mat.id,
      material_no: mat.material_no,
      material_name: mat.name,
      unit_name: mat.unit_id ? (unitMap.get(mat.unit_id) ?? null) : null,
      opening_stock: openingStock,
      po_inward: mov.inward,
      issues: mov.issues,
      reversals: mov.reversals,
      adjustments: mov.adjustments,
      closing_stock: closing,
      last_po_rate: rateMap.get(mat.id) ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Filter dropdown data
// ---------------------------------------------------------------------------

export async function getActiveVehiclesForReports() {
  return db
    .select({ id: vehicles.id, vehicle_name: vehicles.vehicle_name, job_ref_no: vehicles.job_ref_no })
    .from(vehicles)
    .where(eq(vehicles.is_active, true))
    .orderBy(vehicles.job_ref_no);
}

export async function getActiveSuppliersForReports() {
  return db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(eq(suppliers.is_active, true))
    .orderBy(suppliers.name);
}

export async function getActiveMaterialsForReports() {
  return db
    .select({ id: materials.id, name: materials.name, material_no: materials.material_no })
    .from(materials)
    .where(eq(materials.is_active, true))
    .orderBy(materials.material_no);
}

export async function getActiveCustomersForReports() {
  return db
    .select({ id: customers.id, customer_name: customers.customer_name, gstin: customers.gstin })
    .from(customers)
    .where(eq(customers.is_active, true))
    .orderBy(customers.customer_name);
}
