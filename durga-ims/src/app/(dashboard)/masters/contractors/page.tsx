import { getContractors } from "@/lib/actions/contractors.actions";
import { ContractorsClient } from "./contractors-client";

export default async function ContractorsPage() {
  const contractors = await getContractors();
  return <ContractorsClient contractors={contractors} />;
}
