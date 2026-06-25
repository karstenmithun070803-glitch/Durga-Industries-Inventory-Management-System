"use server";

import { unstable_cache, revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache";
import { db } from "@/lib/db";
import { suppliers, purchaseOrderItems, purchaseOrders } from "@/lib/db/schema";
import { eq, and, ilike, ne } from "drizzle-orm";

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

export async function createSupplier(data: {
  name: string;
  tin_no?: string;
  cst_no?: string;
  gstin?: string;
  address?: string;
  state?: string;
}) {
  if (!data.name.trim()) throw new Error("Supplier name is required");
  const [dup] = await db.select({ id: suppliers.id }).from(suppliers)
    .where(ilike(suppliers.name, data.name.trim()));
  if (dup) throw new Error(`A supplier named "${data.name.trim()}" already exists.`);

  await db.insert(suppliers).values({
    name: data.name.trim(),
    tin_no: data.tin_no?.trim() || null,
    cst_no: data.cst_no?.trim() || null,
    gstin: data.gstin?.trim().toUpperCase() || null,
    address: data.address?.trim() || null,
    state: data.state || null,
  });
  revalidateTag(CACHE_TAGS.suppliers);
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
    .where(and(ilike(suppliers.name, data.name.trim()), ne(suppliers.id, id)));
  if (dup) throw new Error(`A supplier named "${data.name.trim()}" already exists.`);

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

  const existing = await db.select({ name: suppliers.name }).from(suppliers);
  const existingNames = new Set(existing.map((s) => s.name.toUpperCase()));

  let skipped = 0;
  const batchSeen = new Set<string>();
  const toInsert = rows.filter((r) => {
    const key = r.name.toUpperCase();
    if (existingNames.has(key) || batchSeen.has(key)) { skipped++; return false; }
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
