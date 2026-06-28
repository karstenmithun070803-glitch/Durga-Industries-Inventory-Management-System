"use server";

import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache";
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
  materialIssues,
  materialIssueItems,
  stages,
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
  return unstable_cache(
    async () => {
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
    },
    ["report-invoice-summary", fy, status ?? "", vehicleId ?? "", customerId ?? "", dateFrom ?? "", dateTo ?? ""],
    { tags: [CACHE_TAGS.dashboard], revalidate: 120 }
  )();
}

// ---------------------------------------------------------------------------
// Purchase Report
// ---------------------------------------------------------------------------

export interface PurchaseReportRow {
  item_id: string;
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
  return unstable_cache(
    async () => {
  const rows = await db
    .select({
      item_id: purchaseOrderItems.id,
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
      item_id: r.item_id,
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
    },
    ["report-purchase", fy, status ?? "", supplierId ?? "", materialId ?? "", dateFrom ?? "", dateTo ?? ""],
    { tags: [CACHE_TAGS.dashboard], revalidate: 120 }
  )();
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
  standard_cost: number | null;
}

export async function getMonthlyStockReport(params: {
  fromDate: string; // e.g. "2026-05-01"
  toDate: string;   // e.g. "2026-05-31"
  materialId?: string;
}): Promise<MonthlyStockRow[]> {
  const { fromDate, toDate, materialId } = params;
  return unstable_cache(
    async () => {
  const from = new Date(fromDate + "T00:00:00+05:30");
  const to = new Date(toDate + "T23:59:59+05:30");

  // Get all active materials (+ filter if specified)
  const matRows = await db
    .select({
      id: materials.id,
      material_no: materials.material_no,
      name: materials.name,
      opening_stock: materials.opening_stock,
      unit_id: materials.purchase_unit_id,
      standard_cost: materials.standard_cost,
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

  // Fetch last received PO rate per material using Drizzle query builder (safe with prepare:false)
  const poRates = await db
    .select({
      material_id: purchaseOrderItems.material_id,
      rate: purchaseOrderItems.rate,
      po_date: purchaseOrders.po_date,
    })
    .from(purchaseOrderItems)
    .innerJoin(purchaseOrders, eq(purchaseOrderItems.po_id, purchaseOrders.id))
    .where(
      and(
        eq(purchaseOrders.status, "Received"),
        lte(purchaseOrders.po_date, to),
      )
    )
    .orderBy(desc(purchaseOrders.po_date));

  const rateMap = new Map<string, number>();
  for (const row of poRates) {
    if (row.material_id && !rateMap.has(row.material_id)) {
      rateMap.set(row.material_id, parseFloat(row.rate));
    }
  }

  // Fetch last stock snapshot before period start using Drizzle query builder (safe with prepare:false)
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
    .orderBy(desc(stockLedger.created_at));

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
      standard_cost: mat.standard_cost !== null ? parseFloat(mat.standard_cost) : null,
    };
  });
    },
    ["report-monthly-stock", fromDate, toDate, materialId ?? ""],
    { tags: [CACHE_TAGS.materials], revalidate: 120 }
  )();
}

// ---------------------------------------------------------------------------
// Stage Wise Costing Report
// ---------------------------------------------------------------------------

export interface StageWiseCostingRow {
  code: string;
  name: string;
  base_amount: number;
  is_direct: boolean;
}

export interface MaterialWiseCostingRow {
  code: string;
  name: string;
  stages: string;
  base_amount: number;
}

export interface StageWiseCostingResult {
  rows: StageWiseCostingRow[];
  storedMargin: number;
}

export interface MaterialWiseCostingResult {
  rows: MaterialWiseCostingRow[];
  storedMargin: number;
}

async function fetchStoredMargin(vehicleId: string, fy: string): Promise<number> {
  const [header] = await db
    .select({ margin_percentage: materialIssues.margin_percentage })
    .from(materialIssues)
    .where(
      and(
        eq(materialIssues.vehicle_id, vehicleId),
        eq(materialIssues.financial_year, fy),
        eq(materialIssues.issue_type, "NEW"),
        eq(materialIssues.status, "Issued"),
      )
    )
    .limit(1);
  return parseFloat(header?.margin_percentage ?? "0");
}

export async function getStageWiseCostingData(vehicleId: string, fy: string, asOfDate?: string): Promise<StageWiseCostingResult> {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(vehicleId)) throw new Error("Invalid vehicleId");
  if (!/^\d{4}-\d{2,4}$/.test(fy)) throw new Error("Invalid FY format");
  if (asOfDate && !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) throw new Error("Invalid asOfDate");

  return unstable_cache(
    async () => {
  const [rows, storedMargin] = await Promise.all([
    db
      .select({
        code: sql<string>`COALESCE(${stages.stage_code}, 'MANUAL')`,
        name: sql<string>`COALESCE(${stages.stage_name}, 'Manual Entry')`,
        base_amount: sql<string>`SUM(${materialIssueItems.amount} + ${materialIssueItems.cgst_amount} + ${materialIssueItems.sgst_amount} + ${materialIssueItems.igst_amount})`,
      })
      .from(materialIssueItems)
      .innerJoin(materialIssues, eq(materialIssueItems.issue_id, materialIssues.id))
      .leftJoin(stages, eq(materialIssueItems.stage_id, stages.id))
      .where(
        and(
          eq(materialIssues.vehicle_id, vehicleId),
          eq(materialIssues.status, "Issued"),
          eq(materialIssues.financial_year, fy),
          eq(materialIssues.issue_type, "NEW"),
          eq(materialIssueItems.affects_inventory, true),
          asOfDate ? lte(materialIssues.issue_date, new Date(asOfDate + "T23:59:59+05:30")) : undefined,
        )
      )
      .groupBy(
        materialIssueItems.stage_id,
        stages.stage_code,
        stages.stage_name,
      )
      .orderBy(sql`${stages.stage_code} NULLS LAST`),
    fetchStoredMargin(vehicleId, fy),
  ]);

  return {
    rows: rows.map((r) => ({
      code: r.code,
      name: r.name,
      base_amount: parseFloat(r.base_amount ?? "0"),
      is_direct: r.code === "MANUAL",
    })),
    storedMargin,
  };
    },
    ["report-stage-costing", vehicleId, fy, asOfDate ?? ""],
    { tags: [CACHE_TAGS.dashboard], revalidate: 120 }
  )();
}

export async function getMaterialWiseCostingData(vehicleId: string, fy: string, asOfDate?: string): Promise<MaterialWiseCostingResult> {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(vehicleId)) throw new Error("Invalid vehicleId");
  if (!/^\d{4}-\d{2,4}$/.test(fy)) throw new Error("Invalid FY format");
  if (asOfDate && !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) throw new Error("Invalid asOfDate");

  return unstable_cache(
    async () => {
  const [rows, storedMargin] = await Promise.all([
    db
      .select({
        code: sql<string>`${materials.material_no}::text`,
        name: materials.name,
        stages: sql<string>`STRING_AGG(DISTINCT COALESCE(${stages.stage_name}, 'Direct Issue'), ', ' ORDER BY COALESCE(${stages.stage_name}, 'Direct Issue'))`,
        base_amount: sql<string>`SUM(${materialIssueItems.amount} + ${materialIssueItems.cgst_amount} + ${materialIssueItems.sgst_amount} + ${materialIssueItems.igst_amount})`,
      })
      .from(materialIssueItems)
      .innerJoin(materialIssues, eq(materialIssueItems.issue_id, materialIssues.id))
      .innerJoin(materials, eq(materialIssueItems.material_id, materials.id))
      .leftJoin(stages, eq(materialIssueItems.stage_id, stages.id))
      .where(
        and(
          eq(materialIssues.vehicle_id, vehicleId),
          eq(materialIssues.status, "Issued"),
          eq(materialIssues.financial_year, fy),
          eq(materialIssues.issue_type, "NEW"),
          eq(materialIssueItems.affects_inventory, true),
          asOfDate ? lte(materialIssues.issue_date, new Date(asOfDate + "T23:59:59+05:30")) : undefined,
        )
      )
      .groupBy(materials.id, materials.material_no, materials.name)
      .orderBy(materials.name),
    fetchStoredMargin(vehicleId, fy),
  ]);

  return {
    rows: rows.map((r) => ({
      code: r.code,
      name: r.name,
      stages: r.stages ?? "",
      base_amount: parseFloat(r.base_amount ?? "0"),
    })),
    storedMargin,
  };
    },
    ["report-material-costing", vehicleId, fy, asOfDate ?? ""],
    { tags: [CACHE_TAGS.dashboard], revalidate: 120 }
  )();
}

// ---------------------------------------------------------------------------
// Vehicle Comparison Report
// ---------------------------------------------------------------------------

export interface VehicleComparisonRow {
  code: string;
  material_name: string;
  stage_name: string;
  qty1: number;
  amt1: number;
  qty2: number;
  amt2: number;
  diff: number;
}

interface VehicleComparisonRawRow {
  code: string;
  material_name: string;
  stage_name: string;
  qty1: string;
  amt1: string;
  qty2: string;
  amt2: string;
  diff: string;
}

export async function getVehicleComparisonData(
  v1Id: string,
  v2Id: string,
  fy: string,
  stageId?: string | null
): Promise<VehicleComparisonRow[]> {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(v1Id)) throw new Error("Invalid v1Id");
  if (!UUID_REGEX.test(v2Id)) throw new Error("Invalid v2Id");
  if (!/^\d{4}-\d{2,4}$/.test(fy)) throw new Error("Invalid FY format");
  if (stageId && !UUID_REGEX.test(stageId)) throw new Error("Invalid stageId");

  // Normalize: undefined → null so Drizzle sends SQL NULL
  const stageParam = stageId ?? null;

  return unstable_cache(
    async () => {
  // FULL OUTER JOIN not supported by Drizzle query builder — uses Drizzle sql tag (safe parameterization)
  const result = await db.execute(sql`
    WITH v1 AS (
      SELECT
        m.material_no::text AS material_no,
        m.name AS mat_name,
        COALESCE(s.stage_name, 'Direct Issue') AS stage_name,
        SUM(mii.qty) AS qty,
        SUM(mii.amount) AS amt
      FROM material_issue_items mii
      JOIN material_issues mi ON mi.id = mii.issue_id
      JOIN materials m ON m.id = mii.material_id
      LEFT JOIN stages s ON s.id = mii.stage_id
      WHERE mi.vehicle_id = ${v1Id}::uuid
        AND mi.status = 'Issued'
        AND mi.financial_year = ${fy}
        AND mii.affects_inventory = true
        AND (${stageParam}::uuid IS NULL OR mii.stage_id = ${stageParam}::uuid)
      GROUP BY m.id, m.material_no, m.name, s.id, s.stage_name
    ),
    v2 AS (
      SELECT
        m.material_no::text AS material_no,
        m.name AS mat_name,
        COALESCE(s.stage_name, 'Direct Issue') AS stage_name,
        SUM(mii.qty) AS qty,
        SUM(mii.amount) AS amt
      FROM material_issue_items mii
      JOIN material_issues mi ON mi.id = mii.issue_id
      JOIN materials m ON m.id = mii.material_id
      LEFT JOIN stages s ON s.id = mii.stage_id
      WHERE mi.vehicle_id = ${v2Id}::uuid
        AND mi.status = 'Issued'
        AND mi.financial_year = ${fy}
        AND mii.affects_inventory = true
        AND (${stageParam}::uuid IS NULL OR mii.stage_id = ${stageParam}::uuid)
      GROUP BY m.id, m.material_no, m.name, s.id, s.stage_name
    )
    SELECT
      COALESCE(v1.material_no, v2.material_no) AS code,
      COALESCE(v1.mat_name, v2.mat_name)       AS material_name,
      COALESCE(v1.stage_name, v2.stage_name)   AS stage_name,
      COALESCE(v1.qty, 0)                      AS qty1,
      COALESCE(v1.amt, 0)                      AS amt1,
      COALESCE(v2.qty, 0)                      AS qty2,
      COALESCE(v2.amt, 0)                      AS amt2,
      COALESCE(v1.qty, 0) - COALESCE(v2.qty, 0) AS diff
    FROM v1
    FULL OUTER JOIN v2
      ON v1.material_no = v2.material_no AND v1.stage_name = v2.stage_name
    ORDER BY stage_name, material_name
  `);

  return (Array.from(result) as unknown as VehicleComparisonRawRow[]).map((r) => ({
    code: r.code,
    material_name: r.material_name,
    stage_name: r.stage_name,
    qty1: parseFloat(r.qty1 ?? "0"),
    amt1: parseFloat(r.amt1 ?? "0"),
    qty2: parseFloat(r.qty2 ?? "0"),
    amt2: parseFloat(r.amt2 ?? "0"),
    diff: Math.round(parseFloat(r.diff ?? "0") * 1000) / 1000,
  }));
    },
    ["report-vehicle-comparison", v1Id, v2Id, fy, stageId ?? ""],
    { tags: [CACHE_TAGS.dashboard], revalidate: 120 }
  )();
}

