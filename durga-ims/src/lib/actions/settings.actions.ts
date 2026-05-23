"use server";

import { db } from "@/lib/db";
import { companySettings } from "@/lib/db/schema";
import { revalidatePath } from "next/cache";

export interface CompanySetting {
  company_name: string;
  address: string | null;
  gstin: string | null;
}

export async function getCompanySettings(): Promise<CompanySetting> {
  const rows = await db.select().from(companySettings).limit(1);
  if (rows.length === 0) {
    return {
      company_name: "DURGA INDUSTRIES",
      address: "S.FNO.1994/2, MADURAI NEW BYE PASS RD, NEAR PERIYAR ARCH, KARUR - 639002",
      gstin: "33AALPU5476B1ZJ",
    };
  }
  return { company_name: rows[0].company_name, address: rows[0].address, gstin: rows[0].gstin };
}

export async function upsertCompanySettings(data: CompanySetting): Promise<void> {
  const existing = await db.select({ id: companySettings.id }).from(companySettings).limit(1);
  if (existing.length > 0) {
    const { eq } = await import("drizzle-orm");
    await db
      .update(companySettings)
      .set({ company_name: data.company_name, address: data.address, gstin: data.gstin, updated_at: new Date() })
      .where(eq(companySettings.id, existing[0].id));
  } else {
    await db.insert(companySettings).values({
      company_name: data.company_name,
      address: data.address,
      gstin: data.gstin,
    });
  }
  revalidatePath("/settings");
}
