import { getMaterials } from "@/lib/actions/materials.actions";
import { getTaxRates } from "@/lib/actions/tax.actions";
import { getUnits } from "@/lib/actions/units.actions";
import { MaterialsClient } from "./materials-client";

export default async function MaterialsPage() {
  const [materials, taxRates, units] = await Promise.all([
    getMaterials(),
    getTaxRates(),
    getUnits(),
  ]);
  return <MaterialsClient materials={materials} taxRates={taxRates} units={units} />;
}
