import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

// prepare: false required for Supabase transaction pooler compatibility
const client = postgres(connectionString, {
  prepare: false,
  idle_timeout: 60,
  max_lifetime: 1800,
});

export const db = drizzle(client, { schema });
