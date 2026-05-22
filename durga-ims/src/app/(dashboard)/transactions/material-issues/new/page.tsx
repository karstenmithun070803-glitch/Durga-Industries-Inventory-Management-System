export const dynamic = "force-dynamic";
import { getCurrentFinancialYear } from "@/types";
import {
  getActiveVehicles,
  getActiveContractors,
  getActiveIssueMaterials,
  getActiveSalesUnits,
  peekNextSlipNumber,
} from "@/lib/actions/material-issues.actions";
import { getAllTaxRates } from "@/lib/actions/tax.actions";
import { MaterialIssueForm } from "../material-issue-form";

export default async function NewMaterialIssuePage() {
  const fy = getCurrentFinancialYear();
  const [vehicles, contractors, materials, units, taxRates, nextSlipNumber] = await Promise.all([
    getActiveVehicles(),
    getActiveContractors(),
    getActiveIssueMaterials(),
    getActiveSalesUnits(),
    getAllTaxRates(),
    peekNextSlipNumber(fy),
  ]);

  return (
    <MaterialIssueForm
      mode="new"
      nextSlipNumber={nextSlipNumber}
      vehicles={vehicles}
      contractors={contractors}
      materials={materials}
      taxRates={taxRates as { id: string; tax_percentage: string }[]}
      units={units}
    />
  );
}
