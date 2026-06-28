import { calcAmountsForRow, newRow } from "./row-calc";
import type { LineItemDraft } from "@/types";

export type RowAction =
  | { type: "UPDATE"; key: string; patch: Partial<LineItemDraft>; gstForCalc: string | null }
  | { type: "DELETE"; key: string }
  | { type: "APPEND"; row: LineItemDraft }
  | { type: "SET_ALL"; rows: LineItemDraft[] }
  | { type: "RECALC_GST"; gstType: string };

export function rowsReducer(state: LineItemDraft[], action: RowAction): LineItemDraft[] {
  switch (action.type) {
    case "UPDATE":
      return state.map((r) => {
        if (r._key !== action.key) return r;
        const updated = { ...r, ...action.patch };
        const gst = action.gstForCalc ?? updated.gst_type;
        return { ...updated, gst_type: gst, ...calcAmountsForRow(updated.qty, updated.rate, updated.tax_percentage, gst) };
      });
    case "DELETE": {
      const next = state.filter((r) => r._key !== action.key);
      return next.length ? next : [newRow()];
    }
    case "APPEND":
      return [...state, action.row];
    case "SET_ALL":
      return action.rows;
    case "RECALC_GST":
      return state.map((r) => ({
        ...r,
        gst_type: action.gstType,
        ...calcAmountsForRow(r.qty, r.rate, r.tax_percentage, action.gstType),
      }));
  }
}
