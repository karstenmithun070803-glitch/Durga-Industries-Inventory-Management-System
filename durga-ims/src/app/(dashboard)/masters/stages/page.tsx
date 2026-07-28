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

  // Smart delete hides (is_active=false) any stage that has history/template; the master
  // list shows ACTIVE stages only. The loader keeps returning every stage (with its material
  // template intact), so we filter here without disturbing that per-stage template data.
  const activeStages = stagesData.filter((s) => s.is_active);

  return (
    <StagesClient stages={activeStages} materials={materialsData} units={unitsData} />
  );
}