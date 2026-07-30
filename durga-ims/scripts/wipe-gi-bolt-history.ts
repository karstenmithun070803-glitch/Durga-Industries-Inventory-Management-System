/**
 * Wipes purchase history and stock ledger for the "16 GI BOLT (RF)" material.
 * The material itself is kept active. All other materials are untouched.
 *
 * What is deleted:
 *   - stock_ledger rows where material_id matches
 *   - purchase_order_items rows where material_id matches
 *   - purchase_orders headers that become empty after the above (no other items)
 *
 * What is reset on the material:
 *   - opening_stock = 0
 *   - current_stock = 0
 *
 * After running:
 *   - Trigger any UI mutation (e.g. edit+save a material) to flush Next.js cache,
 *     OR call the revalidate-all endpoint from DVN ops.
 *
 *   cd durga-ims
 *   NODE_PATH="$(pwd)/node_modules" npx tsx scripts/wipe-gi-bolt-history.ts
 *
 * ⚠ IRREVERSIBLE. Take a Supabase snapshot first.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";
import { createInterface } from "node:readline/promises";

async function confirm(materialName: string, host: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `\nThis will IRREVERSIBLY delete all stock ledger and PO history for:\n  "${materialName}" on ${host}\nType DELETE to proceed: `
  );
  rl.close();
  return answer.trim() === "DELETE";
}

async function main() {
  const { DIRECT_URL } = process.env;
  if (!DIRECT_URL) throw new Error("DIRECT_URL missing from .env.local");

  const host = new URL(DIRECT_URL).host;
  const sql = postgres(DIRECT_URL, { prepare: false });

  try {
    // ── 1. Find the material ─────────────────────────────────────────────────
    const matches = await sql<{ id: string; name: string; material_no: number; current_stock: string }[]>`
      SELECT id, name, material_no, current_stock
      FROM materials
      WHERE name ILIKE ${'%GI BOLT%'}
      ORDER BY material_no
    `;

    if (matches.length === 0) {
      console.error("✗ No material found matching '%GI BOLT%'. Nothing changed.");
      process.exit(1);
    }
    if (matches.length > 1) {
      console.log("Multiple matches found:");
      for (const m of matches) console.log(`  M-${String(m.material_no).padStart(3, "0")} | ${m.id} | ${m.name}`);
      console.error("✗ Ambiguous match. Narrow the search in the script. Nothing changed.");
      process.exit(1);
    }

    const mat = matches[0];
    console.log(`\nFound: M-${String(mat.material_no).padStart(3, "0")} "${mat.name}"`);
    console.log(`  ID:            ${mat.id}`);
    console.log(`  Current stock: ${mat.current_stock}`);

    // ── 2. Count records to be deleted ───────────────────────────────────────
    const [{ ledger_count }] = await sql<{ ledger_count: string }[]>`
      SELECT count(*)::text AS ledger_count FROM stock_ledger WHERE material_id = ${mat.id}
    `;
    const [{ poi_count }] = await sql<{ poi_count: string }[]>`
      SELECT count(*)::text AS poi_count FROM purchase_order_items WHERE material_id = ${mat.id}
    `;
    const affectedPoIds = await sql<{ po_id: string }[]>`
      SELECT DISTINCT po_id FROM purchase_order_items WHERE material_id = ${mat.id}
    `;

    console.log(`\nRecords to delete:`);
    console.log(`  stock_ledger rows:        ${ledger_count}`);
    console.log(`  purchase_order_items rows: ${poi_count}`);
    console.log(`  Affected PO IDs:          ${affectedPoIds.length}`);

    // ── 3. Confirm ───────────────────────────────────────────────────────────
    if (!process.argv.includes("--yes") && !(await confirm(mat.name, host))) {
      console.log("Aborted. Nothing was changed.");
      return;
    }

    // ── 4. Execute inside a transaction ─────────────────────────────────────
    await sql.begin(async (tx) => {
      // Delete ledger entries
      const deletedLedger = await tx`
        DELETE FROM stock_ledger WHERE material_id = ${mat.id} RETURNING id
      `;
      console.log(`\n  Deleted ${deletedLedger.length} stock_ledger rows`);

      // Delete PO items
      const deletedItems = await tx`
        DELETE FROM purchase_order_items WHERE material_id = ${mat.id} RETURNING po_id
      `;
      console.log(`  Deleted ${deletedItems.length} purchase_order_items rows`);

      // Delete any PO headers that now have no items
      let deletedPos = 0;
      if (affectedPoIds.length > 0) {
        const poIdList = affectedPoIds.map((r) => r.po_id);
        const emptyPos = await tx<{ id: string; po_number: number }[]>`
          SELECT po.id, po.po_number
          FROM purchase_orders po
          WHERE po.id = ANY(${poIdList}::uuid[])
          AND NOT EXISTS (
            SELECT 1 FROM purchase_order_items poi WHERE poi.po_id = po.id
          )
        `;
        if (emptyPos.length > 0) {
          const emptyPoIds = emptyPos.map((p) => p.id);
          await tx`DELETE FROM purchase_orders WHERE id = ANY(${emptyPoIds}::uuid[])`;
          deletedPos = emptyPos.length;
          console.log(`  Deleted ${deletedPos} now-empty PO header(s):`);
          for (const p of emptyPos) console.log(`    PO #${p.po_number}`);
        } else {
          console.log(`  No PO headers became empty (all had other materials) — PO headers kept`);
        }
      }

      // Reset stock fields on the material
      await tx`
        UPDATE materials
        SET opening_stock = '0',
            current_stock = '0',
            updated_at    = NOW()
        WHERE id = ${mat.id}
      `;
      console.log(`  Reset opening_stock and current_stock to 0`);
    });

    console.log("\n✓ Done.");
    console.log("\nIMPORTANT: flush the Next.js cache before checking the UI.");
    console.log("  Either: run the revalidate-all endpoint");
    console.log("  Or:     open Materials Master, edit any material, and save.");

  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("✗", e instanceof Error ? e.message : e);
  process.exit(1);
});
