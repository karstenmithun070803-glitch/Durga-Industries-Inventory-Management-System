"use server";

import { db } from "@/lib/db";
import { suppliers, purchaseOrderItems, purchaseOrders } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getSuppliers() {
  return db.select().from(suppliers).where(eq(suppliers.is_active, true)).orderBy(suppliers.code_no);
}

export async function getAllSuppliers() {
  return db.select().from(suppliers).orderBy(suppliers.code_no);
}

export async function createSupplier(data: {
  name: string;
  tin_no?: string;
  cst_no?: string;
  gstin?: string;
  address?: string;
  state?: string;
}) {
  if (!data.name.trim()) throw new Error("Supplier name is required");
  await db.insert(suppliers).values({
    name: data.name.trim(),
    tin_no: data.tin_no?.trim() || null,
    cst_no: data.cst_no?.trim() || null,
    gstin: data.gstin?.trim().toUpperCase() || null,
    address: data.address?.trim() || null,
    state: data.state || null,
  });
  revalidatePath("/masters/suppliers");
}

export async function updateSupplier(id: string, data: {
  name: string;
  tin_no?: string;
  cst_no?: string;
  gstin?: string;
  address?: string;
  state?: string;
}) {
  await db.update(suppliers).set({
    name: data.name.trim(),
    tin_no: data.tin_no?.trim() || null,
    cst_no: data.cst_no?.trim() || null,
    gstin: data.gstin?.trim().toUpperCase() || null,
    address: data.address?.trim() || null,
    state: data.state || null,
  }).where(eq(suppliers.id, id));
  revalidatePath("/masters/suppliers");
}

export async function deleteSupplier(id: string) {
  const draftPO = await db
    .select({ po_number: purchaseOrders.po_number })
    .from(purchaseOrderItems)
    .innerJoin(purchaseOrders, eq(purchaseOrderItems.po_id, purchaseOrders.id))
    .where(and(eq(purchaseOrderItems.supplier_id, id), eq(purchaseOrders.status, "Draft")))
    .limit(1);

  if (draftPO.length > 0) {
    const [sup] = await db.select({ name: suppliers.name }).from(suppliers).where(eq(suppliers.id, id));
    throw new Error(
      `Cannot deactivate "${sup?.name}": they are referenced in Draft PO-${String(draftPO[0].po_number).padStart(4, "0")}. Complete or delete that PO first.`
    );
  }

  await db.update(suppliers).set({ is_active: false }).where(eq(suppliers.id, id));
  revalidatePath("/masters/suppliers");
}

export async function reactivateSupplier(id: string) {
  await db.update(suppliers).set({ is_active: true }).where(eq(suppliers.id, id));
  revalidatePath("/masters/suppliers");
}
