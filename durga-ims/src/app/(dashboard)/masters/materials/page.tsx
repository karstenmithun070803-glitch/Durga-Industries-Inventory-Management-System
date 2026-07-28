export const dynamic = "force-dynamic";

import { getMaterials } from "@/lib/actions/materials.actions";
import { getAllTaxRates } from "@/lib/actions/tax.actions";
import { getAllUnits } from "@/lib/actions/units.actions";
import { isAdmin } from "@/lib/auth";
import { MaterialsClient } from "./materials-client";

export default async function MaterialsPage() {
  // getMaterials = active only, so deleted/hidden materials leave the list. tax rates and
  // units stay full-list (getAll*) so a material referencing a hidden one still resolves it.
  const [materials, taxRates, units, admin] = await Promise.all([
    getMaterials(),
    getAllTaxRates(),
    getAllUnits(),
    isAdmin(),
  ]);
  return <MaterialsClient materials={materials} taxRates={taxRates} units={units} isAdmin={admin} />;
}