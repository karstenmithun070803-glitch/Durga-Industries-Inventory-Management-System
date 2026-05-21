"use server";

import { db } from "@/lib/db";
import { taxRates } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getTaxRates() {
  return db.select().from(taxRates).where(eq(taxRates.is_active, true)).orderBy(taxRates.vat_code);
}

export async function createTaxRate(data: {
  tax_percentage: string;
  description: string;
  inv_prefix?: string;
}) {
  if (!data.tax_percentage || !data.description.trim()) throw new Error("Tax % and description are required");
  await db.insert(taxRates).values({
    tax_percentage: data.tax_percentage,
    description: data.description.trim(),
    inv_prefix: data.inv_prefix?.trim() || null,
  });
  revalidatePath("/masters/tax");
}

export async function updateTaxRate(
  id: string,
  data: { tax_percentage: string; description: string; inv_prefix?: string }
) {
  await db.update(taxRates).set({
    tax_percentage: data.tax_percentage,
    description: data.description.trim(),
    inv_prefix: data.inv_prefix?.trim() || null,
  }).where(eq(taxRates.id, id));
  revalidatePath("/masters/tax");
}

export async function deleteTaxRate(id: string) {
  await db.update(taxRates).set({ is_active: false }).where(eq(taxRates.id, id));
  revalidatePath("/masters/tax");
}
