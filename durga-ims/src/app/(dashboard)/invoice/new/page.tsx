export const dynamic = "force-dynamic";

import { getActiveVehiclesForInvoice, getActiveTaxRatesWithPrefix, getActiveInvoiceMaterials } from "@/lib/actions/invoices.actions";
import { getUnits } from "@/lib/actions/units.actions";
import { getCompanySettings } from "@/lib/actions/settings.actions";
import { InvoiceForm } from "../invoice-form";

export default async function NewInvoicePage() {
  const [vehicles, taxRates, materials, units, companySetting] = await Promise.all([
    getActiveVehiclesForInvoice(),
    getActiveTaxRatesWithPrefix(),
    getActiveInvoiceMaterials(),
    getUnits(),
    getCompanySettings(),
  ]);

  return (
    <InvoiceForm
      mode="new"
      vehicles={vehicles}
      taxRates={taxRates}
      materials={materials}
      units={units}
      companySetting={companySetting}
    />
  );
}
