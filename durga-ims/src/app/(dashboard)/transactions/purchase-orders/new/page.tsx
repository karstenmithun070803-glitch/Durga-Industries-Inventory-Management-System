export const dynamic = "force-dynamic";
import { getActiveSuppliers, getActiveMaterials, getActiveUnits, getNextPONumber } from "@/lib/actions/purchase-orders.actions";
import { getAllTaxRates } from "@/lib/actions/tax.actions";
import { getCurrentFY } from "@/lib/fy";
import { POForm } from "../po-form";

interface Props {
  searchParams: Promise<{ prefill?: string }>;
}

export default async function NewPOPage({ searchParams }: Props) {
  const { prefill } = await searchParams;
  const fy = getCurrentFY();
  const [suppliers, materials, taxRates, units, nextPoNumber] = await Promise.all([
    getActiveSuppliers(),
    getActiveMaterials(),
    getAllTaxRates(),
    getActiveUnits(),
    getNextPONumber(fy),
  ]);

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
