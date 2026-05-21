import { getPurchaseOrders } from "@/lib/actions/purchase-orders.actions";
import { getCurrentFinancialYear } from "@/types";
import { PurchaseOrdersClient } from "./purchase-orders-client";

export default async function PurchaseOrdersPage() {
  const fy = getCurrentFinancialYear();
  const orders = await getPurchaseOrders(fy);
  return <PurchaseOrdersClient initialOrders={orders} initialFY={fy} />;
}
