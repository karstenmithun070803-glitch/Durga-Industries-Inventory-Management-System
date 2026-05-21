import { notFound } from "next/navigation";
import { getPurchaseOrderById, getActiveSuppliers, getActiveMaterials, getActiveUnits } from "@/lib/actions/purchase-orders.actions";
import { getAllTaxRates } from "@/lib/actions/tax.actions";
import { POForm } from "../../po-form";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditPOPage({ params }: Props) {
  const { id } = await params;
  const [po, suppliers, materials, taxRates, units] = await Promise.all([
    getPurchaseOrderById(id),
    getActiveSuppliers(),
    getActiveMaterials(),
    getAllTaxRates(),
    getActiveUnits(),
  ]);

  if (!po) notFound();

  const mode = po.status === "Received" ? "edit-received" : "edit-draft";

  return (
    <POForm
      mode={mode}
      po={po}
      suppliers={suppliers}
      materials={materials}
      taxRates={taxRates as { id: string; tax_percentage: string }[]}
      units={units}
    />
  );
}
