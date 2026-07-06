import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

// Serverless-oriented pool for Supabase's transaction pooler (PgBouncer/Supavisor).
// - prepare: false is required for transaction-pooler compatibility.
// - max: 1 keeps each serverless invocation to a single connection, avoiding
//   pooler client-connection exhaustion across many concurrent function instances.
// - connect_timeout fails fast instead of hanging if a connection can't be
//   established, surfacing a clear error instead of a stalled request.
const client = postgres(connectionString, {
  prepare: false,
  max: 1,
  idle_timeout: 20,
  connect_timeout: 15,
  max_lifetime: 1800,
});

export const db = drizzle(client, { schema });
