// ============================================================
// Phase: 4
// Category: Edge Case
// Tests: Material Issue inventory filter — affects_inventory=false items
//        are saved for billing but do NOT deduct stock or write ledger
// Source: src/lib/actions/material-issues.actions.ts
// ============================================================

import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  createTestUnit,
  createTestTaxRate,
  createTestMaterial,
  createTestVehicle,
  cleanupAll,
  TEST_FY,
} from "../fixtures/seed";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: Function) => fn,
}));

import { saveVehicleMaterialIssue } from "@/lib/actions/material-issues.actions";

// Issue date inside TEST_FY (2099-04-01 to 2100-03-31)
const TEST_ISSUE_DATE = "2099-07-01";

let createdMiId: string | null = null;

afterEach(async () => {
  if (createdMiId) {
    try {
      await db.delete(schema.stockLedger).where(eq(schema.stockLedger.reference_id, createdMiId));
      await db.delete(schema.materialIssueItems).where(eq(schema.materialIssueItems.issue_id, createdMiId));
      await db.delete(schema.materialIssues).where(eq(schema.materialIssues.id, createdMiId));
    } catch { }
    createdMiId = null;
  }
  await cleanupAll();
});

// ===========================================================================
// AFFECTS_INVENTORY FILTERING
// Confirm: only affects_inventory=true items deduct stock and write ledger.
// CONFIRMED SAFE — no code was changed.
// ===========================================================================

describe("saveVehicleMaterialIssue — affects_inventory filtering", () => {
  it("deducts stock ONLY for affects_inventory=true items; false items are saved but stock unchanged", async () => {
    const unit = await createTestUnit();
    const taxRate = await createTestTaxRate();
    const vehicle = await createTestVehicle();

    // Material A: WITH inventory effect (stock must be available)
    const matA = await createTestMaterial(
      { unitId: unit.id, taxRateId: taxRate.id },
      { current_stock: "10", opening_stock: "10" }
    );

    // Material B: WITHOUT inventory effect (stock should stay at 0)
    const matB = await createTestMaterial(
      { unitId: unit.id, taxRateId: taxRate.id },
      { current_stock: "0", opening_stock: "0" }
    );

    const result = await saveVehicleMaterialIssue(vehicle.id, "OLD", {
      vehicle_id: vehicle.id,
      issue_date: TEST_ISSUE_DATE,
      financial_year: TEST_FY,
      margin_percentage: "0",
      total_amount: "200",
      items: [
        {
          material_id: matA.id,
          contractor_id: null,
          hsn_code: "",
          qty: "3",
          unit_id: unit.id,
          rate: "100",
          rate_blank: false,
          tax_percentage: "18",
          cgst_amount: "0",
          sgst_amount: "0",
          igst_amount: "54",
          amount: "300",
          gst_type: "IGST",
          affects_inventory: true,   // should deduct stock
          zero_rate_confirmed: false,
          stage_id: null,
        },
        {
          material_id: matB.id,
          contractor_id: null,
          hsn_code: "",
          qty: "2",
          unit_id: unit.id,
          rate: "50",
          rate_blank: false,
          tax_percentage: "18",
          cgst_amount: "0",
          sgst_amount: "0",
          igst_amount: "18",
          amount: "100",
          gst_type: "IGST",
          affects_inventory: false,  // must NOT touch stock
          zero_rate_confirmed: false,
          stage_id: null,
        },
      ],
    });

    createdMiId = result.id;
    expect(result.isNew).toBe(true);

    // Material A: stock must have decreased by 3
    const [rowA] = await db
      .select({ stock: schema.materials.current_stock })
      .from(schema.materials)
      .where(eq(schema.materials.id, matA.id));
    expect(parseFloat(rowA.stock)).toBe(7); // 10 - 3

    // Material B: stock must be UNCHANGED at 0
    const [rowB] = await db
      .select({ stock: schema.materials.current_stock })
      .from(schema.materials)
      .where(eq(schema.materials.id, matB.id));
    expect(parseFloat(rowB.stock)).toBe(0);

    // Ledger must have exactly ONE entry (only for Material A)
    const ledgerEntries = await db
      .select()
      .from(schema.stockLedger)
      .where(eq(schema.stockLedger.reference_id, result.id));
    expect(ledgerEntries).toHaveLength(1);
    expect(ledgerEntries[0].material_id).toBe(matA.id);
    expect(ledgerEntries[0].transaction_type).toBe("ISSUE");
    expect(parseFloat(ledgerEntries[0].qty_change)).toBe(-3);

    // Both items saved to materialIssueItems (billing needs the false one too)
    const issueItems = await db
      .select()
      .from(schema.materialIssueItems)
      .where(eq(schema.materialIssueItems.issue_id, result.id));
    expect(issueItems).toHaveLength(2);
  });

  it("throws 'Insufficient stock' when affects_inventory=true item qty exceeds available stock", async () => {
    const unit = await createTestUnit();
    const taxRate = await createTestTaxRate();
    const vehicle = await createTestVehicle();
    const matA = await createTestMaterial(
      { unitId: unit.id, taxRateId: taxRate.id },
      { current_stock: "2", opening_stock: "2" }
    );

    await expect(
      saveVehicleMaterialIssue(vehicle.id, "OLD", {
        vehicle_id: vehicle.id,
        issue_date: TEST_ISSUE_DATE,
        financial_year: TEST_FY,
        margin_percentage: "0",
        total_amount: "500",
        items: [
          {
            material_id: matA.id,
            contractor_id: null,
            hsn_code: "",
            qty: "5",          // requesting 5 but only 2 available
            unit_id: unit.id,
            rate: "100",
            rate_blank: false,
            tax_percentage: "18",
            cgst_amount: "0",
            sgst_amount: "0",
            igst_amount: "90",
            amount: "500",
            gst_type: "IGST",
            affects_inventory: true,
            zero_rate_confirmed: false,
            stage_id: null,
          },
        ],
      })
    ).rejects.toThrow(/Insufficient stock/);

    // Stock must be unchanged
    const [row] = await db
      .select({ stock: schema.materials.current_stock })
      .from(schema.materials)
      .where(eq(schema.materials.id, matA.id));
    expect(parseFloat(row.stock)).toBe(2);
  });
});
