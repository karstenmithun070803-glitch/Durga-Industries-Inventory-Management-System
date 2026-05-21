import { getVehicles } from "@/lib/actions/vehicles.actions";
import { getCustomers } from "@/lib/actions/customers.actions";
import { VehiclesClient } from "./vehicles-client";

export default async function VehiclesPage() {
  const [vehicles, customers] = await Promise.all([getVehicles(), getCustomers()]);
  return <VehiclesClient vehicles={vehicles} customers={customers} />;
}
