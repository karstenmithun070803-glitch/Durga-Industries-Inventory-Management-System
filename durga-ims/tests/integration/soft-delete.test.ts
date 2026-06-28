// ============================================================
// Phase: 2
// Category: Integration
// Tests: Soft delete pattern via is_active flag
// Every master table uses is_active=false for soft delete;
// historical data (FKs on POs, MIs, Invoices) must still resolve.
// Source: src/lib/db/schema.ts
// Requires: .env.test pointing to a test database (run npm run db:test:push first)
// ============================================================

import { afterEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  createTestSupplier,
  createTestContractor,
  createTestCustomer,
  createTestMaterial,
  createTestVehicle,
  createTestStage,
  createTestUnit,
  createTestPurchaseOrder,
  createTestMaterialIssue,
  createTestMaterialIssueItem,
  createTestStockLedgerEntry,
  cleanupAll,
} from "../fixtures/seed";

afterEach(async () => {
  await cleanupAll();
});

// ---------------------------------------------------------------------------
// Supplier soft delete
// ---------------------------------------------------------------------------
describe("Supplier soft delete", () => {
  it("supplier with is_active=false is excluded from WHERE is_active=true query", async () => {
    const supplier = await createTestSupplier({ name: "Soft Deleted Supplier" });
    await db.update(schema.suppliers)
      .set({ is_active: false })
      .where(eq(schema.suppliers.id, supplier.id));

    const rows = await db.select()
      .from(schema.suppliers)
      .where(and(
        eq(schema.suppliers.id, supplier.id),
        eq(schema.suppliers.is_active, true)
      ));

    expect(rows).toHaveLength(0);
  });

  it("soft-deleted supplier is still joinable from PO via supplier_id FK", async () => {
    const supplier = await createTestSupplier({ name: "Deleted Supplier For PO" });
    const po = await createTestPurchaseOrder({ supplierId: supplier.id });

    // Soft-delete the supplier
    await db.update(schema.suppliers)
      .set({ is_active: false })
      .where(eq(schema.suppliers.id, supplier.id));

    // The PO still references the supplier — FK join must resolve
    const rows = await db
      .select({
        poId: schema.purchaseOrders.id,
        supplierName: schema.suppliers.name,
        supplierActive: schema.suppliers.is_active,
      })
      .from(schema.purchaseOrders)
      .leftJoin(schema.suppliers, eq(schema.purchaseOrders.supplier_id, schema.suppliers.id))
      .where(eq(schema.purchaseOrders.id, po.id));

    expect(rows).toHaveLength(1);
    expect(rows[0].supplierName).toBe("Deleted Supplier For PO");
    expect(rows[0].supplierActive).toBe(false); // deleted but still resolvable
  });
});

// ---------------------------------------------------------------------------
// Material soft delete
// ---------------------------------------------------------------------------
describe("Material soft delete", () => {
  it("material with is_active=false is excluded from active materials query", async () => {
    const material = await createTestMaterial({}, { name: "Deleted Material" });
    await db.update(schema.materials)
      .set({ is_active: false })
      .where(eq(schema.materials.id, material.id));

    const rows = await db.select()
      .from(schema.materials)
      .where(and(
        eq(schema.materials.id, material.id),
        eq(schema.materials.is_active, true)
      ));

    expect(rows).toHaveLength(0);
  });

  it("stock is still visible in stockLedger via FK join after material is soft-deleted", async () => {
    const material = await createTestMaterial({}, { name: "Material With Stock" });
    const ledger = await createTestStockLedgerEntry(
      { materialId: material.id },
      { qty_change: "10", stock_after: "10", transaction_type: "PO_INWARD" }
    );

    // Soft-delete the material
    await db.update(schema.materials)
      .set({ is_active: false })
      .where(eq(schema.materials.id, material.id));

    // Ledger entry still joins to the material
    const rows = await db
      .select({
        ledgerId: schema.stockLedger.id,
        stockAfter: schema.stockLedger.stock_after,
        materialActive: schema.materials.is_active,
        materialName: schema.materials.name,
      })
      .from(schema.stockLedger)
      .leftJoin(schema.materials, eq(schema.stockLedger.material_id, schema.materials.id))
      .where(eq(schema.stockLedger.id, ledger.id));

    expect(rows).toHaveLength(1);
    expect(rows[0].materialActive).toBe(false);
    expect(parseFloat(rows[0].stockAfter)).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Customer soft delete
// ---------------------------------------------------------------------------
describe("Customer soft delete", () => {
  it("customer with is_active=false is excluded from active customers query", async () => {
    const customer = await createTestCustomer({ customer_name: "Deleted Customer" });
    await db.update(schema.customers)
      .set({ is_active: false })
      .where(eq(schema.customers.id, customer.id));

    const rows = await db.select()
      .from(schema.customers)
      .where(and(
        eq(schema.customers.id, customer.id),
        eq(schema.customers.is_active, true)
      ));

    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Vehicle soft delete
// ---------------------------------------------------------------------------
describe("Vehicle soft delete", () => {
  it("vehicle with is_active=false is excluded from active vehicles query", async () => {
    const vehicle = await createTestVehicle();
    await db.update(schema.vehicles)
      .set({ is_active: false })
      .where(eq(schema.vehicles.id, vehicle.id));

    const rows = await db.select()
      .from(schema.vehicles)
      .where(and(
        eq(schema.vehicles.id, vehicle.id),
        eq(schema.vehicles.is_active, true)
      ));

    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Stage soft delete
// ---------------------------------------------------------------------------
describe("Stage soft delete", () => {
  it("stage with is_active=false is excluded from active stages query", async () => {
    const stage = await createTestStage();
    await db.update(schema.stages)
      .set({ is_active: false })
      .where(eq(schema.stages.id, stage.id));

    const rows = await db.select()
      .from(schema.stages)
      .where(and(
        eq(schema.stages.id, stage.id),
        eq(schema.stages.is_active, true)
      ));

    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Unit soft delete
// ---------------------------------------------------------------------------
describe("Unit soft delete", () => {
  it("unit with is_active=false is excluded from active units query", async () => {
    const unit = await createTestUnit({ unit_name: "Deleted Unit" });
    await db.update(schema.units)
      .set({ is_active: false })
      .where(eq(schema.units.id, unit.id));

    const rows = await db.select()
      .from(schema.units)
      .where(and(
        eq(schema.units.id, unit.id),
        eq(schema.units.is_active, true)
      ));

    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Re-activation
// ---------------------------------------------------------------------------
describe("Re-activation", () => {
  it("setting is_active=true makes a previously soft-deleted record reappear in active query", async () => {
    const supplier = await createTestSupplier({ name: "Reactivated Supplier" });

    // Soft-delete
    await db.update(schema.suppliers)
      .set({ is_active: false })
      .where(eq(schema.suppliers.id, supplier.id));

    const afterDelete = await db.select()
      .from(schema.suppliers)
      .where(and(eq(schema.suppliers.id, supplier.id), eq(schema.suppliers.is_active, true)));
    expect(afterDelete).toHaveLength(0);

    // Re-activate
    await db.update(schema.suppliers)
      .set({ is_active: true })
      .where(eq(schema.suppliers.id, supplier.id));

    const afterReactivate = await db.select()
      .from(schema.suppliers)
      .where(and(eq(schema.suppliers.id, supplier.id), eq(schema.suppliers.is_active, true)));
    expect(afterReactivate).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Soft-deleted contractor still in materialIssueItems via contractor_id FK
// ---------------------------------------------------------------------------
describe("Soft-deleted contractor: historical data safety", () => {
  it("materialIssueItem still joins to contractor via FK even after contractor is soft-deleted", async () => {
    const contractor = await createTestContractor({ name: "Retired Contractor" });
    const vehicle = await createTestVehicle();
    const mi = await createTestMaterialIssue({ vehicleId: vehicle.id });
    const material = await createTestMaterial();
    const miItem = await createTestMaterialIssueItem(
      { issueId: mi.id, materialId: material.id },
      { contractor_id: contractor.id }
    );

    // Soft-delete the contractor
    await db.update(schema.contractors)
      .set({ is_active: false })
      .where(eq(schema.contractors.id, contractor.id));

    // Historical MI item should still reference the contractor correctly
    const rows = await db
      .select({
        itemId: schema.materialIssueItems.id,
        contractorName: schema.contractors.name,
        contractorActive: schema.contractors.is_active,
      })
      .from(schema.materialIssueItems)
      .leftJoin(schema.contractors, eq(schema.materialIssueItems.contractor_id, schema.contractors.id))
      .where(eq(schema.materialIssueItems.id, miItem.id));

    expect(rows).toHaveLength(1);
    expect(rows[0].contractorName).toBe("Retired Contractor");
    expect(rows[0].contractorActive).toBe(false); // soft-deleted, but historical data preserved
  });
});
