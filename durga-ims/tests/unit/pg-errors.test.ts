// ============================================================
// Phase: 1
// Category: Unit
// Tests: isUniqueViolation() — detects 23505 through drizzle's error wrapper
// Source: src/lib/utils/pg-errors.ts
// ============================================================

import { describe, it, expect } from "vitest";
import { isUniqueViolation } from "@/lib/utils/pg-errors";

// Shape drizzle actually throws: a DrizzleQueryError whose message is a raw SQL dump,
// with the PostgresError (the one carrying `code`) on `.cause`.
function drizzleWrapped(code: string): Error {
  const pgError = Object.assign(new Error("duplicate key value violates unique constraint"), {
    code,
    constraint_name: "uq_materials_name_lower",
  });
  return Object.assign(new Error('Failed query: insert into "materials" ...'), { cause: pgError });
}

describe("isUniqueViolation()", () => {
  it("detects 23505 on a bare driver error", () => {
    expect(isUniqueViolation(Object.assign(new Error("dup"), { code: "23505" }))).toBe(true);
  });

  // The regression that shipped once: a top-level `"code" in e` check never matches a
  // wrapped error, so the catch does nothing and the user is shown the SQL statement.
  it("detects 23505 through drizzle's DrizzleQueryError wrapper", () => {
    expect(isUniqueViolation(drizzleWrapped("23505"))).toBe(true);
  });

  it("detects 23505 nested two levels deep", () => {
    const inner = drizzleWrapped("23505");
    expect(isUniqueViolation(Object.assign(new Error("outer"), { cause: inner }))).toBe(true);
  });

  it("ignores other Postgres error codes", () => {
    expect(isUniqueViolation(drizzleWrapped("23503"))).toBe(false); // FK violation
    expect(isUniqueViolation(drizzleWrapped("42804"))).toBe(false); // datatype mismatch
  });

  it("is safe on non-errors and cause cycles", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);

    const cyclic: { cause?: unknown } = {};
    cyclic.cause = cyclic;
    expect(isUniqueViolation(cyclic)).toBe(false); // terminates, does not hang
  });
});
