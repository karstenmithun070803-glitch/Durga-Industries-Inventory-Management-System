"use server";

import { db } from "@/lib/db";
import { materials } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getMaterials() {
  return db.select().from(materials).where(eq(materials.is_active, true)).orderBy(materials.material_no);
}

export async function createMaterial(data: {
  name: string;
  hsn_code?: string;
  tax_rate_id?: string;
  purchase_unit_id?: string;
  sales_unit_id?: string;
  conversion_value?: string;
  opening_stock?: string;
  min_level?: string;
  max_level?: string;
}) {
  if (!data.name.trim()) throw new Error("Material name is required");
  await db.insert(materials).values({
    name: data.name.trim().toUpperCase(),
    hsn_code: data.hsn_code?.trim() || null,
    tax_rate_id: data.tax_rate_id || null,
    purchase_unit_id: data.purchase_unit_id || null,
    sales_unit_id: data.sales_unit_id || null,
    conversion_value: data.conversion_value || "1",
    opening_stock: data.opening_stock || "0",
    current_stock: data.opening_stock || "0",
    min_level: data.min_level || "0",
    max_level: data.max_level || null,
  });
  revalidatePath("/masters/materials");
}

export async function updateMaterial(id: string, data: {
  name: string;
  hsn_code?: string;
  tax_rate_id?: string;
  purchase_unit_id?: string;
  sales_unit_id?: string;
  conversion_value?: string;
  min_level?: string;
  max_level?: string;
}) {
  await db.update(materials).set({
    name: data.name.trim().toUpperCase(),
    hsn_code: data.hsn_code?.trim() || null,
    tax_rate_id: data.tax_rate_id || null,
    purchase_unit_id: data.purchase_unit_id || null,
    sales_unit_id: data.sales_unit_id || null,
    conversion_value: data.conversion_value || "1",
    min_level: data.min_level || "0",
    max_level: data.max_level || null,
  }).where(eq(materials.id, id));
  revalidatePath("/masters/materials");
}

export async function deleteMaterial(id: string) {
  await db.update(materials).set({ is_active: false }).where(eq(materials.id, id));
  revalidatePath("/masters/materials");
}
