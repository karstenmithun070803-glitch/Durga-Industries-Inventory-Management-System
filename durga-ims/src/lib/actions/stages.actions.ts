"use server";

import { unstable_cache, revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache";
import { db } from "@/lib/db";
import {
  stages,
  stageMaterials,
  materials,
  units,
  taxRates,
  materialIssues,
  purchaseOrderItems,
  purchaseOrders,
} from "@/lib/db/schema";
import { eq, and, count, desc, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StageMaterialRow {
  id: string;
  material_id: string;
  material_name: string;
  material_no: number;
  default_qty: string;
  unit_id: string;
  unit_name: string;
}

export interface StageWithMaterials {
  id: string;
  stage_code: string;
  stage_name: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  materials: StageMaterialRow[];
}

// ---------------------------------------------------------------------------
// Reads (cached)
// ---------------------------------------------------------------------------

export const getStagesWithMaterials = unstable_cache(
  async (): Promise<StageWithMaterials[]> => {
    const stagesData = await db
      .select({
        id: stages.id,
        stage_code: stages.stage_code,
        stage_name: stages.stage_name,
        is_active: stages.is_active,
        created_at: stages.created_at,
        updated_at: stages.updated_at,
      })
      .from(stages)
      .orderBy(stages.stage_code);

    const smData = await db
      .select({
        id: stageMaterials.id,
        stage_id: stageMaterials.stage_id,
        material_id: stageMaterials.material_id,
        material_name: materials.name,
        material_no: materials.material_no,
        default_qty: stageMaterials.default_qty,
        unit_id: stageMaterials.unit_id,
        unit_name: units.unit_name,
      })
      .from(stageMaterials)
      .innerJoin(materials, eq(stageMaterials.material_id, materials.id))
      .innerJoin(units, eq(stageMaterials.unit_id, units.id));

    return stagesData.map((stage) => ({
      ...stage,
      materials: smData
        .filter((sm) => sm.stage_id === stage.id)
        .map((sm) => ({
          id: sm.id,
          material_id: sm.material_id,
          material_name: sm.material_name,
          material_no: sm.material_no,
          default_qty: sm.default_qty,
          unit_id: sm.unit_id,
          unit_name: sm.unit_name,
        })),
    }));
  },
  ["stages-with-materials"],
  { tags: [CACHE_TAGS.stages], revalidate: false }
);

export const getStagesForDropdown = unstable_cache(
  async () =>
    db
      .select({
        id: stages.id,
        stage_code: stages.stage_code,
        stage_name: stages.stage_name,
      })
      .from(stages)
      .where(eq(stages.is_active, true))
      .orderBy(stages.stage_code),
  ["stages-dropdown"],
  { tags: [CACHE_TAGS.stages], revalidate: false }
);

// Not cached — called at runtime for New VMI grid pre-fill (Phase 5)
export async function getStageMaterials(stageId: string) {
  const items = await db
    .select({
      id: stageMaterials.id,
      material_id: stageMaterials.material_id,
      material_name: materials.name,
      material_no: materials.material_no,
      default_qty: stageMaterials.default_qty,
      unit_id: stageMaterials.unit_id,
      unit_name: units.unit_name,
      hsn_code: materials.hsn_code,
      tax_rate_id: materials.tax_rate_id,
      tax_percentage: taxRates.tax_percentage,
      purchase_unit_id: materials.purchase_unit_id,
    })
    .from(stageMaterials)
    .innerJoin(materials, eq(stageMaterials.material_id, materials.id))
    .innerJoin(units, eq(stageMaterials.unit_id, units.id))
    .leftJoin(taxRates, eq(materials.tax_rate_id, taxRates.id))
    .where(and(eq(stageMaterials.stage_id, stageId), eq(materials.is_active, true)));

  // Attach last PO rate for each material
  const withRates = await Promise.all(
    items.map(async (item) => {
      const [rateRow] = await db
        .select({ rate: purchaseOrderItems.rate })
        .from(purchaseOrderItems)
        .innerJoin(purchaseOrders, eq(purchaseOrderItems.po_id, purchaseOrders.id))
        .where(
          and(
            eq(purchaseOrderItems.material_id, item.material_id),
            eq(purchaseOrders.status, "Received")
          )
        )
        .orderBy(desc(purchaseOrders.po_date))
        .limit(1);

      return { ...item, last_po_rate: rateRow?.rate ?? null };
    })
  );

  return withRates;
}

// ---------------------------------------------------------------------------
// Stage code auto-generation (numeric MAX to handle S999 → S1000 correctly)
// ---------------------------------------------------------------------------

async function generateStageCode(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0]
): Promise<string> {
  // MUST use numeric cast — text MAX breaks after S999 ('9' > '1' lexicographically)
  const [row] = await tx
    .select({
      maxNum: sql<number>`MAX(CAST(SUBSTRING(${stages.stage_code}, 2) AS INTEGER))`,
    })
    .from(stages);

  const next = (row?.maxNum ?? 0) + 1;
  const padded = next <= 999 ? String(next).padStart(3, "0") : String(next);
  return `S${padded}`;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function saveStage(params: {
  id: string | null;
  stage_name: string;
  materials: Array<{ material_id: string; default_qty: string; unit_id: string }>;
}): Promise<{ stageId: string }> {
  const { id, stage_name, materials: items } = params;
  const name = stage_name.trim();
  if (!name) throw new Error("Stage name is required");

  const stageId = await db.transaction(async (tx) => {
    // Duplicate name check (case-insensitive)
    const [existing] = await tx
      .select({ id: stages.id })
      .from(stages)
      .where(sql`LOWER(${stages.stage_name}) = LOWER(${name})`);

    if (existing && existing.id !== id) {
      throw new Error("A stage with this name already exists");
    }

    let resolvedId: string;

    if (id === null) {
      const stage_code = await generateStageCode(tx);
      const [inserted] = await tx
        .insert(stages)
        .values({ stage_code, stage_name: name })
        .returning({ id: stages.id });
      resolvedId = inserted.id;
    } else {
      await tx
        .update(stages)
        .set({ stage_name: name })
        .where(eq(stages.id, id));
      resolvedId = id;
    }

    // Atomically replace all stage materials
    await tx.delete(stageMaterials).where(eq(stageMaterials.stage_id, resolvedId));

    if (items.length > 0) {
      await tx.insert(stageMaterials).values(
        items.map((item) => ({
          stage_id: resolvedId,
          material_id: item.material_id,
          default_qty: item.default_qty,
          unit_id: item.unit_id,
        }))
      );
    }

    return resolvedId;
  });

  revalidateTag(CACHE_TAGS.stages);
  return { stageId };
}

export async function deleteStage(id: string): Promise<{ draftCount: number }> {
  const [{ issuedCount }] = await db
    .select({ issuedCount: count() })
    .from(materialIssues)
    .where(and(eq(materialIssues.stage_id, id), eq(materialIssues.status, "Issued")));

  if (issuedCount > 0) {
    throw new Error(
      `Stage used in ${issuedCount} issued slip${issuedCount === 1 ? "" : "s"} — cannot delete`
    );
  }

  const [{ draftCount }] = await db
    .select({ draftCount: count() })
    .from(materialIssues)
    .where(and(eq(materialIssues.stage_id, id), eq(materialIssues.status, "Draft")));

  await db.update(stages).set({ is_active: false }).where(eq(stages.id, id));
  revalidateTag(CACHE_TAGS.stages);

  return { draftCount };
}

export async function reactivateStage(id: string): Promise<void> {
  await db.update(stages).set({ is_active: true }).where(eq(stages.id, id));
  revalidateTag(CACHE_TAGS.stages);
}
