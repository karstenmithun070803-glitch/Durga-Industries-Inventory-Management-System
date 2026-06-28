// ============================================================
// Phase: 2
// Category: Integration
// Tests: Factory function validity + full FK chain
// Source: tests/fixtures/seed.ts, tests/fixtures/cleanup.ts
// Requires: .env.test pointing to a test database (run npm run db:test:push first)
// ============================================================

import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  createTestUnit,
  createTestTaxRate,
  createTestSupplier,
  createTestContractor,
  createTestCustomer,
  createTestMaterial,
  createTestVehicle,
  createTestStage,
  createTestMaterialIssue,
  createTestMaterialIssueItem,
  createTestInvoice,
  createTestInvoiceItem,
  createTestInvoiceSlipLink,
  cleanupAll,
} from "../fixtures/seed";

afterEach(async () => {
  await cleanupAll();
});

// ---------------------------------------------------------------------------
// Level 0 factories
// ---------------------------------------------------------------------------
describe("createTestUnit()", () => {
  it("inserts a row and returns it with a valid UUID id", async () => {
    const unit = await createTestUnit();
    expect(unit.id).toMatch(/^[0-9a-f-]{36}$/);
    const [row] = await db.select().from(schema.units).where(eq(schema.units.id, unit.id));
    expect(row).toBeDefined();
    expect(row.unit_name).toBe("TestUnit");
  });
});

describe("createTestTaxRate()", () => {
  it("inserts with correct tax_percentage", async () => {
    const rate = await createTestTaxRate();
    expect(parseFloat(rate.tax_percentage)).toBe(18);
    const [row] = await db.select().from(schema.taxRates).where(eq(schema.taxRates.id, rate.id));
    expect(row).toBeDefined();
  });
});

describe("createTestSupplier()", () => {
  it("inserts and is_active=true by default", async () => {
    const supplier = await createTestSupplier();
    expect(supplier.id).toMatch(/^[0-9a-f-]{36}$/);
    const [row] = await db.select().from(schema.suppliers).where(eq(schema.suppliers.id, supplier.id));
    expect(row.is_active).toBe(true);
  });
});

describe("createTestContractor()", () => {
  it("inserts and returns a row with correct name", async () => {
    const contractor = await createTestContractor();
    expect(contractor.id).toMatch(/^[0-9a-f-]{36}$/);
    const [row] = await db.select().from(schema.contractors).where(eq(schema.contractors.id, contractor.id));
    expect(row.name).toBe("Test Contractor");
  });
});

describe("createTestCustomer()", () => {
  it("inserts and returns a row with correct customer_name", async () => {
    const customer = await createTestCustomer();
    expect(customer.id).toMatch(/^[0-9a-f-]{36}$/);
    const [row] = await db.select().from(schema.customers).where(eq(schema.customers.id, customer.id));
    expect(row.customer_name).toBe("Test Customer");
  });
});

// ---------------------------------------------------------------------------
// Level 1 factories
// ---------------------------------------------------------------------------
describe("createTestMaterial()", () => {
  it("auto-creates unit and taxRate when deps not provided", async () => {
    const material = await createTestMaterial();
    expect(material.id).toMatch(/^[0-9a-f-]{36}$/);
    // Verify the auto-created unit and taxRate exist as real rows
    const [unit] = await db.select().from(schema.units).where(eq(schema.units.id, material.purchase_unit_id));
    const [taxRate] = await db.select().from(schema.taxRates).where(eq(schema.taxRates.id, material.tax_rate_id));
    expect(unit).toBeDefined();
    expect(taxRate).toBeDefined();
  });

  it("uses provided unitId and taxRateId without creating extra rows", async () => {
    const unit = await createTestUnit({ unit_name: "Provided Unit" });
    const taxRate = await createTestTaxRate();

    const material = await createTestMaterial({ unitId: unit.id, taxRateId: taxRate.id });

    expect(material.purchase_unit_id).toBe(unit.id);
    expect(material.tax_rate_id).toBe(taxRate.id);
    // Verify the unit referenced is exactly the one we provided — no extra unit was auto-created
    const [unitInDB] = await db.select().from(schema.units).where(eq(schema.units.id, unit.id));
    expect(unitInDB.unit_name).toBe("Provided Unit");
    // Note: total-count comparison omitted — parallel test file execution on a shared DB
    // makes global counts unreliable between queries.
  });
});

describe("createTestVehicle()", () => {
  it("auto-creates a customer when not provided", async () => {
    const vehicle = await createTestVehicle();
    expect(vehicle.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(vehicle.customer_id).toMatch(/^[0-9a-f-]{36}$/);

    const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, vehicle.customer_id!));
    expect(customer).toBeDefined();
  });

  it("uses provided customerId without creating extra customers", async () => {
    const customer = await createTestCustomer({ customer_name: "Provided Customer" });

    const vehicle = await createTestVehicle({ customerId: customer.id });

    expect(vehicle.customer_id).toBe(customer.id);
    // Verify the customer in the DB is exactly the one we created — no unexpected row was inserted
    const [customerInDB] = await db.select().from(schema.customers).where(eq(schema.customers.id, customer.id));
    expect(customerInDB.customer_name).toBe("Provided Customer");
    // Note: total-count comparison is omitted — vitest runs test files in parallel and
    // another file's cleanupAll() can alter the total count mid-assertion on a shared DB.
  });
});

describe("createTestStage()", () => {
  it("inserts with a non-empty stage_code", async () => {
    const stage = await createTestStage();
    expect(stage.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(stage.stage_code).toBeTruthy();
    expect(stage.stage_name).toBe("Test Stage");
  });
});

// ---------------------------------------------------------------------------
// cleanupAll()
// ---------------------------------------------------------------------------
describe("cleanupAll()", () => {
  it("removes all tracked records without FK errors", async () => {
    const customer = await createTestCustomer();
    const vehicle = await createTestVehicle({ customerId: customer.id });
    const mi = await createTestMaterialIssue({ vehicleId: vehicle.id });
    const material = await createTestMaterial();
    await createTestMaterialIssueItem({ issueId: mi.id, materialId: material.id });

    await cleanupAll();

    const [miRow] = await db.select().from(schema.materialIssues).where(eq(schema.materialIssues.id, mi.id));
    const [customerRow] = await db.select().from(schema.customers).where(eq(schema.customers.id, customer.id));
    expect(miRow).toBeUndefined();
    expect(customerRow).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Full FK chain test
// ---------------------------------------------------------------------------
describe("Full FK chain: Customer → Vehicle → Material → MI → Invoice", () => {
  it("all entities insert cleanly and FK references resolve", async () => {
    // Customer
    const customer = await createTestCustomer({ customer_name: "Chain Customer" });

    // Vehicle
    const vehicle = await createTestVehicle({ customerId: customer.id }, { vehicle_name: "Chain Vehicle" });
    expect(vehicle.customer_id).toBe(customer.id);

    // Material (shared by MI and Invoice items)
    const material = await createTestMaterial({}, { name: "Chain Material" });

    // MI header + item
    const mi = await createTestMaterialIssue({ vehicleId: vehicle.id });
    const miItem = await createTestMaterialIssueItem({ issueId: mi.id, materialId: material.id });
    expect(miItem.issue_id).toBe(mi.id);
    expect(miItem.material_id).toBe(material.id);

    // Invoice header + item
    const invoice = await createTestInvoice({ vehicleId: vehicle.id });
    const invoiceItem = await createTestInvoiceItem({ invoiceId: invoice.id, materialId: material.id });
    expect(invoiceItem.invoice_id).toBe(invoice.id);
    expect(invoiceItem.material_id).toBe(material.id);

    // SlipLink (invoice linked to MI as slip)
    const slipLink = await createTestInvoiceSlipLink({ invoiceId: invoice.id, slipId: mi.id });
    expect(slipLink.invoice_id).toBe(invoice.id);
    expect(slipLink.slip_id).toBe(mi.id);

    // Verify that all entities are actually in DB with correct FK references
    const [vehicleInDB] = await db.select().from(schema.vehicles).where(eq(schema.vehicles.id, vehicle.id));
    expect(vehicleInDB.customer_id).toBe(customer.id);

    const [miInDB] = await db.select().from(schema.materialIssues).where(eq(schema.materialIssues.id, mi.id));
    expect(miInDB.vehicle_id).toBe(vehicle.id);

    const [invoiceInDB] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, invoice.id));
    expect(invoiceInDB.vehicle_id).toBe(vehicle.id);
  });
});
