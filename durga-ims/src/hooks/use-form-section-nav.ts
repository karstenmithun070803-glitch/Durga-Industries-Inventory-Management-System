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
}

interface UseFormSectionNavReturn {
  activeSectionIndex: number | null;
  /** Programmatically move to a specific section (e.g. after async vehicle load). */
  goToSection: (index: number) => void;
  containerProps: {
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
    tabIndex: number;
  };
}

function isCmkdOpen(): boolean {
  return !!document.querySelector("[cmdk-root]");
}

function isDialogOpen(): boolean {
  return !!document.querySelector('[role="dialog"]');
}

export function useFormSectionNav({
  sections,
  isLoading = false,
}: UseFormSectionNavOptions): UseFormSectionNavReturn {
  const [activeSectionIndex, setActiveSectionIndex] = useState<number | null>(null);

  const activeSectionIndexRef = useRef<number | null>(null);
  const isLoadingRef = useRef(isLoading);
  activeSectionIndexRef.current = activeSectionIndex;
  isLoadingRef.current = isLoading;

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

      // Tab: silently trapped — cannot escape to browser chrome, does nothing else
      if (e.key === "Tab") {
        e.preventDefault();
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
    containerProps: {
      onKeyDown: handleKeyDown,
      tabIndex: -1,
    },
  };
}
