/** Postgres unique-violation. */
const PG_UNIQUE_VIOLATION = "23505";
/** Postgres foreign-key violation (child row still references this row). */
const PG_FK_VIOLATION = "23503";

/**
 * Walk the cause chain looking for a PostgresError with the given SQLSTATE `code`.
 *
 * Drizzle wraps the driver error in a DrizzleQueryError whose message is a raw SQL
 * dump ("Failed query: insert into ..."); the PostgresError that actually carries
 * `code` hangs off `.cause`. A check against only the top-level object never matches,
 * so a naive catch silently does nothing and the user is shown the SQL statement.
 */
function matchesPgCode(e: unknown, code: string): boolean {
  for (let cur: unknown = e, depth = 0; cur != null && depth < 5; depth++) {
    if (typeof cur !== "object") break;
    if ("code" in cur && (cur as { code?: unknown }).code === code) return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

/** True when `e` is (or wraps) a Postgres unique-constraint violation. */
export function isUniqueViolation(e: unknown): boolean {
  return matchesPgCode(e, PG_UNIQUE_VIOLATION);
}

/**
 * True when `e` is (or wraps) a Postgres foreign-key violation — i.e. a hard DELETE
 * was blocked because a child row still references this row. Used as the last-resort
 * backstop for the master "smart delete": if the pre-check missed a reference (or a
 * concurrent insert added one), the delete throws 23503 and we fall back to hiding.
 */
export function isForeignKeyViolation(e: unknown): boolean {
  return matchesPgCode(e, PG_FK_VIOLATION);
}
