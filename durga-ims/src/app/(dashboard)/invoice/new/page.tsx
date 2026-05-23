export const dynamic = "force-dynamic";

import { getActiveVehiclesForInvoice, getActiveTaxRatesWithPrefix, getActiveInvoiceMaterials } from "@/lib/actions/invoices.actions";
import { getCurrentFinancialYear } from "@/types";
import { InvoiceForm } from "../invoice-form";

export default async function NewInvoicePage() {
  const fy = getCurrentFinancialYear();
  const [vehicles, taxRates, materials] = await Promise.all([
    getActiveVehiclesForInvoice(),
    getActiveTaxRatesWithPrefix(),
    getActiveInvoiceMaterials(),
  ]);

  return (
    <InvoiceForm
      mode="new"
      vehicles={vehicles}
      taxRates={taxRates}
      materials={materials}
      units={[]}
    />
  );
}
