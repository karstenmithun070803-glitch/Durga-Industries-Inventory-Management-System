"use server";

import { unstable_cache, revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache";
import { db } from "@/lib/db";
import { taxRates, materials } from "@/lib/db/schema";
import { eq, ne, and, isNotNull } from "drizzle-orm";

// ─── Reads (cached) ──────────────────────────────────────────────────────────

export const getTaxRates = unstable_cache(
  async () => db.select().from(taxRates).where(eq(taxRates.is_active, true)).orderBy(taxRates.vat_code),
  ["active-tax-rates"],
  { tags: [CACHE_TAGS.taxRates], revalidate: false }
);

export const getAllTaxRates = unstable_cache(
  async () => db.select().from(taxRates).orderBy(taxRates.vat_code),
  ["all-tax-rates"],
  { tags: [CACHE_TAGS.taxRates], revalidate: false }
);

// ─── Reads (non-cached) ──────────────────────────────────────────────────────

async function checkInvPrefixUnique(prefix: string, excludeId?: string) {
  const rows = await db
    .select({ id: taxRates.id })
    .from(taxRates)
    .where(
      excludeId
        ? and(eq(taxRates.inv_prefix, prefix), ne(taxRates.id, excludeId), isNotNull(taxRates.inv_prefix))
        : and(eq(taxRates.inv_prefix, prefix), isNotNull(taxRates.inv_prefix))
    );
  if (rows.length > 0)
    throw new Error(`Invoice prefix "${prefix}" is already used by another tax rate. Each prefix must be unique.`);
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function createTaxRate(data: {
  tax_percentage: string;
  inv_prefix?: string;
}) {
  if (!data.tax_percentage) throw new Error("Tax percentage is required");
  const pct = parseFloat(data.tax_percentage);
  if (isNaN(pct) || pct < 0) throw new Error("Enter a valid tax percentage");
  const description = pct === 0 ? "Exempt (0%)" : `GST ${pct}%`;
  const prefix = data.inv_prefix?.trim() || null;
  if (prefix) await checkInvPrefixUnique(prefix);
  await db.insert(taxRates).values({
    tax_percentage: data.tax_percentage,
    description,
    inv_prefix: prefix,
  });
  revalidateTag(CACHE_TAGS.taxRates);
}

export async function updateTaxRate(
  id: string,
  data: { tax_percentage: string; inv_prefix?: string }
) {
  const pct = parseFloat(data.tax_percentage || "0");
  const description = pct === 0 ? "Exempt (0%)" : `GST ${pct}%`;
  const prefix = data.inv_prefix?.trim() || null;
  if (prefix) await checkInvPrefixUnique(prefix, id);
  await db.update(taxRates).set({
    tax_percentage: data.tax_percentage,
    description,
    inv_prefix: prefix,
  }).where(eq(taxRates.id, id));
  revalidateTag(CACHE_TAGS.taxRates);
}

export async function deleteTaxRate(id: string) {
  const inUse = await db
    .select({ id: materials.id })
    .from(materials)
    .where(eq(materials.tax_rate_id, id))
    .limit(1);

  if (inUse.length > 0) {
    const [rate] = await db.select({ description: taxRates.description }).from(taxRates).where(eq(taxRates.id, id));
    throw new Error(
      `Cannot deactivate "${rate?.description}": it is assigned to one or more materials. Reassign those materials first.`
    );
  }

  await db.update(taxRates).set({ is_active: false }).where(eq(taxRates.id, id));
  revalidateTag(CACHE_TAGS.taxRates);
}

export async function reactivateTaxRate(id: string) {
  await db.update(taxRates).set({ is_active: true }).where(eq(taxRates.id, id));
  revalidateTag(CACHE_TAGS.taxRates);
}
