/**
 * Purchase price-band rules, kept pure so they can be unit-tested and so the client
 * hint and the server block can never drift apart.
 *
 * The allowed PO rate for a material is  base_rate ± buffer :
 *   max = base + buffer   (ceiling)
 *   min = max(0, base − buffer)   (floor, clamped so it never goes negative)
 * A material is purchasable only when BOTH base_rate and buffer are set.
 */

// numeric(14,4) — anything below this is float noise, not a real over/under.
const EPSILON = 1e-9;

/**
 * True when `rate` is above `ceiling`.
 *
 * Both arguments are COERCED WITH Number() on purpose. Drizzle returns numeric columns
 * as strings, so a ceiling arrives as "150.0000". Comparing strings is lexicographic,
 * and "90" > "150.0000" is `true` — which would wrongly block a ₹90 rate. Never compare
 * these as strings.
 */
export function exceedsCeiling(rate: string | number, ceiling: string | number): boolean {
  return Number(rate) - Number(ceiling) > EPSILON;
}

/** True when `rate` is below `floor`. Same string-coercion discipline as exceedsCeiling. */
export function belowFloor(rate: string | number, floor: string | number): boolean {
  return Number(floor) - Number(rate) > EPSILON;
}

/**
 * The allowed band for a material, or null if it isn't fully configured.
 * Floor is clamped at 0 so `base 400, buffer 500` yields [0, 900], never [-100, 900].
 */
export function rateBand(
  base: string | number | null | undefined,
  buffer: string | number | null | undefined
): { min: number; max: number } | null {
  if (base === null || base === undefined || base === "") return null;
  if (buffer === null || buffer === undefined || buffer === "") return null;
  const b = Number(base);
  const buf = Number(buffer);
  if (!Number.isFinite(b) || !Number.isFinite(buf)) return null;
  return { min: Math.max(0, b - buf), max: b + buf };
}

export class InvalidBaseRateError extends Error {
  constructor() {
    super("Base rate must be greater than 0. Leave blank to mark it as not set.");
    this.name = "InvalidBaseRateError";
  }
}

export class InvalidBufferError extends Error {
  constructor() {
    super("Buffer cannot be negative. Leave blank to mark it as not set.");
    this.name = "InvalidBufferError";
  }
}

/**
 * Normalises a BASE RATE typed into the grid or an import file.
 * Blank => null ("not set", blocks purchasing). Zero is REJECTED: a 0 base means the
 * whole band collapses to [0,0]/negative and reads as configured while blocking everything.
 */
export function parseBaseRateInput(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) throw new InvalidBaseRateError();
  return n.toFixed(4);
}

/**
 * Normalises a BUFFER typed into the grid or an import file.
 * Blank => null ("not set", blocks purchasing). Zero IS allowed and legitimate: it means
 * "the PO must equal the base rate exactly" — unlike a zero base, which is rejected.
 */
export function parseBufferInput(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) throw new InvalidBufferError();
  return n.toFixed(4);
}

// ── Back-compat aliases ───────────────────────────────────────────────────────
// The base-rate parser was previously `parseCeilingInput`. Keep the old name pointing
// at the new one so nothing silently breaks during the rename sweep.
export const parseCeilingInput = parseBaseRateInput;
export const InvalidCeilingError = InvalidBaseRateError;
