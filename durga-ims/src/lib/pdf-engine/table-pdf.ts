import { zlibSync, strToU8 } from "fflate";
import { measure, pdfString, toWinAnsi, wrapText } from "./text";

// Direct-draw PDF writer for fixed-column report tables. No layout engine: column
// widths are known up front, text is measured with core-font metrics, rows are
// stacked at computed y positions. Cost is linear in rows (~7µs per row) so a
// multi-year report renders in well under a second, even off the main thread.

export type Align = "left" | "right" | "center";

export interface HeaderLine {
  text: string;
  size: number;
  bold?: boolean;
  align?: Align;
  color?: string; // "#rrggbb"
  marginTop?: number;
  marginBottom?: number;
  /** Label/value line: `text` is the label (regular) and `value` is drawn bold at `labelWidth`. */
  value?: string;
  labelWidth?: number;
}

export interface Column {
  header: string;
  /** Relative weight; widths are normalised to the printable width. */
  width: number;
  align?: Align;
}

export interface TableRow {
  cells: string[];
  /** Bold the whole row. */
  bold?: boolean;
  /** Bold only these column indexes. */
  boldCols?: number[];
  /** Italic (Times-Italic) for these column indexes. */
  italicCols?: number[];
  shade?: string; // background fill "#rrggbb"
  /** Text colour for the row (e.g. grey for cancelled) and optional strike-through. */
  color?: string;
  strike?: boolean;
  /** Per-cell text colour overrides (column index → "#rrggbb"). */
  cellColors?: Record<number, string>;
  ruleAbove?: { color: string; width: number };
  /** Per-column alignment overrides for this row (e.g. right-aligned TOTAL label). */
  align?: Record<number, Align>;
  /** Full-width text row (e.g. a stage / group sub-header); `cells` ignored. */
  span?: string;
}

export interface TablePdfSpec {
  orientation?: "portrait" | "landscape";
  /** Printed on the first page only, above the table. */
  headerLines: HeaderLine[];
  columns: Column[];
  rows: TableRow[];
  /** Right-aligned footer on every page (no page numbers by design). */
  footerText: string;
  /** Centered notes drawn after the last row (e.g. "Opening balance not shown…"). */
  trailer?: HeaderLine[];
  fontSize?: number; // body, default 9.5
  headerFontSize?: number; // default = fontSize
}

const MARGIN_X = 32;
const MARGIN_TOP = 30;
const MARGIN_BOTTOM = 40;
const CELL_PAD_RIGHT = 1.5;
const ROW_PAD_Y = 3;
const LINE_FACTOR = 1.15;
const FOOTER_SIZE = 8.5;

function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${((n >> 16) & 255) / 255} ${((n >> 8) & 255) / 255} ${(n & 255) / 255}`;
}
const f2 = (n: number) => (Math.round(n * 100) / 100).toString();

interface PreparedRow {
  row: TableRow;
  lines: string[][]; // per column → wrapped lines (WinAnsi)
  height: number;
}

export function buildTablePdf(spec: TablePdfSpec): Uint8Array {
  const landscape = spec.orientation === "landscape";
  const PW = landscape ? 841.89 : 595.28;
  const PH = landscape ? 595.28 : 841.89;
  const usable = PW - MARGIN_X * 2;
  const fs = spec.fontSize ?? 9.5;
  const hfs = spec.headerFontSize ?? fs;
  const lineH = fs * LINE_FACTOR;

  const totalWeight = spec.columns.reduce((s, c) => s + c.width, 0);
  const colW = spec.columns.map((c) => (c.width / totalWeight) * usable);
  const colX: number[] = [];
  {
    let x = MARGIN_X;
    for (const w of colW) { colX.push(x); x += w; }
  }

  const headerCells = spec.columns.map((c) => toWinAnsi(c.header));
  const headerLines = headerCells.map((h, i) =>
    wrapText(h, colW[i], hfs, true, false)
  );
  const headerH = Math.max(...headerLines.map((l) => l.length)) * hfs * LINE_FACTOR + 4;

  const pages: string[] = [];
  let buf: string[] = [];
  let y = 0; // current top edge, measured from the page top

  // y helpers: PDF origin is bottom-left.
  const py = (top: number) => PH - top;

  const drawRule = (top: number, color: string, w: number) => {
    buf.push(`${rgb(color)} RG ${w} w ${f2(MARGIN_X)} ${f2(py(top))} m ${f2(MARGIN_X + usable)} ${f2(py(top))} l S\n`);
  };

  const drawText = (
    s: string, x: number, baselineTop: number, size: number, bold: boolean, color: string | null,
    italic = false
  ) => {
    if (s === "") return;
    buf.push(
      `${color ? rgb(color) + " rg " : ""}BT /${bold ? "F2" : italic ? "F3" : "F1"} ${size} Tf ${f2(x)} ${f2(py(baselineTop))} Td (${pdfString(s)}) Tj ET\n`
    );
    if (color) buf.push("0 0 0 rg\n");
  };

  const drawAligned = (
    s: string, x: number, w: number, baselineTop: number, size: number, bold: boolean,
    align: Align, color: string | null, italic = false
  ) => {
    let tx = x;
    if (align !== "left") {
      const tw = measure(s, size, bold, italic);
      tx = align === "right" ? x + w - CELL_PAD_RIGHT - tw : x + (w - tw) / 2;
    }
    drawText(s, tx, baselineTop, size, bold, color, italic);
  };

  const drawFooter = () => {
    drawRule(PH - 30, "#000000", 0.5);
    const s = toWinAnsi(spec.footerText);
    drawAligned(s, MARGIN_X, usable + CELL_PAD_RIGHT, PH - 18 - FOOTER_SIZE * 0.2, FOOTER_SIZE, false, "right", null);
  };

  const drawTableHeader = () => {
    drawRule(y, "#000000", 0.75);
    y += 2;
    const base = y + hfs;
    for (let c = 0; c < spec.columns.length; c++) {
      const lines = headerLines[c];
      for (let l = 0; l < lines.length; l++) {
        drawAligned(
          lines[l], colX[c], colW[c], base + l * hfs * LINE_FACTOR, hfs, true,
          spec.columns[c].align ?? "left", null
        );
      }
    }
    y += headerH - 2;
    drawRule(y, "#000000", 0.75);
    y += 2;
  };

  const newPage = (first: boolean) => {
    if (!first) { drawFooter(); pages.push(buf.join("")); buf = []; }
    y = MARGIN_TOP;
  };

  // ── First page: company / title block ─────────────────────────────────────
  newPage(true);
  for (const h of spec.headerLines) {
    const text = toWinAnsi(h.text);
    y += h.marginTop ?? 0;
    const bold = !!h.bold;
    if (h.value !== undefined) {
      drawText(text, MARGIN_X, y + h.size, h.size, false, h.color ?? null);
      drawText(toWinAnsi(`: ${h.value}`), MARGIN_X + (h.labelWidth ?? 120), y + h.size, h.size, true, null);
      y += h.size * LINE_FACTOR + (h.marginBottom ?? 0);
      continue;
    }
    const lines = wrapText(text, usable, h.size, bold);
    for (const line of lines) {
      drawAligned(line, MARGIN_X, usable + CELL_PAD_RIGHT, y + h.size, h.size, bold, h.align ?? "left", h.color ?? null);
      y += h.size * LINE_FACTOR;
    }
    y += h.marginBottom ?? 0;
  }
  y += 3;
  drawTableHeader();

  // ── Rows ──────────────────────────────────────────────────────────────────
  const limit = PH - MARGIN_BOTTOM;
  for (const row of spec.rows) {
    // prepare (wrap) lazily per row — no big intermediate arrays
    let height: number;
    let lines: string[][] | null = null;
    if (row.span !== undefined) {
      height = lineH + ROW_PAD_Y * 2;
    } else {
      lines = new Array(spec.columns.length);
      let maxLines = 1;
      for (let c = 0; c < spec.columns.length; c++) {
        const raw = row.cells[c] ?? "";
        const bold = !!row.bold || !!row.boldCols?.includes(c);
        const s = toWinAnsi(raw);
        const l = wrapText(s, colW[c] - CELL_PAD_RIGHT, fs, bold, false, !!row.italicCols?.includes(c));
        lines[c] = l;
        if (l.length > maxLines) maxLines = l.length;
      }
      height = maxLines * lineH + ROW_PAD_Y * 2;
    }

    if (y + height > limit) {
      newPage(false);
      drawTableHeader();
    }

    if (row.shade) {
      buf.push(`${rgb(row.shade)} rg ${f2(MARGIN_X)} ${f2(py(y + height))} ${f2(usable)} ${f2(height)} re f 0 0 0 rg\n`);
    }
    if (row.ruleAbove) drawRule(y, row.ruleAbove.color, row.ruleAbove.width);

    const base = y + ROW_PAD_Y + fs * 0.92;
    if (row.span !== undefined) {
      drawText(toWinAnsi(row.span), MARGIN_X + 6, base, fs, true, null);
    } else {
      for (let c = 0; c < spec.columns.length; c++) {
        const cl = lines![c];
        const bold = !!row.bold || !!row.boldCols?.includes(c);
        const align = row.align?.[c] ?? spec.columns[c].align ?? "left";
        for (let l = 0; l < cl.length; l++) {
          const lineBase = base + l * lineH;
          const color = row.cellColors?.[c] ?? row.color ?? null;
          const italic = !!row.italicCols?.includes(c);
          drawAligned(cl[l], colX[c], colW[c], lineBase, fs, bold, align, color, italic);
          if (row.strike && cl[l] !== "") {
            const tw = measure(cl[l], fs, bold);
            const sx = align === "right" ? colX[c] + colW[c] - CELL_PAD_RIGHT - tw : colX[c];
            const sy = py(lineBase - fs * 0.28);
            buf.push(`${rgb(row.color ?? "#000000")} RG 0.5 w ${f2(sx)} ${f2(sy)} m ${f2(sx + tw)} ${f2(sy)} l S\n`);
          }
        }
      }
    }
    y += height;
  }

  for (const t of spec.trailer ?? []) {
    const lines = wrapText(toWinAnsi(t.text), usable, t.size, !!t.bold);
    const need = lines.length * t.size * LINE_FACTOR + (t.marginTop ?? 0);
    if (y + need > limit) newPage(false);
    y += t.marginTop ?? 0;
    for (const line of lines) {
      drawAligned(line, MARGIN_X, usable + CELL_PAD_RIGHT, y + t.size, t.size, !!t.bold, t.align ?? "left", t.color ?? null);
      y += t.size * LINE_FACTOR;
    }
  }

  drawFooter();
  pages.push(buf.join(""));

  return assemble(pages, PW, PH);
}

function assemble(pageStreams: string[], PW: number, PH: number): Uint8Array {
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let off = 0;
  const emit = (s: string | Uint8Array) => {
    const u = typeof s === "string" ? strToU8(s) : s;
    parts.push(u);
    off += u.length;
  };
  const obj = (id: number, body: string) => {
    offsets[id] = off;
    emit(`${id} 0 obj\n${body}\nendobj\n`);
  };

  const n = pageStreams.length;
  emit("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Kids [${pageStreams.map((_, i) => `${6 + i * 2} 0 R`).join(" ")}] /Count ${n} >>`);
  obj(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>");
  obj(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>");
  obj(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic /Encoding /WinAnsiEncoding >>");
  for (let i = 0; i < n; i++) {
    const pageId = 6 + i * 2;
    const contentId = pageId + 1;
    const z = zlibSync(strToU8(pageStreams[i]), { level: 4 });
    obj(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f2(PW)} ${f2(PH)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    offsets[contentId] = off;
    emit(`${contentId} 0 obj\n<< /Length ${z.length} /Filter /FlateDecode >>\nstream\n`);
    emit(z);
    emit("\nendstream\nendobj\n");
  }
  const total = 5 + n * 2;
  const xref = off;
  let x = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= total; i++) x += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  x += `trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  emit(x);

  const out = new Uint8Array(off);
  let p = 0;
  for (const part of parts) { out.set(part, p); p += part.length; }
  return out;
}
