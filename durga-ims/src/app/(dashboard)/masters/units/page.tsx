export const dynamic = "force-dynamic";
import { getAllUnits } from "@/lib/actions/units.actions";
import { UnitsClient } from "./units-client";

export default async function UnitsPage() {
  const units = await getAllUnits();
  return <UnitsClient units={units} />;
}
