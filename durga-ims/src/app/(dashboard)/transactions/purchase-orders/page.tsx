import { getPurchaseOrders } from "@/lib/actions/purchase-orders.actions";
import { getCurrentFinancialYear } from "@/types";
import { PurchaseOrdersClient } from "./purchase-orders-client";

export default async function PurchaseOrdersPage() {
  const fy = getCurrentFinancialYear();
  const rows = await getPurchaseOrders(fy);
  return <PurchaseOrdersClient initialRows={rows} initialFY={fy} />;
}
