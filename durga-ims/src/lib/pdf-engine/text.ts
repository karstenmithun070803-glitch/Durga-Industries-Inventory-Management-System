import { TIMES_ROMAN_WIDTHS, TIMES_BOLD_WIDTHS, TIMES_ITALIC_WIDTHS } from "./font-metrics";

// Unicode → WinAnsi (cp1252) for the code points that differ from Latin-1 and
// that actually show up in our data. Anything else outside Latin-1 becomes "?".
const WIN_ANSI: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};

// Core-14 widths for the 0x80–0x9F block (the generated tables hold Latin-1 there).
const WIN_ANSI_WIDTH_ROMAN: Record<number, number> = {
  0x85: 1000, 0x91: 333, 0x92: 333, 0x93: 444, 0x94: 444, 0x95: 350, 0x96: 500, 0x97: 1000,
};
const WIN_ANSI_WIDTH_BOLD: Record<number, number> = {
  0x85: 1000, 0x91: 333, 0x92: 333, 0x93: 500, 0x94: 500, 0x95: 350, 0x96: 500, 0x97: 1000,
};

/** Map a JS string to a string whose char codes are WinAnsi bytes (0–255). */
export function toWinAnsi(s: string): string {
  let needs = false;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 126) { needs = true; break; }
  }
  if (!needs) return s;
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 256 && !(c >= 0x80 && c <= 0x9f)) out += s[i];
    else if (c === 0x20b9) out += "Rs."; // ₹ is not in the core fonts
    else out += String.fromCharCode(WIN_ANSI[c] ?? 0x3f);
  }
  return out;
}

function glyphWidth(code: number, bold: boolean, italic: boolean): number {
  if (code >= 0x80 && code <= 0x9f) {
    return (bold ? WIN_ANSI_WIDTH_BOLD : WIN_ANSI_WIDTH_ROMAN)[code] ?? 500;
  }
  const table = bold ? TIMES_BOLD_WIDTHS : italic ? TIMES_ITALIC_WIDTHS : TIMES_ROMAN_WIDTHS;
  const i = code - 32;
  return i >= 0 && i < table.length ? table[i] : 500;
}

/** Width in points of a WinAnsi string. */
export function measure(s: string, size: number, bold: boolean, italic = false): number {
  let w = 0;
  for (let i = 0; i < s.length; i++) w += glyphWidth(s.charCodeAt(i), bold, italic);
  return (w * size) / 1000;
}

/** Escape a WinAnsi string for a PDF literal string; non-ASCII becomes octal. */
export function pdfString(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x28 || c === 0x29 || c === 0x5c) out += "\\" + s[i];
    else if (c < 32 || c > 126) out += "\\" + c.toString(8).padStart(3, "0");
    else out += s[i];
  }
  return out;
}

/** Greedy word wrap. Words wider than `maxWidth` are broken by character only if `breakLongWords`. */
export function wrapText(
  s: string, maxWidth: number, size: number, bold: boolean, breakLongWords = true, italic = false
): string[] {
  if (s === "") return [""];
  if (measure(s, size, bold, italic) <= maxWidth) return [s];
  const lines: string[] = [];
  let line = "";
  const push = () => { lines.push(line); line = ""; };
  for (const word of s.split(" ")) {
    const candidate = line === "" ? word : line + " " + word;
    if (measure(candidate, size, bold, italic) <= maxWidth) { line = candidate; continue; }
    if (line !== "") push();
    // A single word too wide is kept whole (it overflows slightly, like the old react-pdf
    // layout) rather than being split mid-word, unless the caller asks for hard breaks.
    if (!breakLongWords || measure(word, size, bold, italic) <= maxWidth) { line = word; continue; }
    // single word too wide → break by character
    let chunk = "";
    for (let i = 0; i < word.length; i++) {
      if (measure(chunk + word[i], size, bold, italic) > maxWidth && chunk !== "") {
        lines.push(chunk);
        chunk = "";
      }
      chunk += word[i];
    }
    line = chunk;
  }
  if (line !== "" || lines.length === 0) push();
  return lines;
}
