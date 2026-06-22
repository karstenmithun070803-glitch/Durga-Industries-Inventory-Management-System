export const dynamic = "force-dynamic";

import { getPOsForDropdown, getActiveSuppliers, getActiveMaterials, getActiveUnits } from "@/lib/actions/purchase-orders.actions";
import { getAllTaxRates } from "@/lib/actions/tax.actions";
import { getCompanySettings } from "@/lib/actions/settings.actions";
import { getCurrentFY } from "@/lib/fy";
import { PurchaseOrdersClient } from "./purchase-orders-client";

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<{ id?: string }>;
}) {
  const fy = getCurrentFY();
  const params = await searchParams;
  const initialSelectedId = params?.id;

  const [dropdownItems, suppliers, materials, taxRates, units, companySetting] =
    await Promise.all([
      getPOsForDropdown(fy),
      getActiveSuppliers(),
      getActiveMaterials(),
      getAllTaxRates(),
      getActiveUnits(),
      getCompanySettings(),
    ]);

  return (
    <PurchaseOrdersClient
      dropdownItems={dropdownItems}
      suppliers={suppliers}
      materials={materials}
      taxRates={taxRates as { id: string; tax_percentage: string }[]}
      units={units}
      companySetting={companySetting ?? undefined}
      initialFY={fy}
      initialSelectedId={initialSelectedId}
    />
  );
}
