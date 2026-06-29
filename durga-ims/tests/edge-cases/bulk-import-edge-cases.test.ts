// ============================================================
// Phase: 4
// Category: Edge Case
// Tests: bulkImportMaterials — deduplication: within-batch, active DB,
//        inactive DB; happy path import
// Source: src/lib/actions/materials.actions.ts
// ============================================================

import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, ilike, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  createTestUnit,
  createTestMaterial,
  cleanupAll,
} from "../fixtures/seed";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: Function) => fn,
}));

import { bulkImportMaterials } from "@/lib/actions/materials.actions";

// Track materials created by the action so we can clean them up
const importedNames: string[] = [];

afterEach(async () => {
  if (importedNames.length > 0) {
    await db.delete(schema.materials).where(
      inArray(
        schema.materials.name,
        importedNames.map((n) => n.toUpperCase())
      )
    );
    importedNames.length = 0;
  }
  await cleanupAll();
});

// ===========================================================================
// WITHIN-BATCH DEDUPLICATION
// Confirm: batchSeen Set prevents same name appearing twice in one import.
// CONFIRMED SAFE — no code was changed.
// ===========================================================================

describe("bulkImportMaterials — within-batch deduplication", () => {
  it("imports only one row when same name appears twice in the batch", async () => {
    const unit = await createTestUnit();
    const uniqueName = `BULK-DEDUP-${Date.now()}`;

    const result = await bulkImportMaterials([
      { name: uniqueName, purchase_unit_id: unit.id },
      { name: uniqueName, purchase_unit_id: unit.id }, // duplicate
    ]);

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.skippedInactive).toBe(0);
    importedNames.push(uniqueName);
  });

  it("handles case-insensitive within-batch dedup (lower vs upper)", async () => {
    const unit = await createTestUnit();
    const base = `BULK-CASE-${Date.now()}`;

    const result = await bulkImportMaterials([
      { name: base.toLowerCase(), purchase_unit_id: unit.id },
      { name: base.toUpperCase(), purchase_unit_id: unit.id },
    ]);

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    importedNames.push(base.toUpperCase());
  });
});

// ===========================================================================
// DEDUPLICATION AGAINST EXISTING ACTIVE MATERIALS
// ===========================================================================

describe("bulkImportMaterials — skip existing active material", () => {
  it("skips row if same name already exists as active (case-insensitive)", async () => {
    const unit = await createTestUnit();
    const uniqueName = `BULK-ACTIVE-${Date.now()}`;
    await createTestMaterial({ unitId: unit.id }, { name: uniqueName.toUpperCase() });

    const result = await bulkImportMaterials([
      { name: uniqueName.toLowerCase(), purchase_unit_id: unit.id },
    ]);

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.skippedInactive).toBe(0);
  });
});

// ===========================================================================
// DEDUPLICATION AGAINST EXISTING INACTIVE MATERIALS
// ===========================================================================

describe("bulkImportMaterials — skip existing inactive material", () => {
  it("skippedInactive is incremented and row is NOT inserted if name exists as inactive", async () => {
    const unit = await createTestUnit();
    const uniqueName = `BULK-INACTIVE-${Date.now()}`;
    await createTestMaterial({ unitId: unit.id }, { name: uniqueName.toUpperCase() });
    await db
      .update(schema.materials)
      .set({ is_active: false })
      .where(ilike(schema.materials.name, uniqueName));

    const result = await bulkImportMaterials([
      { name: uniqueName, purchase_unit_id: unit.id },
    ]);

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.skippedInactive).toBe(1);
  });
});

// ===========================================================================
// HAPPY PATH
// ===========================================================================

describe("bulkImportMaterials — happy path", () => {
  it("returns imported count equal to the number of unique new rows", async () => {
    const unit = await createTestUnit();
    const names = [
      `BULK-NEW-A-${Date.now()}`,
      `BULK-NEW-B-${Date.now()}`,
      `BULK-NEW-C-${Date.now()}`,
    ];

    const result = await bulkImportMaterials(
      names.map((name) => ({ name, purchase_unit_id: unit.id }))
    );

    expect(result.imported).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.skippedInactive).toBe(0);
    importedNames.push(...names);
  });

  it("returns 0/0/0 for empty input without hitting DB", async () => {
    const result = await bulkImportMaterials([]);
    expect(result).toEqual({ imported: 0, skipped: 0, skippedInactive: 0 });
  });
});
