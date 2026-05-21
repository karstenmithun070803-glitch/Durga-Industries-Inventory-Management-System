import { notFound } from "next/navigation";
import { getPurchaseOrderById, getActiveSuppliers } from "@/lib/actions/purchase-orders.actions";
import { POForm } from "../../po-form";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ViewPOPage({ params }: Props) {
  const { id } = await params;
  const [po, suppliers] = await Promise.all([
    getPurchaseOrderById(id),
    getActiveSuppliers(),
  ]);

  if (!po) notFound();

  return (
    <POForm
      mode="view"
      po={po}
      suppliers={suppliers}
      materials={[]}
      taxRates={[]}
      units={[]}
    />
  );
}
