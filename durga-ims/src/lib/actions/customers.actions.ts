"use server";

import { unstable_cache, revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache";
import { db } from "@/lib/db";
import { customers, vehicles } from "@/lib/db/schema";
import { eq, and, ilike, ne, sql } from "drizzle-orm";
import { isForeignKeyViolation } from "@/lib/utils/pg-errors";

// True when any vehicle still references this customer — i.e. it has history and must be
// HIDDEN rather than physically deleted. Counts vehicles of ANY status (is_active true or
// false): a hidden vehicle still carries a real customer_id FK that would block a hard delete.
async function customerIsReferenced(id: string): Promise<boolean> {
  const [row] = await db.select({ x: sql`1` }).from(vehicles).where(eq(vehicles.customer_id, id)).limit(1);
  return !!row;
}

// ─── Reads (cached) ──────────────────────────────────────────────────────────

export const getCustomers = unstable_cache(
  async () => db.select().from(customers).where(eq(customers.is_active, true)).orderBy(customers.customer_no),
  ["active-customers"],
  { tags: [CACHE_TAGS.customers], revalidate: false }
);

export const getAllCustomers = unstable_cache(
  async () => db.select().from(customers).orderBy(customers.customer_no),
  ["all-customers"],
  { tags: [CACHE_TAGS.customers], revalidate: false }
);

// ─── Mutations ───────────────────────────────────────────────────────────────

/** Signals the client that a new customer matched a hidden ("deleted") row it may restore (R5). */
export type CreateResult = { ok: true } | { hiddenCollision: { id: string; name: string } };

export async function createCustomer(data: {
  customer_name: string;
  address_1?: string;
  address_2?: string;
  street?: string;
  city?: string;
  state?: string;
  gstin?: string;
}): Promise<CreateResult> {
  if (!data.customer_name.trim()) throw new Error("Customer name is required");
  // A hidden ("deleted") row still counts as a duplicate on the composite name+address+gstin
  // key. Distinguish an active duplicate (a real error) from a hidden one (offer to restore,
  // R5): return a signal so the client can ask the user instead of a raw "already exists" wall.
  const dups = await db.select({ id: customers.id, is_active: customers.is_active }).from(customers)
    .where(and(
      ilike(customers.customer_name, data.customer_name.trim()),
      sql`LOWER(TRIM(COALESCE(${customers.address_1}, ''))) = LOWER(${data.address_1?.trim() ?? ''})`,
      sql`LOWER(TRIM(COALESCE(${customers.gstin}, ''))) = LOWER(${data.gstin?.trim() ?? ''})`
    ));
  if (dups.some((d) => d.is_active)) throw new Error(`A customer named "${data.customer_name.trim()}" with the same address and GSTIN already exists. Change the address or GSTIN to save a different record.`);
  if (dups.length > 0) {
    return { hiddenCollision: { id: dups[0].id, name: data.customer_name.trim() } };
  }

  await db.insert(customers).values({
    customer_name: data.customer_name.trim(),
    address_1: data.address_1?.trim() || null,
    address_2: data.address_2?.trim() || null,
    street: data.street?.trim() || null,
    city: data.city?.trim() || null,
    state: data.state || null,
    gstin: data.gstin?.trim().toUpperCase() || null,
  });
  revalidateTag(CACHE_TAGS.customers);
  return { ok: true as const };
}

export async function updateCustomer(id: string, data: {
  customer_name: string;
  address_1?: string;
  address_2?: string;
  street?: string;
  city?: string;
  state?: string;
  gstin?: string;
}) {
  if (!data.customer_name.trim()) throw new Error("Customer name is required");
  const [dup] = await db.select({ id: customers.id }).from(customers)
    .where(and(
      ilike(customers.customer_name, data.customer_name.trim()),
      sql`LOWER(TRIM(COALESCE(${customers.address_1}, ''))) = LOWER(${data.address_1?.trim() ?? ''})`,
      sql`LOWER(TRIM(COALESCE(${customers.gstin}, ''))) = LOWER(${data.gstin?.trim() ?? ''})`,
      ne(customers.id, id)
    ));
  if (dup) throw new Error(`A customer named "${data.customer_name.trim()}" with the same address and GSTIN already exists. Change the address or GSTIN to save a different record.`);

  await db.update(customers).set({
    customer_name: data.customer_name.trim(),
    address_1: data.address_1?.trim() || null,
    address_2: data.address_2?.trim() || null,
    street: data.street?.trim() || null,
    city: data.city?.trim() || null,
    state: data.state || null,
    gstin: data.gstin?.trim().toUpperCase() || null,
  }).where(eq(customers.id, id));
  revalidateTag(CACHE_TAGS.customers);
  revalidateTag(CACHE_TAGS.vehicles);
}

/**
 * Smart delete: physically remove the customer when no vehicle references it, otherwise HIDE
 * it (is_active=false) so it leaves all lists/pickers while its transaction history keeps
 * displaying correctly. To the user both outcomes look identical — the row vanishes.
 */
export async function deleteCustomer(id: string) {
  // Unreferenced → physically delete. The FK check is the primary guard; the 23503 catch is a
  // backstop for a concurrent vehicle insert racing between the check and the delete. Run the
  // delete as a standalone statement (no explicit tx), so a failed delete never poisons the
  // fresh update below.
  if (!(await customerIsReferenced(id))) {
    try {
      await db.delete(customers).where(eq(customers.id, id));
      revalidateTag(CACHE_TAGS.customers);
      revalidateTag(CACHE_TAGS.vehicles);
      return;
    } catch (e) {
      if (!isForeignKeyViolation(e)) throw e;
      // fall through: a reference appeared → hide instead
    }
  }

  await db.update(customers).set({ is_active: false }).where(eq(customers.id, id));
  revalidateTag(CACHE_TAGS.customers);
  revalidateTag(CACHE_TAGS.vehicles);
}

export async function reactivateCustomer(id: string) {
  await db.update(customers).set({ is_active: true }).where(eq(customers.id, id));
  revalidateTag(CACHE_TAGS.customers);
  revalidateTag(CACHE_TAGS.vehicles);
}

export async function bulkImportCustomers(
  rows: Array<{
    customer_name: string;
    address_1?: string | null;
    address_2?: string | null;
    street?: string | null;
    city?: string | null;
    state?: string | null;
    gstin?: string | null;
  }>
): Promise<{ imported: number; skipped: number }> {
  if (rows.length === 0) return { imported: 0, skipped: 0 };

  const existing = await db.select({
    customer_name: customers.customer_name,
    address_1: customers.address_1,
    gstin: customers.gstin,
  }).from(customers);
  const existingKeys = new Set(
    existing.map((c) =>
      `${c.customer_name.toUpperCase()}|${(c.address_1 ?? '').trim().toUpperCase()}|${(c.gstin ?? '').trim().toUpperCase()}`
    )
  );

  let skipped = 0;
  const batchSeen = new Set<string>();
  const toInsert = rows.filter((r) => {
    const key = `${r.customer_name.toUpperCase()}|${(r.address_1 ?? '').trim().toUpperCase()}|${(r.gstin ?? '').trim().toUpperCase()}`;
    if (existingKeys.has(key) || batchSeen.has(key)) { skipped++; return false; }
    batchSeen.add(key);
    return true;
  });

  if (toInsert.length === 0) return { imported: 0, skipped };

  await db.transaction(async (tx) => {
    await tx.insert(customers).values(
      toInsert.map((r) => ({
        customer_name: r.customer_name,
        address_1: r.address_1 || null,
        address_2: r.address_2 || null,
        street: r.street || null,
        city: r.city || null,
        state: r.state || null,
        gstin: r.gstin || null,
      }))
    );
  });

  revalidateTag(CACHE_TAGS.customers);
  return { imported: toInsert.length, skipped };
}
