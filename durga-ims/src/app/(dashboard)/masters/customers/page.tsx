export const dynamic = "force-dynamic";

import { getCustomers } from "@/lib/actions/customers.actions";
import { CustomersClient } from "./customers-client";

export default async function CustomersPage() {
  // getCustomers = active only, so deleted/hidden customers leave the list.
  const customers = await getCustomers();
  return <CustomersClient customers={customers} />;
}