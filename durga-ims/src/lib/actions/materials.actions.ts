"use server";

import { unstable_cache, revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache";
import { db } from "@/lib/db";
import { materials, materialIssueItems, materialIssues, purchaseOrderItems, purchaseOrders } from "@/lib/db/schema";
import { eq, and, ilike, ne, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { parseCeilingInput } from "@/lib/utils/max-rate";
import { isUniqueViolation } from "@/lib/utils/pg-errors";

// The DB is the arbiter of duplicate material names (uq_materials_name_lower); the
// ilike pre-checks below only exist to produce a friendlier message on the non-racing
// path, and cannot see a row another session inserts between the SELECT and the INSERT.
function duplicateNameError(name: string): Error {
  return new Error(`A material named "${name.trim().toUpperCase()}" already exists.`);
}

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
  opening_rate?: string;
}) {
  if (!data.name.trim()) throw new Error("Material name is required");
  if (!data.purchase_unit_id) throw new Error("Purchase unit is required.");
  if (Number(data.opening_stock ?? 0) < 0) throw new Error("Opening stock cannot be negative");
  if (data.opening_rate && parseFloat(data.opening_rate) < 0) throw new Error("Opening rate cannot be negative");

  const [dup] = await db.select({ id: materials.id }).from(materials)
    .where(ilike(materials.name, data.name.trim()));
  if (dup) throw duplicateNameError(data.name);

  try {
    await db.insert(materials).values({
      name: data.name.trim().toUpperCase(),
      hsn_code: data.hsn_code?.trim() || null,
      tax_rate_id: data.tax_rate_id || null,
      purchase_unit_id: data.purchase_unit_id || null,
      opening_stock: data.opening_stock || "0",
      opening_rate: data.opening_rate || null,
      current_stock: data.opening_stock || "0",
    });
  } catch (e) {
    // Lost the race: another session inserted the same name between the check above
    // and this insert. The unique index caught it.
    if (isUniqueViolation(e)) throw duplicateNameError(data.name);
    throw e;
  }
  revalidateTag(CACHE_TAGS.materials);
}

export async function updateMaterial(id: string, data: {
  name: string;
  hsn_code?: string;
  tax_rate_id?: string;
  purchase_unit_id?: string;
  standard_cost?: string;
}) {
  if (!data.name.trim()) throw new Error("Material name is required");
  if (!data.purchase_unit_id) throw new Error("Purchase unit is required.");
  const parsedCost = data.standard_cost?.trim() ? parseFloat(data.standard_cost) : null;
  if (parsedCost !== null && (isNaN(parsedCost) || parsedCost < 0)) throw new Error("Standard cost must be a non-negative number.");

  const [dup] = await db.select({ id: materials.id }).from(materials)
    .where(and(ilike(materials.name, data.name.trim()), ne(materials.id, id)));
  if (dup) throw duplicateNameError(data.name);

  // NOTE: explicit column list, deliberately. max_rate is absent, so an employee
  // editing a material's name can never clobber the admin's ceiling — Postgres
  // row-locking serialises this against batchUpdateMaterialRates and both writes
  // survive. Do NOT "simplify" this into a whole-row write.
  try {
    await db.update(materials).set({
      name: data.name.trim().toUpperCase(),
      hsn_code: data.hsn_code?.trim() || null,
      tax_rate_id: data.tax_rate_id || null,
      purchase_unit_id: data.purchase_unit_id || null,
      standard_cost: parsedCost !== null ? String(parsedCost) : null,
    }).where(eq(materials.id, id));
  } catch (e) {
    if (isUniqueViolation(e)) throw duplicateNameError(data.name);
    throw e;
  }
  revalidateTag(CACHE_TAGS.materials);
  revalidateTag(CACHE_TAGS.stages);
}

// ─── Admin-only: purchase ceiling ────────────────────────────────────────────

/**
 * Batch-writes max_rate for many materials in one statement.
 *
 * Blank => NULL ("not set", which blocks purchasing). Zero is rejected: a ceiling
 * of 0 blocks every positive rate while looking identical to a configured value.
 */
export async function batchUpdateMaterialRates(
  updates: Array<{ id: string; max_rate: string | null }>
): Promise<void> {
  await requireAdmin();

  if (updates.length === 0) return; // UPDATE ... FROM (VALUES ) is invalid SQL

  const rows = updates.map((u) => ({ id: u.id, max_rate: parseCeilingInput(u.max_rate) }));

  // Both columns are cast. materials.id is uuid and max_rate is numeric; an untyped
  // VALUES list infers text for both, so the join throws "operator does not exist:
  // uuid = text" and the assignment throws 42804. This exact bug shipped once before
  // in batchUpdateMaterials (current_stock::text against a numeric column).
  // Inside a transaction so the row-count check can roll the write back. Throwing
  // after a bare db.execute() would leave the partial update committed.
  await db.transaction(async (tx) => {
    // RETURNING, not a driver rowcount: `.count` is not guaranteed to survive drizzle's
    // wrapper, and an undefined rowcount would silently disable the check below.
    const updated = await tx.execute<{ id: string }>(sql`
      UPDATE materials
      SET max_rate   = v.rate,
          updated_at = NOW()
      FROM (VALUES ${sql.join(
        rows.map((r) => sql`(${r.id}::uuid, ${r.max_rate}::numeric)`),
        sql`, `
      )}) AS v(id, rate)
      WHERE materials.id = v.id
      RETURNING materials.id
    `);

    // Fewer rows matched than we sent => a material was deleted while the admin typed.
    // Fail loudly (and roll back) rather than persisting a partial save.
    if (updated.length !== rows.length) {
      throw new Error("Some materials no longer exist. Refresh and try again.");
    }
  });

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

  const openPO = await db
    .select({ po_number: purchaseOrders.po_number })
    .from(purchaseOrderItems)
    .innerJoin(purchaseOrders, eq(purchaseOrderItems.po_id, purchaseOrders.id))
    .where(and(eq(purchaseOrderItems.material_id, id), eq(purchaseOrders.status, "Draft")))
    .limit(1);
  if (openPO.length > 0)
    throw new Error(
      `Cannot deactivate "${mat?.name}": referenced in Draft D-${String(openPO[0].po_number).padStart(4, "0")}. Complete or delete that PO first.`
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
  }>
): Promise<{ imported: number; skipped: number; skippedInactive: number }> {
  if (rows.length === 0) return { imported: 0, skipped: 0, skippedInactive: 0 };

  const existing = await db.select({ name: materials.name, is_active: materials.is_active }).from(materials);
  const existingActiveNames = new Set(existing.filter(m => m.is_active).map((m) => m.name.trim().toUpperCase()));
  const existingInactiveNames = new Set(existing.filter(m => !m.is_active).map((m) => m.name.trim().toUpperCase()));

  let skipped = 0;
  let skippedInactive = 0;
  const batchSeen = new Set<string>();

  // trim() matters: this action is exported and does not control its callers. The
  // import dialog happens to trim, but "MS SHEET " must collide with "MS SHEET"
  // regardless — that is the whole point of uq_materials_name_lower on lower(trim(name)).
  const toInsert = rows.filter((r) => {
    const key = r.name.trim().toUpperCase();
    if (existingActiveNames.has(key) || batchSeen.has(key)) { skipped++; return false; }
    if (existingInactiveNames.has(key)) { skippedInactive++; return false; }
    batchSeen.add(key);
    return true;
  });

  if (toInsert.length === 0) return { imported: 0, skipped, skippedInactive };

  // A single multi-row INSERT inside a transaction: any 23505 aborts the whole
  // statement, so a partial import is structurally impossible. Never commit the
  // good rows and report the rest.
  try {
    await db.transaction(async (tx) => {
      await tx.insert(materials).values(
        toInsert.map((r) => ({
          name: r.name.trim().toUpperCase(),
          hsn_code: r.hsn_code || null,
          tax_rate_id: r.tax_rate_id || null,
          purchase_unit_id: r.purchase_unit_id,
          opening_stock: r.opening_stock || "0",
          current_stock: r.opening_stock || "0",
        }))
      );
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new Error(
        "Import cancelled — one or more material names already exist. Nothing was imported."
      );
    }
    throw e;
  }

  revalidateTag(CACHE_TAGS.materials);
  return { imported: toInsert.length, skipped, skippedInactive };
}
