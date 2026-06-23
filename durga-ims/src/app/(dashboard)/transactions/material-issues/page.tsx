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
import { MaterialIssuesClient } from "./material-issues-client";

export default async function MaterialIssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const fy = getCurrentFY();
  const { id } = await searchParams;

  const [vehicles, contractors, materials, taxRates, units, companySetting] =
    await Promise.all([
      getActiveVehicles(),
      getActiveContractors(),
      getActiveIssueMaterials(),
      getAllTaxRates(),
      getActiveSalesUnits(),
      getCompanySettings(),
    ]);

  return (
    <MaterialIssuesClient
      vehicles={vehicles}
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
