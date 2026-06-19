"use server";

import { unstable_cache, revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache";
import { db } from "@/lib/db";
import { vehicles, customers, materialIssues, invoices } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

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

export async function deleteVehicle(id: string) {
  const [veh] = await db.select({ vehicle_name: vehicles.vehicle_name }).from(vehicles).where(eq(vehicles.id, id));
  const inUse = await db
    .select({ slip_number: materialIssues.slip_number })
    .from(materialIssues)
    .where(and(eq(materialIssues.vehicle_id, id), eq(materialIssues.status, "Draft")))
    .limit(1);
  if (inUse.length > 0)
    throw new Error(
      `Cannot deactivate "${veh?.vehicle_name ?? "this vehicle"}": referenced in a Draft issue slip. Complete or delete that slip first.`
    );

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

  const toInsert = rows.filter((r) => !existingRefs.has(r.job_ref_no.toUpperCase()));
  const skipped = rows.length - toInsert.length;

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
