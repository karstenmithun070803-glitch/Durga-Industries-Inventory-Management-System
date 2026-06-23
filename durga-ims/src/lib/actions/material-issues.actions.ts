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
} from "@/lib/db/schema";
import { eq, and, sql, desc, max } from "drizzle-orm";
import { revalidatePath, unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache";
import { fyDateRange } from "@/lib/fy";
import type { MaterialIssueWithDetails, MaterialIssueItemWithDetails, MaterialIssueRow } from "@/types";

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

  // Duplicate check: material_id|contractor_id|normalizedRate
  const seen = new Set<string>();
  for (const item of items) {
    const rate = parseFloat(item.rate || "0").toFixed(2);
    const key = `${item.material_id}|${item.contractor_id ?? ""}|${rate}`;
    if (seen.has(key))
      throw new Error(
        "Duplicate entry detected: same material, same contractor, and same rate already exists. Combine into one row or adjust the rate."
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
        vehicle_name: vehicles.vehicle_name,
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
    return db
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
        min_level: materials.min_level,
      })
      .from(materials)
      .leftJoin(taxRates, eq(materials.tax_rate_id, taxRates.id))
      .leftJoin(pu, eq(materials.purchase_unit_id, pu.id))
      .where(eq(materials.is_active, true))
      .orderBy(materials.material_no);
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
): Promise<{ id: string; slipNumber: number; vehicleId: string; vehicleName: string | null; date: string; status: string }[]> {
  const rows = await db
    .select({
      id: materialIssues.id,
      slip_number: materialIssues.slip_number,
      vehicle_id: materialIssues.vehicle_id,
      vehicle_name: vehicles.vehicle_name,
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
    vehicleName: r.vehicle_name,
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

export async function getMaterialIssues(
  financialYear: string,
  issueType: "OLD" | "NEW"
): Promise<MaterialIssueRow[]> {
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
      vehicle_name: v.vehicle_name,
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
    .where(
      and(
        eq(materialIssues.financial_year, financialYear),
        eq(materialIssues.issue_type, issueType)
      )
    )
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
      vehicle_id: materialIssues.vehicle_id,
      vehicle_name: vehicles.vehicle_name,
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
    })
    .from(materialIssueItems)
    .innerJoin(materials, eq(materialIssueItems.material_id, materials.id))
    .leftJoin(contractors, eq(materialIssueItems.contractor_id, contractors.id))
    .leftJoin(units, eq(materialIssueItems.unit_id, units.id))
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
    vehicle_id: header.vehicle_id,
    vehicle_name: header.vehicle_name,
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

  revalidatePath("/transactions/material-issues");
  revalidatePath("/transactions/material-issues/new");
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

  revalidatePath("/transactions/material-issues");
  revalidatePath("/transactions/material-issues/new");
}

// ---------------------------------------------------------------------------
// Write — issue (Draft → Issued, stock deduction)
// ---------------------------------------------------------------------------

export async function issueMaterialIssue(id: string): Promise<number> {
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

  await db.transaction(async (tx) => {
    const qtyByMaterial = new Map<string, number>();
    for (const item of items) {
      if (!item.affects_inventory) continue;
      qtyByMaterial.set(
        item.material_id,
        (qtyByMaterial.get(item.material_id) ?? 0) + parseFloat(item.qty || "0")
      );
    }
    for (const [materialId, requestedQty] of Array.from(qtyByMaterial.entries())) {
      const [mat] = await tx
        .select({ name: materials.name, current_stock: materials.current_stock })
        .from(materials)
        .where(eq(materials.id, materialId));
      if (!mat) throw new Error("Material not found.");
      if (parseFloat(mat.current_stock) < requestedQty)
        throw new Error(
          `Insufficient stock for "${mat.name}": available ${parseFloat(mat.current_stock).toFixed(2)}, requested ${requestedQty.toFixed(2)}.`
        );
    }

    await tx.update(materialIssues).set({ status: "Issued" }).where(eq(materialIssues.id, id));

    for (const item of items) {
      if (!item.affects_inventory) continue;
      const [mat] = await tx
        .select({ current_stock: materials.current_stock })
        .from(materials)
        .where(eq(materials.id, item.material_id));

      const newStock = (parseFloat(mat.current_stock) - parseFloat(item.qty)).toString();
      await tx.update(materials).set({ current_stock: newStock }).where(eq(materials.id, item.material_id));
      await tx.insert(stockLedger).values({
        material_id: item.material_id,
        transaction_type: "ISSUE",
        reference_id: id,
        reference_type: "material_issue",
        qty_change: (-parseFloat(item.qty)).toString(),
        stock_after: newStock,
      });
    }
  });

  revalidatePath("/transactions/material-issues");
  revalidatePath("/transactions/material-issues/new");
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

    for (const item of oldItems) {
      if (!item.affects_inventory) continue;
      const [mat] = await tx
        .select({ current_stock: materials.current_stock })
        .from(materials)
        .where(eq(materials.id, item.material_id));

      const reversedStock = (parseFloat(mat.current_stock) + parseFloat(item.qty)).toString();
      await tx.update(materials).set({ current_stock: reversedStock }).where(eq(materials.id, item.material_id));
      await tx.insert(stockLedger).values({
        material_id: item.material_id,
        transaction_type: "REVERSAL",
        reference_id: id,
        reference_type: "material_issue",
        qty_change: item.qty,
        stock_after: reversedStock,
      });
    }

    await tx.delete(materialIssueItems).where(eq(materialIssueItems.issue_id, id));
    if (data.items.length > 0) {
      await tx.insert(materialIssueItems).values(data.items.map((item) => itemValues(id, item)));
    }

    const qtyByMaterial = new Map<string, number>();
    for (const item of data.items) {
      if (!item.affects_inventory) continue;
      qtyByMaterial.set(
        item.material_id,
        (qtyByMaterial.get(item.material_id) ?? 0) + parseFloat(item.qty || "0")
      );
    }
    for (const [materialId, requestedQty] of Array.from(qtyByMaterial.entries())) {
      const [mat] = await tx
        .select({ name: materials.name, current_stock: materials.current_stock })
        .from(materials)
        .where(eq(materials.id, materialId));
      if (!mat) throw new Error("Material not found.");
      if (parseFloat(mat.current_stock) < requestedQty) {
        throw new Error(
          `Insufficient stock for "${mat.name}": available ${parseFloat(mat.current_stock).toFixed(2)}, requested ${requestedQty.toFixed(2)}.`
        );
      }
    }

    for (const item of data.items) {
      if (!item.affects_inventory) continue;
      const [mat] = await tx
        .select({ current_stock: materials.current_stock })
        .from(materials)
        .where(eq(materials.id, item.material_id));

      const newStock = (parseFloat(mat.current_stock) - parseFloat(item.qty)).toString();
      await tx.update(materials).set({ current_stock: newStock }).where(eq(materials.id, item.material_id));
      await tx.insert(stockLedger).values({
        material_id: item.material_id,
        transaction_type: "ISSUE",
        reference_id: id,
        reference_type: "material_issue",
        qty_change: (-parseFloat(item.qty)).toString(),
        stock_after: newStock,
      });
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

  revalidatePath("/transactions/material-issues");
  revalidatePath("/transactions/material-issues/new");
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
      for (const item of items) {
        if (!item.affects_inventory) continue;
        const [mat] = await tx
          .select({ current_stock: materials.current_stock })
          .from(materials)
          .where(eq(materials.id, item.material_id));

        const restoredStock = (parseFloat(mat.current_stock) + parseFloat(item.qty)).toString();
        await tx.update(materials).set({ current_stock: restoredStock }).where(eq(materials.id, item.material_id));
        await tx.insert(stockLedger).values({
          material_id: item.material_id,
          transaction_type: "REVERSAL",
          reference_id: id,
          reference_type: "material_issue",
          qty_change: item.qty,
          stock_after: restoredStock,
        });
      }
      await tx.delete(materialIssues).where(eq(materialIssues.id, id));
    });
  }

  revalidatePath("/transactions/material-issues");
  revalidatePath("/transactions/material-issues/new");
}

// ---------------------------------------------------------------------------
// Write — clone
// ---------------------------------------------------------------------------

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

  revalidatePath("/transactions/material-issues");
  revalidatePath("/transactions/material-issues/new");
  return { newSlipId, newSlipNumber };
}

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
        stage_id: src.stage_id,
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

  revalidatePath("/transactions/material-issues");
  revalidatePath("/transactions/material-issues/new");
  return { newSlipId, newSlipNumber };
}
