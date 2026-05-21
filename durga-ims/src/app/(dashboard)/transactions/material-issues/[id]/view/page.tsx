import { notFound } from "next/navigation";
import { getMaterialIssueById } from "@/lib/actions/material-issues.actions";
import { MaterialIssueForm } from "../../material-issue-form";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ViewMaterialIssuePage({ params }: Props) {
  const { id } = await params;
  const issue = await getMaterialIssueById(id);

  if (!issue) notFound();

  return (
    <MaterialIssueForm
      mode="view"
      issue={issue}
      vehicles={[]}
      contractors={[]}
      materials={[]}
      taxRates={[]}
      units={[]}
    />
  );
}
