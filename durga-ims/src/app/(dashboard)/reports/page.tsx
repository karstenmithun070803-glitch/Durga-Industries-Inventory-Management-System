export const dynamic = "force-dynamic";

import {
  getActiveVehiclesForReports,
  getActiveSuppliersForReports,
  getActiveMaterialsForReports,
  getActiveCustomersForReports,
} from "@/lib/actions/reports.queries";
import { getVehiclesForJobSearch } from "@/lib/actions/stock.actions";
import { getCompanySettings } from "@/lib/actions/settings.actions";
import { getStagesForDropdown } from "@/lib/actions/stages.actions";
import { ReportsClient } from "./reports-client";

export default async function ReportsPage() {
  const [vehicles, suppliers, materials, customers, stages, jobCostVehicles, companySetting] = await Promise.all([
    getActiveVehiclesForReports(),
    getActiveSuppliersForReports(),
    getActiveMaterialsForReports(),
    getActiveCustomersForReports(),
    getStagesForDropdown(),
    getVehiclesForJobSearch(),
    getCompanySettings(),
  ]);

  return (
    <ReportsClient
      vehicles={vehicles}
      suppliers={suppliers}
      materials={materials}
      customers={customers}
      stages={stages}
      jobCostVehicles={jobCostVehicles}
      companySetting={companySetting}
    />
  );
}
