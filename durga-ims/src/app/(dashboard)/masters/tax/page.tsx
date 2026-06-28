import { getAllTaxRates } from "@/lib/actions/tax.actions";
import { TaxClient } from "./tax-client";

export default async function TaxPage() {
  const taxRates = await getAllTaxRates();
  return <TaxClient taxRates={taxRates} />;
}
