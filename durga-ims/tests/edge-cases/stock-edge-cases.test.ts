// ============================================================
// Phase: 4
// Category: Edge Case
// Tests: Stock boundary logic — PO revert guards, adjustStock validation,
//        stage deletion with MI state, PO number uniqueness constraint
// Source: src/lib/actions/purchase-orders.actions.ts
//         src/lib/actions/stock.actions.ts
//         src/lib/actions/stages.actions.ts
// ============================================================

import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  createTestMaterial,
  createTestSupplier,
  createTestUnit,
  createTestPurchaseOrder,
  createTestPurchaseOrderItem,
  createTestVehicle,
  createTestMaterialIssue,
  createTestMaterialIssueItem,
  createTestStage,
  cleanupAll,
  TEST_FY,
} from "../fixtures/seed";
import { trackCreated } from "../fixtures/cleanup";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: Function) => fn,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
  }),
}));

import { receivePurchaseOrder, revertPOToDraft } from "@/lib/actions/purchase-orders.actions";
import { adjustStock } from "@/lib/actions/stock.actions";
import { deleteStage } from "@/lib/actions/stages.actions";

// ---------------------------------------------------------------------------
// Shared cleanup state
// ---------------------------------------------------------------------------
const extraLedgerIds: string[] = [];
const extraMiItemIds: string[] = [];
const createdPoIds: string[] = [];

afterEach(async () => {
  for (const id of extraLedgerIds) {
    try { await db.delete(schema.stockLedger).where(eq(schema.stockLedger.id, id)); } catch { }
  }
  extraLedgerIds.length = 0;
  for (const id of extraMiItemIds) {
    try { await db.delete(schema.materialIssueItems).where(eq(schema.materialIssueItems.id, id)); } catch { }
  }
  extraMiItemIds.length = 0;
  for (const id of createdPoIds) {
    try {
      await db.delete(schema.purchaseOrderItems).where(eq(schema.purchaseOrderItems.po_id, id));
      await db.delete(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, id));
    } catch { }
  }
  createdPoIds.length = 0;
  await cleanupAll();
});

// ---------------------------------------------------------------------------
// Helper: receive a Draft PO and track the ledger entries it creates
// ---------------------------------------------------------------------------
async function receiveAndTrackLedger(poId: string): Promise<void> {
  await receivePurchaseOrder(poId);
  const ledgers = await db
    .select({ id: schema.stockLedger.id })
    .from(schema.stockLedger)
    .where(eq(schema.stockLedger.reference_id, poId));
  for (const l of ledgers) extraLedgerIds.push(l.id);
}

// ===========================================================================
// PO REVERT GUARDS
// Confirm: revertPOToDraft has two pre-flight guards that block unsafe reverts.
// CONFIRMED SAFE — no code was changed.
// ===========================================================================

describe("revertPOToDraft — Guard 1: MI reference blocks revert", () => {
  it("returns error when any MI item references a material from this PO", async () => {
    const supplier = await createTestSupplier();
    const material = await createTestMaterial({}, { current_stock: "0", opening_stock: "0" });
    const po = await createTestPurchaseOrder({ supplierId: supplier.id }, { affects_stock: true });
    await createTestPurchaseOrderItem({ poId: po.id, materialId: material.id }, { qty: "10", rate: "100" });

    await receiveAndTrackLedger(po.id);

    const vehicle = await createTestVehicle();
    const mi = await createTestMaterialIssue({ vehicleId: vehicle.id });
    const miItem = await createTestMaterialIssueItem(
      { issueId: mi.id, materialId: material.id },
      { qty: "3", affects_inventory: true }
    );
    extraMiItemIds.push(miItem.id);
    await db.update(schema.materialIssues).set({ status: "Issued" }).where(eq(schema.materialIssues.id, mi.id));

    const result = await revertPOToDraft(po.id, "test@test.com");

    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toMatch(/cannot revert/i);
    expect((result as { error: string }).error).toMatch(/issued/i);

    const [poRow] = await db
      .select({ status: schema.purchaseOrders.status })
      .from(schema.purchaseOrders)
      .where(eq(schema.purchaseOrders.id, po.id));
    expect(poRow.status).toBe("Received");
  });
});

describe("revertPOToDraft — Guard 2: insufficient stock blocks revert", () => {
  it("returns error listing the blocking material when stock would go negative", async () => {
    const supplier = await createTestSupplier();
    const material = await createTestMaterial({}, { current_stock: "0", opening_stock: "0" });
    const po = await createTestPurchaseOrder({ supplierId: supplier.id }, { affects_stock: true });
    await createTestPurchaseOrderItem({ poId: po.id, materialId: material.id }, { qty: "10", rate: "100" });

    await receiveAndTrackLedger(po.id);

    // Reduce stock below PO qty (simulates another pathway consuming stock)
    await db.update(schema.materials).set({ current_stock: "3" }).where(eq(schema.materials.id, material.id));

    const result = await revertPOToDraft(po.id, "test@test.com");

    expect(result).toHaveProperty("error");
    const err = (result as { error: string }).error;
    expect(err).toMatch(/cannot revert/i);
    expect(err).toMatch(/insufficient stock/i);

    const [poRow] = await db
      .select({ status: schema.purchaseOrders.status })
      .from(schema.purchaseOrders)
      .where(eq(schema.purchaseOrders.id, po.id));
    expect(poRow.status).toBe("Received");
  });
});

describe("revertPOToDraft — happy path: succeeds with full stock and no MIs", () => {
  it("returns { success: true }, sets PO to Draft, restores stock, inserts REVERSAL ledger", async () => {
    const supplier = await createTestSupplier();
    const material = await createTestMaterial({}, { current_stock: "0", opening_stock: "0" });
    const po = await createTestPurchaseOrder({ supplierId: supplier.id }, { affects_stock: true });
    await createTestPurchaseOrderItem({ poId: po.id, materialId: material.id }, { qty: "10", rate: "100" });

    await receiveAndTrackLedger(po.id);

    const [before] = await db
      .select({ stock: schema.materials.current_stock })
      .from(schema.materials)
      .where(eq(schema.materials.id, material.id));
    expect(parseFloat(before.stock)).toBe(10);

    const result = await revertPOToDraft(po.id, "test@test.com");

    expect(result).toEqual({ success: true });

    const [poRow] = await db
      .select({ status: schema.purchaseOrders.status })
      .from(schema.purchaseOrders)
      .where(eq(schema.purchaseOrders.id, po.id));
    expect(poRow.status).toBe("Draft");

    const [after] = await db
      .select({ stock: schema.materials.current_stock })
      .from(schema.materials)
      .where(eq(schema.materials.id, material.id));
    expect(parseFloat(after.stock)).toBe(0);

    const reversals = await db
      .select()
      .from(schema.stockLedger)
      .where(eq(schema.stockLedger.reference_id, po.id));
    const reversal = reversals.find((r) => r.transaction_type === "REVERSAL");
    expect(reversal).toBeDefined();
    expect(parseFloat(reversal!.qty_change)).toBe(-10);
    for (const r of reversals) {
      if (!extraLedgerIds.includes(r.id)) extraLedgerIds.push(r.id);
    }
  });
});

// ===========================================================================
// ADJUST STOCK VALIDATION
// Confirm: adjustStock blocks negative qty, short reason, negative cost.
// CONFIRMED SAFE — no code was changed.
// ===========================================================================

describe("adjustStock — block negative qty", () => {
  it("throws 'Stock cannot go below zero.' when newQty is -1", async () => {
    const material = await createTestMaterial({}, { current_stock: "5", opening_stock: "5" });
    await expect(
      adjustStock(material.id, -1, "valid reason here")
    ).rejects.toThrow("Stock cannot go below zero.");
    const [row] = await db
      .select({ stock: schema.materials.current_stock })
      .from(schema.materials)
      .where(eq(schema.materials.id, material.id));
    expect(parseFloat(row.stock)).toBe(5);
  });

  it("throws when newQty is negative with a decimal", async () => {
    const material = await createTestMaterial({}, { current_stock: "10", opening_stock: "10" });
    await expect(
      adjustStock(material.id, -0.001, "valid reason here")
    ).rejects.toThrow("Stock cannot go below zero.");
  });
});

describe("adjustStock — block short reason", () => {
  it("throws 'Reason must be at least 10 characters.' when reason is 9 chars", async () => {
    const material = await createTestMaterial({}, { current_stock: "5", opening_stock: "5" });
    await expect(
      adjustStock(material.id, 5, "123456789") // 9 chars
    ).rejects.toThrow("Reason must be at least 10 characters.");
  });

  it("throws for empty reason", async () => {
    const material = await createTestMaterial({}, { current_stock: "5", opening_stock: "5" });
    await expect(
      adjustStock(material.id, 5, "")
    ).rejects.toThrow("Reason must be at least 10 characters.");
  });
});

describe("adjustStock — happy path", () => {
  it("updates stock and inserts ADJUSTMENT ledger entry with correct qty_change", async () => {
    const material = await createTestMaterial({}, { current_stock: "5", opening_stock: "5" });

    await adjustStock(material.id, 12, "correcting stock count after audit");

    const [row] = await db
      .select({ stock: schema.materials.current_stock })
      .from(schema.materials)
      .where(eq(schema.materials.id, material.id));
    expect(parseFloat(row.stock)).toBe(12);

    const [ledger] = await db
      .select()
      .from(schema.stockLedger)
      .where(eq(schema.stockLedger.material_id, material.id))
      .orderBy(desc(schema.stockLedger.created_at))
      .limit(1);
    expect(ledger).toBeDefined();
    expect(ledger.transaction_type).toBe("ADJUSTMENT");
    expect(parseFloat(ledger.qty_change)).toBe(7);
    expect(parseFloat(ledger.stock_after)).toBe(12);
    extraLedgerIds.push(ledger.id);
  });

  it("allows adjustment DOWN to zero (newQty = 0 is valid)", async () => {
    const material = await createTestMaterial({}, { current_stock: "5", opening_stock: "5" });

    await adjustStock(material.id, 0, "clearing obsolete stock from system");

    const [row] = await db
      .select({ stock: schema.materials.current_stock })
      .from(schema.materials)
      .where(eq(schema.materials.id, material.id));
    expect(parseFloat(row.stock)).toBe(0);

    const [ledger] = await db
      .select()
      .from(schema.stockLedger)
      .where(eq(schema.stockLedger.material_id, material.id))
      .orderBy(desc(schema.stockLedger.created_at))
      .limit(1);
    extraLedgerIds.push(ledger.id);
    expect(parseFloat(ledger.qty_change)).toBe(-5);
  });
});

describe("adjustStock — block negative standardCost", () => {
  it("throws 'Unit cost cannot be negative.' when standardCost is -10", async () => {
    const material = await createTestMaterial({}, { current_stock: "5", opening_stock: "5" });
    await expect(
      adjustStock(material.id, 5, "valid reason here", -10)
    ).rejects.toThrow("Unit cost cannot be negative.");
  });
});

// ===========================================================================
// STAGE DELETION (smart delete)
// A stage referenced by any material issue (or a material template) is HIDDEN
// (is_active=false) so its history is preserved; a truly unreferenced stage is
// physically hard-deleted. deleteStage no longer throws or returns a draft count.
// ===========================================================================

describe("deleteStage — referenced by a material issue → hidden, not erased", () => {
  it("a stage used by a Draft MI is hidden (is_active=false), row preserved", async () => {
    const stage = await createTestStage();
    const vehicle = await createTestVehicle();
    await createTestMaterialIssue(
      { vehicleId: vehicle.id },
      { stage_id: stage.id, status: "Draft", financial_year: TEST_FY }
    );

    await deleteStage(stage.id); // no longer throws — it hides

    const [row] = await db
      .select({ is_active: schema.stages.is_active })
      .from(schema.stages)
      .where(eq(schema.stages.id, stage.id));
    expect(row).toBeDefined();
    expect(row.is_active).toBe(false);
  });

  it("a stage used by an Issued MI is hidden (is_active=false), row preserved", async () => {
    const stage = await createTestStage();
    const vehicle = await createTestVehicle();
    await createTestMaterialIssue(
      { vehicleId: vehicle.id },
      { stage_id: stage.id, status: "Issued", financial_year: TEST_FY }
    );

    await deleteStage(stage.id);

    const [row] = await db
      .select({ is_active: schema.stages.is_active })
      .from(schema.stages)
      .where(eq(schema.stages.id, stage.id));
    expect(row).toBeDefined();
    expect(row.is_active).toBe(false);
  });
});

describe("deleteStage — no references → hard delete", () => {
  it("a stage with no MIs and no material template is physically removed", async () => {
    const stage = await createTestStage();

    await deleteStage(stage.id);

    const [row] = await db
      .select({ id: schema.stages.id })
      .from(schema.stages)
      .where(eq(schema.stages.id, stage.id));
    expect(row).toBeUndefined();
  });
});

// ===========================================================================
// PO NUMBER UNIQUENESS CONSTRAINT
// Confirm: UNIQUE(po_number, financial_year) is enforced at DB level.
// OBS-4-001: raw Postgres error surfaces on conflict (logged, not fixed).
// ===========================================================================

describe("PO unique constraint — error message quality", () => {
  it("throws a human-readable error (not a raw Postgres string) on po_number conflict", async () => {
    const supplier = await createTestSupplier();
    const unit = await createTestUnit();
    const material = await createTestMaterial({ unitId: unit.id });

    const occupiedNumber = 9_000_000 + Math.floor(Math.random() * 999_000);

    const [existing] = await db
      .insert(schema.purchaseOrders)
      .values({
        po_number: occupiedNumber,
        supplier_id: supplier.id,
        financial_year: TEST_FY,
        total_amount: "0",
        status: "Draft",
        affects_stock: false,
      })
      .returning({ id: schema.purchaseOrders.id });
    trackCreated("purchaseOrders", existing.id);

    let thrownError: Error | null = null;
    try {
      await db
        .insert(schema.purchaseOrders)
        .values({
          po_number: occupiedNumber,
          supplier_id: supplier.id,
          financial_year: TEST_FY,
          total_amount: "0",
          status: "Draft",
          affects_stock: false,
        });
    } catch (e) {
      thrownError = e as Error;
    }

    // Constraint MUST fire — the insert must fail
    expect(thrownError).not.toBeNull();

    const rawPostgresPattern = /duplicate key value violates unique constraint/i;
    const isRawPostgresError = rawPostgresPattern.test(thrownError!.message);

    if (isRawPostgresError) {
      // OBS-4-001: raw Postgres error surfaces on concurrent PO creation.
      // Severity: LOW — near-impossible for 4 users; logged in decisions.md as AD-4-001.
      console.warn(
        "[OBS-4-001] PO number conflict surfaces raw Postgres error:",
        thrownError!.message.slice(0, 120)
      );
    }

    // Verify constraint is enforced (passes regardless of error message quality)
    expect(thrownError).not.toBeNull();
    // The line below documents the gap: fails if raw error leaks
    expect(isRawPostgresError).toBe(false);
  });
});
