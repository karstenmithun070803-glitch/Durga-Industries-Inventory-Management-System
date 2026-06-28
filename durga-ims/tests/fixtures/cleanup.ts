import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";

type TableName = keyof typeof schema;

const _created: { table: TableName; id: string }[] = [];

export function trackCreated(table: TableName, id: string) {
  _created.push({ table, id });
}

export async function cleanupAll() {
  // Delete in reverse order of insertion (respects FK constraints)
  for (const { table, id } of [..._created].reverse()) {
    const t = schema[table] as Parameters<typeof db.delete>[0];
    if (!t || !("id" in t)) continue;
    try {
      await db.delete(t).where(eq((t as { id: unknown }).id as Parameters<typeof eq>[0], id));
    } catch {
      // Row may already be gone via cascade — ignore
    }
  }
  _created.length = 0;
}
