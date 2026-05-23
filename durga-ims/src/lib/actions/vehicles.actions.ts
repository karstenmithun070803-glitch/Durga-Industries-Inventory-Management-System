"use server";

import { db } from "@/lib/db";
import { vehicles, customers, materialIssues, invoices } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

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

export async function getVehicles() {
  return db
    .select(vehicleSelect)
    .from(vehicles)
    .leftJoin(customers, eq(vehicles.customer_id, customers.id))
    .where(eq(vehicles.is_active, true))
    .orderBy(vehicles.job_ref_no);
}

export async function getAllVehicles() {
  return db
    .select(vehicleSelect)
    .from(vehicles)
    .leftJoin(customers, eq(vehicles.customer_id, customers.id))
    .orderBy(vehicles.job_ref_no);
}

export async function createVehicle(data: {
  vehicle_name: string;
  type: string;
  customer_id?: string;
}) {
  if (!data.vehicle_name.trim()) throw new Error("Vehicle name is required");
  await db.insert(vehicles).values({
    vehicle_name: data.vehicle_name.trim().toUpperCase(),
    type: data.type || "New",
    customer_id: data.customer_id || null,
  });
  revalidatePath("/masters/vehicles");
}

export async function updateVehicle(id: string, data: {
  vehicle_name: string;
  type: string;
  customer_id?: string;
}) {
  await db.update(vehicles).set({
    vehicle_name: data.vehicle_name.trim().toUpperCase(),
    type: data.type,
    customer_id: data.customer_id || null,
  }).where(eq(vehicles.id, id));
  revalidatePath("/masters/vehicles");
}

export async function deleteVehicle(id: string) {
  // Guard: block if referenced in any Draft issue slip
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

  // Guard: block if referenced in any Draft invoice
  const draftInvoice = await db
    .select({ bill_number: invoices.bill_number })
    .from(invoices)
    .where(and(eq(invoices.vehicle_id, id), eq(invoices.status, "Draft")))
    .limit(1);
  if (draftInvoice.length > 0)
    throw new Error(
      `Cannot deactivate "${veh?.vehicle_name ?? "this vehicle"}": has a Draft invoice ${draftInvoice[0].bill_number}. Finalize or delete it first.`
    );

  await db.update(vehicles).set({ is_active: false }).where(eq(vehicles.id, id));
  revalidatePath("/masters/vehicles");
}

export async function reactivateVehicle(id: string) {
  await db.update(vehicles).set({ is_active: true }).where(eq(vehicles.id, id));
  revalidatePath("/masters/vehicles");
}
