"use server";

import { unstable_cache, revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache";
import { db } from "@/lib/db";
import { materials, materialIssueItems, purchaseOrderItems, purchaseOrders, invoiceItems, invoiceInsuranceItems, stockLedger, stageMaterials } from "@/lib/db/schema";
import { eq, and, ilike, ne, sql, desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { parseBaseRateInput, parseBufferInput } from "@/lib/utils/max-rate";
import { isUniqueViolation, isForeignKeyViolation } from "@/lib/utils/pg-errors";

// True when any row anywhere still references this material — i.e. it has history and
// must be HIDDEN rather than physically deleted. Covers every child table (any status),
// not just the Draft subset the old soft-delete warning checked. stock_ledger is
// append-only, so any material that ever moved stock lands here permanently.
async function materialIsReferenced(id: string): Promise<boolean> {
  const checks = [
    db.select({ x: sql`1` }).from(purchaseOrderItems).where(eq(purchaseOrderItems.material_id, id)).limit(1),
    db.select({ x: sql`1` }).from(materialIssueItems).where(eq(materialIssueItems.material_id, id)).limit(1),
    db.select({ x: sql`1` }).from(invoiceItems).where(eq(invoiceItems.material_id, id)).limit(1),
    db.select({ x: sql`1` }).from(invoiceInsuranceItems).where(eq(invoiceInsuranceItems.material_id, id)).limit(1),
    db.select({ x: sql`1` }).from(stockLedger).where(eq(stockLedger.material_id, id)).limit(1),
    db.select({ x: sql`1` }).from(stageMaterials).where(eq(stageMaterials.material_id, id)).limit(1),
  ];
  const results = await Promise.all(checks);
  return results.some((r) => r.length > 0);
}

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

/** Signals the client that a new name matched a hidden ("deleted") row it may restore (R5). */
export type CreateResult = { ok: true } | { hiddenCollision: { id: string; name: string } };

export async function createMaterial(data: {
  name: string;
  hsn_code?: string;
  tax_rate_id?: string;
  purchase_unit_id?: string;
  opening_stock?: string;
  opening_rate?: string;
}): Promise<CreateResult> {
  if (!data.name.trim()) throw new Error("Material name is required");
  if (!data.purchase_unit_id) throw new Error("Purchase unit is required.");
  if (Number(data.opening_stock ?? 0) < 0) throw new Error("Opening stock cannot be negative");
  if (data.opening_rate && parseFloat(data.opening_rate) < 0) throw new Error("Opening rate cannot be negative");

  // A hidden ("deleted") row still occupies the unique name index. Distinguish an active
  // duplicate (a real error) from a hidden one (offer to restore, R5): return a signal so
  // the client can ask the user instead of showing a raw "already exists" wall.
  const dups = await db.select({ id: materials.id, is_active: materials.is_active }).from(materials)
    .where(ilike(materials.name, data.name.trim()));
  if (dups.some((d) => d.is_active)) throw duplicateNameError(data.name);
  if (dups.length > 0) {
    return { hiddenCollision: { id: dups[0].id, name: data.name.trim().toUpperCase() } };
  }

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
  return { ok: true as const };
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

  // NOTE: explicit column list, deliberately. base_rate/buffer are absent, so an employee
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

// ─── Admin-only: purchase price band (base rate + buffer) ─────────────────────

/**
 * Batch-writes base_rate and buffer for many materials in one statement.
 *
 * Base and buffer validate under DIFFERENT rules (see max-rate.ts):
 *   - base: blank => NULL; must be > 0 (a 0 base collapses the band and blocks everything).
 *   - buffer: blank => NULL; must be >= 0 (0 is a legitimate "exact base only" policy).
 * A material is purchasable only when BOTH are set.
 */
export async function batchUpdateMaterialRates(
  updates: Array<{ id: string; base_rate: string | null; buffer: string | null }>
): Promise<void> {
  await requireAdmin();

  if (updates.length === 0) return; // UPDATE ... FROM (VALUES ) is invalid SQL

  const rows = updates.map((u) => ({
    id: u.id,
    base_rate: parseBaseRateInput(u.base_rate),
    buffer: parseBufferInput(u.buffer),
  }));

  // Every column is cast. materials.id is uuid, base_rate/buffer are numeric; an untyped
  // VALUES list infers text for all, so the join throws "operator does not exist:
  // uuid = text" and the numeric assignment throws 42804. This exact class of bug shipped
  // once before (current_stock::text against a numeric column).
  // Inside a transaction so the row-count check can roll the write back — throwing after a
  // bare db.execute() would leave the partial update committed.
  await db.transaction(async (tx) => {
    // RETURNING, not a driver rowcount: `.count` is not guaranteed to survive drizzle's
    // wrapper, and an undefined rowcount would silently disable the check below.
    const updated = await tx.execute<{ id: string }>(sql`
      UPDATE materials
      SET base_rate  = v.base_rate,
          buffer     = v.buffer,
          updated_at = NOW()
      FROM (VALUES ${sql.join(
        rows.map((r) => sql`(${r.id}::uuid, ${r.base_rate}::numeric, ${r.buffer}::numeric)`),
        sql`, `
      )}) AS v(id, base_rate, buffer)
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

// ─── Admin-only: price-deviation history ──────────────────────────────────────

export interface RateDeviationEntry {
  id: string;
  po_date: Date;
  po_number: number;
  po_rate: string;        // what was actually entered on the PO (excl GST)
  base_snapshot: string;  // the base rate frozen when that PO was saved
  deviation: string;      // po_rate − base_snapshot (signed)
}

/**
 * Every received purchase of `materialId` whose entered rate differed from the base rate
 * frozen at save time — the admin's "did we buy off the agreed price?" log. Deviation is
 * computed in SQL as a numeric so 400.0000 vs 400 is not a false positive. Admin-only:
 * the server action self-guards; the page gate is cosmetic.
 */
export async function getRateDeviationHistory(
  materialId: string,
  limit = 100
): Promise<RateDeviationEntry[]> {
  await requireAdmin();
  return db
    .select({
      id: purchaseOrderItems.id,
      po_date: purchaseOrders.po_date,
      po_number: purchaseOrders.po_number,
      po_rate: purchaseOrderItems.rate,
      base_snapshot: sql<string>`${purchaseOrderItems.base_rate_snapshot}`,
      deviation: sql<string>`(${purchaseOrderItems.rate} - ${purchaseOrderItems.base_rate_snapshot})`,
    })
    .from(purchaseOrderItems)
    .innerJoin(purchaseOrders, eq(purchaseOrderItems.po_id, purchaseOrders.id))
    .where(
      and(
        eq(purchaseOrderItems.material_id, materialId),
        eq(purchaseOrders.status, "Received"),
        sql`${purchaseOrderItems.base_rate_snapshot} IS NOT NULL`,
        sql`${purchaseOrderItems.rate} <> ${purchaseOrderItems.base_rate_snapshot}`,
      )
    )
    .orderBy(desc(purchaseOrders.po_date), desc(purchaseOrders.po_number))
    .limit(limit);
}

/**
 * The set of material ids that have ≥1 off-base received purchase — drives the
 * "Only changed prices" filter without a per-row query. Admin-only.
 */
export async function getMaterialsWithDeviations(): Promise<string[]> {
  await requireAdmin();
  const rows = await db
    .selectDistinct({ material_id: purchaseOrderItems.material_id })
    .from(purchaseOrderItems)
    .innerJoin(purchaseOrders, eq(purchaseOrderItems.po_id, purchaseOrders.id))
    .where(
      and(
        eq(purchaseOrders.status, "Received"),
        sql`${purchaseOrderItems.base_rate_snapshot} IS NOT NULL`,
        sql`${purchaseOrderItems.rate} <> ${purchaseOrderItems.base_rate_snapshot}`,
      )
    );
  return rows.map((r) => r.material_id);
}

/**
 * Smart delete: physically remove the material when nothing references it, otherwise
 * HIDE it (is_active=false) so it leaves all lists/pickers while its transaction history
 * keeps displaying correctly. To the user both outcomes look identical — the row vanishes.
 */
export async function deleteMaterial(id: string) {
  const [mat] = await db
    .select({ name: materials.name, current_stock: materials.current_stock })
    .from(materials)
    .where(eq(materials.id, id));
  if (!mat) return;

  // Stock guard survives the switch to hard delete: a material still carrying stock must
  // be brought to zero first, else deleting/hiding it would silently drop that stock value.
  if (parseFloat(mat.current_stock) > 0) {
    throw new Error(
      `Cannot delete "${mat.name}": current stock is ${parseFloat(mat.current_stock).toFixed(2)}. Bring stock to zero first.`
    );
  }

  // Unreferenced → physically delete. The FK check is the primary guard; the 23503 catch
  // is a backstop for a concurrent insert racing between the check and the delete. Run the
  // delete as a standalone statement (no explicit tx), so a failed delete never poisons the
  // fresh update below.
  if (!(await materialIsReferenced(id))) {
    try {
      await db.delete(materials).where(eq(materials.id, id));
      revalidateTag(CACHE_TAGS.materials);
      return;
    } catch (e) {
      if (!isForeignKeyViolation(e)) throw e;
      // fall through: a reference appeared → hide instead
    }
  }

  await db.update(materials).set({ is_active: false }).where(eq(materials.id, id));
  revalidateTag(CACHE_TAGS.materials);
}

/**
 * Restore a hidden material and overwrite it with fresh values. Called from the create
 * flow when a new name collides with a hidden ("deleted") row: rather than error, the
 * user chooses to bring that record back — its transaction history reattaches.
 */
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
