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
import { eq, and, sql, desc, like, notExists, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getFinancialYearRange } from "@/types";
import type { InvoiceWithDetails, InvoiceItemWithDetails, InvoiceRow } from "@/types";

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
  issue_id: string | null;
  slip_ids: string[];
  bill_date: string;
  rate_date: string | null;
  inv_prefix: string;
  financial_year: string;
  tax_percentage: string;
  material_margin: string;
  discount: string;
  net_amount: string;
  rev_charge_status: boolean;
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
      .orderBy(desc(invoices.created_at))
      .limit(100);

    for (const row of result) {
      // parse "D-00042" → 42
      const parts = row.bill_number.split("-");
      if (parts.length === 2) {
        const seq = parseInt(parts[1], 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    }
  } else {
    // No prefix — find max purely-numeric bill numbers for this FY
    const result = await db
      .select({ bill_number: invoices.bill_number })
      .from(invoices)
      .where(eq(invoices.financial_year, financialYear))
      .orderBy(desc(invoices.created_at))
      .limit(100);

    for (const row of result) {
      const seq = parseInt(row.bill_number, 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  }

  return buildBillNumber(prefix, maxSeq + 1);
}

export async function peekNextBillNumber(invPrefix: string | null | undefined, financialYear: string): Promise<string> {
  return getNextBillNumber(invPrefix, financialYear);
}

function validateInvoiceItems(items: InvoiceItemInput[], discount: string) {
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

  // Discount hard block
  const subtotal = items.reduce((s, i) => s + parseFloat(i.amount || "0"), 0);
  const discountAmt = parseFloat(discount || "0");
  if (discountAmt < 0) throw new Error("Discount cannot be negative.");
  if (discountAmt > subtotal) throw new Error(`Discount (₹${discountAmt.toFixed(2)}) cannot exceed invoice total (₹${subtotal.toFixed(2)}).`);
}

// ---------------------------------------------------------------------------
// Read — dropdown data
// ---------------------------------------------------------------------------

export async function getActiveVehiclesForInvoice() {
  const rows = await db
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
    .orderBy(vehicles.job_ref_no);
  return rows;
}

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

  const withCounts = await Promise.all(
    rows.map(async (mi) => {
      const countResult = await db
        .select({ cnt: sql<number>`COUNT(*)` })
        .from(materialIssueItems)
        .where(eq(materialIssueItems.issue_id, mi.id));
      return {
        ...mi,
        issue_date: mi.issue_date.toISOString(),
        item_count: Number(countResult[0]?.cnt ?? 0),
      };
    })
  );
  return withCounts;
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

  const result = await Promise.all(
    slips.map(async (slip) => {
      const items = await getMIItemsForInvoice(slip.id);
      return {
        slip_id: slip.id,
        slip_number: slip.slip_number,
        issue_date: slip.issue_date.toISOString(),
        items,
      };
    })
  );

  return result;
}

export async function getActiveTaxRatesWithPrefix() {
  return db
    .select({
      id: taxRates.id,
      vat_code: taxRates.vat_code,
      tax_percentage: taxRates.tax_percentage,
      description: taxRates.description,
      inv_prefix: taxRates.inv_prefix,
    })
    .from(taxRates)
    .where(and(eq(taxRates.is_active, true)))
    .orderBy(taxRates.vat_code);
}

export async function getActiveInvoiceMaterials() {
  const rows = await db
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
    .orderBy(materials.material_no);
  return rows;
}

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
      issue_id: invoices.issue_id,
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
    .where(eq(invoices.financial_year, financialYear))
    .orderBy(desc(invoices.bill_date), desc(invoices.bill_number));

  return rows.map((r) => ({
    ...r,
    bill_date: r.bill_date.toISOString(),
    rate_date: r.rate_date?.toISOString() ?? null,
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
      issue_id: invoices.issue_id,
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
    issue_id: h.issue_id,
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
  validateInvoiceItems(data.items, data.discount);

  // Date within FY
  const fyRange = getFinancialYearRange(data.financial_year);
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

  let invoice: { id: string };
  try {
    [invoice] = await db
      .insert(invoices)
      .values({
        bill_number: billNumber,
        bill_date: new Date(data.bill_date),
        rate_date: data.rate_date ? new Date(data.rate_date) : null,
        tax_percentage: data.tax_percentage,
        material_margin: data.material_margin,
        discount: data.discount,
        vehicle_id: data.vehicle_id,
        issue_id: data.issue_id || null,
        net_amount: data.net_amount,
        rev_charge_status: data.rev_charge_status,
        financial_year: data.financial_year,
        status: "Draft",
        customer_name: vData?.customer_name ?? null,
        customer_gstin: vData?.customer_gstin ?? null,
        customer_state: vData?.customer_state ?? null,
        customer_address,
      })
      .returning({ id: invoices.id });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("bill_number_fy_unique")) {
      throw new Error("Bill number conflict — another invoice was just created with the same number. Please try saving again.");
    }
    throw e;
  }

  await db.insert(invoiceItems).values(
    data.items.map((item) => ({
      invoice_id: invoice.id,
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
    await db.insert(invoiceSlipLinks).values(
      data.slip_ids.map((slipId) => ({ invoice_id: invoice.id, slip_id: slipId }))
    );
  }

  revalidatePath("/invoice");
  return invoice.id;
}

export async function updateInvoice(id: string, data: InvoiceHeaderInput): Promise<void> {
  if (!data.vehicle_id) throw new Error("Vehicle is required.");
  validateInvoiceItems(data.items, data.discount);

  const fyRange = getFinancialYearRange(data.financial_year);
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

  // Delete old items, insert new ones (no stock impact ever)
  await db.delete(invoiceItems).where(eq(invoiceItems.invoice_id, id));

  await db
    .update(invoices)
    .set({
      bill_date: new Date(data.bill_date),
      rate_date: data.rate_date ? new Date(data.rate_date) : null,
      tax_percentage: data.tax_percentage,
      material_margin: data.material_margin,
      discount: data.discount,
      vehicle_id: data.vehicle_id,
      issue_id: data.issue_id || null,
      net_amount: data.net_amount,
      rev_charge_status: data.rev_charge_status,
      customer_name: vData?.customer_name ?? null,
      customer_gstin: vData?.customer_gstin ?? null,
      customer_state: vData?.customer_state ?? null,
      customer_address,
    })
    .where(eq(invoices.id, id));

  await db.insert(invoiceItems).values(
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
  await db.delete(invoiceSlipLinks).where(eq(invoiceSlipLinks.invoice_id, id));
  if (data.slip_ids.length > 0) {
    await db.insert(invoiceSlipLinks).values(
      data.slip_ids.map((slipId) => ({ invoice_id: id, slip_id: slipId }))
    );
  }

  revalidatePath("/invoice");
}

export async function finalizeInvoice(id: string): Promise<void> {
  await db.update(invoices).set({ status: "Finalized" }).where(eq(invoices.id, id));
  revalidatePath("/invoice");
}

export async function revertInvoiceToDraft(id: string): Promise<void> {
  await db.update(invoices).set({ status: "Draft" }).where(eq(invoices.id, id));
  revalidatePath("/invoice");
}

export async function deleteInvoice(id: string): Promise<void> {
  const inv = await db
    .select({ status: invoices.status, bill_number: invoices.bill_number })
    .from(invoices)
    .where(eq(invoices.id, id))
    .limit(1);

  if (!inv.length) throw new Error("Invoice not found.");
  if (inv[0].status === "Finalized")
    throw new Error(
      `Finalized invoice ${inv[0].bill_number} cannot be deleted. Revert to Draft or Cancel it first.`
    );
  if (inv[0].status === "Cancelled")
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
  if (inv.status === "Cancelled") throw new Error(`${inv.bill_number} is already cancelled.`);

  // Free MI slips so they can be used in a corrective invoice
  await db.delete(invoiceSlipLinks).where(eq(invoiceSlipLinks.invoice_id, id));
  await db.update(invoices).set({ status: "Cancelled" }).where(eq(invoices.id, id));
  revalidatePath("/invoice");
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
