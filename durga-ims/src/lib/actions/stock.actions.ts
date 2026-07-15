"use server";

import { db } from "@/lib/db";
import {
  materials,
  units,
  stockLedger,
  purchaseOrders,
  purchaseOrderItems,
  materialIssues,
  materialIssueItems,
  contractors,
  vehicles,
  customers,
} from "@/lib/db/schema";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { revalidatePath, unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StockMaterialRow {
  id: string;
  material_no: number;
  name: string;
  unit_name: string | null;
  current_stock: string;
  max_level: string | null;
  last_po_rate: string | null;
  opening_rate: string | null;
  standard_cost: string | null;
  is_active: boolean;
}

export interface StockSummary {
  totalMaterials: number;
  outOfStockCount: number;
  totalStockValue: number;
  materialsExcludedFromValue: number;
  standardCostCount: number;
}

export interface StockLedgerEntry {
  id: string;
  created_at: Date;
  transaction_type: string;
  qty_change: string;
  stock_after: string;
  reason: string | null;
  adjusted_by: string | null;
  reference_label: string;
  rate_at_time: string | null;
}

export interface DraftCommitment {
  slip_number: number;
  committed_qty: number;
}

export interface DraftCommitmentsResult {
  totalCommitted: number;
  slips: DraftCommitment[];
}

export interface VehicleSearchRow {
  id: string;
  job_ref_no: string;
  customer_name: string | null;
  is_active: boolean;
}

export interface JobCostRow {
  material_name: string;
  material_no: number;
  contractor_name: string | null;
  unit_name: string | null;
  total_qty: number;
  rate: number;
  total_amount: number;
}

export interface JobCostResult {
  vehicle: {
    job_ref_no: string;
    vehicle_type: string;
    customer_name: string | null;
  };
  rows: JobCostRow[];
  totals: {
    total_cost: number;
  };
}

// ---------------------------------------------------------------------------
// getStockDashboardMaterials
// ---------------------------------------------------------------------------

export const getStockDashboardMaterials = unstable_cache(
  async (): Promise<{
  rows: StockMaterialRow[];
  summary: StockSummary;
}> => {
  // Fetch all materials: active ones + deactivated ones with stock > 0
  const allMats = await db
    .select({
      id: materials.id,
      material_no: materials.material_no,
      name: materials.name,
      current_stock: materials.current_stock,
      max_level: materials.max_level,
      is_active: materials.is_active,
      unit_id: materials.purchase_unit_id,
      standard_cost: materials.standard_cost,
      opening_rate: materials.opening_rate,
    })
    .from(materials)
    .where(eq(materials.is_active, true))
    .orderBy(materials.material_no);

  if (allMats.length === 0) {
    return {
      rows: [],
      summary: { totalMaterials: 0, outOfStockCount: 0, totalStockValue: 0, materialsExcludedFromValue: 0, standardCostCount: 0 },
    };
  }

  // Fetch unit names
  const unitRows = await db.select({ id: units.id, unit_name: units.unit_name }).from(units);
  const unitMap = new Map(unitRows.map((u) => [u.id, u.unit_name]));

  // DISTINCT ON returns exactly one row per material (the most recent received PO rate, tax-inclusive).
  // Tax-inclusive = (base amount + cgst + sgst + igst) / qty so the rate matches what the PO tab totals show.
  const latestRates = await db.execute<{ material_id: string; rate: string }>(sql`
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
  `);

  const rateMap = new Map<string, string>(
    Array.from(latestRates).map((r) => [r.material_id, r.rate])
  );

  const rows: StockMaterialRow[] = allMats.map((m) => ({
    id: m.id,
    material_no: m.material_no,
    name: m.name,
    unit_name: m.unit_id ? (unitMap.get(m.unit_id) ?? null) : null,
    current_stock: m.current_stock,
    max_level: m.max_level,
    last_po_rate: rateMap.get(m.id) ?? null,
    opening_rate: m.opening_rate,
    standard_cost: m.standard_cost,
    is_active: m.is_active,
  }));

  // Summary metrics (active materials only)
  const activeMats = rows.filter((r) => r.is_active);
  const totalMaterials = activeMats.length;

  const outOfStockCount = activeMats.filter((r) => parseFloat(r.current_stock) === 0).length;

  let totalStockValue = 0;
  let materialsExcludedFromValue = 0;
  let standardCostCount = 0;
  for (const r of activeMats) {
    const effectiveRate = r.last_po_rate ?? r.opening_rate ?? r.standard_cost;
    if (effectiveRate !== null) {
      totalStockValue += parseFloat(r.current_stock) * parseFloat(effectiveRate);
      if (!r.last_po_rate) standardCostCount++;
    } else {
      materialsExcludedFromValue++;
    }
  }

  return {
    rows,
    summary: { totalMaterials, outOfStockCount, totalStockValue, materialsExcludedFromValue, standardCostCount },
  };
},
["stock-dashboard"],
{ tags: [CACHE_TAGS.materials], revalidate: false }
);

// ---------------------------------------------------------------------------
// getStockMovementHistory
// ---------------------------------------------------------------------------

export async function getStockMovementHistory(
  materialId: string,
  limit = 50
): Promise<StockLedgerEntry[]> {
  const ledger = await db
    .select({
      id: stockLedger.id,
      created_at: stockLedger.created_at,
      transaction_type: stockLedger.transaction_type,
      qty_change: stockLedger.qty_change,
      stock_after: stockLedger.stock_after,
      reason: stockLedger.reason,
      adjusted_by: stockLedger.adjusted_by,
      reference_id: stockLedger.reference_id,
      reference_type: stockLedger.reference_type,
      rate_at_time: stockLedger.rate_at_time,
    })
    .from(stockLedger)
    .where(eq(stockLedger.material_id, materialId))
    .orderBy(desc(stockLedger.created_at))
    .limit(limit);

  if (ledger.length === 0) return [];

  // Build reference labels: fetch PO numbers and slip numbers for references
  const poIds = ledger.filter((e) => e.reference_type === "purchase_order" && e.reference_id).map((e) => e.reference_id!);
  const miIds = ledger.filter((e) => e.reference_type === "material_issue" && e.reference_id).map((e) => e.reference_id!);

  const poMap = new Map<string, number>();
  const miMap = new Map<string, number | null>();

  if (poIds.length > 0) {
    const pos = await db.select({ id: purchaseOrders.id, po_number: purchaseOrders.po_number }).from(purchaseOrders).where(inArray(purchaseOrders.id, poIds));
    for (const p of pos) poMap.set(p.id, p.po_number);
  }
  if (miIds.length > 0) {
    const mis = await db.select({ id: materialIssues.id, slip_number: materialIssues.slip_number }).from(materialIssues).where(inArray(materialIssues.id, miIds));
    for (const m of mis) miMap.set(m.id, m.slip_number);
  }

  return ledger.map((e) => {
    let reference_label = "Manual";
    if (e.reference_type === "purchase_order" && e.reference_id) {
      const num = poMap.get(e.reference_id);
      reference_label = num ? `D-${String(num).padStart(4, "0")}` : "PO";
    } else if (e.reference_type === "material_issue" && e.reference_id) {
      const num = miMap.get(e.reference_id);
      reference_label = (num != null) ? `MI-${String(num).padStart(4, "0")}` : "MI Issue";
    }
    return {
      id: e.id,
      created_at: e.created_at,
      transaction_type: e.transaction_type,
      qty_change: e.qty_change,
      stock_after: e.stock_after,
      reason: e.reason,
      adjusted_by: e.adjusted_by,
      reference_label,
      rate_at_time: e.rate_at_time,
    };
  });
}

// ---------------------------------------------------------------------------
// getDraftCommitmentsForMaterial
// ---------------------------------------------------------------------------

export async function getDraftCommitmentsForMaterial(
  materialId: string
): Promise<DraftCommitmentsResult> {
  const rows = await db.execute<{ slip_number: number; committed_qty: string }>(sql`
    SELECT mi.slip_number, SUM(mii.qty) AS committed_qty
    FROM material_issue_items mii
    INNER JOIN material_issues mi ON mii.issue_id = mi.id
    WHERE mii.material_id = ${materialId}
      AND mi.status = 'Draft'
      AND mii.affects_inventory = true
    GROUP BY mi.id, mi.slip_number
    ORDER BY mi.slip_number
  `);
  const slips = Array.from(rows).map((r) => ({
    slip_number: r.slip_number,
    committed_qty: parseFloat(r.committed_qty),
  }));
  return {
    totalCommitted: slips.reduce((s, r) => s + r.committed_qty, 0),
    slips,
  };
}

// ---------------------------------------------------------------------------
// adjustStock
// ---------------------------------------------------------------------------

export async function adjustStock(
  materialId: string,
  newQty: number,
  reason: string,
  standardCost?: number,
  adjustmentType?: string
): Promise<void> {
  if (newQty < 0) throw new Error("Stock cannot go below zero.");
  if (!reason || reason.trim().length < 10) throw new Error("Reason must be at least 10 characters.");
  if (standardCost !== undefined && standardCost < 0) throw new Error("Unit cost cannot be negative.");

  // Get current username from session
  let username = "system";
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    username = data.user?.email?.split("@")[0] ?? "system";
  } catch {
    // proceed with "system" if auth unavailable
  }

  // Read current stock and standard_cost in one query
  const [mat] = await db
    .select({ current_stock: materials.current_stock, standard_cost: materials.standard_cost })
    .from(materials)
    .where(eq(materials.id, materialId));

  if (!mat) throw new Error("Material not found.");

  const currentQty = parseFloat(mat.current_stock);
  const delta = newQty - currentQty;
  const fullReason = `[${adjustmentType ?? "Adjustment"}] ${reason.trim()} — Adjusted from ${currentQty} to ${newQty} by ${username}`;

  // Fetch the most recent received PO rate for this material.
  // Falls back to standard_cost (existing or newly supplied) so rate_at_time is always
  // populated once a cost is known — keeps the stock history drawer informative.
  const rateResult = await db.execute<{ rate: string }>(sql`
    SELECT DISTINCT ON (poi.material_id) poi.rate
    FROM purchase_order_items poi
    INNER JOIN purchase_orders po ON poi.po_id = po.id
    WHERE po.status = 'Received' AND poi.material_id = ${materialId}
    ORDER BY poi.material_id, po.po_date DESC
    LIMIT 1
  `);
  const poRate = Array.from(rateResult)[0]?.rate ?? null;
  const effectiveStandardCost = standardCost !== undefined ? String(standardCost) : mat.standard_cost;
  const rateAtTime = poRate ?? effectiveStandardCost;

  // Build the SET payload — include standard_cost update when a new value is supplied
  const setPayload: Record<string, string> = { current_stock: String(newQty) };
  if (standardCost !== undefined) setPayload.standard_cost = String(standardCost);

  // Atomic update with optimistic concurrency check
  await db
    .update(materials)
    .set(setPayload)
    .where(and(eq(materials.id, materialId), eq(materials.current_stock, mat.current_stock)));

  // Verify the update actually landed — re-read current_stock.
  // If another user changed it between our read and write, the WHERE clause above
  // would have matched 0 rows and newQty would differ from what's stored now.
  const [verify] = await db
    .select({ current_stock: materials.current_stock })
    .from(materials)
    .where(eq(materials.id, materialId));

  if (!verify || Math.abs(parseFloat(verify.current_stock) - newQty) > 0.0001) {
    throw new Error("Stock was changed by another user — please refresh and try again.");
  }

  // Only insert ledger entry once we've confirmed the update succeeded
  await db.insert(stockLedger).values({
    material_id: materialId,
    transaction_type: "ADJUSTMENT",
    qty_change: String(delta),
    stock_after: String(newQty),
    reason: fullReason,
    adjusted_by: username,
    rate_at_time: rateAtTime,
  });

  revalidatePath("/stock");
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// getStockForMaterial — lightweight single-row fetch for adjustment dialog
// ---------------------------------------------------------------------------

export async function getStockForMaterial(
  materialId: string
): Promise<{ current_stock: string; standard_cost: string | null; draftCommitments: DraftCommitmentsResult } | null> {
  const [row] = await db
    .select({ current_stock: materials.current_stock, standard_cost: materials.standard_cost })
    .from(materials)
    .where(eq(materials.id, materialId));
  if (!row) return null;
  const draftCommitments = await getDraftCommitmentsForMaterial(materialId);
  return { ...row, draftCommitments };
}

// ---------------------------------------------------------------------------
// getVehiclesForJobSearch
// ---------------------------------------------------------------------------

export const getVehiclesForJobSearch = unstable_cache(
  async (): Promise<VehicleSearchRow[]> => {
    const rows = await db
      .select({
        id: vehicles.id,
        job_ref_no: vehicles.job_ref_no,
        customer_name: customers.customer_name,
        is_active: vehicles.is_active,
      })
      .from(vehicles)
      .leftJoin(customers, eq(vehicles.customer_id, customers.id))
      .orderBy(desc(vehicles.job_ref_no));

    return rows.map((r) => ({
      id: r.id,
      job_ref_no: r.job_ref_no,
      customer_name: r.customer_name ?? null,
      is_active: r.is_active,
    }));
  },
  ["stock-vehicles-job-search"],
  { tags: [CACHE_TAGS.vehicles], revalidate: false }
);

// ---------------------------------------------------------------------------
// getJobCostData
// ---------------------------------------------------------------------------

export async function getJobCostData(vehicleId: string): Promise<JobCostResult | null> {
  // Vehicle info
  const [veh] = await db
    .select({
      job_ref_no: vehicles.job_ref_no,
      vehicle_type: vehicles.type,
      customer_name: customers.customer_name,
    })
    .from(vehicles)
    .leftJoin(customers, eq(vehicles.customer_id, customers.id))
    .where(eq(vehicles.id, vehicleId));

  if (!veh) return null;

  // All Issued MI items for this vehicle where affects_inventory = true
  const miItems = await db
    .select({
      slip_id: materialIssues.id,
      material_id: materialIssueItems.material_id,
      material_name: materials.name,
      material_no: materials.material_no,
      contractor_id: materialIssueItems.contractor_id,
      contractor_name: contractors.name,
      unit_name: units.unit_name,
      qty: materialIssueItems.qty,
      rate: materialIssueItems.rate,
      amount: materialIssueItems.amount,
      cgst_amount: materialIssueItems.cgst_amount,
      sgst_amount: materialIssueItems.sgst_amount,
      igst_amount: materialIssueItems.igst_amount,
    })
    .from(materialIssueItems)
    .innerJoin(materialIssues, eq(materialIssueItems.issue_id, materialIssues.id))
    .innerJoin(materials, eq(materialIssueItems.material_id, materials.id))
    .leftJoin(contractors, eq(materialIssueItems.contractor_id, contractors.id))
    .leftJoin(units, eq(materialIssueItems.unit_id, units.id))
    .where(
      and(
        eq(materialIssues.vehicle_id, vehicleId),
        eq(materialIssues.status, "Issued"),
        eq(materialIssueItems.affects_inventory, true)
      )
    );

  if (miItems.length === 0) {
    return {
      vehicle: { job_ref_no: veh.job_ref_no, vehicle_type: veh.vehicle_type, customer_name: veh.customer_name ?? null },
      rows: [],
      totals: { total_cost: 0 },
    };
  }

  // Group by material_id + contractor_id + rate
  type GroupKey = string;
  const groupMap = new Map<
    GroupKey,
    {
      material_name: string;
      material_no: number;
      contractor_name: string | null;
      unit_name: string | null;
      rate: number;
      total_qty: number;
      total_amount: number;
    }
  >();

  for (const item of miItems) {
    const key: GroupKey = `${item.material_id}|${item.contractor_id ?? "none"}|${item.rate}`;
    const qty = parseFloat(item.qty);
    const amount = parseFloat(item.amount);

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        material_name: item.material_name,
        material_no: item.material_no,
        contractor_name: item.contractor_name ?? null,
        unit_name: item.unit_name ?? null,
        rate: parseFloat(item.rate),
        total_qty: 0,
        total_amount: 0,
      });
    }
    const g = groupMap.get(key)!;
    g.total_qty += qty;
    g.total_amount += amount
      + parseFloat(item.cgst_amount || "0")
      + parseFloat(item.sgst_amount || "0")
      + parseFloat(item.igst_amount || "0");
  }

  const rows: JobCostRow[] = Array.from(groupMap.values()).map((g) => ({
    material_name: g.material_name,
    material_no: g.material_no,
    contractor_name: g.contractor_name,
    unit_name: g.unit_name,
    total_qty: g.total_qty,
    rate: g.rate,
    total_amount: g.total_amount,
  }));

  const total_cost = rows.reduce((s, r) => s + r.total_amount, 0);

  return {
    vehicle: { job_ref_no: veh.job_ref_no, vehicle_type: veh.vehicle_type, customer_name: veh.customer_name ?? null },
    rows,
    totals: { total_cost },
  };
}

// ---------------------------------------------------------------------------
// getPriceHistory — purchase price trend for a material
// ---------------------------------------------------------------------------

export interface PriceHistoryEntry {
  id: string;
  po_date: Date;
  po_number: number;
  base_rate: string;            // excl. GST — used for Change % computation, not displayed
  rate_incl_gst: string | null; // null only when qty = 0 (pathological edge case)
}

export async function getPriceHistory(
  materialId: string,
  limit = 50
): Promise<PriceHistoryEntry[]> {
  return db
    .select({
      id: purchaseOrderItems.id,
      po_date: purchaseOrders.po_date,
      po_number: purchaseOrders.po_number,
      base_rate: purchaseOrderItems.rate,
      rate_incl_gst: sql<string | null>`
        ROUND(
          (${purchaseOrderItems.amount}
            + COALESCE(${purchaseOrderItems.cgst_amount}, 0)
            + COALESCE(${purchaseOrderItems.sgst_amount}, 0)
            + COALESCE(${purchaseOrderItems.igst_amount}, 0))
          / NULLIF(${purchaseOrderItems.qty}, 0),
          4
        )
      `,
    })
    .from(purchaseOrderItems)
    .innerJoin(purchaseOrders, eq(purchaseOrderItems.po_id, purchaseOrders.id))
    .where(
      and(
        eq(purchaseOrderItems.material_id, materialId),
        eq(purchaseOrders.status, "Received"),
      )
    )
    .orderBy(desc(purchaseOrders.po_date), desc(purchaseOrders.po_number))
    .limit(limit);
}
