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
  purchaseOrders,
  purchaseOrderItems,
} from "@/lib/db/schema";
import { eq, and, count, sql, desc, inArray } from "drizzle-orm";

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
      .innerJoin(materials, and(eq(stageMaterials.material_id, materials.id), eq(materials.is_active, true)))
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

// Cached — invalidated when stage master or material rates change.
// Uses a single DISTINCT ON query for all rates instead of N per-material round-trips.
export const getStageMaterials = unstable_cache(
  async (stageId: string) => {
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

    if (items.length === 0) return [];

    // One batch query for all material rates — uses inArray (correct UUID typing)
    const materialIds = items.map((i) => i.material_id);
    const allRateRows = await db
      .select({
        material_id: purchaseOrderItems.material_id,
        rate: purchaseOrderItems.rate,
      })
      .from(purchaseOrderItems)
      .innerJoin(purchaseOrders, eq(purchaseOrderItems.po_id, purchaseOrders.id))
      .where(
        and(
          eq(purchaseOrders.status, "Received"),
          inArray(purchaseOrderItems.material_id, materialIds)
        )
      )
      .orderBy(desc(purchaseOrders.po_date));

    const rateMap = new Map<string, string>();
    for (const row of allRateRows) {
      if (!rateMap.has(row.material_id)) {
        rateMap.set(row.material_id, row.rate);
      }
    }
    return items.map((item) => ({ ...item, last_po_rate: rateMap.get(item.material_id) ?? null }));
  },
  ["stage-materials"],
  { tags: [CACHE_TAGS.stages, CACHE_TAGS.materials], revalidate: false }
);

export type StageMaterialResult = Awaited<ReturnType<typeof getStageMaterials>>[number];

// Returns ALL active stage materials grouped by stage_id in a single call.
// Use this for bulk loads (auto-populate on new job) instead of N getStageMaterials() calls.
export const getAllStageMaterials = unstable_cache(
  async (): Promise<Record<string, StageMaterialResult[]>> => {
    const allStages = await db
      .select({ id: stages.id })
      .from(stages)
      .where(eq(stages.is_active, true));

    if (allStages.length === 0) return {};

    const stageIds = allStages.map((s) => s.id);

    const allItems = await db
      .select({
        stage_id: stageMaterials.stage_id,
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
      .where(and(inArray(stageMaterials.stage_id, stageIds), eq(materials.is_active, true)));

    if (allItems.length === 0) return {};

    const materialIds = Array.from(new Set(allItems.map((i) => i.material_id)));
    const rateRows = await db
      .select({ material_id: purchaseOrderItems.material_id, rate: purchaseOrderItems.rate })
      .from(purchaseOrderItems)
      .innerJoin(purchaseOrders, eq(purchaseOrderItems.po_id, purchaseOrders.id))
      .where(and(eq(purchaseOrders.status, "Received"), inArray(purchaseOrderItems.material_id, materialIds)))
      .orderBy(desc(purchaseOrders.po_date));

    const rateMap = new Map<string, string>();
    for (const r of rateRows) {
      if (!rateMap.has(r.material_id)) rateMap.set(r.material_id, r.rate);
    }

    const grouped: Record<string, StageMaterialResult[]> = {};
    for (const item of allItems) {
      if (!grouped[item.stage_id]) grouped[item.stage_id] = [];
      grouped[item.stage_id].push({ ...item, last_po_rate: rateMap.get(item.material_id) ?? null });
    }
    return grouped;
  },
  ["all-stage-materials"],
  { tags: [CACHE_TAGS.stages, CACHE_TAGS.materials], revalidate: false }
);

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
  const [{ draftCount }] = await db
    .select({ draftCount: count() })
    .from(materialIssues)
    .where(and(eq(materialIssues.stage_id, id), eq(materialIssues.status, "Draft")));

  if (draftCount > 0)
    throw new Error(
      `Stage has ${draftCount} Draft issue slip${draftCount === 1 ? "" : "s"} — complete or delete those slips before deactivating this stage.`
    );

  await db.update(stages).set({ is_active: false }).where(eq(stages.id, id));
  revalidateTag(CACHE_TAGS.stages);

  return { draftCount: 0 };
}

export async function reactivateStage(id: string): Promise<void> {
  await db.update(stages).set({ is_active: true }).where(eq(stages.id, id));
  revalidateTag(CACHE_TAGS.stages);
}
