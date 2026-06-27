export const dynamic = "force-dynamic";

import { getCurrentFY } from "@/lib/fy";
import {
  getActiveVehicles,
  getActiveContractors,
  getActiveIssueMaterials,
  getActiveSalesUnits,
  getVehicleIssueDatesForFY,
} from "@/lib/actions/material-issues.actions";
import { getStagesForDropdown } from "@/lib/actions/stages.actions";
import { getAllTaxRates } from "@/lib/actions/tax.actions";
import { getCompanySettings } from "@/lib/actions/settings.actions";
import { getCustomers } from "@/lib/actions/customers.actions";
import { NewVMIClient } from "./new-vmi-client";

export default async function NewVMIPage({
  searchParams,
}: {
  searchParams: Promise<{ vehicleId?: string }>;
}) {
  const fy = getCurrentFY();
  const { vehicleId } = await searchParams;

  const [vehicles, customers, stages, contractors, materials, taxRates, units, companySetting, vehicleIssueDates] =
    await Promise.all([
      getActiveVehicles(),
      getCustomers(),
      getStagesForDropdown(),
      getActiveContractors(),
      getActiveIssueMaterials(),
      getAllTaxRates(),
      getActiveSalesUnits(),
      getCompanySettings(),
      getVehicleIssueDatesForFY(fy, "NEW"),
    ]);

  return (
    <NewVMIClient
      vehicles={vehicles}
      customers={customers}
      stages={stages}
      contractors={contractors}
      materials={materials}
      taxRates={taxRates as { id: string; tax_percentage: string }[]}
      units={units}
      companySetting={companySetting ?? undefined}
      initialVehicleId={vehicleId}
      initialFY={fy}
      initialVehicleIssueDates={vehicleIssueDates}
    />
  );
}
