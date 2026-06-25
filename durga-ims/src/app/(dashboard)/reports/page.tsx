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
  let vehicles: Awaited<ReturnType<typeof getActiveVehiclesForReports>> = [];
  let suppliers: Awaited<ReturnType<typeof getActiveSuppliersForReports>> = [];
  let materials: Awaited<ReturnType<typeof getActiveMaterialsForReports>> = [];
  let customers: Awaited<ReturnType<typeof getActiveCustomersForReports>> = [];
  let stages: Awaited<ReturnType<typeof getStagesForDropdown>> = [];
  let jobCostVehicles: Awaited<ReturnType<typeof getVehiclesForJobSearch>> = [];
  let companySetting: Awaited<ReturnType<typeof getCompanySettings>> | undefined = undefined;

  try {
    [vehicles, suppliers, materials, customers, stages, jobCostVehicles, companySetting] =
      await Promise.all([
        getActiveVehiclesForReports(),
        getActiveSuppliersForReports(),
        getActiveMaterialsForReports(),
        getActiveCustomersForReports(),
        getStagesForDropdown(),
        getVehiclesForJobSearch(),
        getCompanySettings(),
      ]);
  } catch (e) {
    console.error("[ReportsPage] Failed to load dropdown data:", e);
  }

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
