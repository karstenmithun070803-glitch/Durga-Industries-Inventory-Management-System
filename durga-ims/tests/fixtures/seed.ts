/**
 * Test fixture factories for Durga Industries IMS.
 *
 * Dependency order for insertion:
 *   Level 0 (no deps): Unit, TaxRate, Supplier, Contractor, Customer
 *   Level 1 (needs Level 0): Material (→ Unit, TaxRate), Vehicle (→ Customer), Stage
 *   Level 2 (needs Level 1): PurchaseOrder (→ Supplier), MaterialIssue (→ Vehicle)
 *
 * Each factory inserts a record and returns it with its id.
 * trackCreated() / cleanupAll() live in cleanup.ts.
 *
 * Usage:
 *   const mat = await createTestMaterial({ name: "Test Steel" });
 *   // ... test ...
 *   await cleanupAll();
 */

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
export { trackCreated, cleanupAll } from "./cleanup";

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
      name: "Test Material",
      purchase_unit_id: unit,
      sales_unit_id: unit,
      tax_rate_id: taxRate,
      opening_stock: "0",
      current_stock: "0",
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
    .values({ job_ref_no: jobRef, vehicle_name: "Test Vehicle", customer_id: customer, ...overrides })
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
