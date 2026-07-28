// ============================================================
// Phase: 1
// Category: Unit
// Tests: exceedsCeiling()    — PO rate vs the admin purchase ceiling
//        parseCeilingInput() — blank/zero/negative rules for a typed ceiling
// Source: src/lib/utils/max-rate.ts
// ============================================================

import { describe, it, expect } from "vitest";
import {
  exceedsCeiling,
  belowFloor,
  rateBand,
  parseCeilingInput,
  parseBufferInput,
  InvalidCeilingError,
  InvalidBufferError,
} from "@/lib/utils/max-rate";

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

describe("belowFloor()", () => {
  it("string operands do not lexicographically mis-fire", () => {
    // "9" < "10" is false lexicographically ("9" > "1"); numeric says 9 < 10.
    expect(belowFloor("9", "10.0000")).toBe(true);
    expect(belowFloor("538", "538.0000")).toBe(false); // at the floor is allowed
    expect(belowFloor("537.99", "538.0000")).toBe(true);
  });
});

describe("rateBand()", () => {
  it("computes base ± buffer", () => {
    expect(rateBand("543", "5")).toEqual({ min: 538, max: 548 });
  });
  it("clamps the floor at 0 — never negative", () => {
    expect(rateBand("400", "500")).toEqual({ min: 0, max: 900 });
  });
  it("buffer 0 collapses the band to exactly base", () => {
    expect(rateBand("400", "0")).toEqual({ min: 400, max: 400 });
  });
  it("returns null when base or buffer is missing", () => {
    expect(rateBand(null, "5")).toBeNull();
    expect(rateBand("400", null)).toBeNull();
    expect(rateBand("400", "")).toBeNull();
  });
});

describe("parseBufferInput()", () => {
  it("blank => null", () => {
    expect(parseBufferInput("")).toBeNull();
    expect(parseBufferInput(null)).toBeNull();
  });
  it("ACCEPTS zero (exact-base policy) — unlike a zero base", () => {
    expect(parseBufferInput("0")).toBe("0.0000");
  });
  it("normalises to 4dp", () => {
    expect(parseBufferInput("5")).toBe("5.0000");
    expect(parseBufferInput(" 2.5 ")).toBe("2.5000");
  });
  it("rejects negatives and non-numbers", () => {
    expect(() => parseBufferInput("-1")).toThrow(InvalidBufferError);
    expect(() => parseBufferInput("abc")).toThrow(InvalidBufferError);
  });
});
