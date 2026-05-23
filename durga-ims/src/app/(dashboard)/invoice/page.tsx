export const dynamic = "force-dynamic";

import { getInvoices } from "@/lib/actions/invoices.actions";
import { getCurrentFinancialYear } from "@/types";
import { InvoiceListClient } from "./invoice-list-client";

export default async function InvoicesPage() {
  const fy = getCurrentFinancialYear();
  const rows = await getInvoices(fy);
  return <InvoiceListClient rows={rows} fy={fy} />;
}
