export const dynamic = "force-dynamic";

import { getInvoices } from "@/lib/actions/invoices.actions";
import { getCompanySettings } from "@/lib/actions/settings.actions";
import { getCurrentFinancialYear } from "@/types";
import { InvoiceListClient } from "./invoice-list-client";

export default async function InvoicesPage() {
  const fy = getCurrentFinancialYear();
  const [rows, companySetting] = await Promise.all([getInvoices(fy), getCompanySettings()]);
  return <InvoiceListClient rows={rows} fy={fy} companySetting={companySetting} />;
}
