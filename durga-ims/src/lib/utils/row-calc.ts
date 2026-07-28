import type { LineItemDraft } from "@/types";

/**
 * Formats a rate for display/entry in the transaction grids: 2 decimals, no thousands
 * separator (it feeds an <input>). `numeric(14,4)` from the DB arrives as "1080.0000";
 * this shows "1080.00". Blank/invalid → "". Full precision is kept in the stored value —
 * only what the user sees/edits is trimmed.
 */
export function formatRate(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : "";
}

export function calcAmountsForRow(
  qty: string,
  rate: string,
  taxPct: string,
  gstType: string
): { amount: string; cgst_amount: string; sgst_amount: string; igst_amount: string } {
  const q = parseFloat(qty) || 0;
  const r = parseFloat(rate) || 0;
  const t = parseFloat(taxPct) || 0;
  const amount = q * r;
  const roundTwo = (n: number) => Math.round(n * 100) / 100;

  if (gstType === "CGST_SGST") {
    const half = roundTwo((amount * (t / 100)) / 2);
    return {
      amount: amount.toFixed(2),
      cgst_amount: half.toFixed(2),
      sgst_amount: half.toFixed(2),
      igst_amount: "0.00",
    };
  } else {
    const igst = roundTwo(amount * (t / 100));
    return {
      amount: amount.toFixed(2),
      cgst_amount: "0.00",
      sgst_amount: "0.00",
      igst_amount: igst.toFixed(2),
    };
  }
}

export function newRow(): LineItemDraft {
  return {
    _key: crypto.randomUUID(),
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
  };
}
