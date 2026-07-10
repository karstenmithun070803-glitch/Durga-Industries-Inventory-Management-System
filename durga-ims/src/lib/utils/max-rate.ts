/**
 * Purchase-ceiling rules, kept pure so they can be unit-tested and so the client hint
 * and the server block can never drift apart.
 */

// numeric(14,4) — anything below this is float noise, not a real overage.
const EPSILON = 1e-9;

/**
 * True when `rate` is above `ceiling`.
 *
 * Both arguments are COERCED WITH Number() on purpose. Drizzle returns numeric columns
 * as strings, so a ceiling arrives as "150.0000". Comparing strings is lexicographic,
 * and "90" > "150.0000" is `true` — which would wrongly block a ₹90 rate against a
 * ₹150 ceiling while letting other pairs through. Never compare these as strings.
 */
export function exceedsCeiling(rate: string | number, ceiling: string | number): boolean {
  return Number(rate) - Number(ceiling) > EPSILON;
}

export class InvalidCeilingError extends Error {
  constructor() {
    super("Ceiling must be greater than 0. Leave blank to mark it as not set.");
    this.name = "InvalidCeilingError";
  }
}

/**
 * Normalises a ceiling typed into the grid or read from an import file.
 *
 * Blank => null ("not set", which blocks purchasing). Zero is REJECTED rather than
 * stored: a ceiling of 0 blocks every positive rate while being visually identical to
 * a configured value, so it reads as "set" and behaves as "nothing can be bought".
 */
export function parseCeilingInput(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) throw new InvalidCeilingError();
  return n.toFixed(4);
}
