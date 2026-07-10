import { getMaterials } from "@/lib/actions/materials.actions";
import { getAllUnits } from "@/lib/actions/units.actions";
import { MaterialRatesClient } from "./material-rates-client";

// force-dynamic so a hard refresh always reads through to the DB. The pre-handover
// gate ("counter reads 0") depends on this being true, not a cached snapshot.
export const dynamic = "force-dynamic";

export default async function MaterialRatesPage() {
  // getMaterials(), not getAllMaterials(): active only. Inactive materials cannot be
  // purchased anyway, and rating a hidden row would be invisible to the admin.
  const [materials, units] = await Promise.all([getMaterials(), getAllUnits()]);

  return <MaterialRatesClient materials={materials} units={units} />;
}
