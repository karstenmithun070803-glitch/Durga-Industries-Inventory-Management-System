export const dynamic = "force-dynamic";

import {
  getInvoicesForDropdown,
  getActiveVehiclesForInvoice,
  getActiveTaxRatesWithPrefix,
  getActiveInvoiceMaterials,
} from "@/lib/actions/invoices.actions";
import { getActiveUnits } from "@/lib/actions/purchase-orders.actions";
import { getCompanySettings } from "@/lib/actions/settings.actions";
import { getCurrentFY } from "@/lib/fy";
import { InvoiceClient } from "./invoice-client";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams?: Promise<{ id?: string }>;
}) {
  const fy = getCurrentFY();
  const params = await searchParams;
  const initialSelectedId = params?.id;

  const [dropdownItems, vehicles, taxRates, materials, units, companySetting] =
    await Promise.all([
      getInvoicesForDropdown(fy),
      getActiveVehiclesForInvoice(),
      getActiveTaxRatesWithPrefix(),
      getActiveInvoiceMaterials(),
      getActiveUnits(),
      getCompanySettings(),
    ]);

  return (
    <InvoiceClient
      dropdownItems={dropdownItems}
      vehicles={vehicles}
      taxRates={taxRates}
      materials={materials}
      units={units}
      companySetting={companySetting ?? undefined}
      initialFY={fy}
      initialSelectedId={initialSelectedId}
    />
  );
}
