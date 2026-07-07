import { useCallback } from "react";
import type { RefObject } from "react";
import type { LineItemDraft } from "@/types";

interface UseKeyboardGridOptions {
  gridRef: RefObject<HTMLTableElement | null>;
  rows: LineItemDraft[];
  columnCount: number;
  appendEmptyRow: () => void;
  /**
   * Index of the delete button column. Used only for column boundary checks.
   * Navigation does not wrap at this column — Enter always goes to col 0 of next row.
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

export function useKeyboardGrid({
  gridRef,
  rows,
  columnCount,
  appendEmptyRow,
}: UseKeyboardGridOptions) {
  const focusCell = useCallback(
    (rowIndex: number, colIndex: number) => {
      const el = gridRef.current?.querySelector<HTMLElement>(
        `[data-grid-row="${rowIndex}"][data-grid-col="${colIndex}"]`
      );
      if (el) {
        el.focus();
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
          el.scrollIntoView({ block: "nearest", behavior: "smooth" });
          return;
        }
        c += direction;
      }
    },
    [gridRef, columnCount]
  );

  const handleKeyDown = useCallback(
    (
      e: React.KeyboardEvent,
      rowIndex: number,
      colIndex: number,
      isComboboxOpen: boolean
    ) => {
      // When combobox is open: let cmdk handle ↑/↓/Enter/Escape — do NOT intercept
      if (isComboboxOpen) return;

      const isLastRow = rowIndex === rows.length - 1;

      switch (e.key) {
        case "Enter": {
          if ((e.target as HTMLElement).tagName === "TEXTAREA") return;
          // Button elements (combobox trigger, delete): let browser handle natively
          // Combobox trigger: native Enter opens the dropdown
          // Delete button: native Enter fires click
          if ((e.target as HTMLElement).tagName === "BUTTON") return;

          e.preventDefault();
          e.stopPropagation();
          // Enter always goes to col 0 of the next row (creates a new row if on last)
          if (isLastRow) {
            if (rowHasAnyData(rows[rowIndex])) {
              appendEmptyRow();
              setTimeout(() => focusCell(rowIndex + 1, 0), 10);
            }
            // If last row is empty, do nothing (don't create endless empty rows)
          } else {
            focusCell(rowIndex + 1, 0);
          }
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          e.stopPropagation();
          // ↓ moves to next row, same column. Never creates rows.
          if (!isLastRow) {
            focusCell(rowIndex + 1, colIndex);
          }
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          if (rowIndex > 0) {
            e.stopPropagation(); // row 0: let bubble so section nav exits the grid upward
            focusCell(rowIndex - 1, colIndex);
          }
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          e.stopPropagation();
          focusNextEditableCell(rowIndex, colIndex, 1);
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          e.stopPropagation();
          focusNextEditableCell(rowIndex, colIndex, -1);
          break;
        }
      }
    },
    [rows, appendEmptyRow, focusCell, focusNextEditableCell]
  );

  return { handleKeyDown, focusCell };
}
