/**
 * Runs scripts/reset-keep-reference.sql against DIRECT_URL.
 *
 *   cd durga-ims
 *   NODE_PATH="$(pwd)/node_modules" npx tsx scripts/run-reset.ts
 *
 * ⚠ IRREVERSIBLE, and DIRECT_URL points at production. Take a Supabase snapshot
 * first. Requires typing the confirmation phrase; pass --yes to skip the prompt
 * only if you have already confirmed the target.
 *
 * Pre-flights the live table list against what the code knows about before
 * touching anything: a table created by hand in the Supabase editor, or dropped
 * from schema.ts but never dropped in the DB, would otherwise survive the wipe
 * still holding rows. On any surprise this aborts rather than guessing.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { join } from "node:path";

const WIPE = [
  "invoice_insurance_items",
  "invoice_insurance",
  "invoice_slip_links",
  "invoice_items",
  "invoices",
  "material_issue_items",
  "material_issues",
  "purchase_order_items",
  "purchase_orders",
  "stock_ledger",
  "stage_materials",
  "vehicles",
  "materials",
  "customers",
];

const KEEP = [
  "suppliers",
  "units",
  "tax_rates",
  "stages",
  "contractors",
  "app_users",
  "company_settings",
];

const CONFIRM = "DELETE";

async function confirm(host: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `\nThis will irreversibly wipe ${WIPE.length} tables on ${host}.\nType ${CONFIRM} to proceed: `
  );
  rl.close();
  return answer.trim() === CONFIRM;
}

async function main() {
  const { DIRECT_URL } = process.env;
  if (!DIRECT_URL) throw new Error("DIRECT_URL missing from .env.local");

  const host = new URL(DIRECT_URL).host;
  const sql = postgres(DIRECT_URL, { prepare: false });

  try {
    // ── 1. Pre-flight: does the live DB match what the code knows about? ─────
    const live = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;
    const known = new Set([...WIPE, ...KEEP]);
    const unknown = live.map((r) => r.table_name).filter((t) => !known.has(t));

    if (unknown.length > 0) {
      console.error("✗ Live database has tables this script does not account for:");
      for (const t of unknown) console.error(`    ${t}`);
      console.error("\n  Nothing was changed. These are outside schema.ts and would");
      console.error("  survive the wipe holding stale rows. Decide what they are first.");
      process.exit(1);
    }

    const missing = [...known].filter(
      (t) => !live.some((r) => r.table_name === t)
    );
    if (missing.length > 0) {
      console.error(`✗ Expected tables absent from ${host}: ${missing.join(", ")}`);
      console.error("  Nothing was changed. Is DIRECT_URL pointing at the right database?");
      process.exit(1);
    }
    console.log(`✓ pre-flight: ${live.length} tables on ${host}, all accounted for`);

    // ── 2. Confirm ──────────────────────────────────────────────────────────
    if (!process.argv.includes("--yes") && !(await confirm(host))) {
      console.log("Aborted. Nothing was changed.");
      return;
    }

    // ── 3. Wipe ─────────────────────────────────────────────────────────────
    // One statement, so there is never a window where invoices point at
    // deleted vehicles. sql.unsafe() is required: this is a whole file, not a
    // parameterised query. The file is repo-controlled, not user input.
    // __dirname, not import.meta.dirname: the package is CommonJS, so tsx compiles
    // this to CJS and import.meta is unavailable.
    const script = await readFile(join(__dirname, "reset-keep-reference.sql"), "utf8");
    await sql.unsafe(script);
    console.log("✓ wiped");

    // ── 4. Report ───────────────────────────────────────────────────────────
    // Count everything, not just the preserved tables — proving the wiped ones
    // are actually at zero is the point.
    const counts: { table: string; rows: number; expected: string }[] = [];
    for (const t of [...KEEP, ...WIPE]) {
      const [{ n }] = await sql<{ n: string }[]>`
        SELECT count(*)::text AS n FROM ${sql(t)}
      `;
      counts.push({
        table: t,
        rows: Number(n),
        expected: KEEP.includes(t) ? "kept" : "empty",
      });
    }
    console.table(counts);

    const wrong = counts.filter((c) => c.expected === "empty" && c.rows > 0);
    if (wrong.length > 0) {
      console.error(`✗ Still holding rows: ${wrong.map((c) => c.table).join(", ")}`);
      process.exit(1);
    }
    console.log("\nNext: flush the server-component cache before checking the UI.");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("✗", e instanceof Error ? e.message : e);
  process.exit(1);
});
