"use server";

import { unstable_cache, revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache";
import { db } from "@/lib/db";
import { units, materials } from "@/lib/db/schema";
import { eq, or } from "drizzle-orm";

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
}

export async function deleteUnit(id: string) {
  const inUse = await db
    .select({ id: materials.id })
    .from(materials)
    .where(
      or(eq(materials.purchase_unit_id, id), eq(materials.sales_unit_id, id))
    )
    .limit(1);

  if (inUse.length > 0) {
    const [unit] = await db.select({ unit_name: units.unit_name }).from(units).where(eq(units.id, id));
    throw new Error(
      `Cannot deactivate unit "${unit?.unit_name}": it is assigned to one or more materials. Reassign those materials first.`
    );
  }

  await db.update(units).set({ is_active: false }).where(eq(units.id, id));
  revalidateTag(CACHE_TAGS.units);
}

export async function reactivateUnit(id: string) {
  await db.update(units).set({ is_active: true }).where(eq(units.id, id));
  revalidateTag(CACHE_TAGS.units);
}
