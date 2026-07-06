export const dynamic = "force-dynamic";

import { getAllMaterials } from "@/lib/actions/materials.actions";
import { getAllTaxRates } from "@/lib/actions/tax.actions";
import { getAllUnits } from "@/lib/actions/units.actions";
import { MaterialsClient } from "./materials-client";

export default async function MaterialsPage() {
  const [materials, taxRates, units] = await Promise.all([
    getAllMaterials(),
    getAllTaxRates(),
    getAllUnits(),
  ]);
  return <MaterialsClient materials={materials} taxRates={taxRates} units={units} />;
}