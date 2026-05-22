export const dynamic = "force-dynamic";
import { getCurrentFinancialYear } from "@/types";
import { getMaterialIssues } from "@/lib/actions/material-issues.actions";
import { MaterialIssuesClient } from "./material-issues-client";

export default async function MaterialIssuesPage() {
  const fy = getCurrentFinancialYear();
  const rows = await getMaterialIssues(fy);
  return <MaterialIssuesClient initialRows={rows} initialFY={fy} />;
}
