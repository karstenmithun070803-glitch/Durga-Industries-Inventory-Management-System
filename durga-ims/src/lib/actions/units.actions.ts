"use server";

import { unstable_cache, revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache";
import { db } from "@/lib/db";
import { units, materials, purchaseOrderItems, materialIssueItems, invoiceItems, stageMaterials, invoiceInsuranceItems } from "@/lib/db/schema";
import { eq, or, sql } from "drizzle-orm";
import { isForeignKeyViolation } from "@/lib/utils/pg-errors";

// True when any row anywhere still references this unit — i.e. it is in use and must be
// HIDDEN rather than physically deleted. Units are referenced by many tables (any status):
// materials (as purchase OR sales unit) plus every transaction line that records a unit.
async function unitIsReferenced(id: string): Promise<boolean> {
  const checks = [
    db.select({ x: sql`1` }).from(materials).where(or(eq(materials.purchase_unit_id, id), eq(materials.sales_unit_id, id))).limit(1),
    db.select({ x: sql`1` }).from(purchaseOrderItems).where(eq(purchaseOrderItems.unit_id, id)).limit(1),
    db.select({ x: sql`1` }).from(materialIssueItems).where(eq(materialIssueItems.unit_id, id)).limit(1),
    db.select({ x: sql`1` }).from(invoiceItems).where(eq(invoiceItems.unit_id, id)).limit(1),
    db.select({ x: sql`1` }).from(stageMaterials).where(eq(stageMaterials.unit_id, id)).limit(1),
    db.select({ x: sql`1` }).from(invoiceInsuranceItems).where(eq(invoiceInsuranceItems.unit_id, id)).limit(1),
  ];
  const results = await Promise.all(checks);
  return results.some((r) => r.length > 0);
}

// ─── Reads (cached) ──────────────────────────────────────────────────────────

export const getUnits = unstable_cache(
  async () => db.select().from(units).where(eq(units.is_active, true)).orderBy(units.unit_code),
  ["active-units"],
  { tags: [CACHE_TAGS.units], revalidate: false }
);

export const getAllUnits = unstable_cache(
  async () => db.select().from(units).orderBy(units.unit_code),
  ["all-units"],
  { tags: [CACHE_TAGS.units], revalidate: false }
);

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function createUnit(name: string) {
  if (!name.trim()) throw new Error("Unit name is required");
  await db.insert(units).values({ unit_name: name.trim().toUpperCase() });
  revalidateTag(CACHE_TAGS.units);
}

export async function updateUnit(id: string, name: string) {
  if (!name.trim()) throw new Error("Unit name is required");
  await db.update(units).set({ unit_name: name.trim().toUpperCase() }).where(eq(units.id, id));
  revalidateTag(CACHE_TAGS.units);
  revalidateTag(CACHE_TAGS.stages);
}

/**
 * Smart delete: physically remove the unit when nothing references it, otherwise
 * HIDE it (is_active=false) so it leaves all lists/pickers while any material or
 * transaction line that recorded it keeps displaying correctly. To the user both
 * outcomes look identical — the row vanishes.
 */
export async function deleteUnit(id: string) {
  // Unreferenced → physically delete. The FK check is the primary guard; the 23503 catch
  // is a backstop for a concurrent insert racing between the check and the delete. Run the
  // delete as a standalone statement (no explicit tx), so a failed delete never poisons the
  // fresh update below.
  if (!(await unitIsReferenced(id))) {
    try {
      await db.delete(units).where(eq(units.id, id));
      revalidateTag(CACHE_TAGS.units);
      return;
    } catch (e) {
      if (!isForeignKeyViolation(e)) throw e;
      // fall through: a reference appeared → hide instead
    }
  }

  await db.update(units).set({ is_active: false }).where(eq(units.id, id));
  revalidateTag(CACHE_TAGS.units);
}

export async function reactivateUnit(id: string) {
  await db.update(units).set({ is_active: true }).where(eq(units.id, id));
  revalidateTag(CACHE_TAGS.units);
}
