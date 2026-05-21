import { getUnits } from "@/lib/actions/units.actions";
import { UnitsClient } from "./units-client";

export default async function UnitsPage() {
  const units = await getUnits();
  return <UnitsClient units={units} />;
}
