export const dynamic = "force-dynamic";

import { getTaxRates } from "@/lib/actions/tax.actions";
import { TaxClient } from "./tax-client";

export default async function TaxPage() {
  // getTaxRates = active only, so deleted/hidden tax rates leave the list.
  const taxRates = await getTaxRates();
  return <TaxClient taxRates={taxRates} />;
}