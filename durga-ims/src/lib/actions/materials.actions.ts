"use server";

import { unstable_cache, revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache";
import { db } from "@/lib/db";
import { materials, materialIssueItems, materialIssues } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

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
  await db.update(materials).set({
    name: data.name.trim().toUpperCase(),
    hsn_code: data.hsn_code?.trim() || null,
    tax_rate_id: data.tax_rate_id || null,
    purchase_unit_id: data.purchase_unit_id || null,
    min_level: data.min_level || "0",
    standard_cost: parsedCost !== null ? String(parsedCost) : null,
  }).where(eq(materials.id, id));
  revalidateTag(CACHE_TAGS.materials);
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
): Promise<{ imported: number; skipped: number }> {
  if (rows.length === 0) return { imported: 0, skipped: 0 };

  const existing = await db.select({ name: materials.name }).from(materials);
  const existingNames = new Set(existing.map((m) => m.name.toUpperCase()));

  const toInsert = rows.filter((r) => !existingNames.has(r.name.toUpperCase()));
  const skipped = rows.length - toInsert.length;

  if (toInsert.length === 0) return { imported: 0, skipped };

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
  return { imported: toInsert.length, skipped };
}
