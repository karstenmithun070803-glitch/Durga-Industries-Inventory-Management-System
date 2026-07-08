import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { LineItemDraft } from "@/types";

interface UseKeyboardGridOptions {
  gridRef: RefObject<HTMLTableElement | null>;
  rows: LineItemDraft[];
  columnCount: number;
  appendEmptyRow: () => void;
  /**
   * Ordered list of columns the Enter key advances through (Material → … → Rate).
   * Enter on the LAST entry appends a new row. Columns NOT in this list are
   * reachable by arrows only (e.g. the Affects-Stock checkbox, Tax%).
   * Falls back to every editable col 0..lastDataColIndex if omitted.
   */
  enterChainCols?: number[];
  /**
   * Index of the last editable data column (the one before Delete). Enter here
   * appends a new row too, so Tax% never feels like a dead key.
   */
  lastDataColIndex?: number;
}

function rowHasAnyData(row: LineItemDraft): boolean {
  return !!(
    row.material_id ||
    row.qty ||
    row.rate ||
    row.supplier_id ||
    row.contractor_id
  );
}

// True when ←/→ should move the text caret inside the field rather than jump
// columns — i.e. a text-entry input whose caret is not yet at the given edge.
// NOTE: number inputs expose no selection API, so Qty/Rate/Tax use
// type="text" inputMode="decimal" (see TransactionGrid) for this to work.
function isTextField(el: HTMLElement): el is HTMLInputElement {
  if (el.tagName !== "INPUT") return false;
  const t = (el as HTMLInputElement).type;
  return t !== "checkbox" && t !== "button" && t !== "radio";
}

function atLeftEdge(el: HTMLElement): boolean {
  if (!isTextField(el)) return true;
  return el.selectionStart === 0 && el.selectionEnd === 0;
}

function atRightEdge(el: HTMLElement): boolean {
  if (!isTextField(el)) return true;
  const len = el.value.length;
  return el.selectionStart === len && el.selectionEnd === len;
}

export function useKeyboardGrid({
  gridRef,
  rows,
  columnCount,
  appendEmptyRow,
  enterChainCols,
  lastDataColIndex,
}: UseKeyboardGridOptions) {
  // Live rows, read inside handlers so they never close over a stale array.
  // (TransactionRow is memoized and won't re-render existing rows on
  // append/delete, so a rows-in-closure handler would compute wrong boundaries.)
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const focusCell = useCallback(
    (rowIndex: number, colIndex: number) => {
      const el = gridRef.current?.querySelector<HTMLElement>(
        `[data-grid-row="${rowIndex}"][data-grid-col="${colIndex}"]`
      );
      if (el) {
        el.focus();
        el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      }
    },
    [gridRef]
  );

  const focusNextEditableCell = useCallback(
    (rowIndex: number, colIndex: number, direction: 1 | -1) => {
      let c = colIndex + direction;
      while (c >= 0 && c < columnCount) {
        const el = gridRef.current?.querySelector<HTMLElement>(
          `[data-grid-row="${rowIndex}"][data-grid-col="${c}"]`
        );
        if (el && !el.hasAttribute("disabled") && el.getAttribute("aria-readonly") !== "true") {
          el.focus();
          el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
          return;
        }
        c += direction;
      }
    },
    [gridRef, columnCount]
  );

  // Deferred focus after an append: appending re-renders the grid with the new
  // row, and this effect (keyed on rows.length) focuses it once React commits —
  // more reliable than a setTimeout, and coalesces rapid appends to the last one.
  const pendingFocusRef = useRef<{ row: number; col: number } | null>(null);
  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (pending) {
      pendingFocusRef.current = null;
      focusCell(pending.row, pending.col);
    }
  }, [rows.length, focusCell]);

  // Effective Enter chain — default to every col 0..lastDataColIndex if not given.
  const chain =
    enterChainCols ??
    Array.from(
      { length: (lastDataColIndex ?? columnCount - 2) + 1 },
      (_, i) => i
    );
  const firstChainCol = chain[0] ?? 0;
  const lastDataCol = lastDataColIndex ?? columnCount - 2;

  // Advance to the next row's first chain cell, appending a row if on the last row.
  const goToNextRow = useCallback(
    (rowIndex: number) => {
      const liveRows = rowsRef.current;
      const isLastRow = rowIndex === liveRows.length - 1;
      if (isLastRow) {
        if (rowHasAnyData(liveRows[rowIndex])) {
          pendingFocusRef.current = { row: rowIndex + 1, col: firstChainCol };
          appendEmptyRow();
        }
      } else {
        focusCell(rowIndex + 1, firstChainCol);
      }
    },
    [appendEmptyRow, focusCell, firstChainCol]
  );

  // Move forward one step along the Enter chain from (rowIndex, colIndex):
  // next chain col, or a new row when on the last chain cell. Shared by the
  // Enter key and combobox auto-advance ("select AND advance").
  const advanceChain = useCallback(
    (rowIndex: number, colIndex: number) => {
      const pos = chain.indexOf(colIndex);
      if (pos !== -1) {
        if (pos < chain.length - 1) {
          focusCell(rowIndex, chain[pos + 1]);
        } else {
          goToNextRow(rowIndex);
        }
      } else if (colIndex === lastDataCol) {
        goToNextRow(rowIndex);
      }
      // Any other non-chain focusable cell (mid-row checkbox): no advance.
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chain.join(","), lastDataCol, focusCell, goToNextRow]
  );

  const handleKeyDown = useCallback(
    (
      e: React.KeyboardEvent,
      rowIndex: number,
      colIndex: number,
      isComboboxOpen: boolean
    ) => {
      // Modified keys belong to page-level shortcuts (mod+S, mod+Enter,
      // mod+Arrow stage switch, Alt+A/Alt+C) — let them bubble untouched.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // When a combobox is open, cmdk owns ↑/↓/Enter/Escape.
      if (isComboboxOpen) return;

      const isDeleteCol = colIndex === columnCount - 1;

      switch (e.key) {
        case "Enter": {
          if ((e.target as HTMLElement).tagName === "TEXTAREA") return;
          e.preventDefault();
          e.stopPropagation();
          // Enter must NEVER delete a row.
          if (isDeleteCol) return;

          // Chain advance (Tax%, the last editable col, also makes a row so it is
          // never a dead key; the mid-row checkbox is a no-op).
          advanceChain(rowIndex, colIndex);
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          e.stopPropagation();
          if (rowIndex < rowsRef.current.length - 1) {
            focusCell(rowIndex + 1, colIndex);
          }
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          if (rowIndex > 0) {
            e.stopPropagation(); // row 0: let it bubble so the ring exits the grid upward
            focusCell(rowIndex - 1, colIndex);
          }
          break;
        }
        case "ArrowRight": {
          if (!atRightEdge(e.target as HTMLElement)) return; // let caret move inside the field
          e.preventDefault();
          e.stopPropagation();
          focusNextEditableCell(rowIndex, colIndex, 1);
          break;
        }
        case "ArrowLeft": {
          if (!atLeftEdge(e.target as HTMLElement)) return;
          e.preventDefault();
          e.stopPropagation();
          focusNextEditableCell(rowIndex, colIndex, -1);
          break;
        }
      }
    },
    [columnCount, focusCell, focusNextEditableCell, advanceChain]
  );

  return { handleKeyDown, focusCell, advanceChain };
}
