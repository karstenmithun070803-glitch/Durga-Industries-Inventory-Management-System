// ============================================================
// Phase: 1
// Category: Unit
// Tests: numberToWords() — Indian currency to words converter
//        (used in invoice PDFs — "Amount in words" field, GST legal requirement)
// Source: src/lib/utils/number-to-words.ts
// ============================================================

import { describe, it, expect } from "vitest";
import { numberToWords } from "@/lib/utils/number-to-words";

describe("numberToWords()", () => {
  // -----------------------------------------------------------------------
  // Rupees only (no paise)
  // -----------------------------------------------------------------------
  describe("whole rupee amounts", () => {
    it("handles zero", () => {
      expect(numberToWords(0)).toBe("Rupees Zero Only");
    });

    it("handles single digit", () => {
      expect(numberToWords(1)).toBe("Rupees One Only");
      expect(numberToWords(9)).toBe("Rupees Nine Only");
    });

    it("handles teens", () => {
      expect(numberToWords(11)).toBe("Rupees Eleven Only");
      expect(numberToWords(19)).toBe("Rupees Nineteen Only");
    });

    it("handles tens", () => {
      expect(numberToWords(20)).toBe("Rupees Twenty Only");
      expect(numberToWords(50)).toBe("Rupees Fifty Only");
      expect(numberToWords(90)).toBe("Rupees Ninety Only");
    });

    it("handles hundreds", () => {
      expect(numberToWords(100)).toBe("Rupees One Hundred Only");
      expect(numberToWords(500)).toBe("Rupees Five Hundred Only");
    });

    it("handles hundreds with remainder", () => {
      expect(numberToWords(101)).toBe("Rupees One Hundred One Only");
      expect(numberToWords(999)).toBe("Rupees Nine Hundred Ninety Nine Only");
    });

    it("handles thousands", () => {
      expect(numberToWords(1000)).toBe("Rupees One Thousand Only");
      expect(numberToWords(5000)).toBe("Rupees Five Thousand Only");
    });

    it("handles thousands with hundreds", () => {
      expect(numberToWords(1500)).toBe("Rupees One Thousand Five Hundred Only");
    });

    it("handles full thousands (Indian numbering: 10,000 = ten thousand)", () => {
      expect(numberToWords(10000)).toBe("Rupees Ten Thousand Only");
      expect(numberToWords(99000)).toBe("Rupees Ninety Nine Thousand Only");
    });

    it("handles lakhs (Indian 100,000 = one lakh)", () => {
      expect(numberToWords(100000)).toBe("Rupees One Lakh Only");
      expect(numberToWords(500000)).toBe("Rupees Five Lakh Only");
    });

    it("handles lakh and thousands combined", () => {
      expect(numberToWords(150000)).toBe("Rupees One Lakh Fifty Thousand Only");
    });

    it("handles a typical invoice amount (₹1,23,456)", () => {
      expect(numberToWords(123456)).toBe(
        "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six Only"
      );
    });

    it("handles crores (Indian 1,00,00,000 = one crore)", () => {
      expect(numberToWords(10000000)).toBe("Rupees One Crore Only");
    });

    it("handles crore with lakh and remainder", () => {
      expect(numberToWords(12345678)).toBe(
        "Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Only"
      );
    });
  });

  // -----------------------------------------------------------------------
  // Amounts with paise
  // -----------------------------------------------------------------------
  describe("amounts with paise", () => {
    it("includes paise in output when present", () => {
      expect(numberToWords(100.5)).toBe("Rupees One Hundred and Fifty Paise Only");
    });

    it("handles 1 paise", () => {
      expect(numberToWords(100.01)).toBe("Rupees One Hundred and One Paise Only");
    });

    it("handles 99 paise", () => {
      expect(numberToWords(0.99)).toBe("Rupees Zero and Ninety Nine Paise Only");
    });

    it("rounds to 2 decimal places before conversion", () => {
      // 100.005 rounds to 100.01 → 1 paise
      expect(numberToWords(100.005)).toBe("Rupees One Hundred and One Paise Only");
    });

    it("handles a common invoice amount with paise", () => {
      expect(numberToWords(1234.56)).toBe(
        "Rupees One Thousand Two Hundred Thirty Four and Fifty Six Paise Only"
      );
    });
  });

  // -----------------------------------------------------------------------
  // Output format verification
  // -----------------------------------------------------------------------
  describe("output format", () => {
    it("always starts with 'Rupees'", () => {
      expect(numberToWords(0).startsWith("Rupees")).toBe(true);
      expect(numberToWords(500).startsWith("Rupees")).toBe(true);
      expect(numberToWords(1.50).startsWith("Rupees")).toBe(true);
    });

    it("always ends with 'Only'", () => {
      expect(numberToWords(0).endsWith("Only")).toBe(true);
      expect(numberToWords(100).endsWith("Only")).toBe(true);
      expect(numberToWords(0.50).endsWith("Only")).toBe(true);
    });

    it("uses 'and' to separate rupees from paise", () => {
      const result = numberToWords(10.25);
      expect(result).toContain(" and ");
      expect(result).toContain("Paise");
    });

    it("does NOT use 'and' when there are no paise", () => {
      const result = numberToWords(100);
      expect(result).not.toContain(" and ");
      expect(result).not.toContain("Paise");
    });
  });
});
