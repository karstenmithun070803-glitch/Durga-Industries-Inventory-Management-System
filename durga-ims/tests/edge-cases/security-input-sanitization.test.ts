// ============================================================
// Phase: 4
// Category: Edge Case / Security
// Tests: Server-side input validation in createPurchaseOrder —
//        negative rate (BUG-4-001 fix), zero/negative qty (BUG-4-002 fix)
// Source: src/lib/actions/purchase-orders.actions.ts (validateItems)
// ============================================================

import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  createTestSupplier,
  createTestMaterial,
  createTestUnit,
  cleanupAll,
  TEST_FY,
} from "../fixtures/seed";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: Function) => fn,
}));

import { createPurchaseOrder } from "@/lib/actions/purchase-orders.actions";

// Track any POs created by the happy-path test so they can be cleaned up
const createdPoIds: string[] = [];

afterEach(async () => {
  for (const id of createdPoIds) {
    try {
      await db.delete(schema.purchaseOrderItems).where(eq(schema.purchaseOrderItems.po_id, id));
      await db.delete(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, id));
    } catch { }
  }
  createdPoIds.length = 0;
  await cleanupAll();
});

function buildItem(
  overrides: Partial<{
    material_id: string;
    supplier_id: string;
    unit_id: string;
    qty: string;
    rate: string;
  }>
) {
  return {
    material_id: overrides.material_id ?? "00000000-0000-0000-0000-000000000000",
    supplier_id: overrides.supplier_id ?? null,
    qty: overrides.qty ?? "10",
    unit_id: overrides.unit_id ?? "00000000-0000-0000-0000-000000000000",
    rate: overrides.rate ?? "100",
    rate_blank: false,
    zero_rate_confirmed: false,
    tax_percentage: "18",
    cgst_amount: "0",
    sgst_amount: "0",
    igst_amount: "18",
    amount: "100",
    gst_type: "IGST",
  };
}

// ===========================================================================
// BUG-4-001 FIX VERIFICATION: Negative rate blocked server-side
// Before fix: negative rate reached DB. After fix: validateItems() throws.
// ===========================================================================

describe("createPurchaseOrder — negative rate validation (BUG-4-001 fix)", () => {
  it("throws validation error when item rate is negative (-50)", async () => {
    const supplier = await createTestSupplier();
    const unit = await createTestUnit();
    const material = await createTestMaterial({ unitId: unit.id });

    await expect(
      createPurchaseOrder({
        po_date: "2099-07-01",
        financial_year: TEST_FY,
        total_amount: "-500",
        affects_stock: false,
        supplier_bill_no: "",
        supplier_bill_date: "",
        items: [
          buildItem({
            material_id: material.id,
            supplier_id: supplier.id,
            unit_id: unit.id,
            rate: "-50",
            qty: "10",
          }),
        ],
      })
    ).rejects.toThrow(/rate/i);
  });

  it("throws validation error when item rate is a large negative value (-999999)", async () => {
    const supplier = await createTestSupplier();
    const unit = await createTestUnit();
    const material = await createTestMaterial({ unitId: unit.id });

    await expect(
      createPurchaseOrder({
        po_date: "2099-07-01",
        financial_year: TEST_FY,
        total_amount: "-9999990",
        affects_stock: false,
        supplier_bill_no: "",
        supplier_bill_date: "",
        items: [
          buildItem({
            material_id: material.id,
            supplier_id: supplier.id,
            unit_id: unit.id,
            rate: "-999999",
            qty: "10",
          }),
        ],
      })
    ).rejects.toThrow(/rate/i);
  });
});

// ===========================================================================
// BUG-4-002 FIX VERIFICATION: Zero/negative qty blocked server-side
// Before fix: negative qty reached DB; PO receipt would REDUCE stock.
// After fix: validateItems() throws.
// ===========================================================================

describe("createPurchaseOrder — zero and negative quantity validation (BUG-4-002 fix)", () => {
  it("throws validation error when item qty is zero", async () => {
    const supplier = await createTestSupplier();
    const unit = await createTestUnit();
    const material = await createTestMaterial({ unitId: unit.id });

    await expect(
      createPurchaseOrder({
        po_date: "2099-07-01",
        financial_year: TEST_FY,
        total_amount: "0",
        affects_stock: false,
        supplier_bill_no: "",
        supplier_bill_date: "",
        items: [
          buildItem({
            material_id: material.id,
            supplier_id: supplier.id,
            unit_id: unit.id,
            rate: "100",
            qty: "0",
          }),
        ],
      })
    ).rejects.toThrow(/qty|quantity/i);
  });

  it("throws validation error when item qty is negative (-5)", async () => {
    const supplier = await createTestSupplier();
    const unit = await createTestUnit();
    const material = await createTestMaterial({ unitId: unit.id });

    await expect(
      createPurchaseOrder({
        po_date: "2099-07-01",
        financial_year: TEST_FY,
        total_amount: "-500",
        affects_stock: false,
        supplier_bill_no: "",
        supplier_bill_date: "",
        items: [
          buildItem({
            material_id: material.id,
            supplier_id: supplier.id,
            unit_id: unit.id,
            rate: "100",
            qty: "-5",
          }),
        ],
      })
    ).rejects.toThrow(/qty|quantity/i);
  });

  it("correctly allows qty of 0.001 (smallest positive quantity)", async () => {
    const supplier = await createTestSupplier();
    const unit = await createTestUnit();
    const material = await createTestMaterial({ unitId: unit.id });

    const id = await createPurchaseOrder({
      po_date: "2099-07-01",
      financial_year: TEST_FY,
      total_amount: "0.10",
      affects_stock: false,
      supplier_bill_no: "",
      supplier_bill_date: "",
      items: [
        buildItem({
          material_id: material.id,
          supplier_id: supplier.id,
          unit_id: unit.id,
          rate: "100",
          qty: "0.001",
        }),
      ],
    });
    expect(typeof id).toBe("string");
    createdPoIds.push(id);
  });
});
