import { getAllSuppliers } from "@/lib/actions/suppliers.actions";
import { SuppliersClient } from "./suppliers-client";

export default async function SuppliersPage() {
  const suppliers = await getAllSuppliers();
  return <SuppliersClient suppliers={suppliers} />;
}
