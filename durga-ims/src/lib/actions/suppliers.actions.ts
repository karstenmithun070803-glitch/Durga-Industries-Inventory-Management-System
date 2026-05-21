"use server";

import { db } from "@/lib/db";
import { suppliers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getSuppliers() {
  return db.select().from(suppliers).where(eq(suppliers.is_active, true)).orderBy(suppliers.name);
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
  await db.update(suppliers).set({ is_active: false }).where(eq(suppliers.id, id));
  revalidatePath("/masters/suppliers");
}
