export const dynamic = "force-dynamic";

import { getVehicles } from "@/lib/actions/vehicles.actions";
import { getAllCustomers } from "@/lib/actions/customers.actions";
import { VehiclesClient } from "./vehicles-client";

export default async function VehiclesPage() {
  // getVehicles = active only, so deleted/hidden vehicles leave the list. Customers stay
  // full-list (getAllCustomers) so a vehicle referencing a hidden customer still resolves it (R4).
  const [vehicles, customers] = await Promise.all([
    getVehicles(),
    getAllCustomers(),
  ]);
  return <VehiclesClient vehicles={vehicles} customers={customers} />;
}