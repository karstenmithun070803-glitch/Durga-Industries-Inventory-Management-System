// ============================================================
// Phase: 2
// Category: Integration
// Tests: Database schema constraint enforcement (UNIQUE, CHECK, FK, CASCADE)
// Source: src/lib/db/schema.ts
// Requires: .env.test pointing to a test database (run npm run db:test:push first)
// ============================================================

import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  createTestCustomer,
  createTestInvoice,
  createTestInvoiceInsurance,
  createTestMaterial,
  createTestMaterialIssue,
  createTestPurchaseOrder,
  createTestStage,
  createTestStageMaterial,
  createTestSupplier,
  createTestTaxRate,
  createTestUnit,
  createTestVehicle,
  cleanupAll,
  TEST_FY,
  PREV_TEST_FY,
} from "../fixtures/seed";
import { trackCreated } from "../fixtures/cleanup";

afterEach(async () => {
  await cleanupAll();
});

// ---------------------------------------------------------------------------
// CHECK constraint — materials.current_stock >= 0
// ---------------------------------------------------------------------------
describe("materials CHECK constraint (current_stock >= 0)", () => {
  it("setting current_stock to a negative value throws a CHECK violation", async () => {
    const material = await createTestMaterial({}, { current_stock: "10" });

    // Drizzle+postgres.js wraps the Postgres error in "Failed query: ..." so we cannot
    // match the constraint name in error.message — but the error IS thrown, confirming the
    // CHECK constraint is enforced at the DB level.
    await expect(
      db.update(schema.materials)
        .set({ current_stock: "-1" })
        .where(eq(schema.materials.id, material.id))
    ).rejects.toThrow();
  });

  it("setting current_stock to zero is allowed", async () => {
    const material = await createTestMaterial({}, { current_stock: "5" });

    await expect(
      db.update(schema.materials)
        .set({ current_stock: "0" })
        .where(eq(schema.materials.id, material.id))
    ).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// COMPOSITE UNIQUE — purchaseOrders (po_number, financial_year)
// ---------------------------------------------------------------------------
describe("purchaseOrders UNIQUE (po_number, financial_year)", () => {
  it("inserting two POs with the same po_number + same FY throws unique violation", async () => {
    const supplier = await createTestSupplier();
    await db.insert(schema.purchaseOrders).values({
      po_number: 8001,
      supplier_id: supplier.id,
      financial_year: TEST_FY,
      total_amount: "0",
      status: "Draft",
      affects_stock: true,
    }).returning().then(([r]) => trackCreated("purchaseOrders", r.id));

    await expect(
      db.insert(schema.purchaseOrders).values({
        po_number: 8001,
        supplier_id: supplier.id,
        financial_year: TEST_FY,
        total_amount: "0",
        status: "Draft",
        affects_stock: true,
      })
    ).rejects.toThrow();
  });

  it("same po_number in a different FY succeeds", async () => {
    const supplier = await createTestSupplier();

    const [r1] = await db.insert(schema.purchaseOrders).values({
      po_number: 8002,
      supplier_id: supplier.id,
      financial_year: TEST_FY,
      total_amount: "0",
      status: "Draft",
      affects_stock: true,
    }).returning();
    trackCreated("purchaseOrders", r1.id);

    const [r2] = await db.insert(schema.purchaseOrders).values({
      po_number: 8002,
      supplier_id: supplier.id,
      financial_year: PREV_TEST_FY,
      total_amount: "0",
      status: "Draft",
      affects_stock: true,
    }).returning();
    trackCreated("purchaseOrders", r2.id);

    expect(r1.id).not.toBe(r2.id);
  });
});

// ---------------------------------------------------------------------------
// COMPOSITE UNIQUE — invoices (bill_number, financial_year)
// ---------------------------------------------------------------------------
describe("invoices UNIQUE (bill_number, financial_year)", () => {
  it("inserting two invoices with the same bill_number + same FY throws unique violation", async () => {
    const vehicle = await createTestVehicle();
    await db.insert(schema.invoices).values({
      bill_number: "X-00001",
      vehicle_id: vehicle.id,
      financial_year: TEST_FY,
      status: "Draft",
      net_amount: "0",
      rev_charge_status: false,
      payment_status: "Unpaid",
    }).returning().then(([r]) => trackCreated("invoices", r.id));

    await expect(
      db.insert(schema.invoices).values({
        bill_number: "X-00001",
        vehicle_id: vehicle.id,
        financial_year: TEST_FY,
        status: "Draft",
        net_amount: "0",
        rev_charge_status: false,
        payment_status: "Unpaid",
      })
    ).rejects.toThrow();
  });

  it("same bill_number in a different FY succeeds", async () => {
    const vehicle = await createTestVehicle();

    const [r1] = await db.insert(schema.invoices).values({
      bill_number: "X-00002",
      vehicle_id: vehicle.id,
      financial_year: TEST_FY,
      status: "Draft",
      net_amount: "0",
      rev_charge_status: false,
      payment_status: "Unpaid",
    }).returning();
    trackCreated("invoices", r1.id);

    const [r2] = await db.insert(schema.invoices).values({
      bill_number: "X-00002",
      vehicle_id: vehicle.id,
      financial_year: PREV_TEST_FY,
      status: "Draft",
      net_amount: "0",
      rev_charge_status: false,
      payment_status: "Unpaid",
    }).returning();
    trackCreated("invoices", r2.id);

    expect(r1.id).not.toBe(r2.id);
  });
});

// ---------------------------------------------------------------------------
// COMPOSITE UNIQUE — materialIssues (vehicle_id, issue_type, financial_year)
// ---------------------------------------------------------------------------
describe("materialIssues UNIQUE (vehicle_id, issue_type, financial_year)", () => {
  it("two NEW-type MIs for the same vehicle + same FY → unique violation", async () => {
    const vehicle = await createTestVehicle();
    await db.insert(schema.materialIssues).values({
      vehicle_id: vehicle.id,
      financial_year: TEST_FY,
      status: "Draft",
      issue_type: "NEW",
      total_amount: "0",
    }).returning().then(([r]) => trackCreated("materialIssues", r.id));

    await expect(
      db.insert(schema.materialIssues).values({
        vehicle_id: vehicle.id,
        financial_year: TEST_FY,
        status: "Draft",
        issue_type: "NEW",
        total_amount: "0",
      })
    ).rejects.toThrow();
  });

  it("two OLD-type MIs for the same vehicle + same FY → unique violation", async () => {
    const vehicle = await createTestVehicle();
    await db.insert(schema.materialIssues).values({
      vehicle_id: vehicle.id,
      financial_year: TEST_FY,
      status: "Draft",
      issue_type: "OLD",
      total_amount: "0",
    }).returning().then(([r]) => trackCreated("materialIssues", r.id));

    await expect(
      db.insert(schema.materialIssues).values({
        vehicle_id: vehicle.id,
        financial_year: TEST_FY,
        status: "Draft",
        issue_type: "OLD",
        total_amount: "0",
      })
    ).rejects.toThrow();
  });

  it("same vehicle + same type + different FY → both rows insert successfully", async () => {
    const vehicle = await createTestVehicle();
    const [r1] = await db.insert(schema.materialIssues).values({
      vehicle_id: vehicle.id,
      financial_year: TEST_FY,
      status: "Draft",
      issue_type: "OLD",
      total_amount: "0",
    }).returning();
    trackCreated("materialIssues", r1.id);

    const [r2] = await db.insert(schema.materialIssues).values({
      vehicle_id: vehicle.id,
      financial_year: PREV_TEST_FY,
      status: "Draft",
      issue_type: "OLD",
      total_amount: "0",
    }).returning();
    trackCreated("materialIssues", r2.id);

    expect(r1.id).not.toBe(r2.id);
  });
});

// ---------------------------------------------------------------------------
// COMPOSITE UNIQUE — stageMaterials (stage_id, material_id)
// ---------------------------------------------------------------------------
describe("stageMaterials UNIQUE (stage_id, material_id)", () => {
  it("inserting the same stage+material combination twice → unique violation", async () => {
    const stage = await createTestStage();
    const material = await createTestMaterial();
    const unit = await createTestUnit();

    await createTestStageMaterial({ stageId: stage.id, materialId: material.id, unitId: unit.id });

    await expect(
      db.insert(schema.stageMaterials).values({
        stage_id: stage.id,
        material_id: material.id,
        unit_id: unit.id,
        default_qty: "2",
      })
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// UNIQUE — invoiceInsurance (invoice_id)
// ---------------------------------------------------------------------------
describe("invoiceInsurance UNIQUE (invoice_id)", () => {
  it("inserting a second insurance bill for the same invoice → unique violation", async () => {
    const invoice = await createTestInvoice();
    await createTestInvoiceInsurance({ invoiceId: invoice.id });

    await expect(
      db.insert(schema.invoiceInsurance).values({
        invoice_id: invoice.id,
        bill_date: new Date().toISOString().split("T")[0],
        gst_type: "IGST",
        status: "Draft",
        net_amount: "0",
        tax_percentage: "18",
        material_margin: "0",
        discount: "0",
        include_tax: false,
      })
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// FK without CASCADE — invoiceInsurance.invoice_id blocks invoice deletion
// ---------------------------------------------------------------------------
describe("invoiceInsurance FK: deleting invoice with existing insurance bill fails", () => {
  it("FK violation when attempting to delete an invoice that has an insurance bill", async () => {
    const invoice = await createTestInvoice();
    const insurance = await createTestInvoiceInsurance({ invoiceId: invoice.id });

    await expect(
      db.delete(schema.invoices).where(eq(schema.invoices.id, invoice.id))
    ).rejects.toThrow();

    // Cleanup manually in correct order (insurance first, then invoice)
    await db.delete(schema.invoiceInsurance).where(eq(schema.invoiceInsurance.id, insurance.id));
    await db.delete(schema.invoices).where(eq(schema.invoices.id, invoice.id));
    // Remove from cleanup registry since we already deleted them
  });
});

// ---------------------------------------------------------------------------
// CASCADE — child rows deleted when parent is deleted
// ---------------------------------------------------------------------------
describe("CASCADE deletes", () => {
  it("deleting a PO removes its purchaseOrderItems", async () => {
    const po = await createTestPurchaseOrder();
    const material = await createTestMaterial();
    const unit = await createTestUnit();

    await db.insert(schema.purchaseOrderItems).values({
      po_id: po.id,
      material_id: material.id,
      unit_id: unit.id,
      qty: "1",
      rate: "100",
      tax_percentage: "18",
      gst_type: "IGST",
      cgst_amount: "0",
      sgst_amount: "0",
      igst_amount: "18",
      amount: "100",
    });

    // items are cascade-deleted when PO is deleted
    await db.delete(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, po.id));

    const items = await db.select()
      .from(schema.purchaseOrderItems)
      .where(eq(schema.purchaseOrderItems.po_id, po.id));
    expect(items).toHaveLength(0);
  });

  it("deleting an MI removes its materialIssueItems", async () => {
    const mi = await createTestMaterialIssue();
    const material = await createTestMaterial();
    const unit = await createTestUnit();

    await db.insert(schema.materialIssueItems).values({
      issue_id: mi.id,
      material_id: material.id,
      unit_id: unit.id,
      qty: "1",
      rate: "100",
      tax_percentage: "18",
      gst_type: "IGST",
      cgst_amount: "0",
      sgst_amount: "0",
      igst_amount: "18",
      amount: "100",
      affects_inventory: true,
    });

    await db.delete(schema.materialIssues).where(eq(schema.materialIssues.id, mi.id));

    const items = await db.select()
      .from(schema.materialIssueItems)
      .where(eq(schema.materialIssueItems.issue_id, mi.id));
    expect(items).toHaveLength(0);
  });

  it("deleting an invoice removes its invoiceItems", async () => {
    const invoice = await createTestInvoice();
    const material = await createTestMaterial();
    const unit = await createTestUnit();

    await db.insert(schema.invoiceItems).values({
      invoice_id: invoice.id,
      material_id: material.id,
      unit_id: unit.id,
      qty: "1",
      rate: "100",
      tax_percentage: "18",
      gst_type: "IGST",
      cgst_amount: "0",
      sgst_amount: "0",
      igst_amount: "18",
      amount: "100",
    });

    await db.delete(schema.invoices).where(eq(schema.invoices.id, invoice.id));

    const items = await db.select()
      .from(schema.invoiceItems)
      .where(eq(schema.invoiceItems.invoice_id, invoice.id));
    expect(items).toHaveLength(0);
  });

  it("deleting an insurance bill removes its invoiceInsuranceItems", async () => {
    const invoice = await createTestInvoice();
    const insurance = await createTestInvoiceInsurance({ invoiceId: invoice.id });

    await db.insert(schema.invoiceInsuranceItems).values({
      insurance_id: insurance.id,
      qty: "1",
      rate: "100",
      amount: "100",
      tax_percentage: "18",
      gst_type: "IGST",
      cgst_amount: "0",
      sgst_amount: "0",
      igst_amount: "18",
    });

    await db.delete(schema.invoiceInsurance).where(eq(schema.invoiceInsurance.id, insurance.id));

    const items = await db.select()
      .from(schema.invoiceInsuranceItems)
      .where(eq(schema.invoiceInsuranceItems.insurance_id, insurance.id));
    expect(items).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// OBS-2-002 evidence — stockLedger.stock_after has no DB-level CHECK constraint
// ---------------------------------------------------------------------------
describe("stockLedger: no DB-level check on stock_after", () => {
  it("can insert a stockLedger row with stock_after < 0 (no DB constraint prevents it)", async () => {
    const material = await createTestMaterial();
    const [row] = await db.insert(schema.stockLedger).values({
      material_id: material.id,
      transaction_type: "ADJUSTMENT",
      qty_change: "-99",
      stock_after: "-99",
      reason: "OBS-2-002 evidence: no DB check on stock_after",
      adjusted_by: "test",
    }).returning();
    trackCreated("stockLedger", row.id);

    expect(parseFloat(row.stock_after)).toBe(-99);
    // CONFIRMED: stock_after can be negative in the ledger — no DB CHECK constraint.
    // App-layer validation in adjustStock() is the only guard.
    // See OBS-2-002 in tests/reports/bug-log/observations.md
  });
});

// ---------------------------------------------------------------------------
// FK violations
// ---------------------------------------------------------------------------
describe("FK violations", () => {
  it("inserting a material with a nonexistent tax_rate_id → FK violation", async () => {
    const unit = await createTestUnit();
    const fakeId = "00000000-0000-0000-0000-000000000001";

    await expect(
      db.insert(schema.materials).values({
        name: "Bad Material",
        purchase_unit_id: unit.id,
        sales_unit_id: unit.id,
        tax_rate_id: fakeId,
        opening_stock: "0",
        current_stock: "0",
      })
    ).rejects.toThrow();
  });

  it("inserting a material with a nonexistent purchase_unit_id → FK violation", async () => {
    const taxRate = await createTestTaxRate();
    const fakeId = "00000000-0000-0000-0000-000000000002";

    await expect(
      db.insert(schema.materials).values({
        name: "Bad Material 2",
        purchase_unit_id: fakeId,
        sales_unit_id: fakeId,
        tax_rate_id: taxRate.id,
        opening_stock: "0",
        current_stock: "0",
      })
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Soft delete — is_active=false record still exists in DB
// ---------------------------------------------------------------------------
describe("soft delete: is_active=false record remains in DB", () => {
  it("setting is_active=false does not delete the row — it is still queryable", async () => {
    const supplier = await createTestSupplier();
    await db.update(schema.suppliers)
      .set({ is_active: false })
      .where(eq(schema.suppliers.id, supplier.id));

    const [row] = await db.select()
      .from(schema.suppliers)
      .where(eq(schema.suppliers.id, supplier.id));

    expect(row).toBeDefined();
    expect(row.is_active).toBe(false);
  });
});
