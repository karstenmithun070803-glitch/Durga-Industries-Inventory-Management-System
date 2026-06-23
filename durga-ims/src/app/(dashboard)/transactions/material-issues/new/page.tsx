export const dynamic = "force-dynamic";

import { getCurrentFY } from "@/lib/fy";
import {
  getActiveVehicles,
  getActiveContractors,
  getActiveIssueMaterials,
  getActiveSalesUnits,
} from "@/lib/actions/material-issues.actions";
import { getStagesForDropdown } from "@/lib/actions/stages.actions";
import { getAllTaxRates } from "@/lib/actions/tax.actions";
import { getCompanySettings } from "@/lib/actions/settings.actions";
import { NewVMIClient } from "./new-vmi-client";

export default async function NewVMIPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const fy = getCurrentFY();
  const { id } = await searchParams;

  const [vehicles, stages, contractors, materials, taxRates, units, companySetting] =
    await Promise.all([
      getActiveVehicles(),
      getStagesForDropdown(),
      getActiveContractors(),
      getActiveIssueMaterials(),
      getAllTaxRates(),
      getActiveSalesUnits(),
      getCompanySettings(),
    ]);

  return (
    <NewVMIClient
      vehicles={vehicles}
      stages={stages}
      contractors={contractors}
      materials={materials}
      taxRates={taxRates as { id: string; tax_percentage: string }[]}
      units={units}
      companySetting={companySetting ?? undefined}
      initialSelectedId={id}
      initialFY={fy}
    />
  );
}
