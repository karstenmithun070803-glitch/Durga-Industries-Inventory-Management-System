export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import {
  getInvoiceById,
  getActiveVehiclesForInvoice,
  getActiveTaxRatesWithPrefix,
  getActiveInvoiceMaterials,
} from "@/lib/actions/invoices.actions";
import { getUnits } from "@/lib/actions/units.actions";
import { getCompanySettings } from "@/lib/actions/settings.actions";
import { InvoiceForm } from "../../invoice-form";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditInvoicePage({ params }: Props) {
  const { id } = await params;
  const [invoice, vehicles, taxRates, materials, units, companySetting] = await Promise.all([
    getInvoiceById(id),
    getActiveVehiclesForInvoice(),
    getActiveTaxRatesWithPrefix(),
    getActiveInvoiceMaterials(),
    getUnits(),
    getCompanySettings(),
  ]);

  if (!invoice) notFound();

  return (
    <InvoiceForm
      mode="edit"
      invoice={invoice}
      vehicles={vehicles}
      taxRates={taxRates}
      materials={materials}
      units={units}
      companySetting={companySetting}
    />
  );
}
