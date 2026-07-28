"use server";

import { unstable_cache, revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache";
import { db } from "@/lib/db";
import { taxRates, materials, invoices } from "@/lib/db/schema";
import { eq, ne, and, isNotNull, like } from "drizzle-orm";
import { isForeignKeyViolation } from "@/lib/utils/pg-errors";

/**
 * True when anything still references this tax rate — so it must be HIDDEN
 * (is_active=false) rather than physically deleted. Two very different edges:
 *
 *  1. FK child: materials.tax_rate_id — a normal foreign key. The DB would raise
 *     23503 on a hard delete, but we pre-check anyway.
 *  2. NON-FK logical link: the tax rate's inv_prefix drives invoice numbering by
 *     STRING MATCH (prefix "D" → bill_number "D-00001"). There is NO foreign key on
 *     this edge, so the DB will NOT raise 23503 — this check is the ONLY thing that
 *     stops a hard delete from orphaning the invoice-number series.
 */
async function taxRateIsReferenced(id: string): Promise<boolean> {
  // FK child first.
  const matRef = await db
    .select({ x: materials.id })
    .from(materials)
    .where(eq(materials.tax_rate_id, id))
    .limit(1);
  if (matRef.length > 0) return true;

  // NON-FK logical link: load this rate's prefix, then look for invoices numbered from it.
  const [rate] = await db
    .select({ inv_prefix: taxRates.inv_prefix })
    .from(taxRates)
    .where(eq(taxRates.id, id));
  const prefix = rate?.inv_prefix?.trim();
  if (prefix) {
    const invRef = await db
      .select({ x: invoices.id })
      .from(invoices)
      .where(like(invoices.bill_number, `${prefix}-%`))
      .limit(1);
    if (invRef.length > 0) return true;
  }

  return false;
}

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

/** Signals the client that a new inv_prefix matched a hidden ("deleted") row it may restore (R5). */
export type CreateResult = { ok: true } | { hiddenCollision: { id: string; name: string } };

export async function createTaxRate(data: {
  tax_percentage: string;
  inv_prefix?: string;
}): Promise<CreateResult> {
  if (!data.tax_percentage) throw new Error("Tax percentage is required");
  const pct = parseFloat(data.tax_percentage);
  if (isNaN(pct) || pct < 0 || pct > 100) throw new Error("Enter a valid tax percentage (0–100)");
  const description = pct === 0 ? "Exempt (0%)" : `GST ${pct}%`;
  const prefix = data.inv_prefix?.trim() || null;

  // The uniqueness is on inv_prefix. A hidden ("deleted") row still holds the prefix, so
  // distinguish an active duplicate (a real error) from a hidden one (offer to restore, R5).
  // A null/empty prefix has nothing to collide on — skip straight to insert.
  if (prefix) {
    const dups = await db
      .select({ id: taxRates.id, is_active: taxRates.is_active, description: taxRates.description })
      .from(taxRates)
      .where(and(eq(taxRates.inv_prefix, prefix), isNotNull(taxRates.inv_prefix)));
    if (dups.some((d) => d.is_active))
      throw new Error(`Invoice prefix "${prefix}" is already used by another tax rate. Each prefix must be unique.`);
    if (dups.length > 0)
      return { hiddenCollision: { id: dups[0].id, name: dups[0].description || prefix } };
  }

  await db.insert(taxRates).values({
    tax_percentage: data.tax_percentage,
    description,
    inv_prefix: prefix,
  });
  revalidateTag(CACHE_TAGS.taxRates);
  return { ok: true as const };
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

/**
 * Smart delete: physically remove the tax rate when nothing references it, otherwise
 * HIDE it (is_active=false) so it leaves all lists/pickers while any material or invoice
 * that depends on it keeps resolving. To the user both outcomes look identical.
 */
export async function deleteTaxRate(id: string) {
  // Unreferenced by BOTH checks → physically delete. The materials FK will raise 23503 if a
  // concurrent insert races the check, so the catch falls back to hiding. The inv_prefix
  // link has NO FK, so taxRateIsReferenced is the only thing guarding it — a hard delete
  // there would silently orphan the invoice-number series. Standalone statement (no tx) so
  // a failed delete never poisons the fresh update below.
  if (!(await taxRateIsReferenced(id))) {
    try {
      await db.delete(taxRates).where(eq(taxRates.id, id));
      revalidateTag(CACHE_TAGS.taxRates);
      return;
    } catch (e) {
      if (!isForeignKeyViolation(e)) throw e;
      // fall through: a reference appeared → hide instead
    }
  }

  await db.update(taxRates).set({ is_active: false }).where(eq(taxRates.id, id));
  revalidateTag(CACHE_TAGS.taxRates);
}

export async function reactivateTaxRate(id: string) {
  await db.update(taxRates).set({ is_active: true }).where(eq(taxRates.id, id));
  revalidateTag(CACHE_TAGS.taxRates);
}
