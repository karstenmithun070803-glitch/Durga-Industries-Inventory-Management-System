export const dynamic = "force-dynamic";

import { getCurrentFY } from "@/lib/fy";
import {
  getActiveVehicles,
  getActiveContractors,
  getActiveIssueMaterials,
  getActiveSalesUnits,
} from "@/lib/actions/material-issues.actions";
import { getAllTaxRates } from "@/lib/actions/tax.actions";
import { getCompanySettings } from "@/lib/actions/settings.actions";
import { getCustomers } from "@/lib/actions/customers.actions";
import { MaterialIssuesClient } from "./material-issues-client";

export default async function MaterialIssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ vehicleId?: string }>;
}) {
  const fy = getCurrentFY();
  const { vehicleId } = await searchParams;

  const [vehicles, customers, contractors, materials, taxRates, units, companySetting] =
    await Promise.all([
      getActiveVehicles(),
      getCustomers(),
      getActiveContractors(),
      getActiveIssueMaterials(),
      getAllTaxRates(),
      getActiveSalesUnits(),
      getCompanySettings(),
    ]);

  return (
    <MaterialIssuesClient
      vehicles={vehicles}
      customers={customers}
      contractors={contractors}
      materials={materials}
      taxRates={taxRates as { id: string; tax_percentage: string }[]}
      units={units}
      companySetting={companySetting ?? undefined}
      initialVehicleId={vehicleId}
      initialFY={fy}
    />
  );
}
