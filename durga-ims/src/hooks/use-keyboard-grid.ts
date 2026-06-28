import { useCallback } from "react";
import type { RefObject } from "react";
import type { LineItemDraft } from "@/types";

interface UseKeyboardGridOptions {
  gridRef: RefObject<HTMLTableElement | null>;
  rows: LineItemDraft[];
  columnCount: number;
  appendEmptyRow: () => void;
  /**
   * Index of the last DATA column (the column before the delete button).
   * When Enter is pressed from this column, focus wraps to col 0 of the next row
   * instead of staying in the same column — more ergonomic for sequential row entry.
   */
  lastDataColIndex?: number;
  /**
   * Called when ↓ is pressed on the last EMPTY row (instead of doing nothing).
   * Use this to transition focus out of the grid (e.g. to the action bar).
   */
  onExitBottom?: () => void;
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
  lastDataColIndex,
  onExitBottom,
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

      // For button elements (e.g. delete button in grid): let browser fire the
      // click event natively on Enter/Space. Do NOT intercept for grid nav.
      if (
        (e.key === "Enter" || e.key === " ") &&
        (e.target as HTMLElement).tagName === "BUTTON"
      ) {
        return;
      }

      switch (e.key) {
        case "ArrowDown":
        case "Enter": {
          if (e.key === "Enter" && (e.target as HTMLElement).tagName === "TEXTAREA") return;
          e.preventDefault();

          if (isLastRow) {
            if (rowHasAnyData(rows[rowIndex])) {
              appendEmptyRow();
              setTimeout(() => focusCell(rowIndex + 1, 0), 10);
            } else {
              // Last row is empty — exit grid downward
              onExitBottom?.();
            }
          } else {
            // When Enter is pressed from the last DATA column, wrap to col 0 of next row.
            // This is more ergonomic for sequential row entry (Material → ... → Tax → Enter → Material of next row).
            const wrapToStart =
              e.key === "Enter" &&
              lastDataColIndex !== undefined &&
              colIndex === lastDataColIndex;

            focusCell(rowIndex + 1, wrapToStart ? 0 : colIndex);
          }
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          if (rowIndex > 0) focusCell(rowIndex - 1, colIndex);
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          focusNextEditableCell(rowIndex, colIndex, 1);
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          focusNextEditableCell(rowIndex, colIndex, -1);
          break;
        }
      }
    },
    [rows, appendEmptyRow, focusCell, focusNextEditableCell, lastDataColIndex, onExitBottom]
  );

  return { handleKeyDown, focusCell };
}
