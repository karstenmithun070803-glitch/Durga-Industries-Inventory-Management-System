// ============================================================
// Phase: 2
// Category: Integration
// Tests: Admin purchase ceiling — batchUpdateMaterialRates() authorization, casts,
//        rows-affected guard; duplicate-name race (R1); lost-update guard (R11);
//        PO-number collision (R12); PO ceiling enforcement in validateItems.
// Source: src/lib/actions/materials.actions.ts
//         src/lib/actions/purchase-orders.actions.ts
//         src/lib/db/schema.ts (uq_materials_name_lower)
// ============================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  createTestMaterial,
  createTestSupplier,
  createTestUnit,
  createTestTaxRate,
  cleanupAll,
} from "../fixtures/seed";
import { trackCreated } from "../fixtures/cleanup";

// Vitest runs test files in PARALLEL against one shared database. createPurchaseOrder
// derives po_number from MAX(po_number) within a financial year, so writing POs into
// the shared TEST_FY ("2099-2100") races fy-scoping.test.ts, which asserts on
// MAX(po_number) there. Use a financial year owned solely by this file.
const CEILING_FY = "2095-2096";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: Function) => fn,
}));

// requireAdmin() is the real security boundary. Swap the role per-test.
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
} from "@/lib/actions/materials.actions";
import { createPurchaseOrder } from "@/lib/actions/purchase-orders.actions";

const createdPoIds: string[] = [];
const createdMaterialNames: string[] = [];

beforeEach(() => {
  authMock.role = "admin";
});

afterEach(async () => {
  for (const id of createdPoIds) {
    try {
      await db.delete(schema.purchaseOrderItems).where(eq(schema.purchaseOrderItems.po_id, id));
      await db.delete(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, id));
    } catch {
      /* already gone */
    }
  }
  createdPoIds.length = 0;

  for (const name of createdMaterialNames) {
    try {
      await db.delete(schema.materials).where(sql`lower(trim(name)) = lower(trim(${name}))`);
    } catch {
      /* referenced elsewhere */
    }
  }
  createdMaterialNames.length = 0;

  await cleanupAll();
});

function uniqueName(label: string) {
  const name = `ZZ CEILING ${label} ${Math.floor(Math.random() * 1e9)}`;
  createdMaterialNames.push(name);
  return name;
}

// ---------------------------------------------------------------------------
// Authorization — the only check that actually matters. The hidden sidebar item
// and the 404 from the admin layout are cosmetic.
// ---------------------------------------------------------------------------
describe("batchUpdateMaterialRates() authorization", () => {
  it("throws for a non-admin, and writes nothing", async () => {
    const mat = await createTestMaterial({}, { max_rate: null });
    authMock.role = "employee";

    await expect(batchUpdateMaterialRates([{ id: mat.id, max_rate: "150" }])).rejects.toThrow(
      /Unauthorized/
    );

    const [after] = await db.select().from(schema.materials).where(eq(schema.materials.id, mat.id));
    expect(after.max_rate).toBeNull();
  });

  it("allows an admin", async () => {
    const mat = await createTestMaterial({}, { max_rate: null });
    await batchUpdateMaterialRates([{ id: mat.id, max_rate: "150" }]);

    const [after] = await db.select().from(schema.materials).where(eq(schema.materials.id, mat.id));
    expect(after.max_rate).toBe("150.0000");
  });
});

// ---------------------------------------------------------------------------
// The VALUES join casts id::uuid and rate::numeric. Without the casts Postgres
// infers text for both and throws 42804 / "operator does not exist: uuid = text".
// ---------------------------------------------------------------------------
describe("batchUpdateMaterialRates() persistence", () => {
  it("stores numeric(14,4), not text", async () => {
    const mat = await createTestMaterial({}, { max_rate: null });
    await batchUpdateMaterialRates([{ id: mat.id, max_rate: "92.5" }]);

    const rows = await db.execute<{ max_rate: string; type: string }>(sql`
      SELECT max_rate, pg_typeof(max_rate)::text AS type
      FROM materials WHERE id = ${mat.id}::uuid
    `);
    expect(rows[0].type).toBe("numeric");
    expect(rows[0].max_rate).toBe("92.5000");
  });

  it("writes many rows in one statement", async () => {
    const a = await createTestMaterial({}, { max_rate: null });
    const b = await createTestMaterial({}, { max_rate: null });
    await batchUpdateMaterialRates([
      { id: a.id, max_rate: "10" },
      { id: b.id, max_rate: "20" },
    ]);

    const rows = await db.select().from(schema.materials).where(sql`id in (${a.id}::uuid, ${b.id}::uuid)`);
    expect(rows.map((r) => r.max_rate).sort()).toEqual(["10.0000", "20.0000"]);
  });

  it("blank clears the ceiling back to NULL", async () => {
    const mat = await createTestMaterial({}, { max_rate: "150.0000" });
    await batchUpdateMaterialRates([{ id: mat.id, max_rate: "" }]);

    const [after] = await db.select().from(schema.materials).where(eq(schema.materials.id, mat.id));
    expect(after.max_rate).toBeNull();
  });

  it("rejects a zero ceiling", async () => {
    const mat = await createTestMaterial({}, { max_rate: null });
    await expect(batchUpdateMaterialRates([{ id: mat.id, max_rate: "0" }])).rejects.toThrow(
      /greater than 0/
    );
  });

  it("issues no SQL for an empty update list", async () => {
    // UPDATE ... FROM (VALUES ) is a syntax error; the guard must return early.
    await expect(batchUpdateMaterialRates([])).resolves.toBeUndefined();
  });

  // R8 — a material deactivated while the admin was typing. The write must roll back
  // rather than persist the rows that did match.
  it("rolls back entirely when a material no longer exists", async () => {
    const good = await createTestMaterial({}, { max_rate: null });
    const missingId = "00000000-0000-0000-0000-000000000000";

    await expect(
      batchUpdateMaterialRates([
        { id: good.id, max_rate: "111" },
        { id: missingId, max_rate: "222" },
      ])
    ).rejects.toThrow(/no longer exist/);

    const [after] = await db.select().from(schema.materials).where(eq(schema.materials.id, good.id));
    expect(after.max_rate).toBeNull(); // NOT "111.0000" — the transaction rolled back
  });
});

// ---------------------------------------------------------------------------
// R1 — two logins can now add materials simultaneously. createMaterial() is
// check-then-act, so the DB index has to arbitrate.
// ---------------------------------------------------------------------------
describe("R1 duplicate material names", () => {
  it("two concurrent creates yield exactly one row, and the loser gets a friendly error", async () => {
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

    const rows = await db
      .select()
      .from(schema.materials)
      .where(sql`lower(trim(name)) = lower(trim(${name}))`);
    expect(rows).toHaveLength(1);
  });

  it("differs only by case — still rejected (index is on lower(name))", async () => {
    const unit = await createTestUnit();
    const name = uniqueName("CASE");
    await createMaterial({ name, purchase_unit_id: unit.id });

    await expect(
      createMaterial({ name: name.toLowerCase(), purchase_unit_id: unit.id })
    ).rejects.toThrow(/already exists/);
  });

  // bulkImportMaterials is exported and does not control its callers. The import dialog
  // happens to trim; a future caller might not.
  it("differs only by a trailing space — still rejected via bulkImportMaterials, bypassing the dialog", async () => {
    const unit = await createTestUnit();
    const taxRate = await createTestTaxRate();
    const name = uniqueName("TRIM");
    await createMaterial({ name, purchase_unit_id: unit.id });

    const result = await bulkImportMaterials([
      { name: `${name} `, purchase_unit_id: unit.id, tax_rate_id: taxRate.id },
    ]);

    // Skipped by the in-memory dedup, which now trims — so no 23505 is even reached.
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);

    const rows = await db
      .select()
      .from(schema.materials)
      .where(sql`lower(trim(name)) = lower(trim(${name}))`);
    expect(rows).toHaveLength(1);
  });

  it("bulkImportMaterials skips a name that already exists, importing the rest", async () => {
    const unit = await createTestUnit();
    const existing = uniqueName("EXISTING");
    const fresh = uniqueName("FRESH");
    await createMaterial({ name: existing, purchase_unit_id: unit.id });

    // The in-memory dedup catches this before the DB does, so no 23505 is reached.
    const result = await bulkImportMaterials([
      { name: fresh, purchase_unit_id: unit.id },
      { name: existing, purchase_unit_id: unit.id },
    ]);

    expect(result.imported).toBe(1); // fresh only
    expect(result.skipped).toBe(1); // existing
  });

  // The dedup is a SELECT-then-INSERT, so it cannot see a row another session inserts
  // in between. Only here does the DB index actually fire, and the whole multi-row
  // INSERT must abort — never commit "the good rows" and report the rest.
  it("bulkImportMaterials is all-or-nothing when the index fires mid-import", async () => {
    const unit = await createTestUnit();
    const contested = uniqueName("CONTESTED");
    const alsoInBatch = uniqueName("COMPANION");

    const [a, b] = await Promise.allSettled([
      bulkImportMaterials([
        { name: contested, purchase_unit_id: unit.id },
        { name: alsoInBatch, purchase_unit_id: unit.id },
      ]),
      bulkImportMaterials([{ name: contested, purchase_unit_id: unit.id }]),
    ]);

    const loser = [a, b].find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;

    if (loser) {
      expect(loser.reason.message).toMatch(/Nothing was imported/);
      expect(loser.reason.message).not.toMatch(/23505|duplicate key/);

      // The losing batch's companion row must NOT exist — the transaction rolled back.
      const companion = await db
        .select()
        .from(schema.materials)
        .where(sql`lower(trim(name)) = lower(trim(${alsoInBatch}))`);
      const contestedRows = await db
        .select()
        .from(schema.materials)
        .where(sql`lower(trim(name)) = lower(trim(${contested}))`);

      expect(contestedRows).toHaveLength(1);
      // companion survives only if the winning batch was the two-row one
      expect(companion.length).toBeLessThanOrEqual(1);
    }

    // Whatever the interleaving, the contested name exists exactly once.
    const rows = await db
      .select()
      .from(schema.materials)
      .where(sql`lower(trim(name)) = lower(trim(${contested}))`);
    expect(rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// R12 — getNextPONumber is max(po_number)+1 outside a transaction, so two
// simultaneous creates compute the same number. The DB's
// UNIQUE (po_number, financial_year) rejects the loser; we turn the raw
// Postgres error into a retryable message.
// ---------------------------------------------------------------------------
describe("R12 concurrent PO creation", () => {
  it("one PO wins, the loser gets a retryable message and leaves no orphan row", async () => {
    const unit = await createTestUnit();
    const supplier = await createTestSupplier();
    const mat = await createTestMaterial({ unitId: unit.id }, { max_rate: "500.0000" });

    const payload = () => ({
      po_date: `${CEILING_FY.slice(0, 4)}-06-02`,
      financial_year: CEILING_FY,
      total_amount: "100",
      affects_stock: false,
      supplier_bill_no: "",
      supplier_bill_date: "",
      items: [
        {
          material_id: mat.id,
          supplier_id: supplier.id,
          qty: "1",
          unit_id: unit.id,
          rate: "100",
          rate_blank: false,
          zero_rate_confirmed: false,
          tax_percentage: "0",
          cgst_amount: "0",
          sgst_amount: "0",
          igst_amount: "0",
          amount: "100",
          gst_type: "CGST_SGST",
        },
      ],
    });

    const results = await Promise.allSettled([
      createPurchaseOrder(payload()),
      createPurchaseOrder(payload()),
    ]);

    for (const r of results) {
      if (r.status === "fulfilled") createdPoIds.push(r.value);
    }

    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

    // The race is timing-dependent. When it fires, the message must be friendly.
    for (const r of rejected) {
      expect(r.reason.message).toMatch(/just taken — please try again/);
      expect(r.reason.message).not.toMatch(/23505|duplicate key/);
    }

    // Either way, no duplicate (po_number, financial_year) survived.
    const rows = await db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM (
        SELECT po_number FROM purchase_orders
        WHERE financial_year = ${CEILING_FY}
        GROUP BY po_number HAVING count(*) > 1
      ) d
    `);
    expect(rows[0].n).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// R11 — the employee edits a material's name while the admin edits its ceiling.
// Safe ONLY because both write explicit, disjoint column lists. This test exists so
// that collapsing updateMaterial() into a whole-row write fails loudly.
// ---------------------------------------------------------------------------
describe("R11 concurrent name edit and ceiling edit", () => {
  it("both writes survive — neither clobbers the other's column", async () => {
    const unit = await createTestUnit();
    const taxRate = await createTestTaxRate();
    const mat = await createTestMaterial({ unitId: unit.id, taxRateId: taxRate.id }, { max_rate: null });
    const newName = uniqueName("R11");

    await Promise.all([
      updateMaterial(mat.id, { name: newName, purchase_unit_id: unit.id, tax_rate_id: taxRate.id }),
      batchUpdateMaterialRates([{ id: mat.id, max_rate: "175" }]),
    ]);

    const [after] = await db.select().from(schema.materials).where(eq(schema.materials.id, mat.id));
    expect(after.name).toBe(newName.toUpperCase());
    expect(after.max_rate).toBe("175.0000");
  });
});

// ---------------------------------------------------------------------------
// PO ceiling — validateItems() is the single hard block, covering create, edit and
// received-edit.
// ---------------------------------------------------------------------------
describe("PO ceiling enforcement", () => {
  async function poPayload(materialId: string, supplierId: string, unitId: string, rate: string) {
    return {
      po_date: `${CEILING_FY.slice(0, 4)}-06-01`,
      financial_year: CEILING_FY,
      total_amount: rate,
      affects_stock: false,
      supplier_bill_no: "",
      supplier_bill_date: "",
      items: [
        {
          material_id: materialId,
          supplier_id: supplierId,
          qty: "1",
          unit_id: unitId,
          rate,
          rate_blank: false,
          zero_rate_confirmed: false,
          tax_percentage: "0",
          cgst_amount: "0",
          sgst_amount: "0",
          igst_amount: "0",
          amount: rate,
          gst_type: "CGST_SGST",
        },
      ],
    };
  }

  it("blocks a material with no ceiling, naming the admin", async () => {
    const unit = await createTestUnit();
    const supplier = await createTestSupplier();
    const mat = await createTestMaterial({ unitId: unit.id }, { max_rate: null });

    await expect(
      createPurchaseOrder(await poPayload(mat.id, supplier.id, unit.id, "100"))
    ).rejects.toThrow(/no admin ceiling rate/i);
  });

  it("blocks a rate above the ceiling and names both amounts", async () => {
    const unit = await createTestUnit();
    const supplier = await createTestSupplier();
    const mat = await createTestMaterial({ unitId: unit.id }, { max_rate: "150.0000" });

    await expect(
      createPurchaseOrder(await poPayload(mat.id, supplier.id, unit.id, "180"))
    ).rejects.toThrow(/₹180\.00.*₹150\.00/);
  });

  // The numeric-string trap, end to end: max_rate arrives from the driver as
  // "150.0000", and "90" > "150.0000" is true under a lexicographic compare.
  it("ALLOWS a rate that is lexicographically greater but numerically smaller", async () => {
    const unit = await createTestUnit();
    const supplier = await createTestSupplier();
    const mat = await createTestMaterial({ unitId: unit.id }, { max_rate: "150.0000" });

    const poId = await createPurchaseOrder(await poPayload(mat.id, supplier.id, unit.id, "90"));
    createdPoIds.push(poId);
    expect(poId).toBeTruthy();
  });

  it("allows a rate exactly at the ceiling", async () => {
    const unit = await createTestUnit();
    const supplier = await createTestSupplier();
    const mat = await createTestMaterial({ unitId: unit.id }, { max_rate: "150.0000" });

    const poId = await createPurchaseOrder(await poPayload(mat.id, supplier.id, unit.id, "150"));
    createdPoIds.push(poId);
    expect(poId).toBeTruthy();
  });
});
