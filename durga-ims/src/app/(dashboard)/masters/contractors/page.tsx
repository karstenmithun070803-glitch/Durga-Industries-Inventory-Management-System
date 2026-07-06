export const dynamic = "force-dynamic";

import { getAllContractors } from "@/lib/actions/contractors.actions";
import { ContractorsClient } from "./contractors-client";

export default async function ContractorsPage() {
  const contractors = await getAllContractors();
  return <ContractorsClient contractors={contractors} />;
}