export const dynamic = "force-dynamic";

import { getAllMaterials } from "@/lib/actions/materials.actions";
import { getAllTaxRates } from "@/lib/actions/tax.actions";
import { getAllUnits } from "@/lib/actions/units.actions";
import { isAdmin } from "@/lib/auth";
import { MaterialsClient } from "./materials-client";

export default async function MaterialsPage() {
  const [materials, taxRates, units, admin] = await Promise.all([
    getAllMaterials(),
    getAllTaxRates(),
    getAllUnits(),
    isAdmin(),
  ]);
  return <MaterialsClient materials={materials} taxRates={taxRates} units={units} isAdmin={admin} />;
}