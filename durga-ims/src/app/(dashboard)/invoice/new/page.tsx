export const dynamic = "force-dynamic";

import { getActiveVehiclesForInvoice, getActiveInvoiceMaterials } from "@/lib/actions/invoices.actions";
import { getUnits } from "@/lib/actions/units.actions";
import { getCompanySettings } from "@/lib/actions/settings.actions";
import { InvoiceForm } from "../invoice-form";

export default async function NewInvoicePage() {
  const [vehicles, materials, units, companySetting] = await Promise.all([
    getActiveVehiclesForInvoice(),
    getActiveInvoiceMaterials(),
    getUnits(),
    getCompanySettings(),
  ]);

  return (
    <InvoiceForm
      mode="new"
      vehicles={vehicles}
      materials={materials}
      units={units}
      companySetting={companySetting}
    />
  );
}
