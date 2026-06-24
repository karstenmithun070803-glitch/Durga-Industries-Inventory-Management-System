import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCode(prefix: string, num: number, pad = 3): string {
  return `${prefix}${String(num).padStart(pad, "0")}`;
}

export function matchesCode(search: string, prefix: string, num: number, pad = 3): boolean {
  const s = search.toLowerCase().trim();
  if (!s) return true;
  const code = formatCode(prefix, num, pad).toLowerCase();
  if (code.includes(s)) return true;
  const stripped = s.startsWith(prefix.toLowerCase()) ? s.slice(prefix.length) : s;
  const asNum = parseInt(stripped, 10);
  return !isNaN(asNum) && num === asNum;
}

export function formatActionError(e: unknown, fallback = "Action failed"): string {
  const msg = e instanceof Error ? e.message : "";
  if (!msg) return fallback;
  const m = msg.match(
    /^Insufficient stock for "([^"]+)": available ([\d.]+), requested ([\d.]+)\.?$/
  );
  if (m) return `Not enough stock — ${m[1]} (available: ${m[2]}, needed: ${m[3]})`;
  return msg;
}

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

// Returns an error message string if invalid, null if valid or empty (GSTIN is optional).
export function validateGstinFormat(value: string): string | null {
  const v = value.trim().toUpperCase();
  if (!v) return null;
  if (!GSTIN_REGEX.test(v)) return "GSTIN format incorrect. Expected: 33AAAAA1234A1Z5";
  return null;
}
