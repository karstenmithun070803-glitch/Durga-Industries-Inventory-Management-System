"use server";

import { db } from "@/lib/db";
import { vehicles, customers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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
  await db.update(vehicles).set({ is_active: false }).where(eq(vehicles.id, id));
  revalidatePath("/masters/vehicles");
}

export async function reactivateVehicle(id: string) {
  await db.update(vehicles).set({ is_active: true }).where(eq(vehicles.id, id));
  revalidatePath("/masters/vehicles");
}
