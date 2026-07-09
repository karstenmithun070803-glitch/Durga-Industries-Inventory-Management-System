"use server";

import { db } from "@/lib/db";
import {
  materialIssues,
  materialIssueItems,
  materials,
  vehicles,
  customers,
  contractors,
  units,
  taxRates,
  stockLedger,
  invoiceSlipLinks,
  invoices,
  stages,
} from "@/lib/db/schema";
import { eq, and, sql, desc, max, asc, inArray, gte, lte, or, ilike } from "drizzle-orm";
import { revalidateTag, unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache";
import { fyDateRange } from "@/lib/fy";
import type { MaterialIssueWithDetails, MaterialIssueItemWithDetails, MaterialIssueRow } from "@/types";
import { determineGstType } from "@/types";

// ---------------------------------------------------------------------------
// Input interfaces
// ---------------------------------------------------------------------------

interface IssueItemInput {
  material_id: string;
  contractor_id: string | null;
  hsn_code: string;
  qty: string;
  unit_id: string;
  rate: string;
  rate_blank: boolean;
  tax_percentage: string;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  amount: string;
  gst_type: string;
  affects_inventory: boolean;
  zero_rate_confirmed: boolean;
  stage_id?: string | null;
}

interface IssueHeaderInput {
  vehicle_id: string;
  issue_date: string;
  financial_year: string;
  margin_percentage: string;
  total_amount: string;
  issue_type?: "OLD" | "NEW";
  stage_id?: string | null;
  items: IssueItemInput[];
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function clampDateToFY(financialYear: string): Date {
  const { start, end } = fyDateRange(financialYear);
  const today = new Date();
  if (today < start) return start;
  if (today > end) return end;
  return today;
}

export async function peekNextSlipNumber(financialYear: string): Promise<number> {
  const [row] = await db
    .select({ maxNum: max(materialIssues.slip_number) })
    .from(materialIssues)
    .where(eq(materialIssues.financial_year, financialYear));
  return (row?.maxNum ?? 0) + 1;
}

function validateIssueItems(items: IssueItemInput[]) {
  if (items.length === 0) throw new Error("Add at least one material.");

  for (const item of items) {
    if (!item.material_id) throw new Error("All items must have a material selected.");
    if (parseFloat(item.qty || "0") <= 0) throw new Error("All quantities must be greater than zero.");
  }

  // Duplicate check: material_id|contractor_id|normalizedRate|stage_id
  // stage_id is included so two stages can legitimately share the same material at the same rate
  const seen = new Set<string>();
  for (const item of items) {
    const rate = parseFloat(item.rate || "0").toFixed(2);
    const key = `${item.material_id}|${item.contractor_id ?? ""}|${rate}|${item.stage_id ?? ""}`;
    if (seen.has(key))
      throw new Error(
        "Duplicate entry detected: same material, same contractor, same rate, and same stage already exists. Combine into one row or adjust the rate."
      );
    seen.add(key);
  }

  // Zero rate confirmation
  for (const item of items) {
    if (item.rate === "0" && !item.rate_blank && !item.zero_rate_confirmed)
      throw new Error(
        "One or more items have a zero rate without confirmation. Check 'Zero cost — confirm?' for each."
      );
  }
}

function itemValues(issueId: string, item: IssueItemInput) {
  return {
    issue_id: issueId,
    material_id: item.material_id,
    contractor_id: item.contractor_id || null,
    hsn_code: item.hsn_code?.trim() || null,
    qty: item.qty,
    unit_id: item.unit_id || null,
    rate: item.rate || "0",
    tax_percentage: item.tax_percentage || "0",
    cgst_amount: item.cgst_amount || "0",
    sgst_amount: item.sgst_amount || "0",
    igst_amount: item.igst_amount || "0",
    amount: item.amount || "0",
    gst_type: item.gst_type || null,
    affects_inventory: item.affects_inventory,
    stage_id: item.stage_id ?? null,
  };
}

// ---------------------------------------------------------------------------
// Read — dropdown / master data
// ---------------------------------------------------------------------------

export const getActiveVehicles = unstable_cache(
  async () => {
    const rows = await db
      .select({
        id: vehicles.id,
        job_ref_no: vehicles.job_ref_no,
        type: vehicles.type,
        customer_id: vehicles.customer_id,
        customer_name: customers.customer_name,
        customer_gstin: customers.gstin,
        customer_state: customers.state,
        address_1: customers.address_1,
        address_2: customers.address_2,
        street: customers.street,
        city: customers.city,
      })
      .from(vehicles)
      .leftJoin(customers, eq(vehicles.customer_id, customers.id))
      .where(eq(vehicles.is_active, true))
      .orderBy(vehicles.job_ref_no);

    return rows.map((r) => ({
      ...r,
      customer_address: [r.address_1, r.address_2, r.street, r.city].filter(Boolean).join(", ") || null,
      address_1: undefined,
      address_2: undefined,
      street: undefined,
      city: undefined,
    }));
  },
  ["mi-active-vehicles"],
  { tags: [CACHE_TAGS.vehicles], revalidate: false }
);

export const getActiveContractors = unstable_cache(
  async () =>
    db
      .select({
        id: contractors.id,
        code_no: contractors.code_no,
        name: contractors.name,
        role: contractors.role,
      })
      .from(contractors)
      .where(eq(contractors.is_active, true))
      .orderBy(contractors.code_no),
  ["mi-active-contractors"],
  { tags: [CACHE_TAGS.contractors], revalidate: false }
);

export const getActiveIssueMaterials = unstable_cache(
  async () => {
    const pu = units;
    const [mats, rates] = await Promise.all([
      db
        .select({
          id: materials.id,
          material_no: materials.material_no,
          name: materials.name,
          hsn_code: materials.hsn_code,
          tax_rate_id: materials.tax_rate_id,
          tax_percentage: taxRates.tax_percentage,
          purchase_unit_id: materials.purchase_unit_id,
          purchase_unit_name: pu.unit_name,
          sales_unit_id: materials.sales_unit_id,
          current_stock: materials.current_stock,
        })
        .from(materials)
        .leftJoin(taxRates, eq(materials.tax_rate_id, taxRates.id))
        .leftJoin(pu, eq(materials.purchase_unit_id, pu.id))
        .where(eq(materials.is_active, true))
        .orderBy(materials.material_no),
      db.execute<{ material_id: string; rate: string }>(sql`
        SELECT DISTINCT ON (poi.material_id)
          poi.material_id,
          poi.rate
        FROM purchase_order_items poi
        INNER JOIN purchase_orders po ON poi.po_id = po.id
        WHERE po.status = 'Received'
        ORDER BY poi.material_id, po.po_date DESC
      `),
    ]);
    const rateMap = new Map(rates.map((r) => [r.material_id, r.rate]));
    return mats.map((m) => ({ ...m, lastRate: rateMap.get(m.id) ?? null }));
  },
  ["mi-active-materials"],
  { tags: [CACHE_TAGS.materials], revalidate: false }
);

export const getActiveSalesUnits = unstable_cache(
  async () =>
    db
      .select({ id: units.id, unit_name: units.unit_name })
      .from(units)
      .where(eq(units.is_active, true))
      .orderBy(units.unit_code),
  ["mi-active-sales-units"],
  { tags: [CACHE_TAGS.units], revalidate: false }
);

export async function getLastMaterialRate(materialId: string): Promise<string | null> {
  const { purchaseOrders, purchaseOrderItems } = await import("@/lib/db/schema");
  const rows = await db
    .select({ rate: purchaseOrderItems.rate })
    .from(purchaseOrderItems)
    .innerJoin(purchaseOrders, eq(purchaseOrderItems.po_id, purchaseOrders.id))
    .where(
      and(
        eq(purchaseOrderItems.material_id, materialId),
        eq(purchaseOrders.status, "Received")
      )
    )
    .orderBy(desc(purchaseOrders.po_date))
    .limit(1);
  return rows[0]?.rate ?? null;
}

// ---------------------------------------------------------------------------
// Read — slips dropdown (typed by issue_type)
// ---------------------------------------------------------------------------

export async function getSlipsForDropdown(
  financialYear: string,
  issueType: "OLD" | "NEW"
): Promise<{ id: string; slipNumber: number | null; vehicleId: string; date: string; status: string }[]> {
  const rows = await db
    .select({
      id: materialIssues.id,
      slip_number: materialIssues.slip_number,
      vehicle_id: materialIssues.vehicle_id,
      issue_date: materialIssues.issue_date,
      status: materialIssues.status,
    })
    .from(materialIssues)
    .innerJoin(vehicles, eq(materialIssues.vehicle_id, vehicles.id))
    .where(
      and(
        eq(materialIssues.financial_year, financialYear),
        eq(materialIssues.issue_type, issueType)
      )
    )
    .orderBy(desc(materialIssues.slip_number));

  return rows.map((r) => ({
    id: r.id,
    slipNumber: r.slip_number,
    vehicleId: r.vehicle_id,
    date:
      r.issue_date instanceof Date
        ? r.issue_date.toISOString().split("T")[0]
        : String(r.issue_date),
    status: r.status,
  }));
}

// ---------------------------------------------------------------------------
// Read — list + detail
// ---------------------------------------------------------------------------

interface MIListParams {
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function getMaterialIssues(
  financialYear: string,
  issueType: "OLD" | "NEW",
  params: MIListParams = {}
): Promise<MaterialIssueRow[]> {
  const { search, status, dateFrom, dateTo } = params;
  const q = search ? `%${search}%` : null;
  const cu = customers;
  const co = contractors;
  const u = units;
  const m = materials;
  const v = vehicles;

  const rows = await db
    .select({
      id: materialIssues.id,
      slip_number: materialIssues.slip_number,
      issue_date: materialIssues.issue_date,
      financial_year: materialIssues.financial_year,
      status: materialIssues.status,
      issue_type: materialIssues.issue_type,
      margin_percentage: materialIssues.margin_percentage,
      total_amount: materialIssues.total_amount,
      vehicle_id: materialIssues.vehicle_id,
      job_ref_no: v.job_ref_no,
      customer_id: cu.id,
      customer_name: cu.customer_name,
      customer_gstin: cu.gstin,
      customer_state: cu.state,
      customer_address_1: cu.address_1,
      customer_address_2: cu.address_2,
      customer_street: cu.street,
      customer_city: cu.city,
      item_id: materialIssueItems.id,
      material_id: materialIssueItems.material_id,
      material_name: m.name,
      material_no: m.material_no,
      hsn_code: materialIssueItems.hsn_code,
      contractor_id: co.id,
      contractor_name: co.name,
      qty: materialIssueItems.qty,
      unit_id: materialIssueItems.unit_id,
      unit_name: u.unit_name,
      rate: materialIssueItems.rate,
      tax_percentage: materialIssueItems.tax_percentage,
      cgst_amount: materialIssueItems.cgst_amount,
      sgst_amount: materialIssueItems.sgst_amount,
      igst_amount: materialIssueItems.igst_amount,
      amount: materialIssueItems.amount,
      gst_type: materialIssueItems.gst_type,
      affects_inventory: materialIssueItems.affects_inventory,
    })
    .from(materialIssues)
    .innerJoin(materialIssueItems, eq(materialIssueItems.issue_id, materialIssues.id))
    .innerJoin(m, eq(materialIssueItems.material_id, m.id))
    .innerJoin(v, eq(materialIssues.vehicle_id, v.id))
    .leftJoin(cu, eq(v.customer_id, cu.id))
    .leftJoin(co, eq(materialIssueItems.contractor_id, co.id))
    .leftJoin(u, eq(materialIssueItems.unit_id, u.id))
    .where(and(
      eq(materialIssues.financial_year, financialYear),
      eq(materialIssues.issue_type, issueType),
      status && status !== "all" ? eq(materialIssues.status, status) : undefined,
      dateFrom ? gte(materialIssues.issue_date, new Date(dateFrom)) : undefined,
      dateTo ? lte(materialIssues.issue_date, new Date(dateTo + "T23:59:59")) : undefined,
      q ? or(ilike(v.job_ref_no, q), ilike(cu.customer_name, q)) : undefined,
    ))
    .orderBy(desc(materialIssues.issue_date), desc(materialIssues.slip_number));

  return rows.map((r) => ({
    ...r,
    issue_date: r.issue_date instanceof Date ? r.issue_date.toISOString() : String(r.issue_date),
    margin_percentage: r.margin_percentage ?? "0",
    customer_id: r.customer_id ?? null,
    customer_name: r.customer_name ?? null,
    customer_gstin: r.customer_gstin ?? null,
    customer_state: r.customer_state ?? null,
    customer_address:
      [r.customer_address_1, r.customer_address_2, r.customer_street, r.customer_city]
        .filter(Boolean)
        .join(", ") || null,
    customer_address_1: undefined,
    customer_address_2: undefined,
    customer_street: undefined,
    customer_city: undefined,
    contractor_id: r.contractor_id ?? null,
    contractor_name: r.contractor_name ?? null,
    unit_id: r.unit_id ?? null,
    unit_name: r.unit_name ?? null,
    gst_type: r.gst_type ?? null,
  }));
}

export async function getMaterialIssueById(id: string): Promise<MaterialIssueWithDetails | null> {
  const [header] = await db
    .select({
      id: materialIssues.id,
      slip_number: materialIssues.slip_number,
      issue_date: materialIssues.issue_date,
      financial_year: materialIssues.financial_year,
      status: materialIssues.status,
      issue_type: materialIssues.issue_type,
      stage_id: materialIssues.stage_id,
      margin_percentage: materialIssues.margin_percentage,
      total_amount: materialIssues.total_amount,
      saved_stage_ids: materialIssues.saved_stage_ids,
      vehicle_id: materialIssues.vehicle_id,
      job_ref_no: vehicles.job_ref_no,
      customer_id: customers.id,
      customer_name: customers.customer_name,
      customer_gstin: customers.gstin,
      customer_state: customers.state,
      customer_address_1: customers.address_1,
      customer_address_2: customers.address_2,
      customer_street: customers.street,
      customer_city: customers.city,
    })
    .from(materialIssues)
    .innerJoin(vehicles, eq(materialIssues.vehicle_id, vehicles.id))
    .leftJoin(customers, eq(vehicles.customer_id, customers.id))
    .where(eq(materialIssues.id, id));

  if (!header) return null;

  const itemRows = await db
    .select({
      id: materialIssueItems.id,
      issue_id: materialIssueItems.issue_id,
      material_id: materialIssueItems.material_id,
      material_name: materials.name,
      material_no: materials.material_no,
      hsn_code: materialIssueItems.hsn_code,
      contractor_id: contractors.id,
      contractor_name: contractors.name,
      qty: materialIssueItems.qty,
      unit_id: materialIssueItems.unit_id,
      unit_name: units.unit_name,
      rate: materialIssueItems.rate,
      tax_percentage: materialIssueItems.tax_percentage,
      cgst_amount: materialIssueItems.cgst_amount,
      sgst_amount: materialIssueItems.sgst_amount,
      igst_amount: materialIssueItems.igst_amount,
      amount: materialIssueItems.amount,
      gst_type: materialIssueItems.gst_type,
      affects_inventory: materialIssueItems.affects_inventory,
      stage_id: materialIssueItems.stage_id,
      stage_name: stages.stage_name,
    })
    .from(materialIssueItems)
    .innerJoin(materials, eq(materialIssueItems.material_id, materials.id))
    .leftJoin(contractors, eq(materialIssueItems.contractor_id, contractors.id))
    .leftJoin(units, eq(materialIssueItems.unit_id, units.id))
    .leftJoin(stages, eq(materialIssueItems.stage_id, stages.id))
    .where(eq(materialIssueItems.issue_id, id));

  const items: MaterialIssueItemWithDetails[] = itemRows.map((r) => ({
    id: r.id,
    issue_id: r.issue_id,
    material_id: r.material_id,
    material_name: r.material_name,
    material_no: r.material_no,
    hsn_code: r.hsn_code ?? null,
    contractor_id: r.contractor_id ?? null,
    contractor_name: r.contractor_name ?? null,
    qty: r.qty,
    unit_id: r.unit_id ?? null,
    unit_name: r.unit_name ?? null,
    rate: r.rate,
    tax_percentage: r.tax_percentage,
    cgst_amount: r.cgst_amount,
    sgst_amount: r.sgst_amount,
    igst_amount: r.igst_amount,
    amount: r.amount,
    gst_type: r.gst_type ?? null,
    affects_inventory: r.affects_inventory,
    stage_id: r.stage_id ?? null,
    stage_name: r.stage_name ?? null,
  }));

  return {
    id: header.id,
    slip_number: header.slip_number,
    issue_date:
      header.issue_date instanceof Date ? header.issue_date.toISOString() : String(header.issue_date),
    financial_year: header.financial_year,
    status: header.status,
    issue_type: header.issue_type,
    stage_id: header.stage_id ?? null,
    margin_percentage: header.margin_percentage ?? "0",
    total_amount: header.total_amount,
    saved_stage_ids: header.saved_stage_ids ?? [],
    vehicle_id: header.vehicle_id,
    job_ref_no: header.job_ref_no,
    customer_id: header.customer_id ?? null,
    customer_name: header.customer_name ?? null,
    customer_gstin: header.customer_gstin ?? null,
    customer_state: header.customer_state ?? null,
    customer_address:
      [
        header.customer_address_1,
        header.customer_address_2,
        header.customer_street,
        header.customer_city,
      ]
        .filter(Boolean)
        .join(", ") || null,
    items,
  };
}

// ---------------------------------------------------------------------------
// Write — create (advisory lock inside transaction)
// ---------------------------------------------------------------------------

/** @deprecated Use saveVehicleMaterialIssue instead */
export async function createMaterialIssue(data: IssueHeaderInput): Promise<string> {
  if (!data.vehicle_id) throw new Error("Vehicle is required.");
  if (data.issue_type && !["OLD", "NEW"].includes(data.issue_type))
    throw new Error("Invalid issue_type");
  validateIssueItems(data.items);

  const issueDate = new Date(data.issue_date);
  const fyRange = fyDateRange(data.financial_year);
  if (issueDate < fyRange.start || issueDate > fyRange.end)
    throw new Error("Issue date must fall within the active financial year.");

  let newId = "";
  try {
    newId = await db.transaction(async (tx) => {
      const lockKey = `mi_slip:${data.financial_year}`;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`);

      const [row] = await tx
        .select({ maxNum: max(materialIssues.slip_number) })
        .from(materialIssues)
        .where(eq(materialIssues.financial_year, data.financial_year));
      const slipNumber = (row?.maxNum ?? 0) + 1;

      const [issue] = await tx
        .insert(materialIssues)
        .values({
          slip_number: slipNumber,
          issue_date: issueDate,
          vehicle_id: data.vehicle_id,
          issue_type: data.issue_type ?? "OLD",
          stage_id: data.stage_id ?? null,
          margin_percentage: data.margin_percentage || "0",
          total_amount: data.total_amount || "0",
          financial_year: data.financial_year,
          status: "Draft",
        })
        .returning({ id: materialIssues.id });

      if (data.items.length > 0) {
        await tx
          .insert(materialIssueItems)
          .values(data.items.map((item) => itemValues(issue.id, item)));
      }

      return issue.id;
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("slip_number_fy_unique")) {
      throw new Error("Slip number conflict — please try saving again.");
    }
    throw e;
  }

  return newId;
}

// ---------------------------------------------------------------------------
// Write — update Draft
// ---------------------------------------------------------------------------

export async function updateMaterialIssue(id: string, data: IssueHeaderInput): Promise<void> {
  const [existing] = await db
    .select({ status: materialIssues.status })
    .from(materialIssues)
    .where(eq(materialIssues.id, id));

  if (!existing) throw new Error("Issue slip not found.");
  if (existing.status !== "Draft")
    throw new Error("Cannot edit a confirmed issue slip. Use 'Save & Reapply' instead.");

  if (!data.vehicle_id) throw new Error("Vehicle is required.");
  validateIssueItems(data.items);

  const issueDate = new Date(data.issue_date);
  const fyRange = fyDateRange(data.financial_year);
  if (issueDate < fyRange.start || issueDate > fyRange.end)
    throw new Error("Issue date must fall within the active financial year.");

  await db.delete(materialIssueItems).where(eq(materialIssueItems.issue_id, id));
  if (data.items.length > 0) {
    await db
      .insert(materialIssueItems)
      .values(data.items.map((item) => itemValues(id, item)));
  }
  await db
    .update(materialIssues)
    .set({
      issue_date: issueDate,
      vehicle_id: data.vehicle_id,
      stage_id: data.stage_id ?? null,
      margin_percentage: data.margin_percentage || "0",
      total_amount: data.total_amount || "0",
    })
    .where(eq(materialIssues.id, id));

}

// ---------------------------------------------------------------------------
// Write — issue (Draft → Issued, stock deduction)
// ---------------------------------------------------------------------------

/** @deprecated Use saveVehicleMaterialIssue instead */
export async function issueMaterialIssue(id: string): Promise<number | null> {
  const [issue] = await db
    .select({ status: materialIssues.status, slip_number: materialIssues.slip_number })
    .from(materialIssues)
    .where(eq(materialIssues.id, id));

  if (!issue) throw new Error("Issue slip not found.");
  if (issue.status !== "Draft") throw new Error("Only Draft slips can be confirmed.");

  const items = await db
    .select({
      material_id: materialIssueItems.material_id,
      qty: materialIssueItems.qty,
      affects_inventory: materialIssueItems.affects_inventory,
    })
    .from(materialIssueItems)
    .where(eq(materialIssueItems.issue_id, id));

  const inventoryItems = items.filter((i) => i.affects_inventory);

  await db.transaction(async (tx) => {
    // Batch: single SELECT covers both validation and stock update
    const matStocks = inventoryItems.length > 0
      ? await tx
          .select({ id: materials.id, name: materials.name, current_stock: materials.current_stock })
          .from(materials)
          .where(inArray(materials.id, inventoryItems.map((i) => i.material_id)))
      : [];
    const stockMap = new Map(matStocks.map((m) => [m.id, { name: m.name, stock: parseFloat(m.current_stock) }]));

    // Validate stock sufficiency
    const qtyByMaterial = new Map<string, number>();
    for (const item of inventoryItems) {
      qtyByMaterial.set(item.material_id, (qtyByMaterial.get(item.material_id) ?? 0) + parseFloat(item.qty || "0"));
    }
    for (const [materialId, requestedQty] of Array.from(qtyByMaterial.entries())) {
      const mat = stockMap.get(materialId);
      if (!mat) throw new Error("Material not found.");
      if (mat.stock < requestedQty)
        throw new Error(`Insufficient stock for "${mat.name}": available ${mat.stock.toFixed(2)}, requested ${requestedQty.toFixed(2)}.`)
    }

    await tx.update(materialIssues).set({ status: "Issued" }).where(eq(materialIssues.id, id));

    for (const item of inventoryItems) {
      const newStock = stockMap.get(item.material_id)!.stock - parseFloat(item.qty);
      await tx.update(materials).set({ current_stock: newStock.toString() }).where(eq(materials.id, item.material_id));
    }

    if (inventoryItems.length > 0) {
      await tx.insert(stockLedger).values(
        inventoryItems.map((item) => ({
          material_id: item.material_id,
          transaction_type: "ISSUE",
          reference_id: id,
          reference_type: "material_issue",
          qty_change: (-parseFloat(item.qty)).toString(),
          stock_after: (stockMap.get(item.material_id)!.stock - parseFloat(item.qty)).toFixed(4),
        }))
      );
    }
  });

  revalidateTag(CACHE_TAGS.materials);
  revalidateTag(CACHE_TAGS.dashboard);
  return issue.slip_number;
}

// ---------------------------------------------------------------------------
// Write — update issued (atomic reverse + reapply)
// ---------------------------------------------------------------------------

export async function updateIssuedMaterialIssue(id: string, data: IssueHeaderInput): Promise<void> {
  const [existing] = await db
    .select({ status: materialIssues.status })
    .from(materialIssues)
    .where(eq(materialIssues.id, id));

  if (!existing) throw new Error("Issue slip not found.");
  if (existing.status !== "Issued") throw new Error("Use 'Save Draft' for draft slips.");

  if (!data.vehicle_id) throw new Error("Vehicle is required.");
  validateIssueItems(data.items);

  const issueDate = new Date(data.issue_date);
  const fyRange = fyDateRange(data.financial_year);
  if (issueDate < fyRange.start || issueDate > fyRange.end)
    throw new Error("Issue date must fall within the active financial year.");

  await db.transaction(async (tx) => {
    const oldItems = await tx
      .select({
        material_id: materialIssueItems.material_id,
        qty: materialIssueItems.qty,
        affects_inventory: materialIssueItems.affects_inventory,
      })
      .from(materialIssueItems)
      .where(eq(materialIssueItems.issue_id, id));

    const oldInventoryItems = oldItems.filter((i) => i.affects_inventory);
    if (oldInventoryItems.length > 0) {
      const oldMatStocks = await tx
        .select({ id: materials.id, current_stock: materials.current_stock })
        .from(materials)
        .where(inArray(materials.id, oldInventoryItems.map((i) => i.material_id)));
      const oldStockMap = new Map(oldMatStocks.map((m) => [m.id, parseFloat(m.current_stock)]));

      for (const item of oldInventoryItems) {
        const reversedStock = oldStockMap.get(item.material_id)! + parseFloat(item.qty);
        await tx.update(materials).set({ current_stock: reversedStock.toString() }).where(eq(materials.id, item.material_id));
      }

      await tx.insert(stockLedger).values(
        oldInventoryItems.map((item) => ({
          material_id: item.material_id,
          transaction_type: "REVERSAL",
          reference_id: id,
          reference_type: "material_issue",
          qty_change: item.qty,
          stock_after: (oldStockMap.get(item.material_id)! + parseFloat(item.qty)).toFixed(4),
        }))
      );
    }

    await tx.delete(materialIssueItems).where(eq(materialIssueItems.issue_id, id));
    if (data.items.length > 0) {
      await tx.insert(materialIssueItems).values(data.items.map((item) => itemValues(id, item)));
    }

    const newInventoryItems = data.items.filter((i) => i.affects_inventory);
    if (newInventoryItems.length > 0) {
      const newMatStocks = await tx
        .select({ id: materials.id, name: materials.name, current_stock: materials.current_stock })
        .from(materials)
        .where(inArray(materials.id, newInventoryItems.map((i) => i.material_id)));
      const newStockMap = new Map(newMatStocks.map((m) => [m.id, { name: m.name, stock: parseFloat(m.current_stock) }]));

      const qtyByMaterial = new Map<string, number>();
      for (const item of newInventoryItems) {
        qtyByMaterial.set(item.material_id, (qtyByMaterial.get(item.material_id) ?? 0) + parseFloat(item.qty || "0"));
      }
      for (const [materialId, requestedQty] of Array.from(qtyByMaterial.entries())) {
        const mat = newStockMap.get(materialId);
        if (!mat) throw new Error("Material not found.");
        if (mat.stock < requestedQty)
          throw new Error(`Insufficient stock for "${mat.name}": available ${mat.stock.toFixed(2)}, requested ${requestedQty.toFixed(2)}.`);
      }

      for (const item of newInventoryItems) {
        const newStock = newStockMap.get(item.material_id)!.stock - parseFloat(item.qty);
        await tx.update(materials).set({ current_stock: newStock.toString() }).where(eq(materials.id, item.material_id));
      }

      await tx.insert(stockLedger).values(
        newInventoryItems.map((item) => ({
          material_id: item.material_id,
          transaction_type: "ISSUE",
          reference_id: id,
          reference_type: "material_issue",
          qty_change: (-parseFloat(item.qty)).toString(),
          stock_after: (newStockMap.get(item.material_id)!.stock - parseFloat(item.qty)).toFixed(4),
        }))
      );
    }

    // stage_id is immutable after issue — do not update it
    await tx
      .update(materialIssues)
      .set({
        issue_date: issueDate,
        vehicle_id: data.vehicle_id,
        margin_percentage: data.margin_percentage || "0",
        total_amount: data.total_amount || "0",
      })
      .where(eq(materialIssues.id, id));
  });

  revalidateTag(CACHE_TAGS.materials);
  revalidateTag(CACHE_TAGS.dashboard);
}

// ---------------------------------------------------------------------------
// Write — delete
// ---------------------------------------------------------------------------

export async function deleteMaterialIssue(id: string): Promise<void> {
  const [issue] = await db
    .select({ status: materialIssues.status })
    .from(materialIssues)
    .where(eq(materialIssues.id, id));

  if (!issue) throw new Error("Issue slip not found.");

  if (issue.status === "Draft") {
    await db.delete(materialIssues).where(eq(materialIssues.id, id));
  } else {
    const linkedInvoice = await db
      .select({ bill_number: invoices.bill_number })
      .from(invoiceSlipLinks)
      .innerJoin(invoices, eq(invoiceSlipLinks.invoice_id, invoices.id))
      .where(eq(invoiceSlipLinks.slip_id, id))
      .limit(1);
    if (linkedInvoice.length > 0)
      throw new Error(
        `This issue slip has been used in Invoice ${linkedInvoice[0].bill_number}. Delete or revert that invoice first.`
      );

    const items = await db
      .select({
        material_id: materialIssueItems.material_id,
        qty: materialIssueItems.qty,
        affects_inventory: materialIssueItems.affects_inventory,
      })
      .from(materialIssueItems)
      .where(eq(materialIssueItems.issue_id, id));

    await db.transaction(async (tx) => {
      const delInventoryItems = items.filter((i) => i.affects_inventory);
      if (delInventoryItems.length > 0) {
        const delMatStocks = await tx
          .select({ id: materials.id, current_stock: materials.current_stock })
          .from(materials)
          .where(inArray(materials.id, delInventoryItems.map((i) => i.material_id)));
        const delStockMap = new Map(delMatStocks.map((m) => [m.id, parseFloat(m.current_stock)]));

        for (const item of delInventoryItems) {
          const restoredStock = delStockMap.get(item.material_id)! + parseFloat(item.qty);
          await tx.update(materials).set({ current_stock: restoredStock.toString() }).where(eq(materials.id, item.material_id));
        }

        await tx.insert(stockLedger).values(
          delInventoryItems.map((item) => ({
            material_id: item.material_id,
            transaction_type: "REVERSAL",
            reference_id: id,
            reference_type: "material_issue",
            qty_change: item.qty,
            stock_after: (delStockMap.get(item.material_id)! + parseFloat(item.qty)).toFixed(4),
          }))
        );
      }
      await tx.delete(materialIssues).where(eq(materialIssues.id, id));
    });
  }

  revalidateTag(CACHE_TAGS.materials);
  revalidateTag(CACHE_TAGS.dashboard);
}

// ---------------------------------------------------------------------------
// Write — clone
// ---------------------------------------------------------------------------

/** @deprecated Use cloneVehicleMaterialIssue instead */
export async function cloneOldMaterialIssue(
  slipId: string
): Promise<{ newSlipId: string; newSlipNumber: number }> {
  const [src] = await db
    .select({
      status: materialIssues.status,
      issue_type: materialIssues.issue_type,
      vehicle_id: materialIssues.vehicle_id,
      financial_year: materialIssues.financial_year,
      margin_percentage: materialIssues.margin_percentage,
    })
    .from(materialIssues)
    .where(eq(materialIssues.id, slipId));

  if (!src) throw new Error("Slip not found");
  if (src.status === "Cancelled") throw new Error("Cannot clone a cancelled slip");
  if (src.issue_type !== "OLD") throw new Error("Use clone on the New VMI screen for NEW type slips");

  const cloneDate = clampDateToFY(src.financial_year);
  let newSlipId = "";
  let newSlipNumber = 0;

  await db.transaction(async (tx) => {
    const lockKey = `mi_slip:${src.financial_year}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`);

    const [row] = await tx
      .select({ maxNum: max(materialIssues.slip_number) })
      .from(materialIssues)
      .where(eq(materialIssues.financial_year, src.financial_year));
    const slipNum = (row?.maxNum ?? 0) + 1;

    const [{ newId }] = await tx
      .insert(materialIssues)
      .values({
        slip_number: slipNum,
        status: "Draft",
        issue_type: "OLD",
        stage_id: null,
        vehicle_id: src.vehicle_id,
        financial_year: src.financial_year,
        issue_date: cloneDate,
        margin_percentage: src.margin_percentage ?? "0",
        total_amount: "0",
      })
      .returning({ newId: materialIssues.id });

    const srcItems = await tx
      .select({
        material_id: materialIssueItems.material_id,
        contractor_id: materialIssueItems.contractor_id,
        hsn_code: materialIssueItems.hsn_code,
        qty: materialIssueItems.qty,
        unit_id: materialIssueItems.unit_id,
        rate: materialIssueItems.rate,
        tax_percentage: materialIssueItems.tax_percentage,
        cgst_amount: materialIssueItems.cgst_amount,
        sgst_amount: materialIssueItems.sgst_amount,
        igst_amount: materialIssueItems.igst_amount,
        amount: materialIssueItems.amount,
        gst_type: materialIssueItems.gst_type,
        affects_inventory: materialIssueItems.affects_inventory,
      })
      .from(materialIssueItems)
      .where(eq(materialIssueItems.issue_id, slipId));

    if (srcItems.length > 0) {
      await tx
        .insert(materialIssueItems)
        .values(srcItems.map((item) => ({ ...item, issue_id: newId })));
    }

    newSlipId = newId;
    newSlipNumber = slipNum;
  });

  return { newSlipId, newSlipNumber };
}

// ---------------------------------------------------------------------------
// Read — vehicle's single material issue record for a FY (no-slip model)
// ---------------------------------------------------------------------------

export async function getVehicleMaterialIssue(
  vehicleId: string,
  issueType: "OLD" | "NEW",
  financialYear: string
): Promise<MaterialIssueWithDetails | null> {
  const [header] = await db
    .select({
      id: materialIssues.id,
      slip_number: materialIssues.slip_number,
      issue_date: materialIssues.issue_date,
      financial_year: materialIssues.financial_year,
      status: materialIssues.status,
      issue_type: materialIssues.issue_type,
      stage_id: materialIssues.stage_id,
      margin_percentage: materialIssues.margin_percentage,
      total_amount: materialIssues.total_amount,
      saved_stage_ids: materialIssues.saved_stage_ids,
      vehicle_id: materialIssues.vehicle_id,
      job_ref_no: vehicles.job_ref_no,
      customer_id: customers.id,
      customer_name: customers.customer_name,
      customer_gstin: customers.gstin,
      customer_state: customers.state,
      customer_address_1: customers.address_1,
      customer_address_2: customers.address_2,
      customer_street: customers.street,
      customer_city: customers.city,
    })
    .from(materialIssues)
    .innerJoin(vehicles, eq(materialIssues.vehicle_id, vehicles.id))
    .leftJoin(customers, eq(vehicles.customer_id, customers.id))
    .where(
      and(
        eq(materialIssues.vehicle_id, vehicleId),
        eq(materialIssues.issue_type, issueType),
        eq(materialIssues.financial_year, financialYear)
      )
    );

  if (!header) return null;

  const itemRows = await db
    .select({
      id: materialIssueItems.id,
      issue_id: materialIssueItems.issue_id,
      material_id: materialIssueItems.material_id,
      material_name: materials.name,
      material_no: materials.material_no,
      hsn_code: materialIssueItems.hsn_code,
      contractor_id: contractors.id,
      contractor_name: contractors.name,
      qty: materialIssueItems.qty,
      unit_id: materialIssueItems.unit_id,
      unit_name: units.unit_name,
      rate: materialIssueItems.rate,
      tax_percentage: materialIssueItems.tax_percentage,
      cgst_amount: materialIssueItems.cgst_amount,
      sgst_amount: materialIssueItems.sgst_amount,
      igst_amount: materialIssueItems.igst_amount,
      amount: materialIssueItems.amount,
      gst_type: materialIssueItems.gst_type,
      affects_inventory: materialIssueItems.affects_inventory,
      stage_id: materialIssueItems.stage_id,
      stage_name: stages.stage_name,
    })
    .from(materialIssueItems)
    .innerJoin(materials, eq(materialIssueItems.material_id, materials.id))
    .leftJoin(contractors, eq(materialIssueItems.contractor_id, contractors.id))
    .leftJoin(units, eq(materialIssueItems.unit_id, units.id))
    .leftJoin(stages, eq(materialIssueItems.stage_id, stages.id))
    .where(eq(materialIssueItems.issue_id, header.id))
    .orderBy(asc(materialIssueItems.created_at));

  const items: MaterialIssueItemWithDetails[] = itemRows.map((r) => ({
    id: r.id,
    issue_id: r.issue_id,
    material_id: r.material_id,
    material_name: r.material_name,
    material_no: r.material_no,
    hsn_code: r.hsn_code ?? null,
    contractor_id: r.contractor_id ?? null,
    contractor_name: r.contractor_name ?? null,
    qty: r.qty,
    unit_id: r.unit_id ?? null,
    unit_name: r.unit_name ?? null,
    rate: r.rate,
    tax_percentage: r.tax_percentage,
    cgst_amount: r.cgst_amount,
    sgst_amount: r.sgst_amount,
    igst_amount: r.igst_amount,
    amount: r.amount,
    gst_type: r.gst_type ?? null,
    affects_inventory: r.affects_inventory,
    stage_id: r.stage_id ?? null,
    stage_name: r.stage_name ?? null,
  }));

  return {
    id: header.id,
    slip_number: header.slip_number,
    issue_date:
      header.issue_date instanceof Date
        ? header.issue_date.toISOString()
        : String(header.issue_date),
    financial_year: header.financial_year,
    status: header.status,
    issue_type: header.issue_type,
    stage_id: header.stage_id ?? null,
    margin_percentage: header.margin_percentage ?? "0",
    total_amount: header.total_amount,
    saved_stage_ids: header.saved_stage_ids ?? [],
    vehicle_id: header.vehicle_id,
    job_ref_no: header.job_ref_no,
    customer_id: header.customer_id ?? null,
    customer_name: header.customer_name ?? null,
    customer_gstin: header.customer_gstin ?? null,
    customer_state: header.customer_state ?? null,
    customer_address:
      [
        header.customer_address_1,
        header.customer_address_2,
        header.customer_street,
        header.customer_city,
      ]
        .filter(Boolean)
        .join(", ") || null,
    items,
  };
}

// ---------------------------------------------------------------------------
// Read — issue dates per vehicle for the current FY (used for dropdown labels)
// ---------------------------------------------------------------------------

export async function getVehicleIssueDatesForFY(
  fy: string,
  issueType: "OLD" | "NEW"
): Promise<{ vehicleId: string; issue_date: string }[]> {
  const rows = await db
    .select({
      vehicleId: materialIssues.vehicle_id,
      issue_date: materialIssues.issue_date,
    })
    .from(materialIssues)
    .where(
      and(
        eq(materialIssues.financial_year, fy),
        eq(materialIssues.issue_type, issueType)
      )
    );
  return rows.map((r) => ({
    vehicleId: r.vehicleId,
    issue_date: typeof r.issue_date === "string"
      ? r.issue_date
      : (r.issue_date as Date).toISOString().split("T")[0],
  }));
}

// Write — save vehicle material issue (create+issue OR reverse+reapply)
// ---------------------------------------------------------------------------

export async function saveVehicleMaterialIssue(
  vehicleId: string,
  issueType: "OLD" | "NEW",
  data: IssueHeaderInput
): Promise<{ id: string; isNew: boolean }> {
  if (!vehicleId) throw new Error("Vehicle is required.");
  validateIssueItems(data.items);

  const issueDate = new Date(data.issue_date);
  const fyRange = fyDateRange(data.financial_year);
  if (issueDate < fyRange.start || issueDate > fyRange.end)
    throw new Error("Issue date must fall within the active financial year.");

  const [existing] = await db
    .select({ id: materialIssues.id, status: materialIssues.status })
    .from(materialIssues)
    .where(
      and(
        eq(materialIssues.vehicle_id, vehicleId),
        eq(materialIssues.issue_type, issueType),
        eq(materialIssues.financial_year, data.financial_year)
      )
    );

  if (!existing) {
    // First save: create record and issue immediately (atomic)
    const newId = await db.transaction(async (tx) => {
      const [issue] = await tx
        .insert(materialIssues)
        .values({
          slip_number: null,
          issue_date: issueDate,
          vehicle_id: vehicleId,
          issue_type: issueType,
          stage_id: null,
          margin_percentage: data.margin_percentage || "0",
          total_amount: data.total_amount || "0",
          financial_year: data.financial_year,
          status: "Draft",
        })
        .returning({ id: materialIssues.id });

      await tx
        .insert(materialIssueItems)
        .values(data.items.map((item) => itemValues(issue.id, item)));

      // Issue: deduct stock — batch to reduce N+1 queries
      const vmiInventoryItems = data.items.filter((i) => i.affects_inventory);
      if (vmiInventoryItems.length > 0) {
        const vmiMatStocks = await tx
          .select({ id: materials.id, name: materials.name, current_stock: materials.current_stock })
          .from(materials)
          .where(inArray(materials.id, vmiInventoryItems.map((i) => i.material_id)));
        const vmiStockMap = new Map(vmiMatStocks.map((m) => [m.id, { name: m.name, stock: parseFloat(m.current_stock) }]));

        const qtyByMaterial = new Map<string, number>();
        for (const item of vmiInventoryItems) {
          qtyByMaterial.set(item.material_id, (qtyByMaterial.get(item.material_id) ?? 0) + parseFloat(item.qty || "0"));
        }
        for (const [materialId, requestedQty] of Array.from(qtyByMaterial.entries())) {
          const mat = vmiStockMap.get(materialId);
          if (!mat) throw new Error("Material not found.");
          if (mat.stock < requestedQty)
            throw new Error(`Insufficient stock for "${mat.name}": available ${mat.stock.toFixed(2)}, requested ${requestedQty.toFixed(2)}.`);
        }

        await tx.update(materialIssues).set({ status: "Issued" }).where(eq(materialIssues.id, issue.id));

        for (const item of vmiInventoryItems) {
          const newStock = vmiStockMap.get(item.material_id)!.stock - parseFloat(item.qty);
          await tx.update(materials).set({ current_stock: newStock.toString() }).where(eq(materials.id, item.material_id));
        }

        await tx.insert(stockLedger).values(
          vmiInventoryItems.map((item) => ({
            material_id: item.material_id,
            transaction_type: "ISSUE",
            reference_id: issue.id,
            reference_type: "material_issue",
            qty_change: (-parseFloat(item.qty)).toString(),
            stock_after: (vmiStockMap.get(item.material_id)!.stock - parseFloat(item.qty)).toFixed(4),
          }))
        );
      } else {
        await tx.update(materialIssues).set({ status: "Issued" }).where(eq(materialIssues.id, issue.id));
      }

      return issue.id;
    });

    revalidateTag(CACHE_TAGS.materials);
    revalidateTag(CACHE_TAGS.dashboard);
    return { id: newId, isNew: true };
  }

  // Existing record: reverse + reapply (delegates to existing atomic helper)
  await updateIssuedMaterialIssue(existing.id, { ...data, vehicle_id: vehicleId });
  return { id: existing.id, isNew: false };
}

// ---------------------------------------------------------------------------
// Write — save one stage as draft (no stock deduction)
// ---------------------------------------------------------------------------

export async function saveVehicleStage(
  vehicleId: string,
  stageId: string,
  items: IssueItemInput[],
  issueDate: string,
  marginPct: string,
  financialYear: string
): Promise<{ id: string }> {
  if (!vehicleId) throw new Error("Vehicle is required.");
  if (!stageId) throw new Error("Stage is required.");
  if (items.length === 0) throw new Error("At least one material is required.");

  const date = new Date(issueDate);
  const fyRange = fyDateRange(financialYear);
  if (date < fyRange.start || date > fyRange.end)
    throw new Error("Issue date must fall within the active financial year.");

  const [existing] = await db
    .select({ id: materialIssues.id, status: materialIssues.status })
    .from(materialIssues)
    .where(
      and(
        eq(materialIssues.vehicle_id, vehicleId),
        eq(materialIssues.issue_type, "NEW"),
        eq(materialIssues.financial_year, financialYear)
      )
    );

  if (existing && existing.status === "Issued")
    throw new Error("Record already issued — use Save & Reapply.");

  const issueId = await db.transaction(async (tx) => {
    let id: string;

    if (!existing) {
      const [issue] = await tx
        .insert(materialIssues)
        .values({
          slip_number: null,
          issue_date: date,
          vehicle_id: vehicleId,
          issue_type: "NEW",
          stage_id: null,
          margin_percentage: marginPct || "0",
          total_amount: "0",
          financial_year: financialYear,
          status: "Draft",
          saved_stage_ids: [stageId],
        })
        .returning({ id: materialIssues.id });
      id = issue.id;
    } else {
      id = existing.id;
      // Remove existing items for this stage (re-save)
      await tx
        .delete(materialIssueItems)
        .where(
          and(
            eq(materialIssueItems.issue_id, id),
            eq(materialIssueItems.stage_id, stageId)
          )
        );
      // Append stageId to saved_stage_ids (array_remove first ensures idempotency)
      await tx.update(materialIssues).set({
        saved_stage_ids: sql`array_append(array_remove(${materialIssues.saved_stage_ids}, ${stageId}::text), ${stageId}::text)`,
        issue_date: date,
        margin_percentage: marginPct || "0",
      }).where(eq(materialIssues.id, id));
    }

    await tx
      .insert(materialIssueItems)
      .values(items.map((item) => itemValues(id, item)));

    // Recalculate total_amount across all items for this issue
    const [totals] = await tx
      .select({ total: sql<string>`COALESCE(SUM(amount::numeric), 0)::text` })
      .from(materialIssueItems)
      .where(eq(materialIssueItems.issue_id, id));

    await tx
      .update(materialIssues)
      .set({ total_amount: totals?.total ?? "0" })
      .where(eq(materialIssues.id, id));

    return id;
  });

  revalidateTag(CACHE_TAGS.dashboard);
  return { id: issueId };
}

// ---------------------------------------------------------------------------
// Write — finalize draft: deduct stock (Issue All)
// ---------------------------------------------------------------------------

export async function issueDraftRecord(
  vehicleId: string,
  financialYear: string,
  issueDate: string
): Promise<{ id: string }> {
  if (!vehicleId) throw new Error("Vehicle is required.");

  const date = new Date(issueDate);
  const fyRange = fyDateRange(financialYear);
  if (date < fyRange.start || date > fyRange.end)
    throw new Error("Issue date must fall within the active financial year.");

  const [record] = await db
    .select({ id: materialIssues.id, status: materialIssues.status })
    .from(materialIssues)
    .where(
      and(
        eq(materialIssues.vehicle_id, vehicleId),
        eq(materialIssues.issue_type, "NEW"),
        eq(materialIssues.financial_year, financialYear)
      )
    );

  if (!record) throw new Error("No draft record found.");
  if (record.status !== "Draft") throw new Error("Record is not in Draft status.");

  const issueItems = await db
    .select({
      material_id: materialIssueItems.material_id,
      qty: materialIssueItems.qty,
      affects_inventory: materialIssueItems.affects_inventory,
    })
    .from(materialIssueItems)
    .where(eq(materialIssueItems.issue_id, record.id));

  await db.transaction(async (tx) => {
    const inventoryItems = issueItems.filter((i) => i.affects_inventory);

    if (inventoryItems.length > 0) {
      const matStocks = await tx
        .select({ id: materials.id, name: materials.name, current_stock: materials.current_stock })
        .from(materials)
        .where(inArray(materials.id, inventoryItems.map((i) => i.material_id)));
      const stockMap = new Map(matStocks.map((m) => [m.id, { name: m.name, stock: parseFloat(m.current_stock) }]));

      const qtyByMaterial = new Map<string, number>();
      for (const item of inventoryItems) {
        qtyByMaterial.set(item.material_id, (qtyByMaterial.get(item.material_id) ?? 0) + parseFloat(item.qty || "0"));
      }
      for (const [materialId, requestedQty] of Array.from(qtyByMaterial.entries())) {
        const mat = stockMap.get(materialId);
        if (!mat) throw new Error("Material not found.");
        if (mat.stock < requestedQty)
          throw new Error(`Insufficient stock for "${mat.name}": available ${mat.stock.toFixed(2)}, requested ${requestedQty.toFixed(2)}.`);
      }

      for (const item of inventoryItems) {
        const newStock = stockMap.get(item.material_id)!.stock - parseFloat(item.qty);
        await tx.update(materials).set({ current_stock: newStock.toString() }).where(eq(materials.id, item.material_id));
      }

      await tx.insert(stockLedger).values(
        inventoryItems.map((item) => ({
          material_id: item.material_id,
          transaction_type: "ISSUE",
          reference_id: record.id,
          reference_type: "material_issue",
          qty_change: (-parseFloat(item.qty)).toString(),
          stock_after: (stockMap.get(item.material_id)!.stock - parseFloat(item.qty)).toFixed(4),
        }))
      );
    }

    await tx
      .update(materialIssues)
      .set({ status: "Issued", issue_date: date })
      .where(eq(materialIssues.id, record.id));
  });

  revalidateTag(CACHE_TAGS.materials);
  revalidateTag(CACHE_TAGS.dashboard);
  return { id: record.id };
}

// ---------------------------------------------------------------------------
// Write — delete one saved stage from a draft record
// ---------------------------------------------------------------------------

export async function deleteSavedStage(
  issueId: string,
  stageId: string
): Promise<void> {
  const [record] = await db
    .select({ id: materialIssues.id, status: materialIssues.status })
    .from(materialIssues)
    .where(eq(materialIssues.id, issueId));

  if (!record) throw new Error("Record not found.");
  if (record.status !== "Draft") throw new Error("Can only delete stages from a Draft record.");

  await db.transaction(async (tx) => {
    await tx
      .delete(materialIssueItems)
      .where(
        and(
          eq(materialIssueItems.issue_id, issueId),
          eq(materialIssueItems.stage_id, stageId)
        )
      );

    const [updatedRecord] = await tx.update(materialIssues).set({
      saved_stage_ids: sql`array_remove(${materialIssues.saved_stage_ids}, ${stageId}::text)`,
    }).where(eq(materialIssues.id, issueId)).returning({ saved_stage_ids: materialIssues.saved_stage_ids });

    // Recalculate total_amount
    const [totals] = await tx
      .select({ total: sql<string>`COALESCE(SUM(amount::numeric), 0)::text` })
      .from(materialIssueItems)
      .where(eq(materialIssueItems.issue_id, issueId));

    // If no stages remain, delete the entire record; otherwise update total
    if (!updatedRecord || updatedRecord.saved_stage_ids.length === 0) {
      await tx.delete(materialIssues).where(eq(materialIssues.id, issueId));
    } else {
      await tx
        .update(materialIssues)
        .set({ total_amount: totals?.total ?? "0" })
        .where(eq(materialIssues.id, issueId));
    }
  });

  revalidateTag(CACHE_TAGS.dashboard);
}

// ---------------------------------------------------------------------------
// Write — clone vehicle's material issue to a new vehicle
// ---------------------------------------------------------------------------

export async function cloneVehicleMaterialIssue(
  sourceVehicleId: string,
  issueType: "OLD" | "NEW",
  financialYear: string,
  newVehicleId: string
): Promise<{ newIssueId: string }> {
  // Fetch source issue + items
  const [srcIssue] = await db
    .select({
      id: materialIssues.id,
      margin_percentage: materialIssues.margin_percentage,
    })
    .from(materialIssues)
    .where(
      and(
        eq(materialIssues.vehicle_id, sourceVehicleId),
        eq(materialIssues.issue_type, issueType),
        eq(materialIssues.financial_year, financialYear)
      )
    );
  if (!srcIssue) throw new Error("Source vehicle has no material issue record for this FY.");

  const srcItems = await db
    .select({
      material_id: materialIssueItems.material_id,
      contractor_id: materialIssueItems.contractor_id,
      hsn_code: materialIssueItems.hsn_code,
      qty: materialIssueItems.qty,
      unit_id: materialIssueItems.unit_id,
      rate: materialIssueItems.rate,
      tax_percentage: materialIssueItems.tax_percentage,
      cgst_amount: materialIssueItems.cgst_amount,
      sgst_amount: materialIssueItems.sgst_amount,
      igst_amount: materialIssueItems.igst_amount,
      amount: materialIssueItems.amount,
      gst_type: materialIssueItems.gst_type,
      affects_inventory: materialIssueItems.affects_inventory,
      stage_id: materialIssueItems.stage_id,
    })
    .from(materialIssueItems)
    .where(eq(materialIssueItems.issue_id, srcIssue.id));

  // Determine new vehicle's GST type
  const [newVehicleRow] = await db
    .select({ customer_gstin: customers.gstin, customer_state: customers.state })
    .from(vehicles)
    .leftJoin(customers, eq(vehicles.customer_id, customers.id))
    .where(eq(vehicles.id, newVehicleId));
  if (!newVehicleRow) throw new Error("New vehicle not found.");

  const newGstType = determineGstType(newVehicleRow.customer_gstin, newVehicleRow.customer_state);

  // Recalculate tax amounts for each item if GST type differs from source
  const recalcItem = (item: typeof srcItems[0]) => {
    const srcGst = item.gst_type ?? "CGST_SGST";
    if (srcGst === newGstType) return item;
    const base = parseFloat(item.qty) * parseFloat(item.rate);
    const taxAmt = base * (parseFloat(item.tax_percentage) / 100);
    if (newGstType === "CGST_SGST") {
      return {
        ...item,
        gst_type: "CGST_SGST",
        cgst_amount: (taxAmt / 2).toFixed(2),
        sgst_amount: (taxAmt / 2).toFixed(2),
        igst_amount: "0.00",
        amount: base.toFixed(2),
      };
    }
    return {
      ...item,
      gst_type: "IGST",
      cgst_amount: "0.00",
      sgst_amount: "0.00",
      igst_amount: taxAmt.toFixed(2),
      amount: base.toFixed(2),
    };
  };

  const cloneDate = clampDateToFY(financialYear);
  const recalcItems = srcItems.map(recalcItem);
  const totalAmount = recalcItems.reduce((sum, i) =>
    sum + parseFloat(i.amount)
        + parseFloat(i.cgst_amount || "0")
        + parseFloat(i.sgst_amount || "0")
        + parseFloat(i.igst_amount || "0"),
  0).toFixed(2);

  let newIssueId = "";
  await db.transaction(async (tx) => {
    const [issue] = await tx
      .insert(materialIssues)
      .values({
        slip_number: null,
        issue_date: cloneDate,
        vehicle_id: newVehicleId,
        issue_type: issueType,
        stage_id: null,
        margin_percentage: srcIssue.margin_percentage ?? "0",
        total_amount: totalAmount,
        financial_year: financialYear,
        status: "Draft",
      })
      .returning({ id: materialIssues.id });

    if (recalcItems.length > 0) {
      await tx
        .insert(materialIssueItems)
        .values(recalcItems.map((item) => ({ ...item, issue_id: issue.id })));
    }

    // Stock check
    const qtyByMaterial = new Map<string, number>();
    for (const item of recalcItems) {
      if (!item.affects_inventory) continue;
      qtyByMaterial.set(
        item.material_id,
        (qtyByMaterial.get(item.material_id) ?? 0) + parseFloat(item.qty || "0")
      );
    }
    // Batch stock check — one SELECT for all materials at once
    const inventoryMaterialIds = Array.from(qtyByMaterial.keys());
    const stockCheckRows = await tx
      .select({ id: materials.id, name: materials.name, current_stock: materials.current_stock })
      .from(materials)
      .where(inArray(materials.id, inventoryMaterialIds));
    for (const mat of stockCheckRows) {
      const requestedQty = qtyByMaterial.get(mat.id)!;
      if (parseFloat(mat.current_stock) < requestedQty)
        throw new Error(
          `Insufficient stock for "${mat.name}": available ${parseFloat(mat.current_stock).toFixed(2)}, requested ${requestedQty.toFixed(2)}.`
        );
    }

    await tx.update(materialIssues).set({ status: "Issued" }).where(eq(materialIssues.id, issue.id));

    const inventoryItems = recalcItems.filter(item => item.affects_inventory);
    if (inventoryItems.length > 0) {
      const currentStockMap = new Map(stockCheckRows.map(m => [m.id, parseFloat(m.current_stock)]));

      // Batch UPDATE materials stock — one statement instead of N round-trips
      await tx.execute(sql`
        UPDATE materials
        SET current_stock = v.stock::numeric
        FROM (VALUES ${sql.join(
          inventoryItems.map(item => sql`(${item.material_id}::uuid, ${(currentStockMap.get(item.material_id)! - parseFloat(item.qty)).toFixed(4)}::numeric)`),
          sql`, `
        )}) AS v(id, stock)
        WHERE materials.id = v.id
      `);

      // Bulk INSERT stock ledger
      await tx.insert(stockLedger).values(
        inventoryItems.map(item => ({
          material_id: item.material_id,
          transaction_type: "ISSUE" as const,
          reference_id: issue.id,
          reference_type: "material_issue",
          qty_change: (-parseFloat(item.qty)).toString(),
          stock_after: (currentStockMap.get(item.material_id)! - parseFloat(item.qty)).toFixed(4),
        }))
      );
    }

    newIssueId = issue.id;
  });

  revalidateTag(CACHE_TAGS.materials);
  revalidateTag(CACHE_TAGS.dashboard);
  return { newIssueId };
}

/** @deprecated Use saveVehicleMaterialIssue instead */
export async function cloneNewMaterialIssue(
  slipId: string
): Promise<{ newSlipId: string; newSlipNumber: number }> {
  const [src] = await db
    .select({
      status: materialIssues.status,
      issue_type: materialIssues.issue_type,
      vehicle_id: materialIssues.vehicle_id,
      financial_year: materialIssues.financial_year,
      margin_percentage: materialIssues.margin_percentage,
      stage_id: materialIssues.stage_id,
    })
    .from(materialIssues)
    .where(eq(materialIssues.id, slipId));

  if (!src) throw new Error("Slip not found");
  if (src.status === "Cancelled") throw new Error("Cannot clone a cancelled slip");
  if (src.issue_type !== "NEW") throw new Error("Use clone on the Old VMI screen for OLD type slips");

  const cloneDate = clampDateToFY(src.financial_year);
  let newSlipId = "";
  let newSlipNumber = 0;

  await db.transaction(async (tx) => {
    const lockKey = `mi_slip:${src.financial_year}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`);

    const [row] = await tx
      .select({ maxNum: max(materialIssues.slip_number) })
      .from(materialIssues)
      .where(eq(materialIssues.financial_year, src.financial_year));
    const slipNum = (row?.maxNum ?? 0) + 1;

    const [{ newId }] = await tx
      .insert(materialIssues)
      .values({
        slip_number: slipNum,
        status: "Draft",
        issue_type: "NEW",
        stage_id: null,
        vehicle_id: src.vehicle_id,
        financial_year: src.financial_year,
        issue_date: cloneDate,
        margin_percentage: src.margin_percentage ?? "0",
        total_amount: "0",
      })
      .returning({ newId: materialIssues.id });

    const srcItems = await tx
      .select({
        material_id: materialIssueItems.material_id,
        contractor_id: materialIssueItems.contractor_id,
        hsn_code: materialIssueItems.hsn_code,
        qty: materialIssueItems.qty,
        unit_id: materialIssueItems.unit_id,
        rate: materialIssueItems.rate,
        tax_percentage: materialIssueItems.tax_percentage,
        cgst_amount: materialIssueItems.cgst_amount,
        sgst_amount: materialIssueItems.sgst_amount,
        igst_amount: materialIssueItems.igst_amount,
        amount: materialIssueItems.amount,
        gst_type: materialIssueItems.gst_type,
        affects_inventory: materialIssueItems.affects_inventory,
        stage_id: materialIssueItems.stage_id,
      })
      .from(materialIssueItems)
      .where(eq(materialIssueItems.issue_id, slipId));

    if (srcItems.length > 0) {
      await tx
        .insert(materialIssueItems)
        .values(srcItems.map((item) => ({ ...item, issue_id: newId })));
    }

    newSlipId = newId;
    newSlipNumber = slipNum;
  });

  return { newSlipId, newSlipNumber };
}

// ---------------------------------------------------------------------------
// Update Margin — syncs margin_percentage and item rates across ALL issued NEW
// VMI records for a vehicle+FY. No stock ledger changes (qty unchanged).
// ---------------------------------------------------------------------------

export async function updateVehicleMargin(
  vehicleId: string,
  fy: string,
  newMarginStr: string
): Promise<void> {
  const newMargin = parseFloat(newMarginStr) || 0;

  const issueRecords = await db
    .select({ id: materialIssues.id, margin_percentage: materialIssues.margin_percentage })
    .from(materialIssues)
    .where(
      and(
        eq(materialIssues.vehicle_id, vehicleId),
        eq(materialIssues.financial_year, fy),
        eq(materialIssues.issue_type, "NEW"),
        eq(materialIssues.status, "Issued"),
      )
    );

  if (issueRecords.length === 0) return;

  const oldMargin = parseFloat(issueRecords[0].margin_percentage ?? "0");
  const oldFactor = 1 + oldMargin / 100;
  const newFactor = 1 + newMargin / 100;
  const factor = newFactor / oldFactor;

  if (Math.abs(factor - 1) < 0.0001) return;

  await db.transaction(async (tx) => {
    // Batch fetch all items for all issues in one query
    const issueIds = issueRecords.map(i => i.id);
    const allItems = await tx
      .select({
        id: materialIssueItems.id,
        issue_id: materialIssueItems.issue_id,
        qty: materialIssueItems.qty,
        rate: materialIssueItems.rate,
        tax_percentage: materialIssueItems.tax_percentage,
        gst_type: materialIssueItems.gst_type,
      })
      .from(materialIssueItems)
      .where(inArray(materialIssueItems.issue_id, issueIds));

    // Calculate new values for every item
    const itemUpdates: Array<{ id: string; rate: string; amount: string; cgst: string; sgst: string; igst: string }> = [];
    const issueTotals = new Map<string, number>();

    for (const item of allItems) {
      const qty = parseFloat(item.qty) || 0;
      const oldRate = parseFloat(item.rate) || 0;
      const taxPct = parseFloat(item.tax_percentage ?? "0") || 0;
      const gstType = item.gst_type ?? "CGST_SGST";

      const newRate = oldRate * factor;
      const newAmount = qty * newRate;
      const taxAmt = newAmount * (taxPct / 100);
      const cgst = gstType === "CGST_SGST" ? taxAmt / 2 : 0;
      const sgst = gstType === "CGST_SGST" ? taxAmt / 2 : 0;
      const igst = gstType === "IGST" ? taxAmt : 0;

      itemUpdates.push({
        id: item.id,
        rate: newRate.toFixed(4),
        amount: newAmount.toFixed(2),
        cgst: cgst.toFixed(2),
        sgst: sgst.toFixed(2),
        igst: igst.toFixed(2),
      });
      issueTotals.set(item.issue_id, (issueTotals.get(item.issue_id) ?? 0) + newAmount + cgst + sgst + igst);
    }

    // Batch UPDATE all items in one statement
    if (itemUpdates.length > 0) {
      await tx.execute(sql`
        UPDATE material_issue_items
        SET rate         = v.rate,
            amount       = v.amount,
            cgst_amount  = v.cgst,
            sgst_amount  = v.sgst,
            igst_amount  = v.igst
        FROM (VALUES ${sql.join(
          itemUpdates.map(u => sql`(${u.id}::uuid, ${u.rate}::numeric, ${u.amount}::numeric, ${u.cgst}::numeric, ${u.sgst}::numeric, ${u.igst}::numeric)`),
          sql`, `
        )}) AS v(id, rate, amount, cgst, sgst, igst)
        WHERE material_issue_items.id = v.id
      `);
    }

    // Batch UPDATE all issue totals in one statement
    const issueTotalUpdates = issueRecords.map(issue => ({
      id: issue.id,
      total: (issueTotals.get(issue.id) ?? 0).toFixed(2),
    }));
    await tx.execute(sql`
      UPDATE material_issues
      SET margin_percentage = ${newMarginStr},
          total_amount      = v.total
      FROM (VALUES ${sql.join(
        issueTotalUpdates.map(u => sql`(${u.id}::uuid, ${u.total}::numeric)`),
        sql`, `
      )}) AS v(id, total)
      WHERE material_issues.id = v.id
    `);
  });

  revalidateTag(CACHE_TAGS.dashboard);
  revalidateTag(CACHE_TAGS.materials);
}
