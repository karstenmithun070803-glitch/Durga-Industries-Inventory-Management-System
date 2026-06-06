"use server";

import { db } from "@/lib/db";
import {
  invoices,
  invoiceItems,
  invoiceSlipLinks,
  materials,
  vehicles,
  customers,
  units,
  taxRates,
  materialIssues,
  materialIssueItems,
} from "@/lib/db/schema";
import { eq, and, sql, desc, like, notExists, ne, inArray } from "drizzle-orm";
import { revalidatePath, unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache";
import { fyDateRange } from "@/lib/fy";
import { createClient } from "@/lib/supabase/server";
import type { InvoiceWithDetails, InvoiceItemWithDetails, InvoiceRow } from "@/types";
import { INVOICE_STATUS, PAYMENT_STATUS } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Input interfaces
// ---------------------------------------------------------------------------

interface InvoiceItemInput {
  material_id: string;
  hsn_code: string;
  qty: string;
  unit_id: string;
  rate: string;
  rate_blank: boolean;
  zero_rate_confirmed: boolean;
  tax_percentage: string;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  amount: string;
  gst_type: string;
}

interface InvoiceHeaderInput {
  vehicle_id: string;
  slip_ids: string[];
  bill_date: string;
  inv_prefix: string;
  financial_year: string;
  tax_percentage: string;
  material_margin: string;
  net_amount: string;
  items: InvoiceItemInput[];
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function buildBillNumber(prefix: string | null | undefined, seq: number): string {
  const p = prefix?.trim().toUpperCase() ?? "";
  if (!p) return String(seq).padStart(5, "0");
  return `${p}-${String(seq).padStart(5, "0")}`;
}

async function getNextBillNumber(invPrefix: string | null | undefined, financialYear: string): Promise<string> {
  const prefix = invPrefix?.trim().toUpperCase() ?? "";

  let maxSeq = 0;

  if (prefix) {
    const pattern = `${prefix}-%`;
    const result = await db
      .select({ bill_number: invoices.bill_number })
      .from(invoices)
      .where(and(eq(invoices.financial_year, financialYear), like(invoices.bill_number, pattern)))
      .orderBy(desc(invoices.bill_number))
      .limit(1);

    if (result[0]) {
      const parts = result[0].bill_number.split("-");
      if (parts.length === 2) {
        const seq = parseInt(parts[1], 10);
        if (!isNaN(seq)) maxSeq = seq;
      }
    }
  } else {
    // No prefix — find max purely-numeric bill numbers for this FY
    const result = await db
      .select({ bill_number: invoices.bill_number })
      .from(invoices)
      .where(eq(invoices.financial_year, financialYear))
      .orderBy(desc(invoices.bill_number))
      .limit(1);

    if (result[0]) {
      const seq = parseInt(result[0].bill_number, 10);
      if (!isNaN(seq)) maxSeq = seq;
    }
  }

  return buildBillNumber(prefix, maxSeq + 1);
}

export async function peekNextBillNumber(invPrefix: string | null | undefined, financialYear: string): Promise<string> {
  return getNextBillNumber(invPrefix, financialYear);
}

function validateInvoiceItems(items: InvoiceItemInput[]) {
  if (items.length === 0) throw new Error("Add at least one material.");

  for (const item of items) {
    if (!item.material_id) throw new Error("All items must have a material selected.");
    if (parseFloat(item.qty || "0") <= 0) throw new Error("All quantities must be greater than zero.");
  }

  // Zero-rate check
  for (const item of items) {
    if (item.rate === "0" && !item.rate_blank && !item.zero_rate_confirmed)
      throw new Error(
        "One or more items have a zero rate without confirmation. Check 'Zero cost — confirm?' for each."
      );
  }
}

// ---------------------------------------------------------------------------
// Read — dropdown data
// ---------------------------------------------------------------------------

export const getActiveVehiclesForInvoice = unstable_cache(
  async () =>
    db
      .select({
        id: vehicles.id,
        job_ref_no: vehicles.job_ref_no,
        vehicle_name: vehicles.vehicle_name,
        customer_id: vehicles.customer_id,
        customer_name: customers.customer_name,
        customer_gstin: customers.gstin,
        customer_state: customers.state,
      })
      .from(vehicles)
      .leftJoin(customers, eq(vehicles.customer_id, customers.id))
      .where(eq(vehicles.is_active, true))
      .orderBy(vehicles.job_ref_no),
  ["inv-active-vehicles"],
  { tags: [CACHE_TAGS.vehicles], revalidate: false }
);

export async function getIssuedMIsForVehicle(vehicleId: string, currentInvoiceId?: string) {
  const rows = await db
    .select({
      id: materialIssues.id,
      slip_number: materialIssues.slip_number,
      issue_date: materialIssues.issue_date,
    })
    .from(materialIssues)
    .where(
      and(
        eq(materialIssues.vehicle_id, vehicleId),
        eq(materialIssues.status, "Issued"),
        notExists(
          db.select().from(invoiceSlipLinks).where(
            and(
              eq(invoiceSlipLinks.slip_id, materialIssues.id),
              currentInvoiceId
                ? ne(invoiceSlipLinks.invoice_id, currentInvoiceId)
                : sql`true`
            )
          )
        )
      )
    )
    .orderBy(desc(materialIssues.issue_date));

  if (rows.length === 0) return [];

  // Single GROUP BY query instead of one COUNT per slip (N+1 → 1 query)
  const counts = await db
    .select({
      issue_id: materialIssueItems.issue_id,
      cnt: sql<number>`COUNT(*)`,
    })
    .from(materialIssueItems)
    .where(inArray(materialIssueItems.issue_id, rows.map((r) => r.id)))
    .groupBy(materialIssueItems.issue_id);

  const countMap = new Map(counts.map((c) => [c.issue_id, Number(c.cnt)]));

  return rows.map((mi) => ({
    ...mi,
    issue_date: mi.issue_date.toISOString(),
    item_count: countMap.get(mi.id) ?? 0,
  }));
}

export async function getMIItemsForInvoice(issueId: string): Promise<InvoiceItemWithDetails[]> {
  const rows = await db
    .select({
      id: materialIssueItems.id,
      issue_id: materialIssueItems.issue_id,
      material_id: materialIssueItems.material_id,
      material_name: materials.name,
      material_no: materials.material_no,
      hsn_code: materialIssueItems.hsn_code,
      qty: materialIssueItems.qty,
      unit_id: materialIssueItems.unit_id,
      unit_name: units.unit_name,
      rate: materialIssueItems.rate,
      tax_percentage: materialIssueItems.tax_percentage,
      cgst_amount: materialIssueItems.cgst_amount,
      sgst_amount: materialIssueItems.sgst_amount,
      igst_amount: materialIssueItems.igst_amount,
      amount: materialIssueItems.amount,
      gst_type: materialIssueItems.gst_type,
    })
    .from(materialIssueItems)
    .innerJoin(materials, eq(materialIssueItems.material_id, materials.id))
    .leftJoin(units, eq(materialIssueItems.unit_id, units.id))
    .where(eq(materialIssueItems.issue_id, issueId))
    .orderBy(materials.material_no);

  return rows.map((r) => ({
    id: r.id,
    invoice_id: "",
    material_id: r.material_id,
    material_name: r.material_name,
    material_no: r.material_no,
    hsn_code: r.hsn_code,
    qty: r.qty,
    unit_id: r.unit_id,
    unit_name: r.unit_name,
    rate: r.rate,
    tax_percentage: r.tax_percentage,
    cgst_amount: r.cgst_amount,
    sgst_amount: r.sgst_amount,
    igst_amount: r.igst_amount,
    amount: r.amount,
    gst_type: r.gst_type,
  }));
}

// Returns all issued MI items for a vehicle, grouped by slip
// currentInvoiceId: if editing, exclude slips linked to other invoices (but not this one)
export async function getAllIssuedMIItemsForVehicle(vehicleId: string, currentInvoiceId?: string): Promise<
  { slip_id: string; slip_number: number; issue_date: string; items: InvoiceItemWithDetails[] }[]
> {
  const slips = await db
    .select({
      id: materialIssues.id,
      slip_number: materialIssues.slip_number,
      issue_date: materialIssues.issue_date,
    })
    .from(materialIssues)
    .where(
      and(
        eq(materialIssues.vehicle_id, vehicleId),
        eq(materialIssues.status, "Issued"),
        notExists(
          db.select().from(invoiceSlipLinks).where(
            and(
              eq(invoiceSlipLinks.slip_id, materialIssues.id),
              currentInvoiceId
                ? ne(invoiceSlipLinks.invoice_id, currentInvoiceId)
                : sql`true`
            )
          )
        )
      )
    )
    .orderBy(desc(materialIssues.issue_date));

  if (slips.length === 0) return [];

  const allItems = await db
    .select({
      issue_id: materialIssueItems.issue_id,
      id: materialIssueItems.id,
      material_id: materialIssueItems.material_id,
      material_name: materials.name,
      material_no: materials.material_no,
      hsn_code: materialIssueItems.hsn_code,
      qty: materialIssueItems.qty,
      unit_id: materialIssueItems.unit_id,
      unit_name: units.unit_name,
      rate: materialIssueItems.rate,
      tax_percentage: materialIssueItems.tax_percentage,
      cgst_amount: materialIssueItems.cgst_amount,
      sgst_amount: materialIssueItems.sgst_amount,
      igst_amount: materialIssueItems.igst_amount,
      amount: materialIssueItems.amount,
      gst_type: materialIssueItems.gst_type,
    })
    .from(materialIssueItems)
    .innerJoin(materials, eq(materialIssueItems.material_id, materials.id))
    .leftJoin(units, eq(materialIssueItems.unit_id, units.id))
    .where(inArray(materialIssueItems.issue_id, slips.map((s) => s.id)))
    .orderBy(materials.material_no);

  const itemsBySlip = new Map<string, InvoiceItemWithDetails[]>();
  for (const r of allItems) {
    const item: InvoiceItemWithDetails = {
      id: r.id,
      invoice_id: "",
      material_id: r.material_id,
      material_name: r.material_name,
      material_no: r.material_no,
      hsn_code: r.hsn_code,
      qty: r.qty,
      unit_id: r.unit_id,
      unit_name: r.unit_name,
      rate: r.rate,
      tax_percentage: r.tax_percentage,
      cgst_amount: r.cgst_amount,
      sgst_amount: r.sgst_amount,
      igst_amount: r.igst_amount,
      amount: r.amount,
      gst_type: r.gst_type,
    };
    const list = itemsBySlip.get(r.issue_id) ?? [];
    list.push(item);
    itemsBySlip.set(r.issue_id, list);
  }

  return slips.map((slip) => ({
    slip_id: slip.id,
    slip_number: slip.slip_number,
    issue_date: slip.issue_date.toISOString(),
    items: itemsBySlip.get(slip.id) ?? [],
  }));
}

export const getActiveTaxRatesWithPrefix = unstable_cache(
  async () =>
    db
      .select({
        id: taxRates.id,
        vat_code: taxRates.vat_code,
        tax_percentage: taxRates.tax_percentage,
        description: taxRates.description,
        inv_prefix: taxRates.inv_prefix,
      })
      .from(taxRates)
      .where(and(eq(taxRates.is_active, true)))
      .orderBy(taxRates.vat_code),
  ["inv-tax-rates-with-prefix"],
  { tags: [CACHE_TAGS.taxRates], revalidate: false }
);

export const getActiveInvoiceMaterials = unstable_cache(
  async () =>
    db
      .select({
        id: materials.id,
        material_no: materials.material_no,
        name: materials.name,
        hsn_code: materials.hsn_code,
        tax_rate_id: materials.tax_rate_id,
        tax_percentage: taxRates.tax_percentage,
        sales_unit_id: materials.sales_unit_id,
        purchase_unit_id: materials.purchase_unit_id,
      })
      .from(materials)
      .leftJoin(taxRates, eq(materials.tax_rate_id, taxRates.id))
      .where(eq(materials.is_active, true))
      .orderBy(materials.material_no),
  ["inv-active-materials"],
  { tags: [CACHE_TAGS.materials], revalidate: false }
);

// ---------------------------------------------------------------------------
// Read — list + detail
// ---------------------------------------------------------------------------

export async function getInvoices(financialYear: string): Promise<InvoiceRow[]> {
  const rows = await db
    .select({
      // header
      id: invoices.id,
      bill_number: invoices.bill_number,
      bill_date: invoices.bill_date,
      rate_date: invoices.rate_date,
      financial_year: invoices.financial_year,
      status: invoices.status,
      tax_percentage: invoices.tax_percentage,
      material_margin: invoices.material_margin,
      discount: invoices.discount,
      net_amount: invoices.net_amount,
      rev_charge_status: invoices.rev_charge_status,
      payment_status: invoices.payment_status,
      payment_date: invoices.payment_date,
      payment_notes: invoices.payment_notes,
      cancelled_by: invoices.cancelled_by,
      cancelled_at: invoices.cancelled_at,
      // vehicle
      vehicle_id: vehicles.id,
      vehicle_name: vehicles.vehicle_name,
      job_ref_no: vehicles.job_ref_no,
      // customer snapshot (from invoices table — not live JOIN)
      customer_id: customers.id,
      customer_name: invoices.customer_name,
      customer_gstin: invoices.customer_gstin,
      customer_state: invoices.customer_state,
      customer_address: invoices.customer_address,
      // item
      item_id: invoiceItems.id,
      material_id: invoiceItems.material_id,
      material_name: materials.name,
      material_no: materials.material_no,
      hsn_code: invoiceItems.hsn_code,
      qty: invoiceItems.qty,
      unit_id: invoiceItems.unit_id,
      unit_name: units.unit_name,
      rate: invoiceItems.rate,
      tax_percentage_item: invoiceItems.tax_percentage,
      cgst_amount: invoiceItems.cgst_amount,
      sgst_amount: invoiceItems.sgst_amount,
      igst_amount: invoiceItems.igst_amount,
      amount: invoiceItems.amount,
      gst_type: invoiceItems.gst_type,
    })
    .from(invoices)
    .innerJoin(invoiceItems, eq(invoiceItems.invoice_id, invoices.id))
    .innerJoin(materials, eq(invoiceItems.material_id, materials.id))
    .innerJoin(vehicles, eq(invoices.vehicle_id, vehicles.id))
    .leftJoin(customers, eq(vehicles.customer_id, customers.id))
    .leftJoin(units, eq(invoiceItems.unit_id, units.id))
    .where(and(eq(invoices.financial_year, financialYear), ne(invoices.status, INVOICE_STATUS.CANCELLED)))
    .orderBy(desc(invoices.bill_date), desc(invoices.bill_number));

  return rows.map((r) => ({
    ...r,
    bill_date: r.bill_date.toISOString(),
    rate_date: r.rate_date?.toISOString() ?? null,
    payment_date: r.payment_date ? (r.payment_date as unknown as Date).toISOString().split("T")[0] : null,
    cancelled_at: r.cancelled_at ? (r.cancelled_at as unknown as Date).toISOString() : null,
    material_no: r.material_no,
    job_ref_no: r.job_ref_no,
  }));
}

export async function getInvoiceById(id: string): Promise<InvoiceWithDetails | null> {
  const headerRows = await db
    .select({
      id: invoices.id,
      bill_number: invoices.bill_number,
      bill_date: invoices.bill_date,
      rate_date: invoices.rate_date,
      financial_year: invoices.financial_year,
      status: invoices.status,
      tax_percentage: invoices.tax_percentage,
      material_margin: invoices.material_margin,
      discount: invoices.discount,
      net_amount: invoices.net_amount,
      rev_charge_status: invoices.rev_charge_status,
      payment_status: invoices.payment_status,
      payment_date: invoices.payment_date,
      payment_notes: invoices.payment_notes,
      cancelled_by: invoices.cancelled_by,
      cancelled_at: invoices.cancelled_at,
      vehicle_id: vehicles.id,
      vehicle_name: vehicles.vehicle_name,
      job_ref_no: vehicles.job_ref_no,
      customer_id: customers.id,
      // customer snapshot — read from invoices row, not live JOIN
      customer_name: invoices.customer_name,
      customer_gstin: invoices.customer_gstin,
      customer_state: invoices.customer_state,
      customer_address: invoices.customer_address,
    })
    .from(invoices)
    .innerJoin(vehicles, eq(invoices.vehicle_id, vehicles.id))
    .leftJoin(customers, eq(vehicles.customer_id, customers.id))
    .where(eq(invoices.id, id));

  if (!headerRows.length) return null;
  const h = headerRows[0];

  const itemRows = await db
    .select({
      id: invoiceItems.id,
      invoice_id: invoiceItems.invoice_id,
      material_id: invoiceItems.material_id,
      material_name: materials.name,
      material_no: materials.material_no,
      hsn_code: invoiceItems.hsn_code,
      qty: invoiceItems.qty,
      unit_id: invoiceItems.unit_id,
      unit_name: units.unit_name,
      rate: invoiceItems.rate,
      tax_percentage: invoiceItems.tax_percentage,
      cgst_amount: invoiceItems.cgst_amount,
      sgst_amount: invoiceItems.sgst_amount,
      igst_amount: invoiceItems.igst_amount,
      amount: invoiceItems.amount,
      gst_type: invoiceItems.gst_type,
    })
    .from(invoiceItems)
    .innerJoin(materials, eq(invoiceItems.material_id, materials.id))
    .leftJoin(units, eq(invoiceItems.unit_id, units.id))
    .where(eq(invoiceItems.invoice_id, id))
    .orderBy(materials.material_no);

  return {
    id: h.id,
    bill_number: h.bill_number,
    bill_date: h.bill_date.toISOString(),
    rate_date: h.rate_date?.toISOString() ?? null,
    financial_year: h.financial_year,
    status: h.status,
    tax_percentage: h.tax_percentage,
    material_margin: h.material_margin,
    discount: h.discount,
    net_amount: h.net_amount,
    rev_charge_status: h.rev_charge_status,
    payment_status: h.payment_status ?? PAYMENT_STATUS.UNPAID,
    payment_date: h.payment_date ? (h.payment_date as unknown as Date).toISOString().split("T")[0] : null,
    payment_notes: h.payment_notes ?? null,
    cancelled_by: h.cancelled_by ?? null,
    cancelled_at: h.cancelled_at ? (h.cancelled_at as unknown as Date).toISOString() : null,
    vehicle_id: h.vehicle_id,
    vehicle_name: h.vehicle_name,
    job_ref_no: h.job_ref_no,
    customer_id: h.customer_id,
    customer_name: h.customer_name,
    customer_gstin: h.customer_gstin,
    customer_state: h.customer_state,
    customer_address: h.customer_address,
    items: itemRows.map((r) => ({
      id: r.id,
      invoice_id: r.invoice_id,
      material_id: r.material_id,
      material_name: r.material_name,
      material_no: r.material_no,
      hsn_code: r.hsn_code,
      qty: r.qty,
      unit_id: r.unit_id,
      unit_name: r.unit_name,
      rate: r.rate,
      tax_percentage: r.tax_percentage,
      cgst_amount: r.cgst_amount,
      sgst_amount: r.sgst_amount,
      igst_amount: r.igst_amount,
      amount: r.amount,
      gst_type: r.gst_type,
    })),
  };
}

// ---------------------------------------------------------------------------
// Write — create / update / finalize / delete
// ---------------------------------------------------------------------------

export async function createInvoice(data: InvoiceHeaderInput): Promise<string> {
  // Validate
  if (!data.vehicle_id) throw new Error("Vehicle is required.");
  validateInvoiceItems(data.items);

  // Date within FY
  const fyRange = fyDateRange(data.financial_year);
  const billDate = new Date(data.bill_date);
  if (billDate < fyRange.start || billDate > fyRange.end)
    throw new Error("Bill date must fall within the active financial year.");

  // Fetch customer snapshot for this vehicle
  const [vData] = await db
    .select({
      customer_name: customers.customer_name,
      customer_gstin: customers.gstin,
      customer_state: customers.state,
      address_1: customers.address_1,
      address_2: customers.address_2,
      street: customers.street,
      city: customers.city,
    })
    .from(vehicles)
    .leftJoin(customers, eq(vehicles.customer_id, customers.id))
    .where(eq(vehicles.id, data.vehicle_id));

  const customer_address = vData
    ? [vData.address_1, vData.address_2, vData.street, vData.city, vData.customer_state]
        .filter(Boolean)
        .join(", ") || null
    : null;

  const billNumber = await getNextBillNumber(data.inv_prefix, data.financial_year);

  // All writes are atomic: if items or slip links fail, the invoice header is rolled back
  let invoiceId: string;
  try {
    invoiceId = await db.transaction(async (tx) => {
      const [newInvoice] = await tx
        .insert(invoices)
        .values({
          bill_number: billNumber,
          bill_date: new Date(data.bill_date),
          tax_percentage: data.tax_percentage,
          material_margin: data.material_margin || null,
          vehicle_id: data.vehicle_id,
          net_amount: data.net_amount,
          financial_year: data.financial_year,
          status: INVOICE_STATUS.DRAFT,
          customer_name: vData?.customer_name ?? null,
          customer_gstin: vData?.customer_gstin ?? null,
          customer_state: vData?.customer_state ?? null,
          customer_address,
        })
        .returning({ id: invoices.id });

      await tx.insert(invoiceItems).values(
        data.items.map((item) => ({
          invoice_id: newInvoice.id,
          material_id: item.material_id,
          hsn_code: item.hsn_code || null,
          qty: item.qty,
          unit_id: item.unit_id || null,
          rate: item.rate || "0",
          tax_percentage: item.tax_percentage,
          cgst_amount: item.cgst_amount,
          sgst_amount: item.sgst_amount,
          igst_amount: item.igst_amount,
          amount: item.amount,
          gst_type: item.gst_type,
        }))
      );

      if (data.slip_ids.length > 0) {
        await tx.insert(invoiceSlipLinks).values(
          data.slip_ids.map((slipId) => ({ invoice_id: newInvoice.id, slip_id: slipId }))
        );
      }

      return newInvoice.id;
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("bill_number_fy_unique")) {
      throw new Error("Bill number conflict — another invoice was just created with the same number. Please try saving again.");
    }
    throw e;
  }

  revalidatePath("/invoice");
  return invoiceId;
}

export async function updateInvoice(id: string, data: InvoiceHeaderInput): Promise<void> {
  if (!data.vehicle_id) throw new Error("Vehicle is required.");
  validateInvoiceItems(data.items);

  const fyRange = fyDateRange(data.financial_year);
  const billDate = new Date(data.bill_date);
  if (billDate < fyRange.start || billDate > fyRange.end)
    throw new Error("Bill date must fall within the active financial year.");

  // Re-snapshot customer (re-captures if vehicle changes)
  const [vData] = await db
    .select({
      customer_name: customers.customer_name,
      customer_gstin: customers.gstin,
      customer_state: customers.state,
      address_1: customers.address_1,
      address_2: customers.address_2,
      street: customers.street,
      city: customers.city,
    })
    .from(vehicles)
    .leftJoin(customers, eq(vehicles.customer_id, customers.id))
    .where(eq(vehicles.id, data.vehicle_id));

  const customer_address = vData
    ? [vData.address_1, vData.address_2, vData.street, vData.city, vData.customer_state]
        .filter(Boolean)
        .join(", ") || null
    : null;

  // All writes are atomic: if any step fails the entire update rolls back
  await db.transaction(async (tx) => {
    // Delete old items then re-insert — no stock impact on invoices
    await tx.delete(invoiceItems).where(eq(invoiceItems.invoice_id, id));

    await tx
      .update(invoices)
      .set({
        bill_date: new Date(data.bill_date),
        tax_percentage: data.tax_percentage,
        material_margin: data.material_margin || null,
        vehicle_id: data.vehicle_id,
        net_amount: data.net_amount,
        customer_name: vData?.customer_name ?? null,
        customer_gstin: vData?.customer_gstin ?? null,
        customer_state: vData?.customer_state ?? null,
        customer_address,
      })
      .where(eq(invoices.id, id));

    await tx.insert(invoiceItems).values(
      data.items.map((item) => ({
        invoice_id: id,
        material_id: item.material_id,
        hsn_code: item.hsn_code || null,
        qty: item.qty,
        unit_id: item.unit_id || null,
        rate: item.rate || "0",
        tax_percentage: item.tax_percentage,
        cgst_amount: item.cgst_amount,
        sgst_amount: item.sgst_amount,
        igst_amount: item.igst_amount,
        amount: item.amount,
        gst_type: item.gst_type,
      }))
    );

    // Replace slip links
    await tx.delete(invoiceSlipLinks).where(eq(invoiceSlipLinks.invoice_id, id));
    if (data.slip_ids.length > 0) {
      await tx.insert(invoiceSlipLinks).values(
        data.slip_ids.map((slipId) => ({ invoice_id: id, slip_id: slipId }))
      );
    }
  });

  revalidatePath("/invoice");
}

export async function finalizeInvoice(id: string): Promise<void> {
  await db.update(invoices).set({ status: INVOICE_STATUS.FINALIZED }).where(eq(invoices.id, id));
  revalidatePath("/invoice");
}

export async function revertInvoiceToDraft(id: string): Promise<void> {
  const [inv] = await db.select({ status: invoices.status }).from(invoices).where(eq(invoices.id, id));
  if (!inv) throw new Error("Invoice not found.");
  if (inv.status === INVOICE_STATUS.CANCELLED) throw new Error("Cancelled invoices cannot be reverted to Draft.");
  await db.update(invoices).set({ status: INVOICE_STATUS.DRAFT }).where(eq(invoices.id, id));
  revalidatePath("/invoice");
}

export async function deleteInvoice(id: string): Promise<void> {
  const inv = await db
    .select({ status: invoices.status, bill_number: invoices.bill_number })
    .from(invoices)
    .where(eq(invoices.id, id))
    .limit(1);

  if (!inv.length) throw new Error("Invoice not found.");
  if (inv[0].status === INVOICE_STATUS.FINALIZED)
    throw new Error(
      `Finalized invoice ${inv[0].bill_number} cannot be deleted. Revert to Draft or Cancel it first.`
    );
  if (inv[0].status === INVOICE_STATUS.CANCELLED)
    throw new Error(
      `Cancelled invoice ${inv[0].bill_number} is a permanent record and cannot be deleted.`
    );

  // CASCADE deletes invoice_items and invoice_slip_links
  await db.delete(invoices).where(eq(invoices.id, id));
  revalidatePath("/invoice");
}

export async function cancelInvoice(id: string): Promise<void> {
  const [inv] = await db
    .select({ status: invoices.status, bill_number: invoices.bill_number })
    .from(invoices)
    .where(eq(invoices.id, id));

  if (!inv) throw new Error("Invoice not found.");
  if (inv.status === INVOICE_STATUS.CANCELLED) throw new Error(`${inv.bill_number} is already cancelled.`);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Free MI slips and record cancellation audit atomically
  await db.transaction(async (tx) => {
    await tx.delete(invoiceSlipLinks).where(eq(invoiceSlipLinks.invoice_id, id));
    await tx.update(invoices).set({
      status: INVOICE_STATUS.CANCELLED,
      cancelled_by: user?.email ?? "unknown",
      cancelled_at: new Date(),
    }).where(eq(invoices.id, id));
  });
  revalidatePath("/invoice");
}

export async function markInvoicePayment(
  id: string,
  data: { payment_status: string; payment_date: string | null; payment_notes: string | null }
): Promise<void> {
  const [inv] = await db
    .select({ status: invoices.status, bill_number: invoices.bill_number })
    .from(invoices)
    .where(eq(invoices.id, id));

  if (!inv) throw new Error("Invoice not found.");
  if (inv.status !== INVOICE_STATUS.FINALIZED)
    throw new Error(`Only Finalized invoices can be marked as paid. ${inv.bill_number} is ${inv.status}.`);
  if (!(Object.values(PAYMENT_STATUS) as string[]).includes(data.payment_status))
    throw new Error("Invalid payment status.");

  await db.update(invoices).set({
    payment_status: data.payment_status,
    payment_date: data.payment_date || null,
    payment_notes: data.payment_notes || null,
  }).where(eq(invoices.id, id));
  revalidatePath("/invoice");
  revalidatePath("/");
}

export async function getLinkedSlipsForInvoice(invoiceId: string): Promise<{ id: string; slip_number: number; issue_date: string; item_count: number }[]> {
  const rows = await db
    .select({
      id: materialIssues.id,
      slip_number: materialIssues.slip_number,
      issue_date: materialIssues.issue_date,
    })
    .from(invoiceSlipLinks)
    .innerJoin(materialIssues, eq(invoiceSlipLinks.slip_id, materialIssues.id))
    .where(eq(invoiceSlipLinks.invoice_id, invoiceId));

  return rows.map((r) => ({
    id: r.id,
    slip_number: r.slip_number,
    issue_date: r.issue_date.toISOString(),
    item_count: 0,
  }));
}
