import { useState, type RefObject } from "react";
import { useHotkeys } from "react-hotkeys-hook";

interface UseListKeyboardNavOptions {
  itemCount: number;
  searchRef: RefObject<HTMLInputElement | null>;
  onActivate?: (index: number) => void;
  onRefresh?: () => void;
}

export function useListKeyboardNav({
  itemCount,
  searchRef,
  onActivate,
  onRefresh,
}: UseListKeyboardNavOptions) {
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // / or F: focus search (when no input is focused)
  useHotkeys(
    ["/", "f"],
    (e) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      )
        return;
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    },
    { enableOnFormTags: false }
  );

  // R: refresh (when no input is focused)
  useHotkeys(
    "r",
    (e) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      )
        return;
      e.preventDefault();
      onRefresh?.();
    },
    { enableOnFormTags: false }
  );

  const searchProps = {
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        searchRef.current?.blur();
        setHighlightedIndex(-1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        searchRef.current?.blur();
        setHighlightedIndex(0);
      }
    },
  };

  const tableProps = {
    tabIndex: 0,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((i) => Math.min(i + 1, itemCount - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (highlightedIndex <= 0) {
          setHighlightedIndex(-1);
          searchRef.current?.focus();
          return;
        }
        setHighlightedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && highlightedIndex >= 0) {
        e.preventDefault();
        onActivate?.(highlightedIndex);
      }
    },
  };

  return {
    highlightedIndex,
    setHighlightedIndex,
    searchProps,
    tableProps,
  };
}
