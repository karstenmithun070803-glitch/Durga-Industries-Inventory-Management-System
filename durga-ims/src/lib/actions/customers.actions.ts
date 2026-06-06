"use server";

import { unstable_cache, revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache";
import { db } from "@/lib/db";
import { customers, vehicles } from "@/lib/db/schema";
import { eq, and, count } from "drizzle-orm";

// ─── Reads (cached) ──────────────────────────────────────────────────────────

export const getCustomers = unstable_cache(
  async () => db.select().from(customers).where(eq(customers.is_active, true)).orderBy(customers.customer_no),
  ["active-customers"],
  { tags: [CACHE_TAGS.customers], revalidate: false }
);

export const getAllCustomers = unstable_cache(
  async () => db.select().from(customers).orderBy(customers.customer_no),
  ["all-customers"],
  { tags: [CACHE_TAGS.customers], revalidate: false }
);

// ─── Mutations ───────────────────────────────────────────────────────────────

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
  revalidateTag(CACHE_TAGS.customers);
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
  revalidateTag(CACHE_TAGS.customers);
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
  revalidateTag(CACHE_TAGS.customers);
}

export async function reactivateCustomer(id: string) {
  await db.update(customers).set({ is_active: true }).where(eq(customers.id, id));
  revalidateTag(CACHE_TAGS.customers);
}

export async function bulkImportCustomers(
  rows: Array<{
    customer_name: string;
    address_1?: string | null;
    address_2?: string | null;
    street?: string | null;
    city?: string | null;
    state?: string | null;
    gstin?: string | null;
  }>
): Promise<{ imported: number; skipped: number }> {
  if (rows.length === 0) return { imported: 0, skipped: 0 };

  const existing = await db.select({ customer_name: customers.customer_name }).from(customers);
  const existingNames = new Set(existing.map((c) => c.customer_name.toUpperCase()));

  const toInsert = rows.filter((r) => !existingNames.has(r.customer_name.toUpperCase()));
  const skipped = rows.length - toInsert.length;

  if (toInsert.length === 0) return { imported: 0, skipped };

  await db.transaction(async (tx) => {
    await tx.insert(customers).values(
      toInsert.map((r) => ({
        customer_name: r.customer_name,
        address_1: r.address_1 || null,
        address_2: r.address_2 || null,
        street: r.street || null,
        city: r.city || null,
        state: r.state || null,
        gstin: r.gstin || null,
      }))
    );
  });

  revalidateTag(CACHE_TAGS.customers);
  return { imported: toInsert.length, skipped };
}
