import { getSuppliers } from "@/lib/actions/suppliers.actions";
import { SuppliersClient } from "./suppliers-client";

export default async function SuppliersPage() {
  const suppliers = await getSuppliers();
  return <SuppliersClient suppliers={suppliers} />;
}
