import { getTaxRates } from "@/lib/actions/tax.actions";
import { TaxClient } from "./tax-client";

export default async function TaxPage() {
  const taxRates = await getTaxRates();
  return <TaxClient taxRates={taxRates} />;
}
