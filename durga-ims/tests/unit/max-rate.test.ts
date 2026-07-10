// ============================================================
// Phase: 1
// Category: Unit
// Tests: exceedsCeiling()    — PO rate vs the admin purchase ceiling
//        parseCeilingInput() — blank/zero/negative rules for a typed ceiling
// Source: src/lib/utils/max-rate.ts
// ============================================================

import { describe, it, expect } from "vitest";
import { exceedsCeiling, parseCeilingInput, InvalidCeilingError } from "@/lib/utils/max-rate";

describe("exceedsCeiling()", () => {
  // ---------------------------------------------------------------------
  // The numeric-string trap. Drizzle returns numeric columns as STRINGS, so a
  // ceiling reaches this code as "150.0000". A lexicographic compare makes
  // "90" > "150.0000" true, which would block a ₹90 rate against a ₹150 ceiling
  // while letting other pairs through. These tests exist to catch exactly that.
  // ---------------------------------------------------------------------
  describe("string operands (as returned by the DB driver)", () => {
    it("does NOT block a rate that is lexicographically greater but numerically smaller", () => {
      // Guard: prove the naive comparison really is wrong, so this test can never
      // be "fixed" by reverting to string compare.
      expect("90" > "150.0000").toBe(true);

      expect(exceedsCeiling("90", "150.0000")).toBe(false);
    });

    it("blocks a rate above the ceiling", () => {
      expect(exceedsCeiling("180", "150.0000")).toBe(true);
    });

    it("allows a rate exactly at the ceiling", () => {
      expect(exceedsCeiling("150", "150.0000")).toBe(false);
      expect(exceedsCeiling("150.0000", "150.0000")).toBe(false);
    });

    it("blocks a rate a hair above the ceiling", () => {
      expect(exceedsCeiling("150.0001", "150.0000")).toBe(true);
    });

    it("tolerates float noise below numeric(14,4) precision", () => {
      expect(exceedsCeiling("150.00000000001", "150.0000")).toBe(false);
    });

    it.each([
      ["9", "10.0000"],
      ["90", "100.0000"],
      ["900", "1000.0000"],
      ["2", "10.0000"],
    ])("rate %s under ceiling %s is allowed despite lexicographic ordering", (rate, ceiling) => {
      expect(Number(rate) < Number(ceiling)).toBe(true);
      expect(exceedsCeiling(rate, ceiling)).toBe(false);
    });
  });

  describe("numeric operands", () => {
    it("blocks above, allows at and below", () => {
      expect(exceedsCeiling(180, 150)).toBe(true);
      expect(exceedsCeiling(150, 150)).toBe(false);
      expect(exceedsCeiling(90, 150)).toBe(false);
    });

    it("treats a zero rate as within any positive ceiling", () => {
      expect(exceedsCeiling("0", "150.0000")).toBe(false);
    });
  });
});

describe("parseCeilingInput()", () => {
  it("returns null for blank — 'not set', which blocks purchasing", () => {
    expect(parseCeilingInput("")).toBeNull();
    expect(parseCeilingInput("   ")).toBeNull();
    expect(parseCeilingInput(null)).toBeNull();
    expect(parseCeilingInput(undefined)).toBeNull();
  });

  it("normalises to numeric(14,4) scale", () => {
    expect(parseCeilingInput("150")).toBe("150.0000");
    expect(parseCeilingInput(" 92.5 ")).toBe("92.5000");
  });

  // A ceiling of 0 blocks every positive rate while looking identical to a set
  // value in the grid. It must be impossible to save.
  it("rejects zero", () => {
    expect(() => parseCeilingInput("0")).toThrow(InvalidCeilingError);
    expect(() => parseCeilingInput("0.0")).toThrow(InvalidCeilingError);
  });

  it("rejects negatives and non-numbers", () => {
    expect(() => parseCeilingInput("-1")).toThrow(InvalidCeilingError);
    expect(() => parseCeilingInput("abc")).toThrow(InvalidCeilingError);
    expect(() => parseCeilingInput("1,50")).toThrow(InvalidCeilingError);
  });

  it("tells the user how to mark a material as not set", () => {
    expect(() => parseCeilingInput("0")).toThrow(/Leave blank to mark it as not set/);
  });
});
