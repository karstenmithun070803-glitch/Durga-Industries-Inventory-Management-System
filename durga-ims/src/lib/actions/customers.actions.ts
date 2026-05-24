"use server";

import { db } from "@/lib/db";
import { customers, vehicles } from "@/lib/db/schema";
import { eq, and, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getCustomers() {
  return db.select().from(customers).where(eq(customers.is_active, true)).orderBy(customers.customer_no);
}

export async function getAllCustomers() {
  return db.select().from(customers).orderBy(customers.customer_no);
}

export async function createCustomer(data: {
  customer_name: string;
  address_1?: string;
  address_2?: string;
  street?: string;
  city?: string;
  state?: string;
  gstin?: string;
}) {
  if (!data.customer_name.trim()) throw new Error("Customer name is required");
  await db.insert(customers).values({
    customer_name: data.customer_name.trim(),
    address_1: data.address_1?.trim() || null,
    address_2: data.address_2?.trim() || null,
    street: data.street?.trim() || null,
    city: data.city?.trim() || null,
    state: data.state || null,
    gstin: data.gstin?.trim().toUpperCase() || null,
  });
  revalidatePath("/masters/customers");
}

export async function updateCustomer(id: string, data: {
  customer_name: string;
  address_1?: string;
  address_2?: string;
  street?: string;
  city?: string;
  state?: string;
  gstin?: string;
}) {
  await db.update(customers).set({
    customer_name: data.customer_name.trim(),
    address_1: data.address_1?.trim() || null,
    address_2: data.address_2?.trim() || null,
    street: data.street?.trim() || null,
    city: data.city?.trim() || null,
    state: data.state || null,
    gstin: data.gstin?.trim().toUpperCase() || null,
  }).where(eq(customers.id, id));
  revalidatePath("/masters/customers");
}

export async function deleteCustomer(id: string) {
  const [{ activeVehicles }] = await db
    .select({ activeVehicles: count() })
    .from(vehicles)
    .where(and(eq(vehicles.customer_id, id), eq(vehicles.is_active, true)));

  if (activeVehicles > 0) {
    throw new Error(
      `Cannot deactivate — ${activeVehicles} active vehicle(s) are linked to this customer. Deactivate those vehicles first.`
    );
  }

  await db.update(customers).set({ is_active: false }).where(eq(customers.id, id));
  revalidatePath("/masters/customers");
}

export async function reactivateCustomer(id: string) {
  await db.update(customers).set({ is_active: true }).where(eq(customers.id, id));
  revalidatePath("/masters/customers");
}
