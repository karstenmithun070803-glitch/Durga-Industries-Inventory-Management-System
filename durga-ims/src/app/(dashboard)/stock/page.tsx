export const dynamic = "force-dynamic";

import { getStockDashboardMaterials } from "@/lib/actions/stock.actions";
import { StockClient } from "./stock-client";

export default async function StockPage() {
  const { rows, summary } = await getStockDashboardMaterials();

  return (
    <StockClient
      initialRows={rows}
      summary={summary}
    />
  );
}
