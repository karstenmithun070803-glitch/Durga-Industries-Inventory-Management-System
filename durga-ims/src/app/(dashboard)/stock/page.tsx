export const dynamic = "force-dynamic";

import { getStockDashboardMaterials, getVehiclesForJobSearch } from "@/lib/actions/stock.actions";
import { getCompanySettings } from "@/lib/actions/settings.actions";
import { StockClient } from "./stock-client";

export default async function StockPage() {
  const [{ rows, summary }, vehicles, companySetting] = await Promise.all([
    getStockDashboardMaterials(),
    getVehiclesForJobSearch(),
    getCompanySettings(),
  ]);

  return (
    <StockClient
      initialRows={rows}
      summary={summary}
      vehicles={vehicles}
      companySetting={companySetting}
    />
  );
}
