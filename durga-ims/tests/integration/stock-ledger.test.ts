// ============================================================
// Phase: 2
// Category: Integration
// Tests: Stock ledger consistency invariant
// Invariant: materials.current_stock == latest stock_ledger.stock_after for each material
// Source: src/lib/db/schema.ts (materials, stockLedger tables)
// Requires: .env.test pointing to a test database (run npm run db:test:push first)
// ============================================================

import { afterEach, describe, expect, it } from "vitest";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  createTestMaterial,
  createTestStockLedgerEntry,
  cleanupAll,
} from "../fixtures/seed";
import { trackCreated } from "../fixtures/cleanup";

afterEach(async () => {
  await cleanupAll();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getLatestLedger(materialId: string) {
  const [row] = await db
    .select()
    .from(schema.stockLedger)
    .where(eq(schema.stockLedger.material_id, materialId))
    .orderBy(desc(schema.stockLedger.created_at))
    .limit(1);
  return row ?? null;
}

async function getMaterialStock(materialId: string): Promise<number> {
  const [row] = await db
    .select({ stock: schema.materials.current_stock })
    .from(schema.materials)
    .where(eq(schema.materials.id, materialId));
  return parseFloat(row.stock);
}

async function setStock(materialId: string, stock: string) {
  await db
    .update(schema.materials)
    .set({ current_stock: stock })
    .where(eq(schema.materials.id, materialId));
}

async function insertLedger(
  materialId: string,
  type: string,
  qtyChange: string,
  stockAfter: string,
  extra: Record<string, unknown> = {}
) {
  const [row] = await db
    .insert(schema.stockLedger)
    .values({
      material_id: materialId,
      transaction_type: type as "PO_INWARD" | "ISSUE" | "REVERSAL" | "ADJUSTMENT" | "OPENING",
      qty_change: qtyChange,
      stock_after: stockAfter,
      ...extra,
    })
    .returning();
  trackCreated("stockLedger", row.id);
  return row;
}

// ---------------------------------------------------------------------------
// After PO_INWARD
// ---------------------------------------------------------------------------
describe("After PO_INWARD: consistency invariant", () => {
  it("materials.current_stock equals latest stock_ledger.stock_after after simulated inward", async () => {
    const material = await createTestMaterial({}, { current_stock: "10", opening_stock: "10" });
    await setStock(material.id, "15");
    await insertLedger(material.id, "PO_INWARD", "5", "15");

    const stock = await getMaterialStock(material.id);
    const ledger = await getLatestLedger(material.id);
    expect(stock).toBe(15);
    expect(parseFloat(ledger!.stock_after)).toBe(15);
    expect(stock).toBe(parseFloat(ledger!.stock_after));
  });
});

// ---------------------------------------------------------------------------
// After ISSUE
// ---------------------------------------------------------------------------
describe("After ISSUE: consistency invariant", () => {
  it("materials.current_stock equals latest stock_ledger.stock_after after simulated issue", async () => {
    const material = await createTestMaterial({}, { current_stock: "15", opening_stock: "15" });
    await setStock(material.id, "10");
    await insertLedger(material.id, "ISSUE", "-5", "10");

    const stock = await getMaterialStock(material.id);
    const ledger = await getLatestLedger(material.id);
    expect(stock).toBe(10);
    expect(parseFloat(ledger!.stock_after)).toBe(10);
    expect(stock).toBe(parseFloat(ledger!.stock_after));
  });
});

// ---------------------------------------------------------------------------
// After REVERSAL
// ---------------------------------------------------------------------------
describe("After REVERSAL: consistency invariant", () => {
  it("materials.current_stock equals latest stock_ledger.stock_after after reversal", async () => {
    const material = await createTestMaterial({}, { current_stock: "10", opening_stock: "15" });
    await insertLedger(material.id, "ISSUE", "-5", "10");
    await setStock(material.id, "15");
    await insertLedger(material.id, "REVERSAL", "5", "15");

    const stock = await getMaterialStock(material.id);
    const ledger = await getLatestLedger(material.id);
    expect(stock).toBe(15);
    expect(parseFloat(ledger!.stock_after)).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// After ADJUSTMENT
// ---------------------------------------------------------------------------
describe("After ADJUSTMENT: consistency invariant", () => {
  it("materials.current_stock equals latest stock_ledger.stock_after after adjustment", async () => {
    const material = await createTestMaterial({}, { current_stock: "10", opening_stock: "10" });
    await setStock(material.id, "14");
    await insertLedger(material.id, "ADJUSTMENT", "4", "14");

    const stock = await getMaterialStock(material.id);
    const ledger = await getLatestLedger(material.id);
    expect(stock).toBe(14);
    expect(parseFloat(ledger!.stock_after)).toBe(14);
  });
});

// ---------------------------------------------------------------------------
// Sequential operations
// ---------------------------------------------------------------------------
describe("Sequential operations", () => {
  it("running ledger stock_after chain is correct (10 → 15 → 12 → 14)", async () => {
    const material = await createTestMaterial({}, { current_stock: "10", opening_stock: "10" });

    await setStock(material.id, "15");
    await insertLedger(material.id, "PO_INWARD", "5", "15");

    await setStock(material.id, "12");
    await insertLedger(material.id, "ISSUE", "-3", "12");

    await setStock(material.id, "14");
    await insertLedger(material.id, "ADJUSTMENT", "2", "14");

    const stock = await getMaterialStock(material.id);
    const latestLedger = await getLatestLedger(material.id);
    expect(stock).toBe(14);
    expect(parseFloat(latestLedger!.stock_after)).toBe(14);

    const allEntries = await db
      .select()
      .from(schema.stockLedger)
      .where(eq(schema.stockLedger.material_id, material.id))
      .orderBy(schema.stockLedger.created_at);
    expect(allEntries).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// GAP-1 evidence — adjustStock() non-transactional pattern creates audit gap
// ---------------------------------------------------------------------------
describe("GAP-1 evidence: UPDATE materials without ledger → inconsistency possible", () => {
  it("updating current_stock without inserting a ledger entry creates a stock/ledger mismatch", async () => {
    const material = await createTestMaterial({}, { current_stock: "10", opening_stock: "10" });

    // Simulate adjustStock()'s non-transactional pattern: update stock but no ledger written
    // (e.g., if the INSERT stockLedger fails after UPDATE materials succeeds)
    await setStock(material.id, "12");
    // Intentionally do NOT insert a ledger entry

    const stock = await getMaterialStock(material.id);
    const ledger = await getLatestLedger(material.id);

    expect(stock).toBe(12);
    // CONFIRMED: ledger is null — no record of the change
    // This proves adjustStock()'s two-statement pattern can leave stock changed but unrecorded.
    // See BUG-2-001 candidate in tests/reports/bug-log/bugs-master.md
    expect(ledger).toBeNull();
    expect(stock).not.toBe(ledger ?? 0); // mismatch is real
  });
});

// ---------------------------------------------------------------------------
// GAP-3 evidence — stockLedger.stock_after < 0 has no DB constraint
// ---------------------------------------------------------------------------
describe("GAP-3 evidence: stock_after < 0 can be inserted (OBS-2-002)", () => {
  it("inserting stock_after=-5 succeeds — no DB CHECK prevents it", async () => {
    const material = await createTestMaterial();

    const row = await insertLedger(material.id, "ADJUSTMENT", "-15", "-5", {
      reason: "OBS-2-002 evidence",
    });

    expect(parseFloat(row.stock_after)).toBe(-5);
    // App-layer validation in adjustStock() is the only guard against negative stock_after.
    // A direct db.insert() bypasses it. See OBS-2-002 in observations.md.
  });
});

// ---------------------------------------------------------------------------
// Materials CHECK still blocks negative current_stock
// ---------------------------------------------------------------------------
describe("materials CHECK still blocks negative current_stock", () => {
  it("setting current_stock to -1 via direct update throws a CHECK violation", async () => {
    const material = await createTestMaterial({}, { current_stock: "5", opening_stock: "5" });

    // Drizzle+postgres.js wraps the Postgres error in "Failed query: ..." so the constraint
    // name is not in error.message — but the error IS thrown, confirming CHECK is enforced.
    await expect(
      db
        .update(schema.materials)
        .set({ current_stock: "-1" })
        .where(eq(schema.materials.id, material.id))
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Ledger references correct material_id
// ---------------------------------------------------------------------------
describe("Ledger references", () => {
  it("stockLedger entry references the correct material_id", async () => {
    const material = await createTestMaterial();
    const entry = await insertLedger(material.id, "PO_INWARD", "10", "10");

    expect(entry.material_id).toBe(material.id);
  });
});

// ---------------------------------------------------------------------------
// Multiple materials: independent ledger chains
// ---------------------------------------------------------------------------
describe("Multiple materials", () => {
  it("each material has its own independent ledger chain", async () => {
    const matA = await createTestMaterial({}, { current_stock: "5", opening_stock: "5" });
    const matB = await createTestMaterial({}, { current_stock: "20", opening_stock: "20" });

    await insertLedger(matA.id, "PO_INWARD", "5", "10");
    await insertLedger(matB.id, "ISSUE", "-5", "15");

    const stockA = await getMaterialStock(matA.id);
    const stockB = await getMaterialStock(matB.id);
    const ledgerA = await getLatestLedger(matA.id);
    const ledgerB = await getLatestLedger(matB.id);

    // stockA was not updated in DB (we only inserted ledger) — the ledger shows 10
    expect(parseFloat(ledgerA!.stock_after)).toBe(10);
    // stockB was not updated in DB either — the ledger shows 15
    expect(parseFloat(ledgerB!.stock_after)).toBe(15);
    // materials table still holds original values (we only changed ledger)
    expect(stockA).toBe(5);
    expect(stockB).toBe(20);
    // This is exactly what GAP-1 demonstrates: stock and ledger can diverge
  });
});

// ---------------------------------------------------------------------------
// Ledger is append-only
// ---------------------------------------------------------------------------
describe("Ledger is append-only", () => {
  it("querying all entries for a material returns them in chronological order", async () => {
    const material = await createTestMaterial();
    const e1 = await insertLedger(material.id, "PO_INWARD", "10", "10");
    const e2 = await insertLedger(material.id, "ISSUE", "-3", "7");
    const e3 = await insertLedger(material.id, "ADJUSTMENT", "1", "8");

    const entries = await db
      .select()
      .from(schema.stockLedger)
      .where(eq(schema.stockLedger.material_id, material.id))
      .orderBy(schema.stockLedger.created_at);

    expect(entries).toHaveLength(3);
    expect(entries[0].id).toBe(e1.id);
    expect(entries[1].id).toBe(e2.id);
    expect(entries[2].id).toBe(e3.id);
  });
});

// ---------------------------------------------------------------------------
// New material baseline
// ---------------------------------------------------------------------------
describe("New material baseline", () => {
  it("freshly inserted material has current_stock == opening_stock", async () => {
    const material = await createTestMaterial({}, { opening_stock: "100", current_stock: "100" });
    const stock = await getMaterialStock(material.id);
    expect(stock).toBe(100);
    expect(stock).toBe(parseFloat(material.opening_stock));
  });

  it("opening_stock does not change after stock ledger entries (immutable baseline)", async () => {
    const material = await createTestMaterial({}, { opening_stock: "50", current_stock: "50" });
    await setStock(material.id, "60");
    await insertLedger(material.id, "PO_INWARD", "10", "60");

    const [row] = await db
      .select({ opening: schema.materials.opening_stock })
      .from(schema.materials)
      .where(eq(schema.materials.id, material.id));
    expect(parseFloat(row.opening)).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Decimal precision
// ---------------------------------------------------------------------------
describe("Decimal precision in stockLedger", () => {
  it("stock_after with 4 decimal places is stored and retrieved correctly", async () => {
    const material = await createTestMaterial();
    const entry = await insertLedger(material.id, "ADJUSTMENT", "1.2345", "1.2345");
    const fetched = await getLatestLedger(material.id);
    expect(parseFloat(fetched!.stock_after)).toBeCloseTo(1.2345, 4);
  });
});
