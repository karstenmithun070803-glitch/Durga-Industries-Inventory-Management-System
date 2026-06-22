"use server";

import { revalidatePath, unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache";
import { db } from "@/lib/db";
import { purchaseOrders, purchaseOrderItems, materials, stockLedger } from "@/lib/db/schema";
import { suppliers, units } from "@/lib/db/schema";
import { eq, and, max, desc, inArray } from "drizzle-orm";
import type { PurchaseOrderWithDetails, PurchaseOrderItemWithDetails } from "@/types";

// ---------------------------------------------------------------------------
// READ — lightweight dropdown list (one row per PO, for identifier combobox)
// ---------------------------------------------------------------------------

export async function getPOsForDropdown(financialYear: string) {
  return db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.po_number,
      supplierName: suppliers.name,
      date: purchaseOrders.po_date,
      status: purchaseOrders.status,
    })
    .from(purchaseOrders)
    .leftJoin(suppliers, eq(purchaseOrders.supplier_id, suppliers.id))
    .where(eq(purchaseOrders.financial_year, financialYear))
    .orderBy(desc(purchaseOrders.po_number));
}

// ---------------------------------------------------------------------------
// READ — list (two-query: headers first, then items; merged into flat rows)
// ---------------------------------------------------------------------------

async function fetchPOItemsForIds(poIds: string[]) {
  if (poIds.length === 0) return [];
  return db
    .select({
      po_id: purchaseOrderItems.po_id,
      item_id: purchaseOrderItems.id,
      material_id: purchaseOrderItems.material_id,
      material_name: materials.name,
      material_no: materials.material_no,
      supplier_id: purchaseOrderItems.supplier_id,
      supplier_name: suppliers.name,
      qty: purchaseOrderItems.qty,
      unit_name: units.unit_name,
      rate: purchaseOrderItems.rate,
      tax_percentage: purchaseOrderItems.tax_percentage,
      cgst_amount: purchaseOrderItems.cgst_amount,
      sgst_amount: purchaseOrderItems.sgst_amount,
      igst_amount: purchaseOrderItems.igst_amount,
      amount: purchaseOrderItems.amount,
      gst_type: purchaseOrderItems.gst_type,
    })
    .from(purchaseOrderItems)
    .innerJoin(materials, eq(purchaseOrderItems.material_id, materials.id))
    .leftJoin(suppliers, eq(purchaseOrderItems.supplier_id, suppliers.id))
    .leftJoin(units, eq(purchaseOrderItems.unit_id, units.id))
    .where(inArray(purchaseOrderItems.po_id, poIds));
}

export async function getPurchaseOrders(financialYear: string) {
  const headers = await db
    .select({
      id: purchaseOrders.id,
      po_number: purchaseOrders.po_number,
      po_date: purchaseOrders.po_date,
      status: purchaseOrders.status,
      financial_year: purchaseOrders.financial_year,
      affects_stock: purchaseOrders.affects_stock,
      supplier_bill_no: purchaseOrders.supplier_bill_no,
      supplier_bill_date: purchaseOrders.supplier_bill_date,
    })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.financial_year, financialYear))
    .orderBy(desc(purchaseOrders.po_date), desc(purchaseOrders.po_number));

  if (headers.length === 0) return [];

  const allItems = await fetchPOItemsForIds(headers.map((h) => h.id));

  const headerMap = new Map(headers.map((h) => [h.id, h]));
  return allItems.map((item) => ({
    ...headerMap.get(item.po_id)!,
    item_id: item.item_id,
    material_id: item.material_id,
    material_name: item.material_name,
    material_no: item.material_no,
    supplier_id: item.supplier_id,
    supplier_name: item.supplier_name,
    qty: item.qty,
    unit_name: item.unit_name,
    rate: item.rate,
    tax_percentage: item.tax_percentage,
    cgst_amount: item.cgst_amount,
    sgst_amount: item.sgst_amount,
    igst_amount: item.igst_amount,
    amount: item.amount,
    gst_type: item.gst_type,
  }));
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
      total_amount: purchaseOrders.total_amount,
      status: purchaseOrders.status,
      financial_year: purchaseOrders.financial_year,
      affects_stock: purchaseOrders.affects_stock,
      supplier_bill_no: purchaseOrders.supplier_bill_no,
      supplier_bill_date: purchaseOrders.supplier_bill_date,
      created_at: purchaseOrders.created_at,
      updated_at: purchaseOrders.updated_at,
    })
    .from(purchaseOrders)
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
      supplier_id: purchaseOrderItems.supplier_id,
      supplier_name: suppliers.name,
      qty: purchaseOrderItems.qty,
      unit_id: purchaseOrderItems.unit_id,
      unit_name: units.unit_name,
      rate: purchaseOrderItems.rate,
      tax_percentage: purchaseOrderItems.tax_percentage,
      cgst_amount: purchaseOrderItems.cgst_amount,
      sgst_amount: purchaseOrderItems.sgst_amount,
      igst_amount: purchaseOrderItems.igst_amount,
      amount: purchaseOrderItems.amount,
      gst_type: purchaseOrderItems.gst_type,
    })
    .from(purchaseOrderItems)
    .leftJoin(materials, eq(purchaseOrderItems.material_id, materials.id))
    .leftJoin(suppliers, eq(purchaseOrderItems.supplier_id, suppliers.id))
    .leftJoin(units, eq(purchaseOrderItems.unit_id, units.id))
    .where(eq(purchaseOrderItems.po_id, id));

  const items: PurchaseOrderItemWithDetails[] = itemRows.map((r) => ({
    id: r.id,
    po_id: r.po_id,
    material_id: r.material_id,
    material_name: r.material_name ?? "",
    material_no: r.material_no ?? 0,
    hsn_code: r.hsn_code ?? null,
    supplier_id: r.supplier_id ?? null,
    supplier_name: r.supplier_name ?? null,
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
  }));

  return { ...po, items };
}

// ---------------------------------------------------------------------------
// READ — dropdown data (active only, cached)
// ---------------------------------------------------------------------------

export const getActiveSuppliers = unstable_cache(
  async () =>
    db
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
      .orderBy(suppliers.name),
  ["po-active-suppliers"],
  { tags: [CACHE_TAGS.suppliers], revalidate: false }
);

export const getActiveMaterials = unstable_cache(
  async () =>
    db
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
      .orderBy(materials.name),
  ["po-active-materials"],
  { tags: [CACHE_TAGS.materials], revalidate: false }
);

export const getActiveUnits = unstable_cache(
  async () =>
    db
      .select({ id: units.id, unit_code: units.unit_code, unit_name: units.unit_name })
      .from(units)
      .where(eq(units.is_active, true))
      .orderBy(units.unit_name),
  ["po-active-units"],
  { tags: [CACHE_TAGS.units], revalidate: false }
);

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
// READ — next PO number (cheap single-row query, non-cached — always fresh)
// ---------------------------------------------------------------------------

export async function getNextPONumber(financialYear: string): Promise<number> {
  const [row] = await db
    .select({ maxNo: max(purchaseOrders.po_number) })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.financial_year, financialYear));
  return (row?.maxNo ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// WRITE — helpers
// ---------------------------------------------------------------------------

interface LineItemInput {
  material_id: string;
  supplier_id: string | null;
  qty: string;
  unit_id: string;
  rate: string;
  rate_blank: boolean;
  zero_rate_confirmed: boolean;
  tax_percentage: string;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  amount: string;
  gst_type: string | null;
}

function validateItems(items: LineItemInput[]) {
  if (items.length === 0) throw new Error("Add at least one material.");
  for (const item of items) {
    if (!item.supplier_id) throw new Error("All items must have a supplier selected.");
  }
  const seen = new Set<string>();
  for (const item of items) {
    const rate = parseFloat(item.rate || "0").toFixed(2);
    const key = `${item.material_id}|${item.supplier_id ?? ""}|${rate}`;
    if (seen.has(key))
      throw new Error("Duplicate entry detected: same material, same supplier, and same rate already exists on this PO. Combine into one row or adjust the rate.");
    seen.add(key);
  }
  for (const item of items) {
    if (item.rate === "0" && !item.rate_blank && !item.zero_rate_confirmed)
      throw new Error("One or more items have a zero rate without confirmation. Check 'Zero cost — confirm?' for each.");
  }
}

function deriveHeaderSupplierId(items: LineItemInput[]): string | null {
  const ids = Array.from(new Set(items.map((i) => i.supplier_id).filter((id): id is string => !!id)));
  return ids.length === 1 ? ids[0] : null;
}

interface POHeaderInput {
  po_date: string;
  financial_year: string;
  total_amount: string;
  affects_stock: boolean;
  supplier_bill_no: string;
  supplier_bill_date: string;
  items: LineItemInput[];
}

function itemValues(poId: string, item: LineItemInput) {
  return {
    po_id: poId,
    material_id: item.material_id,
    supplier_id: item.supplier_id || null,
    qty: item.qty,
    unit_id: item.unit_id || null,
    rate: item.rate,
    tax_percentage: item.tax_percentage,
    cgst_amount: item.cgst_amount,
    sgst_amount: item.sgst_amount,
    igst_amount: item.igst_amount,
    amount: item.amount,
    gst_type: item.gst_type || null,
  };
}

// ---------------------------------------------------------------------------
// WRITE — create Draft PO
// ---------------------------------------------------------------------------

export async function createPurchaseOrder(data: POHeaderInput): Promise<string> {
  validateItems(data.items);
  const poNumber = await getNextPONumber(data.financial_year);

  const [po] = await db
    .insert(purchaseOrders)
    .values({
      po_number: poNumber,
      po_date: new Date(data.po_date),
      supplier_id: deriveHeaderSupplierId(data.items),
      total_amount: data.total_amount,
      status: "Draft",
      financial_year: data.financial_year,
      affects_stock: data.affects_stock,
      supplier_bill_no: data.supplier_bill_no || null,
      supplier_bill_date: data.supplier_bill_date || null,
    })
    .returning({ id: purchaseOrders.id });

  if (data.items.length > 0) {
    await db.insert(purchaseOrderItems).values(data.items.map((item) => itemValues(po.id, item)));
  }

  revalidatePath("/transactions/purchase-orders");
  return po.id;
}

// ---------------------------------------------------------------------------
// WRITE — update Draft PO (replace items)
// ---------------------------------------------------------------------------

export async function updatePurchaseOrder(id: string, data: Omit<POHeaderInput, "financial_year">): Promise<void> {
  validateItems(data.items);
  await db
    .update(purchaseOrders)
    .set({
      po_date: new Date(data.po_date),
      supplier_id: deriveHeaderSupplierId(data.items),
      total_amount: data.total_amount,
      affects_stock: data.affects_stock,
      supplier_bill_no: data.supplier_bill_no || null,
      supplier_bill_date: data.supplier_bill_date || null,
      updated_at: new Date(),
    })
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.status, "Draft")));

  await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.po_id, id));

  if (data.items.length > 0) {
    await db.insert(purchaseOrderItems).values(data.items.map((item) => itemValues(id, item)));
  }

  revalidatePath("/transactions/purchase-orders");
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

    if (po.affects_stock) {
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
    }
  });

  revalidatePath("/transactions/purchase-orders");
}

// ---------------------------------------------------------------------------
// WRITE — update Received PO (atomic: reverse + reapply stock)
// ---------------------------------------------------------------------------

export async function updateReceivedPurchaseOrder(id: string, data: Omit<POHeaderInput, "financial_year">): Promise<void> {
  validateItems(data.items);
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

    // Reverse old stock (only if the PO originally updated stock)
    if (po.affects_stock) {
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
    }

    // Update header date, total, affects_stock, and derived supplier
    await tx
      .update(purchaseOrders)
      .set({
        po_date: new Date(data.po_date),
        supplier_id: deriveHeaderSupplierId(data.items),
        total_amount: data.total_amount,
        affects_stock: data.affects_stock,
        updated_at: new Date(),
      })
      .where(eq(purchaseOrders.id, id));

    // Replace items
    await tx.delete(purchaseOrderItems).where(eq(purchaseOrderItems.po_id, id));

    if (data.items.length > 0) {
      await tx.insert(purchaseOrderItems).values(data.items.map((item) => itemValues(id, item)));
    }

    // Apply new stock (only if new affects_stock is true)
    if (data.affects_stock) {
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
    }
  });

  revalidatePath("/transactions/purchase-orders");
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
    revalidatePath("/transactions/purchase-orders");
    return;
  }

  // Received PO — check that stock reversal would not go negative
  if (po.affects_stock) {
    const stockCheck = await db
      .select({
        name: materials.name,
        current_stock: materials.current_stock,
        qty: purchaseOrderItems.qty,
      })
      .from(purchaseOrderItems)
      .innerJoin(materials, eq(purchaseOrderItems.material_id, materials.id))
      .where(eq(purchaseOrderItems.po_id, id));

    for (const item of stockCheck) {
      const afterReversal = parseFloat(item.current_stock) - parseFloat(item.qty);
      if (afterReversal < 0) {
        throw new Error(
          `Cannot delete: reversing this PO would bring ${item.name} stock to ${afterReversal.toFixed(2)} (current: ${parseFloat(item.current_stock).toFixed(2)}, removing: ${parseFloat(item.qty).toFixed(2)}). Reduce issued quantities first.`
        );
      }
    }
  }

  // Safe to delete — atomic stock reversal (skip if PO never updated stock)
  await db.transaction(async (tx) => {
    if (po.affects_stock) {
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
    }

    await tx.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
  });

  revalidatePath("/transactions/purchase-orders");
}

// ---------------------------------------------------------------------------
// WRITE — revert Received PO back to Draft (atomic: stock reversal + status)
// ---------------------------------------------------------------------------

export async function revertPOToDraft(
  poId: string,
  userEmail: string = "unknown"
): Promise<{ success: true } | { error: string }> {
  const [po] = await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, poId));

  if (!po) return { error: "Purchase order not found." };
  if (po.status !== "Received") return { error: "Only Received POs can be reverted to Draft." };

  // Pre-flight: check all materials have enough stock for reversal (single bulk query)
  if (po.affects_stock) {
    const stockCheck = await db
      .select({
        name: materials.name,
        current_stock: materials.current_stock,
        qty: purchaseOrderItems.qty,
      })
      .from(purchaseOrderItems)
      .innerJoin(materials, eq(purchaseOrderItems.material_id, materials.id))
      .where(eq(purchaseOrderItems.po_id, poId));

    const blocking: string[] = [];
    for (const item of stockCheck) {
      const after = parseFloat(item.current_stock) - parseFloat(item.qty);
      if (after < 0) {
        blocking.push(
          `${item.name}: stock ${parseFloat(item.current_stock).toFixed(3)}, need to remove ${parseFloat(item.qty).toFixed(3)}`
        );
      }
    }
    if (blocking.length > 0) {
      return {
        error: `Cannot revert — insufficient stock for:\n• ${blocking.join("\n• ")}`,
      };
    }
  }

  // Atomic transaction: reverse stock + set status = Draft
  await db.transaction(async (tx) => {
    if (po.affects_stock) {
      const poItems = await tx
        .select({
          material_id: purchaseOrderItems.material_id,
          qty: purchaseOrderItems.qty,
          rate: purchaseOrderItems.rate,
        })
        .from(purchaseOrderItems)
        .where(eq(purchaseOrderItems.po_id, poId));

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
          reference_id: poId,
          reference_type: "purchase_order",
          qty_change: (-parseFloat(item.qty)).toString(),
          stock_after: newStock,
          rate_at_time: item.rate,
          adjusted_by: userEmail,
          reason: `PO #${po.po_number} reverted to Draft`,
        });
      }
    }

    await tx
      .update(purchaseOrders)
      .set({
        status: "Draft",
        reverted_at: new Date(),
        reverted_by: userEmail,
        updated_at: new Date(),
      })
      .where(eq(purchaseOrders.id, poId));
  });

  revalidatePath("/transactions/purchase-orders");
  return { success: true };
}
