"use server";

import { db } from "@/lib/db";
import { contractors, materialIssueItems, materialIssues } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getContractors() {
  return db.select().from(contractors).where(eq(contractors.is_active, true)).orderBy(contractors.code_no);
}

export async function getAllContractors() {
  return db.select().from(contractors).orderBy(contractors.code_no);
}

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
  revalidatePath("/masters/contractors");
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
  revalidatePath("/masters/contractors");
}

export async function deleteContractor(id: string) {
  // Guard: block if assigned to any Draft issue slip
  const [con] = await db.select({ name: contractors.name }).from(contractors).where(eq(contractors.id, id));
  const inUse = await db
    .select({ id: materialIssueItems.id })
    .from(materialIssueItems)
    .innerJoin(materialIssues, eq(materialIssueItems.issue_id, materialIssues.id))
    .where(
      and(
        eq(materialIssueItems.contractor_id, id),
        eq(materialIssues.status, "Draft")
      )
    )
    .limit(1);
  if (inUse.length > 0)
    throw new Error(
      `Cannot deactivate "${con?.name ?? "this contractor"}": assigned to a Draft issue slip. Complete or delete that slip first.`
    );

  await db.update(contractors).set({ is_active: false }).where(eq(contractors.id, id));
  revalidatePath("/masters/contractors");
}

export async function reactivateContractor(id: string) {
  await db.update(contractors).set({ is_active: true }).where(eq(contractors.id, id));
  revalidatePath("/masters/contractors");
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

  const toInsert = rows.filter((r) => !existingNames.has(r.name.toUpperCase()));
  const skipped = rows.length - toInsert.length;

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

  revalidatePath("/masters/contractors");
  return { imported: toInsert.length, skipped };
}
