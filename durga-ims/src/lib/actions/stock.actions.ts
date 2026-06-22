"use server";

import { db } from "@/lib/db";
import {
  materials,
  units,
  stockLedger,
  purchaseOrders,
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
  min_level: string | null;
  max_level: string | null;
  last_po_rate: string | null;
  is_active: boolean;
}

export interface StockSummary {
  totalMaterials: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalStockValue: number;
  materialsExcludedFromValue: number;
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

export interface VehicleSearchRow {
  id: string;
  job_ref_no: string;
  vehicle_name: string | null;
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
    vehicle_name: string | null;
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

export async function getStockDashboardMaterials(): Promise<{
  rows: StockMaterialRow[];
  summary: StockSummary;
}> {
  // Fetch all materials: active ones + deactivated ones with stock > 0
  const allMats = await db
    .select({
      id: materials.id,
      material_no: materials.material_no,
      name: materials.name,
      current_stock: materials.current_stock,
      min_level: materials.min_level,
      max_level: materials.max_level,
      is_active: materials.is_active,
      unit_id: materials.purchase_unit_id,
    })
    .from(materials)
    .where(eq(materials.is_active, true))
    .orderBy(materials.material_no);

  if (allMats.length === 0) {
    return {
      rows: [],
      summary: { totalMaterials: 0, lowStockCount: 0, outOfStockCount: 0, totalStockValue: 0, materialsExcludedFromValue: 0 },
    };
  }

  // Fetch unit names
  const unitRows = await db.select({ id: units.id, unit_name: units.unit_name }).from(units);
  const unitMap = new Map(unitRows.map((u) => [u.id, u.unit_name]));

  // DISTINCT ON returns exactly one row per material (the most recent received PO rate).
  const latestRates = await db.execute<{ material_id: string; rate: string }>(sql`
    SELECT DISTINCT ON (poi.material_id)
      poi.material_id,
      poi.rate
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
    min_level: m.min_level,
    max_level: m.max_level,
    last_po_rate: rateMap.get(m.id) ?? null,
    is_active: m.is_active,
  }));

  // Summary metrics (active materials only)
  const activeMats = rows.filter((r) => r.is_active);
  const totalMaterials = activeMats.length;

  const lowStockCount = activeMats.filter((r) => {
    const stock = parseFloat(r.current_stock);
    const minL = parseFloat(r.min_level ?? "0");
    return stock > 0 && minL > 0 && stock < minL;
  }).length;

  const outOfStockCount = activeMats.filter((r) => parseFloat(r.current_stock) === 0).length;

  let totalStockValue = 0;
  let materialsExcludedFromValue = 0;
  for (const r of activeMats) {
    if (r.last_po_rate) {
      totalStockValue += parseFloat(r.current_stock) * parseFloat(r.last_po_rate);
    } else {
      materialsExcludedFromValue++;
    }
  }

  return {
    rows,
    summary: { totalMaterials, lowStockCount, outOfStockCount, totalStockValue, materialsExcludedFromValue },
  };
}

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
  const miMap = new Map<string, number>();

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
      reference_label = num ? `PO-${String(num).padStart(4, "0")}` : "PO";
    } else if (e.reference_type === "material_issue" && e.reference_id) {
      const num = miMap.get(e.reference_id);
      reference_label = num ? `MI-${String(num).padStart(4, "0")}` : "MI Slip";
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
// adjustStock
// ---------------------------------------------------------------------------

export async function adjustStock(
  materialId: string,
  newQty: number,
  reason: string
): Promise<void> {
  if (newQty < 0) throw new Error("Stock cannot go below zero.");
  if (!reason || reason.trim().length < 10) throw new Error("Reason must be at least 10 characters.");

  // Get current username from session
  let username = "system";
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    username = data.user?.email?.split("@")[0] ?? "system";
  } catch {
    // proceed with "system" if auth unavailable
  }

  // Read current stock
  const [mat] = await db
    .select({ current_stock: materials.current_stock })
    .from(materials)
    .where(eq(materials.id, materialId));

  if (!mat) throw new Error("Material not found.");

  const currentQty = parseFloat(mat.current_stock);
  const delta = newQty - currentQty;
  const fullReason = `${reason.trim()} — Adjusted from ${currentQty} to ${newQty} by ${username}`;

  // Fetch the most recent received PO rate for this material — informational only (not critical).
  // Queried before the update to minimise the timing gap; null if material has never been purchased.
  const rateResult = await db.execute<{ rate: string }>(sql`
    SELECT DISTINCT ON (poi.material_id) poi.rate
    FROM purchase_order_items poi
    INNER JOIN purchase_orders po ON poi.po_id = po.id
    WHERE po.status = 'Received' AND poi.material_id = ${materialId}
    ORDER BY poi.material_id, po.po_date DESC
    LIMIT 1
  `);
  const rateAtTime = Array.from(rateResult)[0]?.rate ?? null;

  // Atomic update with optimistic concurrency check
  await db
    .update(materials)
    .set({ current_stock: String(newQty) })
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
}

// ---------------------------------------------------------------------------
// getStockForMaterial — lightweight single-row fetch for adjustment dialog
// ---------------------------------------------------------------------------

export async function getStockForMaterial(
  materialId: string
): Promise<{ current_stock: string } | null> {
  const [row] = await db
    .select({ current_stock: materials.current_stock })
    .from(materials)
    .where(eq(materials.id, materialId));
  return row ?? null;
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
        vehicle_name: vehicles.vehicle_name,
        customer_name: customers.customer_name,
        is_active: vehicles.is_active,
      })
      .from(vehicles)
      .leftJoin(customers, eq(vehicles.customer_id, customers.id))
      .orderBy(desc(vehicles.job_ref_no));

    return rows.map((r) => ({
      id: r.id,
      job_ref_no: r.job_ref_no,
      vehicle_name: r.vehicle_name,
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
      vehicle_name: vehicles.vehicle_name,
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
      vehicle: { job_ref_no: veh.job_ref_no, vehicle_name: veh.vehicle_name, vehicle_type: veh.vehicle_type, customer_name: veh.customer_name ?? null },
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
    g.total_amount += amount;
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
    vehicle: { job_ref_no: veh.job_ref_no, vehicle_name: veh.vehicle_name, vehicle_type: veh.vehicle_type, customer_name: veh.customer_name ?? null },
    rows,
    totals: { total_cost },
  };
}
