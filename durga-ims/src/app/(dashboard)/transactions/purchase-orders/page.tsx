export const dynamic = "force-dynamic";
import { getPurchaseOrders } from "@/lib/actions/purchase-orders.actions";
import { getCompanySettings } from "@/lib/actions/settings.actions";
import { getCurrentFinancialYear } from "@/types";
import { PurchaseOrdersClient } from "./purchase-orders-client";

export default async function PurchaseOrdersPage() {
  const fy = getCurrentFinancialYear();
  const [rows, companySetting] = await Promise.all([
    getPurchaseOrders(fy),
    getCompanySettings(),
  ]);
  return <PurchaseOrdersClient initialRows={rows} initialFY={fy} companySetting={companySetting} />;
}
