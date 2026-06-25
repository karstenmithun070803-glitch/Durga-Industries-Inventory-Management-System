"use server";

import { unstable_cache, revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache";
import { db } from "@/lib/db";
import { materials, materialIssueItems, materialIssues, purchaseOrderItems, purchaseOrders } from "@/lib/db/schema";
import { eq, and, ilike, ne } from "drizzle-orm";

// ─── Reads (cached) ──────────────────────────────────────────────────────────

export const getMaterials = unstable_cache(
  async () => db.select().from(materials).where(eq(materials.is_active, true)).orderBy(materials.material_no),
  ["active-materials"],
  { tags: [CACHE_TAGS.materials], revalidate: false }
);

export const getAllMaterials = unstable_cache(
  async () => db.select().from(materials).orderBy(materials.material_no),
  ["all-materials"],
  { tags: [CACHE_TAGS.materials], revalidate: false }
);

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function createMaterial(data: {
  name: string;
  hsn_code?: string;
  tax_rate_id?: string;
  purchase_unit_id?: string;
  opening_stock?: string;
  min_level?: string;
}) {
  if (!data.name.trim()) throw new Error("Material name is required");
  if (!data.purchase_unit_id) throw new Error("Purchase unit is required.");
  if (Number(data.opening_stock ?? 0) < 0) throw new Error("Opening stock cannot be negative");
  if (Number(data.min_level ?? 0) < 0) throw new Error("Min level cannot be negative");

  const [dup] = await db.select({ id: materials.id }).from(materials)
    .where(ilike(materials.name, data.name.trim()));
  if (dup) throw new Error(`A material named "${data.name.trim().toUpperCase()}" already exists.`);

  await db.insert(materials).values({
    name: data.name.trim().toUpperCase(),
    hsn_code: data.hsn_code?.trim() || null,
    tax_rate_id: data.tax_rate_id || null,
    purchase_unit_id: data.purchase_unit_id || null,
    opening_stock: data.opening_stock || "0",
    current_stock: data.opening_stock || "0",
    min_level: data.min_level || "0",
  });
  revalidateTag(CACHE_TAGS.materials);
}

export async function updateMaterial(id: string, data: {
  name: string;
  hsn_code?: string;
  tax_rate_id?: string;
  purchase_unit_id?: string;
  min_level?: string;
  standard_cost?: string;
}) {
  if (!data.name.trim()) throw new Error("Material name is required");
  if (!data.purchase_unit_id) throw new Error("Purchase unit is required.");
  const parsedCost = data.standard_cost?.trim() ? parseFloat(data.standard_cost) : null;
  if (parsedCost !== null && (isNaN(parsedCost) || parsedCost < 0)) throw new Error("Standard cost must be a non-negative number.");

  const [dup] = await db.select({ id: materials.id }).from(materials)
    .where(and(ilike(materials.name, data.name.trim()), ne(materials.id, id)));
  if (dup) throw new Error(`A material named "${data.name.trim().toUpperCase()}" already exists.`);

  await db.update(materials).set({
    name: data.name.trim().toUpperCase(),
    hsn_code: data.hsn_code?.trim() || null,
    tax_rate_id: data.tax_rate_id || null,
    purchase_unit_id: data.purchase_unit_id || null,
    min_level: data.min_level || "0",
    standard_cost: parsedCost !== null ? String(parsedCost) : null,
  }).where(eq(materials.id, id));
  revalidateTag(CACHE_TAGS.materials);
  revalidateTag(CACHE_TAGS.stages);
}

export async function deleteMaterial(id: string) {
  const [mat] = await db
    .select({ name: materials.name, current_stock: materials.current_stock })
    .from(materials)
    .where(eq(materials.id, id));

  if (mat && parseFloat(mat.current_stock) > 0) {
    throw new Error(
      `Cannot deactivate "${mat.name}": current stock is ${parseFloat(mat.current_stock).toFixed(2)}. Bring stock to zero before deactivating.`
    );
  }

  const inUse = await db
    .select({ slip_number: materialIssues.slip_number })
    .from(materialIssueItems)
    .innerJoin(materialIssues, eq(materialIssueItems.issue_id, materialIssues.id))
    .where(and(eq(materialIssueItems.material_id, id), eq(materialIssues.status, "Draft")))
    .limit(1);
  if (inUse.length > 0)
    throw new Error(
      `Cannot deactivate "${mat?.name}": it is used in Draft Issue Slip MI-${String(inUse[0].slip_number).padStart(4, "0")}. Complete or delete that slip first.`
    );

  const openPO = await db
    .select({ po_number: purchaseOrders.po_number })
    .from(purchaseOrderItems)
    .innerJoin(purchaseOrders, eq(purchaseOrderItems.po_id, purchaseOrders.id))
    .where(and(eq(purchaseOrderItems.material_id, id), eq(purchaseOrders.status, "Draft")))
    .limit(1);
  if (openPO.length > 0)
    throw new Error(
      `Cannot deactivate "${mat?.name}": referenced in Draft PO-${String(openPO[0].po_number).padStart(4, "0")}. Complete or delete that PO first.`
    );

  await db.update(materials).set({ is_active: false }).where(eq(materials.id, id));
  revalidateTag(CACHE_TAGS.materials);
}

export async function reactivateMaterial(id: string) {
  await db.update(materials).set({ is_active: true }).where(eq(materials.id, id));
  revalidateTag(CACHE_TAGS.materials);
}

export async function bulkImportMaterials(
  rows: Array<{
    name: string;
    hsn_code?: string | null;
    tax_rate_id?: string | null;
    purchase_unit_id: string;
    opening_stock?: string;
    min_level?: string;
  }>
): Promise<{ imported: number; skipped: number; skippedInactive: number }> {
  if (rows.length === 0) return { imported: 0, skipped: 0, skippedInactive: 0 };

  const existing = await db.select({ name: materials.name, is_active: materials.is_active }).from(materials);
  const existingActiveNames = new Set(existing.filter(m => m.is_active).map((m) => m.name.toUpperCase()));
  const existingInactiveNames = new Set(existing.filter(m => !m.is_active).map((m) => m.name.toUpperCase()));

  let skipped = 0;
  let skippedInactive = 0;
  const batchSeen = new Set<string>();

  const toInsert = rows.filter((r) => {
    const key = r.name.toUpperCase();
    if (existingActiveNames.has(key) || batchSeen.has(key)) { skipped++; return false; }
    if (existingInactiveNames.has(key)) { skippedInactive++; return false; }
    batchSeen.add(key);
    return true;
  });

  if (toInsert.length === 0) return { imported: 0, skipped, skippedInactive };

  await db.transaction(async (tx) => {
    await tx.insert(materials).values(
      toInsert.map((r) => ({
        name: r.name.toUpperCase(),
        hsn_code: r.hsn_code || null,
        tax_rate_id: r.tax_rate_id || null,
        purchase_unit_id: r.purchase_unit_id,
        opening_stock: r.opening_stock || "0",
        current_stock: r.opening_stock || "0",
        min_level: r.min_level || "0",
      }))
    );
  });

  revalidateTag(CACHE_TAGS.materials);
  return { imported: toInsert.length, skipped, skippedInactive };
}
