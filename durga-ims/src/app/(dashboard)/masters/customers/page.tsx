export const dynamic = "force-dynamic";
import { getAllCustomers } from "@/lib/actions/customers.actions";
import { CustomersClient } from "./customers-client";

export default async function CustomersPage() {
  const customers = await getAllCustomers();
  return <CustomersClient customers={customers} />;
}
