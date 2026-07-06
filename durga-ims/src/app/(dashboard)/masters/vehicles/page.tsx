export const dynamic = "force-dynamic";

import { getAllVehicles } from "@/lib/actions/vehicles.actions";
import { getCustomers } from "@/lib/actions/customers.actions";
import { VehiclesClient } from "./vehicles-client";

export default async function VehiclesPage() {
  const [vehicles, customers] = await Promise.all([
    getAllVehicles(),
    getCustomers(),
  ]);
  return <VehiclesClient vehicles={vehicles} customers={customers} />;
}