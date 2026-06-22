import { useCallback } from "react";
import type { RefObject } from "react";
import type { LineItemDraft } from "@/types";

interface UseKeyboardGridOptions {
  gridRef: RefObject<HTMLTableElement | null>;
  rows: LineItemDraft[];
  columnCount: number;
  appendEmptyRow: () => void;
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
        case "ArrowDown":
        case "Enter": {
          // Enter inside a text input should not trigger grid nav (let browser handle form submit)
          // but we do want it for grid navigation — only intercept if not a textarea
          if (e.key === "Enter" && (e.target as HTMLElement).tagName === "TEXTAREA") return;
          e.preventDefault();
          if (isLastRow) {
            if (rowHasAnyData(rows[rowIndex])) {
              appendEmptyRow();
              setTimeout(() => focusCell(rowIndex + 1, 0), 10);
            }
            // empty last row → do nothing
          } else {
            focusCell(rowIndex + 1, colIndex);
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
    [rows, appendEmptyRow, focusCell, focusNextEditableCell]
  );

  return { handleKeyDown, focusCell };
}
