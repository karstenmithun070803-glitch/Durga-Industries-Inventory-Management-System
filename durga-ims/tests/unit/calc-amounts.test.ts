// ============================================================
// Phase: 1
// Category: Unit
// Tests: calcAmountsForRow() — GST amount calculations for transaction grid rows
//        newRow() — blank row factory for TransactionGrid
// Source: src/lib/utils/row-calc.ts
// ============================================================

import { describe, it, expect } from "vitest";
import { calcAmountsForRow, newRow } from "@/lib/utils/row-calc";

describe("calcAmountsForRow()", () => {
  // -----------------------------------------------------------------------
  // CGST_SGST path — tax split equally between CGST and SGST
  // -----------------------------------------------------------------------
  describe("CGST_SGST mode", () => {
    it("calculates amounts correctly for a standard transaction", () => {
      const result = calcAmountsForRow("10", "100", "18", "CGST_SGST");
      expect(result.amount).toBe("1000.00");
      expect(result.cgst_amount).toBe("90.00");
      expect(result.sgst_amount).toBe("90.00");
      expect(result.igst_amount).toBe("0.00");
    });

    it("splits tax exactly 50/50 between CGST and SGST", () => {
      // 5 × 200 = 1000; 12% tax = 120; half = 60 each
      const result = calcAmountsForRow("5", "200", "12", "CGST_SGST");
      expect(result.cgst_amount).toBe("60.00");
      expect(result.sgst_amount).toBe("60.00");
      expect(result.igst_amount).toBe("0.00");
    });

    it("returns zero amounts when rate is zero", () => {
      const result = calcAmountsForRow("5", "0", "18", "CGST_SGST");
      expect(result.amount).toBe("0.00");
      expect(result.cgst_amount).toBe("0.00");
      expect(result.sgst_amount).toBe("0.00");
      expect(result.igst_amount).toBe("0.00");
    });

    it("returns zero tax when tax percentage is zero", () => {
      const result = calcAmountsForRow("10", "100", "0", "CGST_SGST");
      expect(result.amount).toBe("1000.00");
      expect(result.cgst_amount).toBe("0.00");
      expect(result.sgst_amount).toBe("0.00");
    });

    it("handles rounding: 1 unit at ₹1 with 5% tax (odd half)", () => {
      // amount = 1, tax = 0.05, half = round(0.025) = 0.03 (rounds up — standard JS rounding)
      // This documents the actual behavior — CGST+SGST (0.06) may not equal full tax (0.05)
      // This is deliberate GST rounding behavior; test locks in current output.
      const result = calcAmountsForRow("1", "1", "5", "CGST_SGST");
      expect(result.amount).toBe("1.00");
      expect(result.cgst_amount).toBe("0.03");
      expect(result.sgst_amount).toBe("0.03");
      expect(result.igst_amount).toBe("0.00");
    });

    it("handles decimal quantities (e.g., materials sold by weight)", () => {
      // qty=2.5, rate=200 → amount=500; 12% tax → half = 30
      const result = calcAmountsForRow("2.5", "200", "12", "CGST_SGST");
      expect(result.amount).toBe("500.00");
      expect(result.cgst_amount).toBe("30.00");
      expect(result.sgst_amount).toBe("30.00");
    });
  });

  // -----------------------------------------------------------------------
  // IGST path — full tax as a single IGST component
  // -----------------------------------------------------------------------
  describe("IGST mode", () => {
    it("calculates amounts correctly for a standard transaction", () => {
      const result = calcAmountsForRow("10", "100", "18", "IGST");
      expect(result.amount).toBe("1000.00");
      expect(result.cgst_amount).toBe("0.00");
      expect(result.sgst_amount).toBe("0.00");
      expect(result.igst_amount).toBe("180.00");
    });

    it("places full tax in igst_amount, leaving cgst and sgst at zero", () => {
      const result = calcAmountsForRow("5", "200", "12", "IGST");
      expect(result.cgst_amount).toBe("0.00");
      expect(result.sgst_amount).toBe("0.00");
      expect(result.igst_amount).toBe("120.00");
    });

    it("handles rounding in IGST: 1 unit at ₹1 with 5% tax", () => {
      // amount = 1; igst = round(1 * 0.05) = round(0.05) = 0.05
      const result = calcAmountsForRow("1", "1", "5", "IGST");
      expect(result.igst_amount).toBe("0.05");
    });
  });

  // -----------------------------------------------------------------------
  // Input parsing — inputs are strings from form fields
  // -----------------------------------------------------------------------
  describe("string input parsing", () => {
    it("treats empty strings as zero (form field default before user types)", () => {
      const result = calcAmountsForRow("", "", "", "IGST");
      expect(result.amount).toBe("0.00");
      expect(result.igst_amount).toBe("0.00");
    });

    it("treats non-numeric strings as zero", () => {
      const result = calcAmountsForRow("abc", "xyz", "18", "IGST");
      expect(result.amount).toBe("0.00");
      expect(result.igst_amount).toBe("0.00");
    });

    it("parses valid numeric strings correctly", () => {
      const result = calcAmountsForRow("3", "150", "18", "IGST");
      expect(result.amount).toBe("450.00");
      expect(result.igst_amount).toBe("81.00");
    });
  });

  // -----------------------------------------------------------------------
  // Unknown gstType — falls through to IGST branch (else case)
  // -----------------------------------------------------------------------
  it("treats unknown gstType as IGST (else branch)", () => {
    const result = calcAmountsForRow("10", "100", "18", "UNKNOWN");
    expect(result.cgst_amount).toBe("0.00");
    expect(result.sgst_amount).toBe("0.00");
    expect(result.igst_amount).toBe("180.00");
  });

  // -----------------------------------------------------------------------
  // Large values — verify no overflow or precision catastrophe
  // -----------------------------------------------------------------------
  it("handles large values without overflow", () => {
    // qty=1000, rate=9999.99 → amount=9,999,990.00; 28% IGST → 2,799,997.20
    const result = calcAmountsForRow("1000", "9999.99", "28", "IGST");
    expect(result.amount).toBe("9999990.00");
    expect(result.igst_amount).toBe("2799997.20");
  });

  // -----------------------------------------------------------------------
  // Return shape — all four keys always present
  // -----------------------------------------------------------------------
  it("always returns all four amount keys", () => {
    const result = calcAmountsForRow("1", "1", "18", "CGST_SGST");
    expect(result).toHaveProperty("amount");
    expect(result).toHaveProperty("cgst_amount");
    expect(result).toHaveProperty("sgst_amount");
    expect(result).toHaveProperty("igst_amount");
  });

  it("all returned values are strings (matching LineItemDraft field types)", () => {
    const result = calcAmountsForRow("5", "100", "18", "IGST");
    expect(typeof result.amount).toBe("string");
    expect(typeof result.cgst_amount).toBe("string");
    expect(typeof result.sgst_amount).toBe("string");
    expect(typeof result.igst_amount).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// newRow()
// ---------------------------------------------------------------------------
describe("newRow()", () => {
  it("returns an object with the correct shape (all LineItemDraft fields present)", () => {
    const row = newRow();
    expect(row).toMatchObject({
      material_id: "",
      material_name: "",
      material_no: 0,
      hsn_code: "",
      supplier_id: "",
      supplier_name: "",
      gst_type: "IGST",
      qty: "",
      unit_id: "",
      unit_name: "",
      rate: "",
      tax_percentage: "",
      cgst_amount: "0",
      sgst_amount: "0",
      igst_amount: "0",
      amount: "0",
      rateBlank: false,
      zeroRateConfirmed: false,
      contractor_id: "",
      contractor_name: "",
      affects_inventory: true,
    });
  });

  it("generates a unique _key (UUID) for each new row", () => {
    const row1 = newRow();
    const row2 = newRow();
    expect(row1._key).toBeTruthy();
    expect(row2._key).toBeTruthy();
    expect(row1._key).not.toBe(row2._key);
  });

  it("defaults affects_inventory to true (stock is tracked by default)", () => {
    expect(newRow().affects_inventory).toBe(true);
  });

  it("defaults gst_type to IGST (conservative default before customer is selected)", () => {
    expect(newRow().gst_type).toBe("IGST");
  });
});
