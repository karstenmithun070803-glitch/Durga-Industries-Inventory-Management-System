/** Postgres unique-violation. */
const PG_UNIQUE_VIOLATION = "23505";

/**
 * True when `e` is (or wraps) a Postgres unique-constraint violation.
 *
 * Walks the cause chain on purpose. Drizzle wraps the driver error in a
 * DrizzleQueryError whose message is a raw SQL dump ("Failed query: insert into ...");
 * the PostgresError that actually carries `code` hangs off `.cause`. A check against
 * only the top-level object never matches, so the catch silently does nothing and the
 * user is shown the SQL statement.
 */
export function isUniqueViolation(e: unknown): boolean {
  for (let cur: unknown = e, depth = 0; cur != null && depth < 5; depth++) {
    if (typeof cur !== "object") break;
    if ("code" in cur && (cur as { code?: unknown }).code === PG_UNIQUE_VIOLATION) return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}
