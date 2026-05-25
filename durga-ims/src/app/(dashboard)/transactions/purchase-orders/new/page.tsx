export const dynamic = "force-dynamic";
import { getActiveSuppliers, getActiveMaterials, getActiveUnits, getPurchaseOrders } from "@/lib/actions/purchase-orders.actions";
import { getAllTaxRates } from "@/lib/actions/tax.actions";
import { getCurrentFY } from "@/lib/fy";
import { POForm } from "../po-form";

interface Props {
  searchParams: Promise<{ prefill?: string }>;
}

export default async function NewPOPage({ searchParams }: Props) {
  const { prefill } = await searchParams;
  const fy = getCurrentFY();
  const [suppliers, materials, taxRates, units, orders] = await Promise.all([
    getActiveSuppliers(),
    getActiveMaterials(),
    getAllTaxRates(),
    getActiveUnits(),
    getPurchaseOrders(fy),
  ]);

  const maxNo = orders.reduce((max, o) => Math.max(max, o.po_number), 0);
  const nextPoNumber = maxNo + 1;

  return (
    <POForm
      mode="new"
      nextPoNumber={nextPoNumber}
      suppliers={suppliers}
      materials={materials}
      taxRates={taxRates as { id: string; tax_percentage: string }[]}
      units={units}
      prefillMaterialId={prefill}
    />
  );
}
