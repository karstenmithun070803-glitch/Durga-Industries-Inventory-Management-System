"use server";

import { unstable_cache, revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache";
import { db } from "@/lib/db";
import { suppliers, purchaseOrderItems, purchaseOrders } from "@/lib/db/schema";
import { eq, and, ilike, ne, sql } from "drizzle-orm";
import { isForeignKeyViolation } from "@/lib/utils/pg-errors";

// True when any row anywhere still references this supplier — i.e. it has history and
// must be HIDDEN rather than physically deleted. Covers every child table (any status).
async function supplierIsReferenced(id: string): Promise<boolean> {
  const checks = [
    db.select({ x: sql`1` }).from(purchaseOrders).where(eq(purchaseOrders.supplier_id, id)).limit(1),
    db.select({ x: sql`1` }).from(purchaseOrderItems).where(eq(purchaseOrderItems.supplier_id, id)).limit(1),
  ];
  const results = await Promise.all(checks);
  return results.some((r) => r.length > 0);
}

// ─── Reads (cached) ──────────────────────────────────────────────────────────

export const getSuppliers = unstable_cache(
  async () => db.select().from(suppliers).where(eq(suppliers.is_active, true)).orderBy(suppliers.code_no),
  ["active-suppliers"],
  { tags: [CACHE_TAGS.suppliers], revalidate: false }
);

export const getAllSuppliers = unstable_cache(
  async () => db.select().from(suppliers).orderBy(suppliers.code_no),
  ["all-suppliers"],
  { tags: [CACHE_TAGS.suppliers], revalidate: false }
);

// ─── Mutations ───────────────────────────────────────────────────────────────

/** Signals the client that a new supplier matched a hidden ("deleted") row it may restore (R5). */
export type CreateResult = { ok: true } | { hiddenCollision: { id: string; name: string } };

export async function createSupplier(data: {
  name: string;
  tin_no?: string;
  cst_no?: string;
  gstin?: string;
  address?: string;
  state?: string;
}): Promise<CreateResult> {
  if (!data.name.trim()) throw new Error("Supplier name is required");
  // A hidden ("deleted") row still occupies the composite name+address+gstin space. Distinguish
  // an active duplicate (a real error) from a hidden one (offer to restore, R5): return a signal
  // so the client can ask the user instead of showing a raw "already exists" wall.
  const [dup] = await db.select({ id: suppliers.id, is_active: suppliers.is_active, name: suppliers.name }).from(suppliers)
    .where(and(
      ilike(suppliers.name, data.name.trim()),
      sql`LOWER(TRIM(COALESCE(${suppliers.address}, ''))) = LOWER(${data.address?.trim() ?? ''})`,
      sql`LOWER(TRIM(COALESCE(${suppliers.gstin}, ''))) = LOWER(${data.gstin?.trim() ?? ''})`
    ));
  if (dup?.is_active) throw new Error(`A supplier named "${data.name.trim()}" with the same address and GSTIN already exists. Change the address or GSTIN to save a different record.`);
  if (dup) {
    return { hiddenCollision: { id: dup.id, name: dup.name } };
  }

  await db.insert(suppliers).values({
    name: data.name.trim(),
    tin_no: data.tin_no?.trim() || null,
    cst_no: data.cst_no?.trim() || null,
    gstin: data.gstin?.trim().toUpperCase() || null,
    address: data.address?.trim() || null,
    state: data.state || null,
  });
  revalidateTag(CACHE_TAGS.suppliers);
  return { ok: true as const };
}

export async function updateSupplier(id: string, data: {
  name: string;
  tin_no?: string;
  cst_no?: string;
  gstin?: string;
  address?: string;
  state?: string;
}) {
  if (!data.name.trim()) throw new Error("Supplier name is required");
  const [dup] = await db.select({ id: suppliers.id }).from(suppliers)
    .where(and(
      ilike(suppliers.name, data.name.trim()),
      sql`LOWER(TRIM(COALESCE(${suppliers.address}, ''))) = LOWER(${data.address?.trim() ?? ''})`,
      sql`LOWER(TRIM(COALESCE(${suppliers.gstin}, ''))) = LOWER(${data.gstin?.trim() ?? ''})`,
      ne(suppliers.id, id)
    ));
  if (dup) throw new Error(`A supplier named "${data.name.trim()}" with the same address and GSTIN already exists. Change the address or GSTIN to save a different record.`);

  await db.update(suppliers).set({
    name: data.name.trim(),
    tin_no: data.tin_no?.trim() || null,
    cst_no: data.cst_no?.trim() || null,
    gstin: data.gstin?.trim().toUpperCase() || null,
    address: data.address?.trim() || null,
    state: data.state || null,
  }).where(eq(suppliers.id, id));
  revalidateTag(CACHE_TAGS.suppliers);
}

/**
 * Smart delete: physically remove the supplier when nothing references it, otherwise
 * HIDE it (is_active=false) so it leaves all lists/pickers while its transaction history
 * keeps displaying correctly. To the user both outcomes look identical — the row vanishes.
 */
export async function deleteSupplier(id: string) {
  const [sup] = await db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, id));
  if (!sup) return;

  // Unreferenced → physically delete. The reference check is the primary guard; the 23503 catch
  // is a backstop for a concurrent insert racing between the check and the delete. Run the
  // delete as a standalone statement (no explicit tx), so a failed delete never poisons the
  // fresh update below.
  if (!(await supplierIsReferenced(id))) {
    try {
      await db.delete(suppliers).where(eq(suppliers.id, id));
      revalidateTag(CACHE_TAGS.suppliers);
      return;
    } catch (e) {
      if (!isForeignKeyViolation(e)) throw e;
      // fall through: a reference appeared → hide instead
    }
  }

  await db.update(suppliers).set({ is_active: false }).where(eq(suppliers.id, id));
  revalidateTag(CACHE_TAGS.suppliers);
}

export async function reactivateSupplier(id: string) {
  await db.update(suppliers).set({ is_active: true }).where(eq(suppliers.id, id));
  revalidateTag(CACHE_TAGS.suppliers);
}

export async function bulkImportSuppliers(
  rows: Array<{
    name: string;
    tin_no?: string | null;
    cst_no?: string | null;
    gstin?: string | null;
    address?: string | null;
    state?: string | null;
  }>
): Promise<{ imported: number; skipped: number }> {
  if (rows.length === 0) return { imported: 0, skipped: 0 };

  const existing = await db.select({
    name: suppliers.name,
    address: suppliers.address,
    gstin: suppliers.gstin,
  }).from(suppliers);
  const existingKeys = new Set(
    existing.map((s) =>
      `${s.name.toUpperCase()}|${(s.address ?? '').trim().toUpperCase()}|${(s.gstin ?? '').trim().toUpperCase()}`
    )
  );

  let skipped = 0;
  const batchSeen = new Set<string>();
  const toInsert = rows.filter((r) => {
    const key = `${r.name.toUpperCase()}|${(r.address ?? '').trim().toUpperCase()}|${(r.gstin ?? '').trim().toUpperCase()}`;
    if (existingKeys.has(key) || batchSeen.has(key)) { skipped++; return false; }
    batchSeen.add(key);
    return true;
  });

  if (toInsert.length === 0) return { imported: 0, skipped };

  await db.transaction(async (tx) => {
    await tx.insert(suppliers).values(
      toInsert.map((r) => ({
        name: r.name,
        tin_no: r.tin_no || null,
        cst_no: r.cst_no || null,
        gstin: r.gstin || null,
        address: r.address || null,
        state: r.state || null,
      }))
    );
  });

  revalidateTag(CACHE_TAGS.suppliers);
  return { imported: toInsert.length, skipped };
}
