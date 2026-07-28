export const dynamic = "force-dynamic";

import { getSuppliers } from "@/lib/actions/suppliers.actions";
import { SuppliersClient } from "./suppliers-client";

export default async function SuppliersPage() {
  // getSuppliers = active only, so deleted/hidden suppliers leave the list.
  const suppliers = await getSuppliers();
  return <SuppliersClient suppliers={suppliers} />;
}