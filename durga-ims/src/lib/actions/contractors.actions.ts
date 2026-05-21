"use server";

import { db } from "@/lib/db";
import { contractors } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getContractors() {
  return db.select().from(contractors).where(eq(contractors.is_active, true)).orderBy(contractors.code_no);
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
  await db.update(contractors).set({ is_active: false }).where(eq(contractors.id, id));
  revalidatePath("/masters/contractors");
}
