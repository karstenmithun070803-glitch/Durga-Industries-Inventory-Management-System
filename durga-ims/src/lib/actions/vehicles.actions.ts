"use server";

import { unstable_cache, revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache";
import { db } from "@/lib/db";
import { vehicles, customers, materialIssues, invoices } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { isForeignKeyViolation } from "@/lib/utils/pg-errors";

// True when any row anywhere still references this vehicle — i.e. it has history and
// must be HIDDEN rather than physically deleted. Covers both child tables at ANY status
// (a Finalized invoice counts just as much as a Draft one).
async function vehicleIsReferenced(id: string): Promise<boolean> {
  const checks = [
    db.select({ x: sql`1` }).from(materialIssues).where(eq(materialIssues.vehicle_id, id)).limit(1),
    db.select({ x: sql`1` }).from(invoices).where(eq(invoices.vehicle_id, id)).limit(1),
  ];
  const results = await Promise.all(checks);
  return results.some((r) => r.length > 0);
}

const vehicleSelect = {
  id: vehicles.id,
  job_ref_no: vehicles.job_ref_no,
  type: vehicles.type,
  customer_id: vehicles.customer_id,
  customer_name: customers.customer_name,
  is_active: vehicles.is_active,
  created_at: vehicles.created_at,
  updated_at: vehicles.updated_at,
};

// ─── Reads (cached) ──────────────────────────────────────────────────────────

export const getVehicles = unstable_cache(
  async () =>
    db
      .select(vehicleSelect)
      .from(vehicles)
      .leftJoin(customers, eq(vehicles.customer_id, customers.id))
      .where(eq(vehicles.is_active, true))
      .orderBy(vehicles.job_ref_no),
  ["active-vehicles"],
  { tags: [CACHE_TAGS.vehicles], revalidate: false }
);

export const getAllVehicles = unstable_cache(
  async () =>
    db
      .select(vehicleSelect)
      .from(vehicles)
      .leftJoin(customers, eq(vehicles.customer_id, customers.id))
      .orderBy(vehicles.job_ref_no),
  ["all-vehicles"],
  { tags: [CACHE_TAGS.vehicles], revalidate: false }
);

// ─── Mutations ───────────────────────────────────────────────────────────────

/** Signals the client that a new job_ref_no matched a hidden ("deleted") row it may restore (R5). */
export type CreateResult = { ok: true } | { hiddenCollision: { id: string; name: string } };

export async function createVehicle(data: {
  job_ref_no: string;
  type: string;
  customer_id?: string;
}): Promise<CreateResult> {
  if (!data.job_ref_no.trim()) throw new Error("Job No / Reg No is required.");

  // A hidden ("deleted") row still occupies the unique job_ref_no index. Distinguish an
  // active duplicate (a real error) from a hidden one (offer to restore, R5): return a
  // signal so the client can ask the user instead of showing a raw "already exists" wall.
  const key = data.job_ref_no.trim().toUpperCase();
  const dups = await db.select({ id: vehicles.id, is_active: vehicles.is_active }).from(vehicles)
    .where(eq(vehicles.job_ref_no, key));
  if (dups.some((d) => d.is_active))
    throw new Error(`Job No / Reg No "${data.job_ref_no.trim()}" already exists. Choose a different number.`);
  if (dups.length > 0) {
    return { hiddenCollision: { id: dups[0].id, name: key } };
  }

  try {
    await db.insert(vehicles).values({
      job_ref_no: key,
      type: data.type || "New",
      customer_id: data.customer_id || null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("vehicles_job_ref_no_unique"))
      throw new Error(`Job No / Reg No "${data.job_ref_no.trim()}" already exists. Choose a different number.`);
    throw e;
  }
  revalidateTag(CACHE_TAGS.vehicles);
  return { ok: true as const };
}

export async function updateVehicle(id: string, data: {
  job_ref_no: string;
  type: string;
  customer_id?: string;
}) {
  if (!data.job_ref_no.trim()) throw new Error("Job No / Reg No is required.");
  try {
    await db.update(vehicles).set({
      job_ref_no: data.job_ref_no.trim().toUpperCase(),
      type: data.type,
      customer_id: data.customer_id || null,
    }).where(eq(vehicles.id, id));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("vehicles_job_ref_no_unique"))
      throw new Error(`Job No / Reg No "${data.job_ref_no.trim()}" already exists. Choose a different number.`);
    throw e;
  }
  revalidateTag(CACHE_TAGS.vehicles);
}

/**
 * Smart delete: physically remove the vehicle when nothing references it, otherwise
 * HIDE it (is_active=false) so it leaves all lists/pickers while its transaction history
 * keeps displaying correctly. To the user both outcomes look identical — the row vanishes.
 */
export async function deleteVehicle(id: string) {
  const [veh] = await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, id));
  if (!veh) return;

  // Unreferenced → physically delete. The reference check is the primary guard; the 23503
  // catch is a backstop for a concurrent insert racing between the check and the delete. Run
  // the delete as a standalone statement (no explicit tx), so a failed delete never poisons
  // the fresh update below.
  if (!(await vehicleIsReferenced(id))) {
    try {
      await db.delete(vehicles).where(eq(vehicles.id, id));
      revalidateTag(CACHE_TAGS.vehicles);
      return;
    } catch (e) {
      if (!isForeignKeyViolation(e)) throw e;
      // fall through: a reference appeared → hide instead
    }
  }

  await db.update(vehicles).set({ is_active: false }).where(eq(vehicles.id, id));
  revalidateTag(CACHE_TAGS.vehicles);
}

export async function reactivateVehicle(id: string) {
  await db.update(vehicles).set({ is_active: true }).where(eq(vehicles.id, id));
  revalidateTag(CACHE_TAGS.vehicles);
}

export async function bulkImportVehicles(
  rows: Array<{
    job_ref_no: string;
    type: string;
    customer_id?: string | null;
  }>
): Promise<{ imported: number; skipped: number }> {
  if (rows.length === 0) return { imported: 0, skipped: 0 };

  const existing = await db.select({ job_ref_no: vehicles.job_ref_no }).from(vehicles);
  const existingRefs = new Set(existing.map((v) => v.job_ref_no.toUpperCase()));

  let skipped = 0;
  const batchSeen = new Set<string>();
  const toInsert = rows.filter((r) => {
    const key = r.job_ref_no.toUpperCase();
    if (existingRefs.has(key) || batchSeen.has(key)) { skipped++; return false; }
    batchSeen.add(key);
    return true;
  });

  if (toInsert.length === 0) return { imported: 0, skipped };

  await db.transaction(async (tx) => {
    await tx.insert(vehicles).values(
      toInsert.map((r) => ({
        job_ref_no: r.job_ref_no.toUpperCase(),
        type: r.type,
        customer_id: r.customer_id || null,
      }))
    );
  });

  revalidateTag(CACHE_TAGS.vehicles);
  return { imported: toInsert.length, skipped };
}

// ---------------------------------------------------------------------------
// Create vehicle + customer atomically (used by CloneVehicleDialog)
// ---------------------------------------------------------------------------

export async function createVehicleWithCustomer(data: {
  job_ref_no: string;
  type: "Old" | "New";
  // Provide customer_id to use an existing customer, OR customer_name to create a new one
  customer_id?: string;
  customer_name?: string;
  customer_gstin?: string;
  customer_state?: string;
  customer_address_1?: string;
  customer_address_2?: string;
  customer_street?: string;
  customer_city?: string;
}): Promise<{ vehicleId: string; customerId: string | null }> {
  if (!data.job_ref_no.trim()) throw new Error("Job number is required.");
  if (!data.customer_id && !data.customer_name?.trim())
    throw new Error("Customer is required.");

  return await db.transaction(async (tx) => {
    let customerId: string | null = data.customer_id ?? null;

    if (!customerId && data.customer_name?.trim()) {
      const [newCustomer] = await tx
        .insert(customers)
        .values({
          customer_name: data.customer_name.trim(),
          gstin: data.customer_gstin?.trim().toUpperCase() || null,
          state: data.customer_state || null,
          address_1: data.customer_address_1?.trim() || null,
          address_2: data.customer_address_2?.trim() || null,
          street: data.customer_street?.trim() || null,
          city: data.customer_city?.trim() || null,
        })
        .returning({ id: customers.id });
      customerId = newCustomer.id;
    }

    let vehicleId: string;
    try {
      const [newVehicle] = await tx
        .insert(vehicles)
        .values({
          job_ref_no: data.job_ref_no.trim().toUpperCase(),
          type: data.type,
          customer_id: customerId,
        })
        .returning({ id: vehicles.id });
      vehicleId = newVehicle.id;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("vehicles_job_ref_no_unique"))
        throw new Error(`DUPLICATE_JOB_REF:Job No / Reg No "${data.job_ref_no.trim()}" already exists.`);
      throw e;
    }

    revalidateTag(CACHE_TAGS.vehicles);
    revalidateTag(CACHE_TAGS.customers);
    return { vehicleId, customerId };
  });
}
