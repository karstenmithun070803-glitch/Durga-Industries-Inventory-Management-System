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
  /** The DOM element that visually represents this section (receives the ring). */
  ref: RefObject<HTMLElement | null>;
  /** Called when the section becomes active (Enter pressed, or autoActivate). */
  onActivate: () => void;
  /** Optional cleanup called when the section is deactivated (Escape pressed). */
  onDeactivate?: () => void;
  /** When true, skip this section during ↑/↓ navigation. */
  isDisabled?: () => boolean;
  /**
   * When true, the section activates immediately when the ring lands on it —
   * no Enter press needed. Use for number inputs and button bars.
   */
  autoActivate?: boolean;
}

interface UseFormSectionNavOptions {
  sections: FormSection[];
  /** When true, all navigation is suspended (e.g. during async loads). */
  isLoading?: boolean;
}

interface UseFormSectionNavReturn {
  activeSectionIndex: number | null;
  isInSection: boolean;
  /** Call this from a section's Escape handler to exit back to overview. Ring stays on same section. */
  exitSection: () => void;
  /** Call this from a section's Enter/confirm handler to exit AND advance ring to next section. */
  exitSectionAndAdvance: () => void;
  /** Programmatically move the ring to a specific section index (e.g. after async load completes). */
  goToSection: (index: number) => void;
  /** Spread onto the form's root <div> to attach the keydown listener. */
  containerProps: {
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
    tabIndex: number;
  };
}

function isDialogOpen(): boolean {
  return !!document.querySelector('[role="dialog"]');
}

export function useFormSectionNav({
  sections,
  isLoading = false,
}: UseFormSectionNavOptions): UseFormSectionNavReturn {
  const [activeSectionIndex, setActiveSectionIndex] = useState<number | null>(null);
  const [isInSection, setIsInSection] = useState(false);

  // Mirror state in refs so event handlers always see current values
  // without needing to be re-created on every render.
  const activeSectionIndexRef = useRef<number | null>(null);
  const isInSectionRef = useRef(false);
  const isLoadingRef = useRef(isLoading);

  activeSectionIndexRef.current = activeSectionIndex;
  isInSectionRef.current = isInSection;
  isLoadingRef.current = isLoading;

  // ── Helpers ────────────────────────────────────────────────────────────────

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
      setIsInSection(true);
      isInSectionRef.current = true;
      sections[index].onActivate();
    },
    [sections]
  );

  const deactivateSection = useCallback(
    (index: number) => {
      setIsInSection(false);
      isInSectionRef.current = false;
      sections[index].onDeactivate?.();
    },
    [sections]
  );

  // ── autoActivate: fire synchronously via useLayoutEffect ──────────────────
  // We use useLayoutEffect (not useEffect) so activation fires before paint,
  // preventing any visual flash when the user arrows quickly through sections.

  const prevIndexRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (activeSectionIndex === prevIndexRef.current) return;
    prevIndexRef.current = activeSectionIndex;

    if (
      activeSectionIndex !== null &&
      !isInSection &&
      sections[activeSectionIndex]?.autoActivate &&
      !sections[activeSectionIndex]?.isDisabled?.()
    ) {
      activateSection(activeSectionIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSectionIndex]);

  // ── Public API ─────────────────────────────────────────────────────────────

  const exitSection = useCallback(() => {
    const idx = activeSectionIndexRef.current;
    if (idx !== null) deactivateSection(idx);
  }, [deactivateSection]);

  const exitSectionAndAdvance = useCallback(() => {
    const idx = activeSectionIndexRef.current;
    if (idx === null) return;
    deactivateSection(idx);
    const next = findNextEnabledSection(idx, 1);
    if (next !== null) {
      setActiveSectionIndex(next);
    }
  }, [deactivateSection, findNextEnabledSection]);

  const goToSection = useCallback((index: number) => {
    if (index < 0 || index >= sections.length) return;
    if (sections[index].isDisabled?.()) return;
    setIsInSection(false);
    isInSectionRef.current = false;
    setActiveSectionIndex(index);
  }, [sections]);

  // ── Container keydown handler ──────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // Never intercept when a dialog is open or loading
      if (isDialogOpen() || isLoadingRef.current) return;

      const idx = activeSectionIndexRef.current;
      const inSection = isInSectionRef.current;

      // Tab key: always revert to browser-native tab mode (hide ring)
      if (e.key === "Tab") {
        if (idx !== null) {
          if (inSection) deactivateSection(idx);
          setActiveSectionIndex(null);
        }
        return; // let browser handle Tab naturally
      }

      // Escape key
      if (e.key === "Escape") {
        if (inSection && idx !== null) {
          // Exit active section back to overview. Ring stays on this section.
          e.preventDefault();
          e.stopPropagation();
          deactivateSection(idx);
          return;
        }
        if (!inSection && idx !== null) {
          // Ring visible but not in a section — dismiss the ring
          e.preventDefault();
          e.stopPropagation();
          setActiveSectionIndex(null);
          return;
        }
        // No ring, no section: do nothing (let caller handle, e.g. Cancel button)
        return;
      }

      // ↓ / ↑: navigate between sections (only in overview mode)
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !inSection) {
        const direction: 1 | -1 = e.key === "ArrowDown" ? 1 : -1;

        if (idx === null) {
          // Activate ring mode: find first/last enabled section
          const start = direction === 1 ? -1 : sections.length;
          const first = findNextEnabledSection(start, direction);
          if (first !== null) {
            e.preventDefault();
            setActiveSectionIndex(first);
          }
          return;
        }

        const next = findNextEnabledSection(idx, direction);
        if (next !== null) {
          e.preventDefault();
          setActiveSectionIndex(next);
        }
        return;
      }

      // Enter: activate the current section (only in overview mode, not autoActivate)
      if (e.key === "Enter" && !inSection && idx !== null) {
        const section = sections[idx];
        if (!section.autoActivate && !section.isDisabled?.()) {
          e.preventDefault();
          activateSection(idx);
        }
        return;
      }

      // All other keys: if not in a section (and ring is visible), suppress them
      // so stray keypresses don't leak through.
      // Exception: ↑/↓ when ring is visible and we're in overview — already handled above.
    },
    [sections, activateSection, deactivateSection, findNextEnabledSection]
  );

  // ── Apply visual ring to section container elements ───────────────────────
  useEffect(() => {
    sections.forEach((section, i) => {
      const el = section.ref.current;
      if (!el) return;

      const isActive = i === activeSectionIndex;
      const isInSectionActive = isActive && isInSection;

      // Base ring state
      el.setAttribute("data-section-ring", isActive ? "true" : "false");
      el.setAttribute("data-section-active", isInSectionActive ? "true" : "false");
    });
  }, [activeSectionIndex, isInSection, sections]);

  return {
    activeSectionIndex,
    isInSection,
    exitSection,
    exitSectionAndAdvance,
    goToSection,
    containerProps: {
      onKeyDown: handleKeyDown,
      tabIndex: -1,
    },
  };
}
