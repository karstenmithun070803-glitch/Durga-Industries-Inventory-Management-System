import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

export interface FormSection {
  id: string;
  ref: RefObject<HTMLElement | null>;
  onActivate: () => void;
  onDeactivate?: () => void;
  isDisabled?: () => boolean;
  /**
   * When true, the section activates immediately when the ring lands on it.
   * Use for number inputs (Margin %) so the cursor is placed on first ↓.
   */
  autoActivate?: boolean;
}

interface UseFormSectionNavOptions {
  sections: FormSection[];
  isLoading?: boolean;
  /**
   * Optional Tab handler. When provided, Tab is delegated here instead of being
   * silently trapped — the page decides (e.g. jump into the grid when focus is
   * outside it, otherwise let native Tab proceed). When omitted, Tab stays trapped.
   */
  onTab?: (e: React.KeyboardEvent) => void;
}

interface UseFormSectionNavReturn {
  activeSectionIndex: number | null;
  /** Programmatically move to a specific section (e.g. after async vehicle load). */
  goToSection: (index: number) => void;
  /**
   * Set the active section WITHOUT calling its onActivate (no focus move).
   * Used to keep the ring in sync with real DOM focus (mouse clicks, focusCell,
   * grid arrow moves) so the next Up/Down arrow acts on the region the user is
   * actually in — this is the core fix for the "reverse-nav jumps to a tab" bug.
   */
  setActiveSectionSilently: (index: number | null) => void;
  containerProps: {
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
    onFocus: (e: React.FocusEvent<HTMLDivElement>) => void;
    tabIndex: number;
  };
}

function isCmkdOpen(): boolean {
  return !!document.querySelector("[cmdk-root]");
}

/**
 * Focus row 0 of the grid inside a section, restoring the column the user last
 * left (published by TransactionGrid as `data-entry-col`). Falls back to col 0.
 * Use this in a grid section's `onActivate` so re-entry from the ring is seamless.
 */
export function focusGridRowZero(sectionEl: HTMLElement | null): void {
  if (!sectionEl) return;
  const col = sectionEl.querySelector("table")?.getAttribute("data-entry-col") ?? "0";
  const cell =
    sectionEl.querySelector<HTMLElement>(`[data-grid-row="0"][data-grid-col="${col}"]`) ??
    sectionEl.querySelector<HTMLElement>('[data-grid-row="0"][data-grid-col="0"]');
  cell?.focus();
}

function isDialogOpen(): boolean {
  return !!document.querySelector('[role="dialog"]');
}

export function useFormSectionNav({
  sections,
  isLoading = false,
  onTab,
}: UseFormSectionNavOptions): UseFormSectionNavReturn {
  const onTabRef = useRef(onTab);
  onTabRef.current = onTab;
  const [activeSectionIndex, setActiveSectionIndex] = useState<number | null>(null);

  const activeSectionIndexRef = useRef<number | null>(null);
  const isLoadingRef = useRef(isLoading);
  activeSectionIndexRef.current = activeSectionIndex;
  isLoadingRef.current = isLoading;

  // When true, the next activeSectionIndex change came from a silent focus sync
  // (mouse/focusCell) and must NOT trigger the autoActivate onActivate below.
  const skipAutoActivateRef = useRef(false);

  const setActiveSectionSilently = useCallback((index: number | null) => {
    if (activeSectionIndexRef.current === index) return;
    skipAutoActivateRef.current = true;
    setActiveSectionIndex(index);
  }, []);

  // Keep the ring aligned with real DOM focus. React's onFocus bubbles (focusin),
  // so this fires whenever focus lands on any element inside a section — via mouse
  // click, programmatic focusCell, or grid arrow movement. Without this the ring's
  // index goes stale and the next Up/Down arrow misroutes to the wrong region.
  const handleContainerFocus = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      const target = e.target as Node;
      for (let i = 0; i < sections.length; i++) {
        if (sections[i].ref.current?.contains(target)) {
          setActiveSectionSilently(i);
          return;
        }
      }
    },
    [sections, setActiveSectionSilently]
  );

  const findNextEnabledSection = useCallback(
    (from: number, direction: 1 | -1): number | null => {
      let i = from + direction;
      while (i >= 0 && i < sections.length) {
        if (!sections[i].isDisabled?.()) return i;
        i += direction;
      }
      return null;
    },
    [sections]
  );

  const activateSection = useCallback(
    (index: number) => {
      sections[index].onActivate();
    },
    [sections]
  );

  // autoActivate sections: fire onActivate synchronously before paint
  const prevIndexRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (activeSectionIndex === prevIndexRef.current) return;
    prevIndexRef.current = activeSectionIndex;

    // Change came from a silent focus sync — do not steal/re-focus.
    if (skipAutoActivateRef.current) {
      skipAutoActivateRef.current = false;
      return;
    }

    if (
      activeSectionIndex !== null &&
      sections[activeSectionIndex]?.autoActivate &&
      !sections[activeSectionIndex]?.isDisabled?.()
    ) {
      activateSection(activeSectionIndex);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSectionIndex]);

  const goToSection = useCallback(
    (index: number) => {
      if (index < 0 || index >= sections.length) return;
      if (sections[index].isDisabled?.()) return;
      setActiveSectionIndex(index);
      sections[index].onActivate();
    },
    [sections]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (isDialogOpen() || isLoadingRef.current) return;

      // Tab: delegate to the page if it opted in (e.g. jump into the grid),
      // otherwise stay trapped (cannot escape to browser chrome).
      if (e.key === "Tab") {
        if (onTabRef.current) {
          onTabRef.current(e);
        } else {
          e.preventDefault();
        }
        return;
      }

      // When a cmdk dropdown is open, pass ALL keys through unmodified
      if (isCmkdOpen()) return;

      const idx = activeSectionIndexRef.current;

      if (e.key === "Escape") {
        if (idx !== null) {
          e.preventDefault();
          e.stopPropagation();
          sections[idx]?.onDeactivate?.();
          setActiveSectionIndex(null);
        }
        return;
      }

      if (e.key === "ArrowDown") {
        const start = idx !== null ? idx : -1;
        const next = findNextEnabledSection(start, 1);
        if (next !== null) {
          e.preventDefault();
          setActiveSectionIndex(next);
          if (!sections[next].autoActivate) {
            activateSection(next);
          }
        }
        return;
      }

      if (e.key === "ArrowUp") {
        if (idx === null) return;
        const prev = findNextEnabledSection(idx, -1);
        if (prev !== null) {
          e.preventDefault();
          setActiveSectionIndex(prev);
          if (!sections[prev].autoActivate) {
            activateSection(prev);
          }
        }
        return;
      }
    },
    [sections, activateSection, findNextEnabledSection]
  );

  // Mark active section on the DOM element for CSS targeting if needed
  useEffect(() => {
    sections.forEach((section, i) => {
      const el = section.ref.current;
      if (!el) return;
      el.setAttribute("data-section-active", i === activeSectionIndex ? "true" : "false");
    });
  }, [activeSectionIndex, sections]);

  return {
    activeSectionIndex,
    goToSection,
    setActiveSectionSilently,
    containerProps: {
      onKeyDown: handleKeyDown,
      onFocus: handleContainerFocus,
      tabIndex: -1,
    },
  };
}
