"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { purchaseOrders, purchaseOrderItems, materials, stockLedger } from "@/lib/db/schema";
import { suppliers, units } from "@/lib/db/schema";
import { eq, and, max, desc, inArray } from "drizzle-orm";
import type { PurchaseOrderWithDetails, PurchaseOrderItemWithDetails } from "@/types";

const REVALIDATE_PATH = "/transactions/purchase-orders";

// ---------------------------------------------------------------------------
// READ — list
// ---------------------------------------------------------------------------

export async function getPurchaseOrders(financialYear: string) {
  const rows = await db
    .select({
      id: purchaseOrders.id,
      po_number: purchaseOrders.po_number,
      po_date: purchaseOrders.po_date,
      supplier_id: purchaseOrders.supplier_id,
      supplier_name: suppliers.name,
      total_amount: purchaseOrders.total_amount,
      status: purchaseOrders.status,
      financial_year: purchaseOrders.financial_year,
      created_at: purchaseOrders.created_at,
      updated_at: purchaseOrders.updated_at,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(purchaseOrders.supplier_id, suppliers.id))
    .where(eq(purchaseOrders.financial_year, financialYear))
    .orderBy(desc(purchaseOrders.po_number));

  // Fetch item counts per PO
  const poIds = rows.map((r) => r.id);
  const itemCounts: Record<string, number> = {};
  if (poIds.length > 0) {
    const counts = await db
      .select({ po_id: purchaseOrderItems.po_id, id: purchaseOrderItems.id })
      .from(purchaseOrderItems)
      .where(inArray(purchaseOrderItems.po_id, poIds));
    for (const c of counts) {
      itemCounts[c.po_id] = (itemCounts[c.po_id] ?? 0) + 1;
    }
  }

  return rows.map((r) => ({ ...r, item_count: itemCounts[r.id] ?? 0 }));
}

// ---------------------------------------------------------------------------
// READ — single PO with full details
// ---------------------------------------------------------------------------

export async function getPurchaseOrderById(id: string): Promise<PurchaseOrderWithDetails | null> {
  const [po] = await db
    .select({
      id: purchaseOrders.id,
      po_number: purchaseOrders.po_number,
      po_date: purchaseOrders.po_date,
      supplier_id: purchaseOrders.supplier_id,
      supplier_name: suppliers.name,
      supplier_gstin: suppliers.gstin,
      supplier_state: suppliers.state,
      supplier_address: suppliers.address,
      total_amount: purchaseOrders.total_amount,
      status: purchaseOrders.status,
      financial_year: purchaseOrders.financial_year,
      created_at: purchaseOrders.created_at,
      updated_at: purchaseOrders.updated_at,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(purchaseOrders.supplier_id, suppliers.id))
    .where(eq(purchaseOrders.id, id));

  if (!po) return null;

  const itemRows = await db
    .select({
      id: purchaseOrderItems.id,
      po_id: purchaseOrderItems.po_id,
      material_id: purchaseOrderItems.material_id,
      material_name: materials.name,
      material_no: materials.material_no,
      hsn_code: materials.hsn_code,
      qty: purchaseOrderItems.qty,
      unit_id: purchaseOrderItems.unit_id,
      unit_name: units.unit_name,
      rate: purchaseOrderItems.rate,
      tax_percentage: purchaseOrderItems.tax_percentage,
      cgst_amount: purchaseOrderItems.cgst_amount,
      sgst_amount: purchaseOrderItems.sgst_amount,
      igst_amount: purchaseOrderItems.igst_amount,
      amount: purchaseOrderItems.amount,
    })
    .from(purchaseOrderItems)
    .leftJoin(materials, eq(purchaseOrderItems.material_id, materials.id))
    .leftJoin(units, eq(purchaseOrderItems.unit_id, units.id))
    .where(eq(purchaseOrderItems.po_id, id));

  const items: PurchaseOrderItemWithDetails[] = itemRows.map((r) => ({
    id: r.id,
    po_id: r.po_id,
    material_id: r.material_id,
    material_name: r.material_name ?? "",
    material_no: r.material_no ?? 0,
    hsn_code: r.hsn_code ?? null,
    qty: r.qty,
    unit_id: r.unit_id ?? null,
    unit_name: r.unit_name ?? null,
    rate: r.rate,
    tax_percentage: r.tax_percentage,
    cgst_amount: r.cgst_amount,
    sgst_amount: r.sgst_amount,
    igst_amount: r.igst_amount,
    amount: r.amount,
  }));

  return { ...po, items };
}

// ---------------------------------------------------------------------------
// READ — dropdown data (active only)
// ---------------------------------------------------------------------------

export async function getActiveSuppliers() {
  return db
    .select({
      id: suppliers.id,
      code_no: suppliers.code_no,
      name: suppliers.name,
      gstin: suppliers.gstin,
      state: suppliers.state,
      address: suppliers.address,
    })
    .from(suppliers)
    .where(eq(suppliers.is_active, true))
    .orderBy(suppliers.name);
}

export async function getActiveMaterials() {
  return db
    .select({
      id: materials.id,
      material_no: materials.material_no,
      name: materials.name,
      hsn_code: materials.hsn_code,
      tax_rate_id: materials.tax_rate_id,
      purchase_unit_id: materials.purchase_unit_id,
      current_stock: materials.current_stock,
    })
    .from(materials)
    .where(eq(materials.is_active, true))
    .orderBy(materials.name);
}

export async function getActiveUnits() {
  return db
    .select({ id: units.id, unit_code: units.unit_code, unit_name: units.unit_name })
    .from(units)
    .where(eq(units.is_active, true))
    .orderBy(units.unit_name);
}

// ---------------------------------------------------------------------------
// READ — last material rate (from Received POs only)
// ---------------------------------------------------------------------------

export async function getLastMaterialRate(materialId: string): Promise<string | null> {
  const [row] = await db
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

  return row?.rate ?? null;
}

// ---------------------------------------------------------------------------
// WRITE — helpers
// ---------------------------------------------------------------------------

async function getNextPoNumber(financialYear: string): Promise<number> {
  const [row] = await db
    .select({ maxNo: max(purchaseOrders.po_number) })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.financial_year, financialYear));
  return (row?.maxNo ?? 0) + 1;
}

interface LineItemInput {
  material_id: string;
  qty: string;
  unit_id: string;
  rate: string;
  tax_percentage: string;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  amount: string;
}

interface POHeaderInput {
  supplier_id: string;
  po_date: string;
  financial_year: string;
  total_amount: string;
  items: LineItemInput[];
}

// ---------------------------------------------------------------------------
// WRITE — create Draft PO
// ---------------------------------------------------------------------------

export async function createPurchaseOrder(data: POHeaderInput): Promise<string> {
  const poNumber = await getNextPoNumber(data.financial_year);

  const [po] = await db
    .insert(purchaseOrders)
    .values({
      po_number: poNumber,
      po_date: new Date(data.po_date),
      supplier_id: data.supplier_id,
      total_amount: data.total_amount,
      status: "Draft",
      financial_year: data.financial_year,
    })
    .returning({ id: purchaseOrders.id });

  if (data.items.length > 0) {
    await db.insert(purchaseOrderItems).values(
      data.items.map((item) => ({
        po_id: po.id,
        material_id: item.material_id,
        qty: item.qty,
        unit_id: item.unit_id || null,
        rate: item.rate,
        tax_percentage: item.tax_percentage,
        cgst_amount: item.cgst_amount,
        sgst_amount: item.sgst_amount,
        igst_amount: item.igst_amount,
        amount: item.amount,
      }))
    );
  }

  revalidatePath(REVALIDATE_PATH);
  return po.id;
}

// ---------------------------------------------------------------------------
// WRITE — update Draft PO (replace items)
// ---------------------------------------------------------------------------

export async function updatePurchaseOrder(id: string, data: Omit<POHeaderInput, "financial_year">): Promise<void> {
  await db
    .update(purchaseOrders)
    .set({
      supplier_id: data.supplier_id,
      po_date: new Date(data.po_date),
      total_amount: data.total_amount,
      updated_at: new Date(),
    })
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.status, "Draft")));

  await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.po_id, id));

  if (data.items.length > 0) {
    await db.insert(purchaseOrderItems).values(
      data.items.map((item) => ({
        po_id: id,
        material_id: item.material_id,
        qty: item.qty,
        unit_id: item.unit_id || null,
        rate: item.rate,
        tax_percentage: item.tax_percentage,
        cgst_amount: item.cgst_amount,
        sgst_amount: item.sgst_amount,
        igst_amount: item.igst_amount,
        amount: item.amount,
      }))
    );
  }

  revalidatePath(REVALIDATE_PATH);
}

// ---------------------------------------------------------------------------
// WRITE — mark PO as Received (atomic: update status + stock + ledger)
// ---------------------------------------------------------------------------

export async function receivePurchaseOrder(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [po] = await tx
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.status, "Draft")));

    if (!po) throw new Error("PO not found or already received");

    const items = await tx
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.po_id, id));

    if (items.length === 0) throw new Error("Cannot receive a PO with no items");

    await tx
      .update(purchaseOrders)
      .set({ status: "Received", updated_at: new Date() })
      .where(eq(purchaseOrders.id, id));

    for (const item of items) {
      const [mat] = await tx
        .select({ current_stock: materials.current_stock })
        .from(materials)
        .where(eq(materials.id, item.material_id));

      const newStock = (parseFloat(mat.current_stock) + parseFloat(item.qty)).toString();

      await tx
        .update(materials)
        .set({ current_stock: newStock, updated_at: new Date() })
        .where(eq(materials.id, item.material_id));

      await tx.insert(stockLedger).values({
        material_id: item.material_id,
        transaction_type: "PO_INWARD",
        reference_id: id,
        reference_type: "purchase_order",
        qty_change: item.qty,
        stock_after: newStock,
      });
    }
  });

  revalidatePath(REVALIDATE_PATH);
}

// ---------------------------------------------------------------------------
// WRITE — update Received PO (atomic: reverse + reapply stock)
// ---------------------------------------------------------------------------

export async function updateReceivedPurchaseOrder(id: string, data: Omit<POHeaderInput, "financial_year">): Promise<void> {
  await db.transaction(async (tx) => {
    const [po] = await tx
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.status, "Received")));

    if (!po) throw new Error("PO not found or not in Received status");

    const oldItems = await tx
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.po_id, id));

    // Reverse old stock
    for (const item of oldItems) {
      const [mat] = await tx
        .select({ current_stock: materials.current_stock })
        .from(materials)
        .where(eq(materials.id, item.material_id));

      const newStock = (parseFloat(mat.current_stock) - parseFloat(item.qty)).toString();

      await tx
        .update(materials)
        .set({ current_stock: newStock, updated_at: new Date() })
        .where(eq(materials.id, item.material_id));

      await tx.insert(stockLedger).values({
        material_id: item.material_id,
        transaction_type: "REVERSAL",
        reference_id: id,
        reference_type: "purchase_order",
        qty_change: (-parseFloat(item.qty)).toString(),
        stock_after: newStock,
      });
    }

    // Update header
    await tx
      .update(purchaseOrders)
      .set({
        supplier_id: data.supplier_id,
        po_date: new Date(data.po_date),
        total_amount: data.total_amount,
        updated_at: new Date(),
      })
      .where(eq(purchaseOrders.id, id));

    // Replace items
    await tx.delete(purchaseOrderItems).where(eq(purchaseOrderItems.po_id, id));

    if (data.items.length > 0) {
      await tx.insert(purchaseOrderItems).values(
        data.items.map((item) => ({
          po_id: id,
          material_id: item.material_id,
          qty: item.qty,
          unit_id: item.unit_id || null,
          rate: item.rate,
          tax_percentage: item.tax_percentage,
          cgst_amount: item.cgst_amount,
          sgst_amount: item.sgst_amount,
          igst_amount: item.igst_amount,
          amount: item.amount,
        }))
      );
    }

    // Apply new stock
    for (const item of data.items) {
      const [mat] = await tx
        .select({ current_stock: materials.current_stock })
        .from(materials)
        .where(eq(materials.id, item.material_id));

      const newStock = (parseFloat(mat.current_stock) + parseFloat(item.qty)).toString();

      await tx
        .update(materials)
        .set({ current_stock: newStock, updated_at: new Date() })
        .where(eq(materials.id, item.material_id));

      await tx.insert(stockLedger).values({
        material_id: item.material_id,
        transaction_type: "PO_INWARD",
        reference_id: id,
        reference_type: "purchase_order",
        qty_change: item.qty,
        stock_after: newStock,
      });
    }
  });

  revalidatePath(REVALIDATE_PATH);
}

// ---------------------------------------------------------------------------
// WRITE — delete PO (Draft: simple; Received: hard block + stock reversal)
// ---------------------------------------------------------------------------

export async function deletePurchaseOrder(id: string): Promise<void> {
  const [po] = await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, id));

  if (!po) throw new Error("PO not found");

  if (po.status === "Draft") {
    await db.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
    revalidatePath(REVALIDATE_PATH);
    return;
  }

  // Received PO — check if any items have been issued
  const items = await db
    .select({ material_id: purchaseOrderItems.material_id })
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.po_id, id));

  const materialIds = items.map((i) => i.material_id);

  if (materialIds.length > 0) {
    // Import here to avoid circular deps at module top
    const { materialIssueItems, materialIssues, vehicles } = await import("@/lib/db/schema");

    const issued = await db
      .select({
        material_id: materialIssueItems.material_id,
        job_ref_no: vehicles.job_ref_no,
        vehicle_name: vehicles.vehicle_name,
      })
      .from(materialIssueItems)
      .innerJoin(materialIssues, eq(materialIssueItems.issue_id, materialIssues.id))
      .innerJoin(vehicles, eq(materialIssues.vehicle_id, vehicles.id))
      .where(inArray(materialIssueItems.material_id, materialIds))
      .limit(1);

    if (issued.length > 0) {
      const job = issued[0];
      throw new Error(
        `Cannot delete. A material from this PO has already been issued to Job J${String(job.job_ref_no).padStart(5, "0")} (${job.vehicle_name}). Delete the material issue slip first.`
      );
    }
  }

  // Safe to delete — atomic stock reversal
  await db.transaction(async (tx) => {
    const poItems = await tx
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.po_id, id));

    for (const item of poItems) {
      const [mat] = await tx
        .select({ current_stock: materials.current_stock })
        .from(materials)
        .where(eq(materials.id, item.material_id));

      const newStock = (parseFloat(mat.current_stock) - parseFloat(item.qty)).toString();

      await tx
        .update(materials)
        .set({ current_stock: newStock, updated_at: new Date() })
        .where(eq(materials.id, item.material_id));

      await tx.insert(stockLedger).values({
        material_id: item.material_id,
        transaction_type: "REVERSAL",
        reference_id: id,
        reference_type: "purchase_order",
        qty_change: (-parseFloat(item.qty)).toString(),
        stock_after: newStock,
      });
    }

    await tx.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
  });

  revalidatePath(REVALIDATE_PATH);
}

