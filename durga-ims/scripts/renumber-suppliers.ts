/**
 * One-time: close gaps in suppliers.code_no (e.g. S-019 -> S-350) caused by the
 * SERIAL sequence advancing on failed/deleted inserts. Keeps relative order,
 * renumbers 1..N, then resets the sequence so the next supplier is N+1.
 *
 * Run: NODE_PATH="$(pwd)/node_modules" npx tsx scripts/renumber-suppliers.ts [--yes]
 * Without --yes it only prints the planned changes (dry run).
 */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

async function main() {
  const apply = process.argv.includes("--yes");
  const sql = postgres(process.env.DIRECT_URL!, { prepare: false });

  try {
    const rows = await sql<{ id: string; code_no: number; name: string }[]>`
      SELECT id, code_no, name FROM suppliers ORDER BY code_no`;
    const [seq] = await sql`SELECT last_value FROM suppliers_code_no_seq`;
    console.log(`suppliers: ${rows.length}, max code_no: ${rows.at(-1)?.code_no}, seq: ${seq.last_value}`);

    const changes = rows
      .map((r, i) => ({ ...r, next: i + 1 }))
      .filter((r) => r.code_no !== r.next);
    for (const c of changes) console.log(`  ${c.code_no} -> ${c.next}  ${c.name}`);
    console.log(`${changes.length} row(s) to renumber`);

    if (!apply) return console.log("Dry run. Re-run with --yes to apply.");
    if (changes.length === 0) return;

    await sql.begin(async (tx) => {
      await tx`UPDATE suppliers SET code_no = code_no + 100000`;
      await tx`
        UPDATE suppliers s SET code_no = r.rn
        FROM (SELECT id, row_number() OVER (ORDER BY code_no) AS rn FROM suppliers) r
        WHERE s.id = r.id`;
      await tx`SELECT setval('suppliers_code_no_seq', (SELECT max(code_no) FROM suppliers))`;
    });

    const after = await sql`SELECT min(code_no) AS min, max(code_no) AS max, count(*)::int AS n FROM suppliers`;
    console.log("after:", after[0]);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
