export const dynamic = "force-dynamic";
import { getCurrentFY } from "@/lib/fy";
import { getMaterialIssues } from "@/lib/actions/material-issues.actions";
import { getCompanySettings } from "@/lib/actions/settings.actions";
import { MaterialIssuesClient } from "./material-issues-client";

export default async function MaterialIssuesPage() {
  const fy = getCurrentFY();
  const [rows, companySetting] = await Promise.all([
    getMaterialIssues(fy),
    getCompanySettings(),
  ]);
  return <MaterialIssuesClient initialRows={rows} initialFY={fy} companySetting={companySetting} />;
}
