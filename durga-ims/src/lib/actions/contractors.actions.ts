"use server";

import { unstable_cache, revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache";
import { db } from "@/lib/db";
import { contractors, materialIssueItems } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { isForeignKeyViolation } from "@/lib/utils/pg-errors";

// True when any material-issue line still references this contractor — i.e. it has
// history and must be HIDDEN rather than physically deleted. Checks any status, not
// just the Draft subset the old soft-delete warning looked at.
async function contractorIsReferenced(id: string): Promise<boolean> {
  const rows = await db
    .select({ x: sql`1` })
    .from(materialIssueItems)
    .where(eq(materialIssueItems.contractor_id, id))
    .limit(1);
  return rows.length > 0;
}

// ─── Reads (cached) ──────────────────────────────────────────────────────────

export const getContractors = unstable_cache(
  async () => db.select().from(contractors).where(eq(contractors.is_active, true)).orderBy(contractors.code_no),
  ["active-contractors"],
  { tags: [CACHE_TAGS.contractors], revalidate: false }
);

export const getAllContractors = unstable_cache(
  async () => db.select().from(contractors).orderBy(contractors.code_no),
  ["all-contractors"],
  { tags: [CACHE_TAGS.contractors], revalidate: false }
);

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function createContractor(data: {
  name: string;
  role?: string;
  contact?: string;
}) {
  if (!data.name.trim()) throw new Error("Contractor name is required");
  await db.insert(contractors).values({
    name: data.name.trim(),
    role: data.role?.trim() || null,
    contact: data.contact?.trim() || null,
  });
  revalidateTag(CACHE_TAGS.contractors);
}

export async function updateContractor(
  id: string,
  data: { name: string; role?: string; contact?: string }
) {
  await db.update(contractors).set({
    name: data.name.trim(),
    role: data.role?.trim() || null,
    contact: data.contact?.trim() || null,
  }).where(eq(contractors.id, id));
  revalidateTag(CACHE_TAGS.contractors);
}

/**
 * Smart delete: physically remove the contractor when nothing references it, otherwise
 * HIDE it (is_active=false) so it leaves all lists/pickers while its material-issue history
 * keeps displaying correctly. To the user both outcomes look identical — the row vanishes.
 */
export async function deleteContractor(id: string) {
  const [con] = await db.select({ id: contractors.id }).from(contractors).where(eq(contractors.id, id));
  if (!con) return;

  // Unreferenced → physically delete. The FK check is the primary guard; the 23503 catch
  // is a backstop for a concurrent insert racing between the check and the delete. Run the
  // delete as a standalone statement (no explicit tx), so a failed delete never poisons the
  // fresh update below.
  if (!(await contractorIsReferenced(id))) {
    try {
      await db.delete(contractors).where(eq(contractors.id, id));
      revalidateTag(CACHE_TAGS.contractors);
      return;
    } catch (e) {
      if (!isForeignKeyViolation(e)) throw e;
      // fall through: a reference appeared → hide instead
    }
  }

  await db.update(contractors).set({ is_active: false }).where(eq(contractors.id, id));
  revalidateTag(CACHE_TAGS.contractors);
}

export async function reactivateContractor(id: string) {
  await db.update(contractors).set({ is_active: true }).where(eq(contractors.id, id));
  revalidateTag(CACHE_TAGS.contractors);
}

export async function bulkImportContractors(
  rows: Array<{
    name: string;
    role?: string | null;
    contact?: string | null;
  }>
): Promise<{ imported: number; skipped: number }> {
  if (rows.length === 0) return { imported: 0, skipped: 0 };

  const existing = await db.select({ name: contractors.name }).from(contractors);
  const existingNames = new Set(existing.map((c) => c.name.toUpperCase()));

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
    await tx.insert(contractors).values(
      toInsert.map((r) => ({
        name: r.name,
        role: r.role || null,
        contact: r.contact || null,
      }))
    );
  });

  revalidateTag(CACHE_TAGS.contractors);
  return { imported: toInsert.length, skipped };
}
