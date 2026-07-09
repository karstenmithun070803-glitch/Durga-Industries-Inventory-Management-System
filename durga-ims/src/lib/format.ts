// Shared number/currency formatters (Indian locale), mirroring the app's existing
// `toLocaleString("en-IN", …)` date convention. Use these everywhere amounts or
// quantities are printed so digits group and align consistently (pair with `tabular-nums`).

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format a rupee amount as e.g. "₹1,23,456.00". Accepts number or numeric string. */
export function formatINR(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (n == null || Number.isNaN(n)) return "₹0.00";
  return inrFormatter.format(n);
}

const qtyFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

/** Format a quantity with Indian grouping and up to 3 decimals (trailing zeros trimmed). */
export function formatQty(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (n == null || Number.isNaN(n)) return "0";
  return qtyFormatter.format(n);
}
