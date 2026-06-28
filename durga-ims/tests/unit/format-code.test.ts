// ============================================================
// Phase: 1
// Category: Unit
// Tests: formatCode() — serial code formatting (C001, M042)
//        matchesCode() — code search matching
//        formatActionError() — stock error message formatting (BUG-1-001 fixed here)
//        validateGstinFormat() — GSTIN format validation
// Source: src/lib/utils.ts
// ============================================================

import { describe, it, expect } from "vitest";
import { formatCode, matchesCode, formatActionError, validateGstinFormat } from "@/lib/utils";

// ---------------------------------------------------------------------------
// formatCode()
// ---------------------------------------------------------------------------
describe("formatCode()", () => {
  it("pads a single-digit number to 3 digits by default", () => {
    expect(formatCode("C", 1)).toBe("C001");
  });

  it("pads a two-digit number to 3 digits", () => {
    expect(formatCode("M", 42)).toBe("M042");
  });

  it("does not truncate when number exceeds pad width (grows naturally)", () => {
    // pad=3 but 1000 has 4 digits — padStart does not truncate
    expect(formatCode("PO", 1000)).toBe("PO1000");
  });

  it("respects a custom pad width", () => {
    expect(formatCode("S", 5, 2)).toBe("S05");
  });

  it("works with a multi-character prefix", () => {
    expect(formatCode("INV", 7)).toBe("INV007");
  });

  it("handles pad=0 (no padding)", () => {
    expect(formatCode("X", 42, 0)).toBe("X42");
  });
});

// ---------------------------------------------------------------------------
// matchesCode()
// ---------------------------------------------------------------------------
describe("matchesCode()", () => {
  it("returns true for empty search string (matches everything)", () => {
    expect(matchesCode("", "C", 1)).toBe(true);
  });

  it("returns true for whitespace-only search (trimmed to empty)", () => {
    expect(matchesCode("   ", "C", 1)).toBe(true);
  });

  it("matches full code string case-insensitively", () => {
    expect(matchesCode("C001", "C", 1)).toBe(true);
    expect(matchesCode("c001", "C", 1)).toBe(true);
    expect(matchesCode("C001", "c", 1)).toBe(true);
  });

  it("matches partial code string", () => {
    expect(matchesCode("00", "C", 1)).toBe(true); // "c001" includes "00"
  });

  it("matches by number only (strips prefix)", () => {
    expect(matchesCode("1", "C", 1)).toBe(true);  // strips "C", parses "1" → matches num=1
    expect(matchesCode("42", "M", 42)).toBe(true);
  });

  it("returns false when code does not match", () => {
    expect(matchesCode("C002", "C", 1)).toBe(false);
    expect(matchesCode("X", "C", 1)).toBe(false);
  });

  it("returns false when number does not match", () => {
    expect(matchesCode("2", "C", 1)).toBe(false);
  });

  it("handles non-numeric search after stripping prefix", () => {
    // Search "Cabc" → strip "C" → "abc" → parseInt("abc") = NaN → no numeric match
    // "cabc".includes("c001") = false → returns false
    expect(matchesCode("Cabc", "C", 1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// formatActionError()
// ---------------------------------------------------------------------------
describe("formatActionError()", () => {
  it("formats an insufficient-stock error into a user-friendly message", () => {
    const err = new Error('Insufficient stock for "Steel Rod": available 5.00, requested 10.00.');
    const result = formatActionError(err);
    expect(result).toBe("Not enough stock — Steel Rod (available: 5.00, needed: 10.00)");
  });

  it("returns the raw error message for non-stock errors", () => {
    const err = new Error("Something else went wrong");
    expect(formatActionError(err)).toBe("Something else went wrong");
  });

  it("returns the fallback string when error has no message", () => {
    const err = new Error("");
    expect(formatActionError(err)).toBe("Action failed");
  });

  it("returns the fallback string for non-Error values", () => {
    expect(formatActionError(null)).toBe("Action failed");
    expect(formatActionError(undefined)).toBe("Action failed");
    expect(formatActionError("a plain string")).toBe("Action failed");
  });

  it("accepts a custom fallback string", () => {
    expect(formatActionError(null, "Custom error")).toBe("Custom error");
  });

  it("strips trailing period from error message (regex accepts optional trailing period)", () => {
    // Error messages end with a period; the formatted output should not include it
    const err = new Error('Insufficient stock for "Paint": available 2.00, requested 5.00');
    const result = formatActionError(err);
    expect(result).toBe("Not enough stock — Paint (available: 2.00, needed: 5.00)");
  });
});

// ---------------------------------------------------------------------------
// validateGstinFormat()
// ---------------------------------------------------------------------------
describe("validateGstinFormat()", () => {
  it("returns null for empty string (GSTIN is optional)", () => {
    expect(validateGstinFormat("")).toBeNull();
  });

  it("returns null for whitespace-only input (trimmed to empty)", () => {
    expect(validateGstinFormat("   ")).toBeNull();
  });

  it("returns null for a valid GSTIN (example format)", () => {
    expect(validateGstinFormat("33AAAAA1234A1Z5")).toBeNull();
  });

  it("accepts lowercase input (converts to uppercase before validating)", () => {
    expect(validateGstinFormat("33aaaaa1234a1z5")).toBeNull();
  });

  it("returns an error message for an invalid GSTIN format", () => {
    const result = validateGstinFormat("INVALID");
    expect(typeof result).toBe("string");
    expect(result).toContain("GSTIN format incorrect");
  });

  it("rejects a GSTIN that is too short", () => {
    const result = validateGstinFormat("33AAAA1234A1Z5"); // missing one char
    expect(typeof result).toBe("string");
  });

  it("rejects a GSTIN that is too long", () => {
    const result = validateGstinFormat("33AAAAA1234A1Z5X"); // extra char
    expect(typeof result).toBe("string");
  });

  it("rejects a GSTIN with wrong structure (numbers where letters expected)", () => {
    const result = validateGstinFormat("33111111234A1Z5");
    expect(typeof result).toBe("string");
  });
});
