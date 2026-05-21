"use server";

import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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
  await db.update(customers).set({ is_active: false }).where(eq(customers.id, id));
  revalidatePath("/masters/customers");
}

export async function reactivateCustomer(id: string) {
  await db.update(customers).set({ is_active: true }).where(eq(customers.id, id));
  revalidatePath("/masters/customers");
}
