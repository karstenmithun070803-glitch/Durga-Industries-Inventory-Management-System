// ============================================================
// Phase: 2
// Category: Integration
// Tests: Financial year data isolation
// Critical: any query returning wrong-FY data is a business bug (mixed financial data)
// Source: src/lib/db/schema.ts (purchaseOrders, invoices, materialIssues)
// Requires: .env.test pointing to a test database (run npm run db:test:push first)
// ============================================================

import { afterEach, describe, expect, it } from "vitest";
import { and, eq, max, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  createTestSupplier,
  createTestVehicle,
  createTestMaterial,
  cleanupAll,
  TEST_FY,
  PREV_TEST_FY,
} from "../fixtures/seed";
import { trackCreated } from "../fixtures/cleanup";

// Two non-overlapping FYs for all FY isolation tests
const FY_A = TEST_FY;        // "2099-2100"
const FY_B = PREV_TEST_FY;   // "2098-2099"

afterEach(async () => {
  await cleanupAll();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function insertPO(supplierId: string, poNumber: number, fy: string) {
  const [row] = await db.insert(schema.purchaseOrders).values({
    po_number: poNumber,
    supplier_id: supplierId,
    financial_year: fy,
    total_amount: "0",
    status: "Draft",
    affects_stock: true,
  }).returning();
  trackCreated("purchaseOrders", row.id);
  return row;
}

async function insertInvoice(vehicleId: string, billNumber: string, fy: string) {
  const [row] = await db.insert(schema.invoices).values({
    bill_number: billNumber,
    vehicle_id: vehicleId,
    financial_year: fy,
    status: "Draft",
    net_amount: "0",
    rev_charge_status: false,
    payment_status: "Unpaid",
  }).returning();
  trackCreated("invoices", row.id);
  return row;
}

async function insertMI(vehicleId: string, fy: string, issueType: "NEW" | "OLD" = "OLD") {
  const [row] = await db.insert(schema.materialIssues).values({
    vehicle_id: vehicleId,
    financial_year: fy,
    status: "Draft",
    issue_type: issueType,
    total_amount: "0",
  }).returning();
  trackCreated("materialIssues", row.id);
  return row;
}

// ---------------------------------------------------------------------------
// PO FY isolation
// ---------------------------------------------------------------------------
describe("PO financial_year isolation", () => {
  it("PO in FY_A is NOT returned by a query filtering on FY_B", async () => {
    const supplier = await createTestSupplier();
    await insertPO(supplier.id, 7001, FY_A);

    const rows = await db.select()
      .from(schema.purchaseOrders)
      .where(and(
        eq(schema.purchaseOrders.supplier_id, supplier.id),
        eq(schema.purchaseOrders.financial_year, FY_B)
      ));

    expect(rows).toHaveLength(0);
  });

  it("PO in FY_A IS returned by a query filtering on FY_A", async () => {
    const supplier = await createTestSupplier();
    const po = await insertPO(supplier.id, 7002, FY_A);

    const rows = await db.select()
      .from(schema.purchaseOrders)
      .where(and(
        eq(schema.purchaseOrders.id, po.id),
        eq(schema.purchaseOrders.financial_year, FY_A)
      ));

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(po.id);
  });
});

// ---------------------------------------------------------------------------
// Invoice FY isolation
// ---------------------------------------------------------------------------
describe("Invoice financial_year isolation", () => {
  it("Invoice in FY_A is NOT returned by a query filtering on FY_B", async () => {
    const vehicle = await createTestVehicle();
    await insertInvoice(vehicle.id, "Z-07001", FY_A);

    const rows = await db.select()
      .from(schema.invoices)
      .where(and(
        eq(schema.invoices.vehicle_id, vehicle.id),
        eq(schema.invoices.financial_year, FY_B)
      ));

    expect(rows).toHaveLength(0);
  });

  it("Invoice in FY_A IS returned by a query filtering on FY_A", async () => {
    const vehicle = await createTestVehicle();
    const invoice = await insertInvoice(vehicle.id, "Z-07002", FY_A);

    const rows = await db.select()
      .from(schema.invoices)
      .where(and(
        eq(schema.invoices.id, invoice.id),
        eq(schema.invoices.financial_year, FY_A)
      ));

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(invoice.id);
  });
});

// ---------------------------------------------------------------------------
// MaterialIssue FY isolation
// ---------------------------------------------------------------------------
describe("MaterialIssue financial_year isolation", () => {
  it("MI in FY_A is NOT returned by a query filtering on FY_B", async () => {
    const vehicle = await createTestVehicle();
    await insertMI(vehicle.id, FY_A, "OLD");

    const rows = await db.select()
      .from(schema.materialIssues)
      .where(and(
        eq(schema.materialIssues.vehicle_id, vehicle.id),
        eq(schema.materialIssues.financial_year, FY_B)
      ));

    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// UNIQUE constraints allow same sequence numbers across FYs
// ---------------------------------------------------------------------------
describe("UNIQUE allows same po_number in different FYs", () => {
  it("po_number=7777 can exist in both FY_A and FY_B without conflict", async () => {
    const supplier = await createTestSupplier();
    const po1 = await insertPO(supplier.id, 7777, FY_A);
    const po2 = await insertPO(supplier.id, 7777, FY_B);

    expect(po1.id).not.toBe(po2.id);
    expect(po1.po_number).toBe(7777);
    expect(po2.po_number).toBe(7777);
  });
});

describe("UNIQUE allows same bill_number in different FYs", () => {
  it("bill_number='Z-00001' can exist in both FY_A and FY_B without conflict", async () => {
    const vehicle = await createTestVehicle();
    const inv1 = await insertInvoice(vehicle.id, "Z-00001", FY_A);
    const inv2 = await insertInvoice(vehicle.id, "Z-00001", FY_B);

    expect(inv1.id).not.toBe(inv2.id);
  });
});

describe("Vehicle MI unique: same vehicle can have OLD-type MI in different FYs", () => {
  it("same vehicle + OLD type in FY_A and FY_B both insert successfully", async () => {
    const vehicle = await createTestVehicle();
    const mi1 = await insertMI(vehicle.id, FY_A, "OLD");
    const mi2 = await insertMI(vehicle.id, FY_B, "OLD");

    expect(mi1.id).not.toBe(mi2.id);
    expect(mi1.financial_year).toBe(FY_A);
    expect(mi2.financial_year).toBe(FY_B);
  });
});

// ---------------------------------------------------------------------------
// MAX(po_number) FY filter only counts that FY's POs
// ---------------------------------------------------------------------------
describe("MAX(po_number) is FY-scoped", () => {
  it("MAX(po_number) WHERE financial_year=FY_A counts only FY_A POs, not FY_B POs", async () => {
    const supplier = await createTestSupplier();
    // FY_B has a higher po_number (5) than FY_A (1)
    await insertPO(supplier.id, 5, FY_B);
    await insertPO(supplier.id, 1, FY_A);

    const [result] = await db
      .select({ maxPo: max(schema.purchaseOrders.po_number) })
      .from(schema.purchaseOrders)
      .where(eq(schema.purchaseOrders.financial_year, FY_A));

    // Should be 1 (only FY_A counted), not 5 (which belongs to FY_B)
    expect(result.maxPo).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// MAX(bill_number suffix) FY filter
// ---------------------------------------------------------------------------
describe("Invoice sequence number is FY-scoped", () => {
  it("counting invoices WHERE financial_year=FY_A ignores FY_B invoices", async () => {
    const vehicle = await createTestVehicle();
    // Insert 3 invoices in FY_B, 1 in FY_A
    await insertInvoice(vehicle.id, "Z-10001", FY_B);
    await insertInvoice(vehicle.id, "Z-10002", FY_B);
    await insertInvoice(vehicle.id, "Z-10003", FY_B);
    await insertInvoice(vehicle.id, "Z-20001", FY_A);

    const rows = await db
      .select()
      .from(schema.invoices)
      .where(and(
        eq(schema.invoices.vehicle_id, vehicle.id),
        eq(schema.invoices.financial_year, FY_A)
      ));

    expect(rows).toHaveLength(1);
    expect(rows[0].bill_number).toBe("Z-20001");
  });
});

// ---------------------------------------------------------------------------
// stockLedger has no FY filter — all entries visible across FYs
// ---------------------------------------------------------------------------
describe("stockLedger has no financial_year column", () => {
  it("all ledger entries for a material are visible regardless of when they were created", async () => {
    const material = await createTestMaterial();

    // Insert two ledger entries (no FY concept in stockLedger)
    const [e1] = await db.insert(schema.stockLedger).values({
      material_id: material.id,
      transaction_type: "PO_INWARD",
      qty_change: "10",
      stock_after: "10",
    }).returning();
    trackCreated("stockLedger", e1.id);

    const [e2] = await db.insert(schema.stockLedger).values({
      material_id: material.id,
      transaction_type: "ISSUE",
      qty_change: "-5",
      stock_after: "5",
    }).returning();
    trackCreated("stockLedger", e2.id);

    const allEntries = await db
      .select()
      .from(schema.stockLedger)
      .where(eq(schema.stockLedger.material_id, material.id));

    expect(allEntries).toHaveLength(2);
  });
});
