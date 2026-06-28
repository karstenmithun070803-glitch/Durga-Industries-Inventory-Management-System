import type { Config } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env.test" });

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DIRECT_URL!,
  },
} satisfies Config;
