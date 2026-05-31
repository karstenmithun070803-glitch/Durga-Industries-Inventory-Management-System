export const dynamic = "force-dynamic";

import {
  getActiveVehiclesForReports,
  getActiveSuppliersForReports,
  getActiveMaterialsForReports,
  getActiveCustomersForReports,
} from "@/lib/actions/reports.actions";
import { getCompanySettings } from "@/lib/actions/settings.actions";
import { ReportsClient } from "./reports-client";

export default async function ReportsPage() {
  const [vehicles, suppliers, materials, customers, companySetting] = await Promise.all([
    getActiveVehiclesForReports(),
    getActiveSuppliersForReports(),
    getActiveMaterialsForReports(),
    getActiveCustomersForReports(),
    getCompanySettings(),
  ]);

  return (
    <ReportsClient
      vehicles={vehicles}
      suppliers={suppliers}
      materials={materials}
      customers={customers}
      companySetting={companySetting}
    />
  );
}
