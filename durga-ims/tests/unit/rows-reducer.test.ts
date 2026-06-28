// ============================================================
// Phase: 1
// Category: Unit
// Tests: rowsReducer() — grid row state reducer, all 5 action types
//        (UPDATE, DELETE, APPEND, SET_ALL, RECALC_GST)
// Source: src/lib/utils/rows-reducer.ts
// ============================================================

import { describe, it, expect } from "vitest";
import { rowsReducer } from "@/lib/utils/rows-reducer";
import { newRow } from "@/lib/utils/row-calc";
import type { LineItemDraft } from "@/types";

// Helper: create a minimal row with known values for assertions
function makeRow(overrides: Partial<LineItemDraft> = {}): LineItemDraft {
  return {
    ...newRow(),
    _key: "test-key-" + Math.random().toString(36).slice(2, 8),
    qty: "10",
    rate: "100",
    tax_percentage: "18",
    gst_type: "IGST",
    amount: "1000.00",
    cgst_amount: "0.00",
    sgst_amount: "0.00",
    igst_amount: "180.00",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// UPDATE action
// ---------------------------------------------------------------------------
describe("UPDATE action", () => {
  it("updates only the targeted row (leaves other rows unchanged)", () => {
    const row1 = makeRow({ _key: "key-1", qty: "5" });
    const row2 = makeRow({ _key: "key-2", qty: "10" });
    const state = [row1, row2];

    const next = rowsReducer(state, {
      type: "UPDATE",
      key: "key-1",
      patch: { qty: "20" },
      gstForCalc: null,
    });

    expect(next[0].qty).toBe("20");
    expect(next[1].qty).toBe("10"); // row2 unchanged
    expect(next).toHaveLength(2);
  });

  it("recalculates amounts when qty or rate is patched", () => {
    const row = makeRow({ _key: "key-1", qty: "5", rate: "100", tax_percentage: "18", gst_type: "IGST" });
    const next = rowsReducer([row], {
      type: "UPDATE",
      key: "key-1",
      patch: { qty: "10" },
      gstForCalc: "IGST",
    });
    // 10 × 100 = 1000; 18% IGST = 180
    expect(next[0].amount).toBe("1000.00");
    expect(next[0].igst_amount).toBe("180.00");
  });

  it("uses gstForCalc when provided (overrides row's current gst_type)", () => {
    const row = makeRow({ _key: "key-1", qty: "10", rate: "100", tax_percentage: "18", gst_type: "IGST" });
    const next = rowsReducer([row], {
      type: "UPDATE",
      key: "key-1",
      patch: {},
      gstForCalc: "CGST_SGST",
    });
    expect(next[0].gst_type).toBe("CGST_SGST");
    expect(next[0].cgst_amount).toBe("90.00");
    expect(next[0].sgst_amount).toBe("90.00");
    expect(next[0].igst_amount).toBe("0.00");
  });

  it("uses the row's own gst_type when gstForCalc is null", () => {
    const row = makeRow({ _key: "key-1", qty: "10", rate: "100", tax_percentage: "18", gst_type: "CGST_SGST" });
    const next = rowsReducer([row], {
      type: "UPDATE",
      key: "key-1",
      patch: { qty: "5" },
      gstForCalc: null,
    });
    expect(next[0].gst_type).toBe("CGST_SGST");
    expect(next[0].cgst_amount).toBe("45.00");
  });

  it("does nothing when key does not match any row", () => {
    const row = makeRow({ _key: "key-1" });
    const next = rowsReducer([row], {
      type: "UPDATE",
      key: "nonexistent",
      patch: { qty: "999" },
      gstForCalc: null,
    });
    expect(next[0].qty).toBe(row.qty); // unchanged
  });
});

// ---------------------------------------------------------------------------
// DELETE action
// ---------------------------------------------------------------------------
describe("DELETE action", () => {
  it("removes the row with the matching key", () => {
    const row1 = makeRow({ _key: "key-1" });
    const row2 = makeRow({ _key: "key-2" });
    const next = rowsReducer([row1, row2], { type: "DELETE", key: "key-1" });
    expect(next).toHaveLength(1);
    expect(next[0]._key).toBe("key-2");
  });

  it("preserves the order of remaining rows", () => {
    const rows = [
      makeRow({ _key: "key-1" }),
      makeRow({ _key: "key-2" }),
      makeRow({ _key: "key-3" }),
    ];
    const next = rowsReducer(rows, { type: "DELETE", key: "key-2" });
    expect(next[0]._key).toBe("key-1");
    expect(next[1]._key).toBe("key-3");
  });

  it("returns [newRow()] when the last row is deleted (grid always shows at least one row)", () => {
    const row = makeRow({ _key: "key-1" });
    const next = rowsReducer([row], { type: "DELETE", key: "key-1" });
    expect(next).toHaveLength(1);
    // The replacement row should be a blank new row (not the deleted row)
    expect(next[0].qty).toBe("");
    expect(next[0].rate).toBe("");
  });

  it("returns unchanged state when key does not exist", () => {
    const row = makeRow({ _key: "key-1" });
    const next = rowsReducer([row], { type: "DELETE", key: "nonexistent" });
    // nonexistent key → filter returns same length → goes to else branch → returns next (unchanged)
    expect(next).toHaveLength(1);
    expect(next[0]._key).toBe("key-1");
  });
});

// ---------------------------------------------------------------------------
// APPEND action
// ---------------------------------------------------------------------------
describe("APPEND action", () => {
  it("adds a new row at the end of the list", () => {
    const row1 = makeRow({ _key: "key-1" });
    const appendedRow = newRow();
    const next = rowsReducer([row1], { type: "APPEND", row: appendedRow });
    expect(next).toHaveLength(2);
    expect(next[1]._key).toBe(appendedRow._key);
  });

  it("does not modify existing rows", () => {
    const row1 = makeRow({ _key: "key-1", qty: "5" });
    const next = rowsReducer([row1], { type: "APPEND", row: newRow() });
    expect(next[0].qty).toBe("5");
  });

  it("can append to an empty array", () => {
    const next = rowsReducer([], { type: "APPEND", row: newRow() });
    expect(next).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// SET_ALL action
// ---------------------------------------------------------------------------
describe("SET_ALL action", () => {
  it("replaces the entire row array", () => {
    const existing = [makeRow({ _key: "old" })];
    const newRows = [makeRow({ _key: "new-1" }), makeRow({ _key: "new-2" })];
    const next = rowsReducer(existing, { type: "SET_ALL", rows: newRows });
    expect(next).toHaveLength(2);
    expect(next[0]._key).toBe("new-1");
    expect(next[1]._key).toBe("new-2");
  });

  it("can set to empty array (unlike DELETE which guards to [newRow()])", () => {
    const existing = [makeRow()];
    const next = rowsReducer(existing, { type: "SET_ALL", rows: [] });
    expect(next).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// RECALC_GST action
// ---------------------------------------------------------------------------
describe("RECALC_GST action", () => {
  it("updates gst_type on all rows", () => {
    const rows = [
      makeRow({ _key: "key-1", gst_type: "IGST" }),
      makeRow({ _key: "key-2", gst_type: "IGST" }),
    ];
    const next = rowsReducer(rows, { type: "RECALC_GST", gstType: "CGST_SGST" });
    expect(next[0].gst_type).toBe("CGST_SGST");
    expect(next[1].gst_type).toBe("CGST_SGST");
  });

  it("recalculates all amounts for new gst_type (IGST → CGST_SGST)", () => {
    const row = makeRow({
      _key: "key-1",
      qty: "10",
      rate: "100",
      tax_percentage: "18",
      gst_type: "IGST",
      igst_amount: "180.00",
      cgst_amount: "0.00",
      sgst_amount: "0.00",
    });
    const next = rowsReducer([row], { type: "RECALC_GST", gstType: "CGST_SGST" });
    expect(next[0].cgst_amount).toBe("90.00");
    expect(next[0].sgst_amount).toBe("90.00");
    expect(next[0].igst_amount).toBe("0.00");
  });

  it("recalculates all amounts for new gst_type (CGST_SGST → IGST)", () => {
    const row = makeRow({
      _key: "key-1",
      qty: "10",
      rate: "100",
      tax_percentage: "18",
      gst_type: "CGST_SGST",
      cgst_amount: "90.00",
      sgst_amount: "90.00",
      igst_amount: "0.00",
    });
    const next = rowsReducer([row], { type: "RECALC_GST", gstType: "IGST" });
    expect(next[0].igst_amount).toBe("180.00");
    expect(next[0].cgst_amount).toBe("0.00");
    expect(next[0].sgst_amount).toBe("0.00");
  });

  it("preserves amount (base amount does not change when gst_type changes)", () => {
    const row = makeRow({ qty: "10", rate: "100", tax_percentage: "18", gst_type: "IGST" });
    const next = rowsReducer([row], { type: "RECALC_GST", gstType: "CGST_SGST" });
    expect(next[0].amount).toBe("1000.00");
  });
});
