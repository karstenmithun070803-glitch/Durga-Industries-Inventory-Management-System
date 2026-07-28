/**
 * Test fixture factories for Durga Industries IMS.
 *
 * Dependency order for insertion:
 *   Level 0 (no deps): Unit, TaxRate, Supplier, Contractor, Customer
 *   Level 1 (needs Level 0): Material (→ Unit, TaxRate), Vehicle (→ Customer), Stage
 *   Level 2 (needs Level 1): PurchaseOrder (→ Supplier), MaterialIssue (→ Vehicle),
 *                             Invoice (→ Vehicle), StockLedgerEntry (→ Material)
 *   Level 3 (needs Level 2): PurchaseOrderItem, MaterialIssueItem, InvoiceItem,
 *                             InvoiceSlipLink, InvoiceInsurance, StageMaterial
 *
 * Each factory inserts a record and returns it with its id.
 * trackCreated() / cleanupAll() live in cleanup.ts.
 *
 * Usage:
 *   const mat = await createTestMaterial();
 *   // ... test ...
 *   await cleanupAll();
 */

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { trackCreated } from "./cleanup";
export { trackCreated, cleanupAll } from "./cleanup";

// ---------------------------------------------------------------------------
// Unique value generator — unique integers per run AND across runs
// Random base avoids clashing with stale data from previous failed runs.
// Range: 1_000_000–9_000_000 — well within postgres INTEGER max (2.1B).
// ---------------------------------------------------------------------------
const _RUN_BASE = Math.floor(Math.random() * 8_000_000) + 1_000_000;
let _seq = 0;
function nextSeq() {
  return _RUN_BASE + (++_seq);
}

// Default test financial year — far future, no conflict with real data
const TEST_FY = "2099-2100";
const PREV_TEST_FY = "2098-2099";
export { TEST_FY, PREV_TEST_FY };

// ---------------------------------------------------------------------------
// Level 0 factories — no FK dependencies
// ---------------------------------------------------------------------------

export async function createTestUnit(
  overrides: Partial<typeof schema.units.$inferInsert> = {}
) {
  const [row] = await db
    .insert(schema.units)
    .values({ unit_name: "TestUnit", ...overrides })
    .returning();
  trackCreated("units", row.id);
  return row;
}

export async function createTestTaxRate(
  overrides: Partial<typeof schema.taxRates.$inferInsert> = {}
) {
  const [row] = await db
    .insert(schema.taxRates)
    .values({ tax_percentage: "18", description: "Test GST 18%", ...overrides })
    .returning();
  trackCreated("taxRates", row.id);
  return row;
}

export async function createTestSupplier(
  overrides: Partial<typeof schema.suppliers.$inferInsert> = {}
) {
  const [row] = await db
    .insert(schema.suppliers)
    .values({ name: "Test Supplier", ...overrides })
    .returning();
  trackCreated("suppliers", row.id);
  return row;
}

export async function createTestContractor(
  overrides: Partial<typeof schema.contractors.$inferInsert> = {}
) {
  const [row] = await db
    .insert(schema.contractors)
    .values({ name: "Test Contractor", ...overrides })
    .returning();
  trackCreated("contractors", row.id);
  return row;
}

export async function createTestCustomer(
  overrides: Partial<typeof schema.customers.$inferInsert> = {}
) {
  const [row] = await db
    .insert(schema.customers)
    .values({ customer_name: "Test Customer", ...overrides })
    .returning();
  trackCreated("customers", row.id);
  return row;
}

// ---------------------------------------------------------------------------
// Level 1 factories — depend on Level 0
// ---------------------------------------------------------------------------

export async function createTestMaterial(
  deps: { unitId?: string; taxRateId?: string } = {},
  overrides: Partial<typeof schema.materials.$inferInsert> = {}
) {
  const unit = deps.unitId ?? (await createTestUnit()).id;
  const taxRate = deps.taxRateId ?? (await createTestTaxRate()).id;
  const [row] = await db
    .insert(schema.materials)
    .values({
      // Unique per call: materials has a UNIQUE index on lower(trim(name)), so a fixed
      // default name makes any test that creates two materials fail with 23505.
      // Tests that care about the name pass an override.
      name: `Test Material ${nextSeq()}`,
      purchase_unit_id: unit,
      sales_unit_id: unit,
      tax_rate_id: taxRate,
      opening_stock: "0",
      current_stock: "0",
      // A material needs BOTH base_rate and buffer to be purchasable (validateRateBand
      // blocks otherwise). Default to an effectively unbounded band so tests that are not
      // about the band can still create/receive POs. Band tests override these (incl. null).
      base_rate: "9999999.0000",
      buffer: "9999999.0000",
      ...overrides,
    })
    .returning();
  trackCreated("materials", row.id);
  return row;
}

export async function createTestVehicle(
  deps: { customerId?: string | null } = {},
  overrides: Partial<typeof schema.vehicles.$inferInsert> = {}
) {
  const customer =
    deps.customerId !== undefined
      ? deps.customerId
      : (await createTestCustomer()).id;
  const jobRef = `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const [row] = await db
    .insert(schema.vehicles)
    .values({ job_ref_no: jobRef, customer_id: customer, ...overrides })
    .returning();
  trackCreated("vehicles", row.id);
  return row;
}

export async function createTestStage(
  overrides: Partial<typeof schema.stages.$inferInsert> = {}
) {
  const code = `TS${Date.now().toString().slice(-4)}`;
  const [row] = await db
    .insert(schema.stages)
    .values({ stage_code: code, stage_name: "Test Stage", ...overrides })
    .returning();
  trackCreated("stages", row.id);
  return row;
}

// ---------------------------------------------------------------------------
// Level 2 factories — depend on Level 1
// ---------------------------------------------------------------------------

export async function createTestPurchaseOrder(
  deps: { supplierId?: string } = {},
  overrides: Partial<typeof schema.purchaseOrders.$inferInsert> = {}
) {
  const supplier = deps.supplierId ?? (await createTestSupplier()).id;
  const poNum = nextSeq();
  const [row] = await db
    .insert(schema.purchaseOrders)
    .values({
      po_number: poNum,
      supplier_id: supplier,
      financial_year: TEST_FY,
      total_amount: "0",
      status: "Draft",
      affects_stock: true,
      ...overrides,
    })
    .returning();
  trackCreated("purchaseOrders", row.id);
  return row;
}

export async function createTestMaterialIssue(
  deps: { vehicleId?: string } = {},
  overrides: Partial<typeof schema.materialIssues.$inferInsert> = {}
) {
  const vehicle = deps.vehicleId ?? (await createTestVehicle()).id;
  const [row] = await db
    .insert(schema.materialIssues)
    .values({
      vehicle_id: vehicle,
      financial_year: TEST_FY,
      status: "Draft",
      issue_type: "OLD",
      total_amount: "0",
      ...overrides,
    })
    .returning();
  trackCreated("materialIssues", row.id);
  return row;
}

export async function createTestInvoice(
  deps: { vehicleId?: string } = {},
  overrides: Partial<typeof schema.invoices.$inferInsert> = {}
) {
  const vehicle = deps.vehicleId ?? (await createTestVehicle()).id;
  const billNum = `T-${nextSeq()}`;
  const [row] = await db
    .insert(schema.invoices)
    .values({
      bill_number: billNum,
      vehicle_id: vehicle,
      financial_year: TEST_FY,
      status: "Draft",
      net_amount: "0",
      rev_charge_status: false,
      payment_status: "Unpaid",
      ...overrides,
    })
    .returning();
  trackCreated("invoices", row.id);
  return row;
}

export async function createTestStockLedgerEntry(
  deps: { materialId: string },
  overrides: Partial<typeof schema.stockLedger.$inferInsert> = {}
) {
  const [row] = await db
    .insert(schema.stockLedger)
    .values({
      material_id: deps.materialId,
      transaction_type: "PO_INWARD",
      qty_change: "0",
      stock_after: "0",
      ...overrides,
    })
    .returning();
  trackCreated("stockLedger", row.id);
  return row;
}

// ---------------------------------------------------------------------------
// Level 3 factories — depend on Level 2
// ---------------------------------------------------------------------------

export async function createTestPurchaseOrderItem(
  deps: { poId: string; materialId?: string; unitId?: string },
  overrides: Partial<typeof schema.purchaseOrderItems.$inferInsert> = {}
) {
  const material = deps.materialId ?? (await createTestMaterial()).id;
  const unit = deps.unitId ?? (await createTestUnit()).id;
  const [row] = await db
    .insert(schema.purchaseOrderItems)
    .values({
      po_id: deps.poId,
      material_id: material,
      qty: "1",
      unit_id: unit,
      rate: "100",
      tax_percentage: "18",
      gst_type: "IGST",
      cgst_amount: "0",
      sgst_amount: "0",
      igst_amount: "18",
      amount: "100",
      ...overrides,
    })
    .returning();
  trackCreated("purchaseOrderItems", row.id);
  return row;
}

export async function createTestMaterialIssueItem(
  deps: { issueId: string; materialId?: string; unitId?: string },
  overrides: Partial<typeof schema.materialIssueItems.$inferInsert> = {}
) {
  const material = deps.materialId ?? (await createTestMaterial()).id;
  const unit = deps.unitId ?? (await createTestUnit()).id;
  const [row] = await db
    .insert(schema.materialIssueItems)
    .values({
      issue_id: deps.issueId,
      material_id: material,
      qty: "1",
      unit_id: unit,
      rate: "100",
      tax_percentage: "18",
      gst_type: "IGST",
      cgst_amount: "0",
      sgst_amount: "0",
      igst_amount: "18",
      amount: "100",
      affects_inventory: true,
      ...overrides,
    })
    .returning();
  trackCreated("materialIssueItems", row.id);
  return row;
}

export async function createTestInvoiceItem(
  deps: { invoiceId: string; materialId?: string; unitId?: string },
  overrides: Partial<typeof schema.invoiceItems.$inferInsert> = {}
) {
  const material = deps.materialId ?? (await createTestMaterial()).id;
  const unit = deps.unitId ?? (await createTestUnit()).id;
  const [row] = await db
    .insert(schema.invoiceItems)
    .values({
      invoice_id: deps.invoiceId,
      material_id: material,
      qty: "1",
      unit_id: unit,
      rate: "100",
      tax_percentage: "18",
      gst_type: "IGST",
      cgst_amount: "0",
      sgst_amount: "0",
      igst_amount: "18",
      amount: "100",
      ...overrides,
    })
    .returning();
  trackCreated("invoiceItems", row.id);
  return row;
}

export async function createTestInvoiceSlipLink(
  deps: { invoiceId: string; slipId: string }
) {
  const [row] = await db
    .insert(schema.invoiceSlipLinks)
    .values({ invoice_id: deps.invoiceId, slip_id: deps.slipId })
    .returning();
  trackCreated("invoiceSlipLinks", row.id);
  return row;
}

export async function createTestInvoiceInsurance(
  deps: { invoiceId: string },
  overrides: Partial<typeof schema.invoiceInsurance.$inferInsert> = {}
) {
  const [row] = await db
    .insert(schema.invoiceInsurance)
    .values({
      invoice_id: deps.invoiceId,
      bill_date: new Date().toISOString().split("T")[0],
      gst_type: "IGST",
      status: "Draft",
      net_amount: "0",
      tax_percentage: "18",
      material_margin: "0",
      discount: "0",
      include_tax: false,
      ...overrides,
    })
    .returning();
  trackCreated("invoiceInsurance", row.id);
  return row;
}

export async function createTestStageMaterial(
  deps: { stageId: string; materialId?: string; unitId?: string },
  overrides: Partial<typeof schema.stageMaterials.$inferInsert> = {}
) {
  const material = deps.materialId ?? (await createTestMaterial()).id;
  const unit = deps.unitId ?? (await createTestUnit()).id;
  const [row] = await db
    .insert(schema.stageMaterials)
    .values({
      stage_id: deps.stageId,
      material_id: material,
      unit_id: unit,
      default_qty: "1",
      ...overrides,
    })
    .returning();
  trackCreated("stageMaterials", row.id);
  return row;
}
