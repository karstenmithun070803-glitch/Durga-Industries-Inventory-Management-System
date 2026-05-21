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
