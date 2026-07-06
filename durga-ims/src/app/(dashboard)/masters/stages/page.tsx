export const dynamic = "force-dynamic";

import { getStagesWithMaterials } from "@/lib/actions/stages.actions";
import { getActiveMaterials, getActiveUnits } from "@/lib/actions/purchase-orders.actions";
import { StagesClient } from "./stages-client";

export default async function StagesPage() {
  const [stagesData, materialsData, unitsData] = await Promise.all([
    getStagesWithMaterials(),
    getActiveMaterials(),
    getActiveUnits(),
  ]);

  return (
    <StagesClient stages={stagesData} materials={materialsData} units={unitsData} />
  );
}