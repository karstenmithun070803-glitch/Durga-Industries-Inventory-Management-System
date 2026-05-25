export const dynamic = "force-dynamic";

import { getInvoices } from "@/lib/actions/invoices.actions";
import { getCompanySettings } from "@/lib/actions/settings.actions";
import { getCurrentFY } from "@/lib/fy";
import { InvoiceListClient } from "./invoice-list-client";

export default async function InvoicesPage() {
  const fy = getCurrentFY();
  const [rows, companySetting] = await Promise.all([getInvoices(fy), getCompanySettings()]);
  return <InvoiceListClient rows={rows} fy={fy} companySetting={companySetting} />;
}
