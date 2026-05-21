import { notFound } from "next/navigation";
import {
  getMaterialIssueById,
  getActiveVehicles,
  getActiveContractors,
  getActiveIssueMaterials,
  getActiveSalesUnits,
} from "@/lib/actions/material-issues.actions";
import { getAllTaxRates } from "@/lib/actions/tax.actions";
import { MaterialIssueForm } from "../../material-issue-form";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditMaterialIssuePage({ params }: Props) {
  const { id } = await params;
  const [issue, vehicles, contractors, materials, units, taxRates] = await Promise.all([
    getMaterialIssueById(id),
    getActiveVehicles(),
    getActiveContractors(),
    getActiveIssueMaterials(),
    getActiveSalesUnits(),
    getAllTaxRates(),
  ]);

  if (!issue) notFound();

  const mode = issue.status === "Issued" ? "edit-issued" : "edit-draft";

  return (
    <MaterialIssueForm
      mode={mode}
      issue={issue}
      vehicles={vehicles}
      contractors={contractors}
      materials={materials}
      taxRates={taxRates as { id: string; tax_percentage: string }[]}
      units={units}
    />
  );
}
