// ============================================================
// Phase: 1
// Category: Unit
// Tests: determineGstType() — GST type resolution (CGST_SGST vs IGST)
//        based on GSTIN state code and customer state field
//        Company is in Tamil Nadu (state code "33"); intra-state = CGST_SGST
// Source: src/types/index.ts → determineGstType()
// ============================================================

import { describe, it, expect } from "vitest";
import { determineGstType } from "@/types";

// Company is in Tamil Nadu — state code "33"
// GSTIN starting with "33" → intra-state → CGST_SGST
// Any other state code → inter-state → IGST

describe("determineGstType()", () => {
  // -----------------------------------------------------------------------
  // GSTIN-based determination (primary path: gstin length >= 2)
  // -----------------------------------------------------------------------
  describe("GSTIN provided (primary determination)", () => {
    it("returns CGST_SGST for a Tamil Nadu customer (GSTIN starts with 33)", () => {
      expect(determineGstType("33AAAAA1234A1Z5", "Tamil Nadu")).toBe("CGST_SGST");
    });

    it("returns IGST for an out-of-state customer (GSTIN starts with 27 = Maharashtra)", () => {
      expect(determineGstType("27BBBBB5678B2Z6", "Maharashtra")).toBe("IGST");
    });

    it("returns IGST for a Delhi customer (GSTIN starts with 07)", () => {
      expect(determineGstType("07CCCCC9012C3Z7", "Delhi")).toBe("IGST");
    });

    it("GSTIN overrides the state — out-of-state GSTIN beats TN state field", () => {
      // Customer has state=Tamil Nadu but GSTIN from another state (data mismatch)
      // GSTIN wins — this is correct behavior (GSTIN is authoritative for GST)
      expect(determineGstType("27DDDDD3456D4Z8", "Tamil Nadu")).toBe("IGST");
    });

    it("handles exactly 2-character GSTIN starting with '33' (minimum valid length check)", () => {
      expect(determineGstType("33", null)).toBe("CGST_SGST");
    });

    it("handles exactly 2-character GSTIN not starting with '33'", () => {
      expect(determineGstType("27", null)).toBe("IGST");
    });
  });

  // -----------------------------------------------------------------------
  // State-based fallback (when GSTIN is absent or too short)
  // -----------------------------------------------------------------------
  describe("no GSTIN — state-based fallback", () => {
    it("returns CGST_SGST when state is Tamil Nadu and GSTIN is null", () => {
      expect(determineGstType(null, "Tamil Nadu")).toBe("CGST_SGST");
    });

    it("returns CGST_SGST when state is Tamil Nadu and GSTIN is undefined", () => {
      expect(determineGstType(undefined, "Tamil Nadu")).toBe("CGST_SGST");
    });

    it("returns IGST when state is Maharashtra and no GSTIN", () => {
      expect(determineGstType(null, "Maharashtra")).toBe("IGST");
    });

    it("returns IGST when state is Karnataka and no GSTIN", () => {
      expect(determineGstType(undefined, "Karnataka")).toBe("IGST");
    });

    it("returns CGST_SGST when both gstin and state are null (unknown customer → assume local)", () => {
      expect(determineGstType(null, null)).toBe("CGST_SGST");
    });

    it("returns CGST_SGST when both gstin and state are undefined", () => {
      expect(determineGstType(undefined, undefined)).toBe("CGST_SGST");
    });

    it("returns CGST_SGST when state is empty string (treated as unknown → assume local)", () => {
      expect(determineGstType(null, "")).toBe("CGST_SGST");
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases for GSTIN format
  // -----------------------------------------------------------------------
  describe("GSTIN edge cases", () => {
    it("falls back to state when GSTIN is empty string (empty string is falsy)", () => {
      expect(determineGstType("", "Tamil Nadu")).toBe("CGST_SGST");
      expect(determineGstType("", "Maharashtra")).toBe("IGST");
    });

    it("falls back to state when GSTIN is a single character (length < 2)", () => {
      // "3" has length 1, so gstin.length >= 2 is false → state fallback
      expect(determineGstType("3", "Tamil Nadu")).toBe("CGST_SGST");
      expect(determineGstType("3", "Maharashtra")).toBe("IGST");
    });
  });
});
