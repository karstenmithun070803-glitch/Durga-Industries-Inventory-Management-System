"use server";

import { unstable_cache, revalidateTag } from "next/cache";
import { cache } from "react";
import { CACHE_TAGS } from "@/lib/cache";
import { db } from "@/lib/db";
import { companySettings } from "@/lib/db/schema";

export interface CompanySetting {
  company_name: string;
  address: string | null;
  gstin: string | null;
  pan_no: string | null;
  tan_no: string | null;
  bank_name: string | null;
  bank_account_no: string | null;
  bank_ifsc: string | null;
  bank_branch: string | null;
  invoice_terms: string | null;
}

const DEFAULTS: CompanySetting = {
  company_name: "DURGA INDUSTRIES",
  address: "S.FNO.1994/2, MADURAI NEW BYE PASS RD, NEAR PERIYAR ARCH, KARUR - 639002",
  gstin: "33AALPU5476B1ZJ",
  pan_no: null,
  tan_no: null,
  bank_name: null,
  bank_account_no: null,
  bank_ifsc: null,
  bank_branch: null,
  invoice_terms: null,
};

// ─── Reads (cached) ──────────────────────────────────────────────────────────
// React.cache deduplicates within a single request; unstable_cache persists across requests.

export const getCompanySettings: () => Promise<CompanySetting> = cache(
  unstable_cache(
    async (): Promise<CompanySetting> => {
      const rows = await db.select().from(companySettings).limit(1);
      if (rows.length === 0) return DEFAULTS;
      const r = rows[0];
      return {
        company_name: r.company_name,
        address: r.address,
        gstin: r.gstin,
        pan_no: r.pan_no,
        tan_no: r.tan_no,
        bank_name: r.bank_name,
        bank_account_no: r.bank_account_no,
        bank_ifsc: r.bank_ifsc,
        bank_branch: r.bank_branch,
        invoice_terms: r.invoice_terms,
      };
    },
    ["company-settings"],
    { tags: [CACHE_TAGS.settings], revalidate: false }
  )
);

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function upsertCompanySettings(data: CompanySetting): Promise<void> {
  const existing = await db.select({ id: companySettings.id }).from(companySettings).limit(1);
  const values = {
    company_name: data.company_name,
    address: data.address,
    gstin: data.gstin,
    pan_no: data.pan_no,
    tan_no: data.tan_no,
    bank_name: data.bank_name,
    bank_account_no: data.bank_account_no,
    bank_ifsc: data.bank_ifsc,
    bank_branch: data.bank_branch,
    invoice_terms: data.invoice_terms,
    updated_at: new Date(),
  };
  if (existing.length > 0) {
    const { eq } = await import("drizzle-orm");
    await db.update(companySettings).set(values).where(eq(companySettings.id, existing[0].id));
  } else {
    await db.insert(companySettings).values(values);
  }
  revalidateTag(CACHE_TAGS.settings);
}
