import { getCustomers } from "@/lib/actions/customers.actions";
import { CustomersClient } from "./customers-client";

export default async function CustomersPage() {
  const customers = await getCustomers();
  return <CustomersClient customers={customers} />;
}
