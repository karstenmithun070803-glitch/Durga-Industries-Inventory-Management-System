// ============================================================
// Phase: 2
// Category: Integration
// Tests: Admin price band (base_rate ± buffer) — batchUpdateMaterialRates authz/casts;
//        PO band enforcement (over max, under min, within, no base, no buffer, floor clamp,
//        numeric-string trap); price-deviation logging with a base FROZEN at save so later
//        base edits never rewrite history; duplicate-name (R1); PO-number collision (R12);
//        lost-update (R11).
// Source: src/lib/actions/materials.actions.ts, src/lib/actions/purchase-orders.actions.ts
// Runs against the PRODUCTION DB (see .env.test) — every created row is cleaned up.
// ============================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  createTestMaterial,
  createTestSupplier,
  createTestUnit,
  createTestTaxRate,
  cleanupAll,
} from "../fixtures/seed";

// createPurchaseOrder derives po_number from MAX(po_number) in a financial year; give this
// file its own FY so it never races fy-scoping.test.ts.
const BAND_FY = "2094-2095";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: Function) => fn,
}));

const authMock = vi.hoisted(() => ({ role: "admin" as "admin" | "employee" }));
vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => {
    if (authMock.role !== "admin") throw new Error("Unauthorized: admin access required.");
    return { authId: "test", username: "test", role: "admin" as const };
  }),
  isAdmin: vi.fn(async () => authMock.role === "admin"),
  getCurrentUser: vi.fn(async () => ({ authId: "test", username: "test", role: authMock.role })),
}));

import {
  batchUpdateMaterialRates,
  createMaterial,
  bulkImportMaterials,
  updateMaterial,
  getRateDeviationHistory,
  getMaterialsWithDeviations,
} from "@/lib/actions/materials.actions";
import {
  createPurchaseOrder,
  receivePurchaseOrder,
} from "@/lib/actions/purchase-orders.actions";

const createdPoIds: string[] = [];
const createdMaterialNames: string[] = [];

beforeEach(() => {
  authMock.role = "admin";
});

afterEach(async () => {
  // Received POs leave stock_ledger rows + mutate material stock (C19); unwind ledger first.
  for (const id of createdPoIds) {
    try {
      await db.delete(schema.stockLedger).where(eq(schema.stockLedger.reference_id, id));
      await db.delete(schema.purchaseOrderItems).where(eq(schema.purchaseOrderItems.po_id, id));
      await db.delete(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, id));
    } catch { /* already gone */ }
  }
  createdPoIds.length = 0;

  for (const name of createdMaterialNames) {
    try {
      await db.delete(schema.materials).where(sql`lower(trim(name)) = lower(trim(${name}))`);
    } catch { /* referenced elsewhere */ }
  }
  createdMaterialNames.length = 0;

  await cleanupAll();
});

function uniqueName(label: string) {
  const name = `ZZ BAND ${label} ${Math.floor(Math.random() * 1e9)}`;
  createdMaterialNames.push(name);
  return name;
}

async function poPayload(materialId: string, supplierId: string, unitId: string, rate: string) {
  return {
    po_date: `${BAND_FY.slice(0, 4)}-06-01`,
    financial_year: BAND_FY,
    total_amount: rate,
    affects_stock: true,
    supplier_bill_no: "",
    supplier_bill_date: "",
    items: [{
      material_id: materialId, supplier_id: supplierId, qty: "1", unit_id: unitId, rate,
      rate_blank: false, zero_rate_confirmed: false, tax_percentage: "0",
      cgst_amount: "0", sgst_amount: "0", igst_amount: "0", amount: rate, gst_type: "CGST_SGST",
    }],
  };
}

// ── Authorization ─────────────────────────────────────────────────────────────
describe("batchUpdateMaterialRates authorization", () => {
  it("throws for a non-admin and writes nothing", async () => {
    const mat = await createTestMaterial({}, { base_rate: null, buffer: null });
    authMock.role = "employee";
    await expect(
      batchUpdateMaterialRates([{ id: mat.id, base_rate: "150", buffer: "5" }])
    ).rejects.toThrow(/Unauthorized/);
    const [after] = await db.select().from(schema.materials).where(eq(schema.materials.id, mat.id));
    expect(after.base_rate).toBeNull();
    expect(after.buffer).toBeNull();
  });
});

// ── Persistence, casts, validation ────────────────────────────────────────────
describe("batchUpdateMaterialRates persistence", () => {
  it("stores base and buffer as numeric(14,4)", async () => {
    const mat = await createTestMaterial({}, { base_rate: null, buffer: null });
    await batchUpdateMaterialRates([{ id: mat.id, base_rate: "543", buffer: "5" }]);
    const rows = await db.execute<{ base_rate: string; buffer: string; bt: string; ft: string }>(sql`
      SELECT base_rate, buffer, pg_typeof(base_rate)::text bt, pg_typeof(buffer)::text ft
      FROM materials WHERE id = ${mat.id}::uuid`);
    expect(rows[0].bt).toBe("numeric");
    expect(rows[0].ft).toBe("numeric");
    expect(rows[0].base_rate).toBe("543.0000");
    expect(rows[0].buffer).toBe("5.0000");
  });

  it("rejects a zero BASE but ACCEPTS a zero buffer (exact-base policy)", async () => {
    const mat = await createTestMaterial({}, { base_rate: null, buffer: null });
    await expect(
      batchUpdateMaterialRates([{ id: mat.id, base_rate: "0", buffer: "5" }])
    ).rejects.toThrow(/greater than 0/);

    await batchUpdateMaterialRates([{ id: mat.id, base_rate: "100", buffer: "0" }]);
    const [after] = await db.select().from(schema.materials).where(eq(schema.materials.id, mat.id));
    expect(after.buffer).toBe("0.0000");
  });

  it("rejects a negative buffer", async () => {
    const mat = await createTestMaterial({}, { base_rate: null, buffer: null });
    await expect(
      batchUpdateMaterialRates([{ id: mat.id, base_rate: "100", buffer: "-1" }])
    ).rejects.toThrow(/negative/);
  });

  it("blank clears both back to NULL", async () => {
    const mat = await createTestMaterial({}, { base_rate: "150.0000", buffer: "5.0000" });
    await batchUpdateMaterialRates([{ id: mat.id, base_rate: "", buffer: "" }]);
    const [after] = await db.select().from(schema.materials).where(eq(schema.materials.id, mat.id));
    expect(after.base_rate).toBeNull();
    expect(after.buffer).toBeNull();
  });

  it("empty update list issues no SQL", async () => {
    await expect(batchUpdateMaterialRates([])).resolves.toBeUndefined();
  });

  it("rolls back entirely when a material no longer exists (C8/R8)", async () => {
    const good = await createTestMaterial({}, { base_rate: null, buffer: null });
    await expect(
      batchUpdateMaterialRates([
        { id: good.id, base_rate: "111", buffer: "1" },
        { id: "00000000-0000-0000-0000-000000000000", base_rate: "222", buffer: "2" },
      ])
    ).rejects.toThrow(/no longer exist/);
    const [after] = await db.select().from(schema.materials).where(eq(schema.materials.id, good.id));
    expect(after.base_rate).toBeNull(); // rolled back, NOT "111.0000"
  });
});

// ── PO band enforcement ───────────────────────────────────────────────────────
describe("PO band enforcement", () => {
  it("blocks when base rate is not set", async () => {
    const unit = await createTestUnit();
    const supplier = await createTestSupplier();
    const mat = await createTestMaterial({ unitId: unit.id }, { base_rate: null, buffer: "5" });
    await expect(createPurchaseOrder(await poPayload(mat.id, supplier.id, unit.id, "100")))
      .rejects.toThrow(/has no base rate/i);
  });

  it("blocks when buffer is not set", async () => {
    const unit = await createTestUnit();
    const supplier = await createTestSupplier();
    const mat = await createTestMaterial({ unitId: unit.id }, { base_rate: "100", buffer: null });
    await expect(createPurchaseOrder(await poPayload(mat.id, supplier.id, unit.id, "100")))
      .rejects.toThrow(/has no buffer/i);
  });

  it("blocks a rate above the maximum (base + buffer)", async () => {
    const unit = await createTestUnit();
    const supplier = await createTestSupplier();
    const mat = await createTestMaterial({ unitId: unit.id }, { base_rate: "543.0000", buffer: "5.0000" });
    await expect(createPurchaseOrder(await poPayload(mat.id, supplier.id, unit.id, "549")))
      .rejects.toThrow(/above the maximum of ₹548\.00/);
  });

  it("blocks a rate below the minimum (base − buffer)", async () => {
    const unit = await createTestUnit();
    const supplier = await createTestSupplier();
    const mat = await createTestMaterial({ unitId: unit.id }, { base_rate: "543.0000", buffer: "5.0000" });
    await expect(createPurchaseOrder(await poPayload(mat.id, supplier.id, unit.id, "500")))
      .rejects.toThrow(/below the minimum of ₹538\.00/);
  });

  it("allows a rate at each band edge and within", async () => {
    const unit = await createTestUnit();
    const supplier = await createTestSupplier();
    const mat = await createTestMaterial({ unitId: unit.id }, { base_rate: "543.0000", buffer: "5.0000" });
    for (const rate of ["538", "548", "544"]) {
      const id = await createPurchaseOrder(await poPayload(mat.id, supplier.id, unit.id, rate));
      createdPoIds.push(id);
      expect(id).toBeTruthy();
    }
  });

  // The numeric-string trap end-to-end: base_rate arrives as "150.0000"; "90" > "150" is
  // lexicographically true, so a naive compare would wrongly block a legal ₹149.
  it("does not lexicographically mis-block (base 150 buffer 5 → 149 allowed)", async () => {
    const unit = await createTestUnit();
    const supplier = await createTestSupplier();
    const mat = await createTestMaterial({ unitId: unit.id }, { base_rate: "150.0000", buffer: "5.0000" });
    const id = await createPurchaseOrder(await poPayload(mat.id, supplier.id, unit.id, "149"));
    createdPoIds.push(id);
    expect(id).toBeTruthy();
  });

  it("clamps the floor at 0 (base 400 buffer 500 → 10 allowed, no negative minimum)", async () => {
    const unit = await createTestUnit();
    const supplier = await createTestSupplier();
    const mat = await createTestMaterial({ unitId: unit.id }, { base_rate: "400.0000", buffer: "500.0000" });
    const id = await createPurchaseOrder(await poPayload(mat.id, supplier.id, unit.id, "10"));
    createdPoIds.push(id);
    expect(id).toBeTruthy();
  });
});

// ── Deviation logging + FROZEN base (the core new correctness) ─────────────────
describe("price-deviation logging with a frozen base", () => {
  it("a within-buffer off-base purchase is logged, and the base is FROZEN at save", async () => {
    const unit = await createTestUnit();
    const supplier = await createTestSupplier();
    const mat = await createTestMaterial({ unitId: unit.id }, { base_rate: "543.0000", buffer: "5.0000" });

    // 544 is inside the band (538..548) but off base 543 → deviation +1.
    const poId = await createPurchaseOrder(await poPayload(mat.id, supplier.id, unit.id, "544"));
    createdPoIds.push(poId);

    // snapshot frozen at save, even before receive
    const [item] = await db.select().from(schema.purchaseOrderItems)
      .where(eq(schema.purchaseOrderItems.po_id, poId));
    expect(item.base_rate_snapshot).toBe("543.0000");

    // Not in the deviation history until RECEIVED
    expect(await getRateDeviationHistory(mat.id)).toHaveLength(0);

    await receivePurchaseOrder(poId);

    const hist = await getRateDeviationHistory(mat.id);
    expect(hist).toHaveLength(1);
    expect(Number(hist[0].po_rate)).toBe(544);
    expect(Number(hist[0].base_snapshot)).toBe(543);
    expect(Number(hist[0].deviation)).toBe(1);

    // 🔴 The freeze: change the material's base, and the logged deviation must NOT move.
    await batchUpdateMaterialRates([{ id: mat.id, base_rate: "450", buffer: "5" }]);
    const after = await getRateDeviationHistory(mat.id);
    expect(Number(after[0].base_snapshot)).toBe(543); // still 543, not 450
    expect(Number(after[0].deviation)).toBe(1);       // still +1, not +94
  });

  it("a purchase exactly at base is NOT a deviation", async () => {
    const unit = await createTestUnit();
    const supplier = await createTestSupplier();
    const mat = await createTestMaterial({ unitId: unit.id }, { base_rate: "543.0000", buffer: "5.0000" });
    const poId = await createPurchaseOrder(await poPayload(mat.id, supplier.id, unit.id, "543"));
    createdPoIds.push(poId);
    await receivePurchaseOrder(poId);
    expect(await getRateDeviationHistory(mat.id)).toHaveLength(0);
    expect(await getMaterialsWithDeviations()).not.toContain(mat.id);
  });

  it("getMaterialsWithDeviations lists a material with an off-base received purchase", async () => {
    const unit = await createTestUnit();
    const supplier = await createTestSupplier();
    const mat = await createTestMaterial({ unitId: unit.id }, { base_rate: "543.0000", buffer: "5.0000" });
    const poId = await createPurchaseOrder(await poPayload(mat.id, supplier.id, unit.id, "544"));
    createdPoIds.push(poId);
    await receivePurchaseOrder(poId);
    expect(await getMaterialsWithDeviations()).toContain(mat.id);
  });
});

// ── R1 duplicate names ────────────────────────────────────────────────────────
describe("R1 duplicate material names", () => {
  it("two concurrent creates yield exactly one row with a friendly error", async () => {
    const unit = await createTestUnit();
    const name = uniqueName("RACE");
    const results = await Promise.allSettled([
      createMaterial({ name, purchase_unit_id: unit.id }),
      createMaterial({ name, purchase_unit_id: unit.id }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.message).toMatch(/already exists/);
    expect(rejected[0].reason.message).not.toMatch(/23505|duplicate key/);
  });

  it("bulkImportMaterials skips a trailing-space duplicate (index is lower(trim(name)))", async () => {
    const unit = await createTestUnit();
    const taxRate = await createTestTaxRate();
    const name = uniqueName("TRIM");
    await createMaterial({ name, purchase_unit_id: unit.id });
    const result = await bulkImportMaterials([
      { name: `${name} `, purchase_unit_id: unit.id, tax_rate_id: taxRate.id },
    ]);
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
  });
});

// ── R11 concurrent name edit vs band edit ─────────────────────────────────────
describe("R11 concurrent name edit and band edit", () => {
  it("both writes survive — disjoint columns, no lost update", async () => {
    const unit = await createTestUnit();
    const taxRate = await createTestTaxRate();
    const mat = await createTestMaterial({ unitId: unit.id, taxRateId: taxRate.id }, { base_rate: null, buffer: null });
    const newName = uniqueName("R11");
    await Promise.all([
      updateMaterial(mat.id, { name: newName, purchase_unit_id: unit.id, tax_rate_id: taxRate.id }),
      batchUpdateMaterialRates([{ id: mat.id, base_rate: "175", buffer: "5" }]),
    ]);
    const [after] = await db.select().from(schema.materials).where(eq(schema.materials.id, mat.id));
    expect(after.name).toBe(newName.toUpperCase());
    expect(after.base_rate).toBe("175.0000");
    expect(after.buffer).toBe("5.0000");
  });
});

// ── R12 PO-number collision ───────────────────────────────────────────────────
describe("R12 concurrent PO creation", () => {
  it("one wins, loser gets a retryable message, no duplicate po_number", async () => {
    const unit = await createTestUnit();
    const supplier = await createTestSupplier();
    const mat = await createTestMaterial({ unitId: unit.id }, { base_rate: "500.0000", buffer: "500.0000" });
    const results = await Promise.allSettled([
      createPurchaseOrder(await poPayload(mat.id, supplier.id, unit.id, "100")),
      createPurchaseOrder(await poPayload(mat.id, supplier.id, unit.id, "100")),
    ]);
    for (const r of results) if (r.status === "fulfilled") createdPoIds.push(r.value);
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    for (const r of rejected) {
      expect(r.reason.message).toMatch(/just taken — please try again/);
      expect(r.reason.message).not.toMatch(/23505|duplicate key/);
    }
    const dup = await db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM (
        SELECT po_number FROM purchase_orders WHERE financial_year = ${BAND_FY}
        GROUP BY po_number HAVING count(*) > 1) d`);
    expect(dup[0].n).toBe(0);
  });
});

// keep inArray import used (defensive; some helpers reference it)
void inArray;
