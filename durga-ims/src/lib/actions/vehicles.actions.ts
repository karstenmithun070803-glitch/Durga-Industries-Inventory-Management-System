"use server";

import { unstable_cache, revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache";
import { db } from "@/lib/db";
import { vehicles, customers, materialIssues, invoices } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentFY } from "@/lib/fy";

const vehicleSelect = {
  id: vehicles.id,
  job_ref_no: vehicles.job_ref_no,
  vehicle_name: vehicles.vehicle_name,
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

export async function createVehicle(data: {
  job_ref_no: string;
  vehicle_name?: string;
  type: string;
  customer_id?: string;
}) {
  if (!data.job_ref_no.trim()) throw new Error("Job number is required.");
  try {
    await db.insert(vehicles).values({
      job_ref_no: data.job_ref_no.trim(),
      vehicle_name: data.vehicle_name?.trim().toUpperCase() || null,
      type: data.type || "New",
      customer_id: data.customer_id || null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("vehicles_job_ref_no_unique"))
      throw new Error(`Job number "${data.job_ref_no.trim()}" already exists. Choose a different number.`);
    throw e;
  }
  revalidateTag(CACHE_TAGS.vehicles);
}

export async function updateVehicle(id: string, data: {
  job_ref_no: string;
  vehicle_name?: string;
  type: string;
  customer_id?: string;
}) {
  if (!data.job_ref_no.trim()) throw new Error("Job number is required.");
  try {
    await db.update(vehicles).set({
      job_ref_no: data.job_ref_no.trim(),
      vehicle_name: data.vehicle_name?.trim().toUpperCase() || null,
      type: data.type,
      customer_id: data.customer_id || null,
    }).where(eq(vehicles.id, id));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("vehicles_job_ref_no_unique"))
      throw new Error(`Job number "${data.job_ref_no.trim()}" already exists. Choose a different number.`);
    throw e;
  }
  revalidateTag(CACHE_TAGS.vehicles);
}

export async function deleteVehicle(id: string, force = false) {
  const [veh] = await db.select({ vehicle_name: vehicles.vehicle_name }).from(vehicles).where(eq(vehicles.id, id));

  if (!force) {
    // Soft warning: vehicle has material issue records in the current FY
    // Caller catches this, shows a confirmation dialog, then calls deleteVehicle(id, true)
    const currentFY = getCurrentFY();
    const currentFYIssue = await db
      .select({ id: materialIssues.id })
      .from(materialIssues)
      .where(and(eq(materialIssues.vehicle_id, id), eq(materialIssues.financial_year, currentFY)))
      .limit(1);
    if (currentFYIssue.length > 0) {
      throw new Error(
        `WARN:This vehicle has material issue records in FY ${currentFY}. Deactivating will hide it from new issue forms.`
      );
    }
  }

  const draftInvoice = await db
    .select({ bill_number: invoices.bill_number })
    .from(invoices)
    .where(and(eq(invoices.vehicle_id, id), eq(invoices.status, "Draft")))
    .limit(1);
  if (draftInvoice.length > 0)
    throw new Error(
      `Cannot deactivate "${veh?.vehicle_name ?? "this vehicle"}": has a Draft invoice ${draftInvoice[0].bill_number}. Finalize or delete it first.`
    );

  const finalizedInvoice = await db
    .select({ bill_number: invoices.bill_number })
    .from(invoices)
    .where(and(eq(invoices.vehicle_id, id), eq(invoices.status, "Finalized")))
    .limit(1);
  if (finalizedInvoice.length > 0)
    throw new Error(
      `Cannot deactivate "${veh?.vehicle_name ?? "this vehicle"}": has a Finalized invoice ${finalizedInvoice[0].bill_number}. Finalized invoices are permanent GST records.`
    );

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
    vehicle_name: string;
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
        job_ref_no: r.job_ref_no,
        vehicle_name: r.vehicle_name,
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
  vehicle_name?: string;
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
          job_ref_no: data.job_ref_no.trim(),
          vehicle_name: data.vehicle_name?.trim().toUpperCase() || null,
          type: data.type,
          customer_id: customerId,
        })
        .returning({ id: vehicles.id });
      vehicleId = newVehicle.id;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("vehicles_job_ref_no_unique"))
        throw new Error(`DUPLICATE_JOB_REF:Job number "${data.job_ref_no.trim()}" already exists.`);
      throw e;
    }

    revalidateTag(CACHE_TAGS.vehicles);
    revalidateTag(CACHE_TAGS.customers);
    return { vehicleId, customerId };
  });
}
