import type { RefObject } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { isOverlayOpen } from "@/lib/overlay";

interface UseMasterKeyboardNavOptions {
  searchRef: RefObject<HTMLInputElement | null>;
  saveRef: RefObject<HTMLButtonElement | null>;
  /** Called when Alt+N is pressed — typically resets editing state and focuses first field */
  onNew?: () => void;
}

/**
 * Adds shared hotkeys to all master pages:
 * - / (forward slash): focus search input (skipped if an input is already focused)
 * - Ctrl+S: click save button
 * - Alt+N: trigger new record
 */
export function useMasterKeyboardNav({
  searchRef,
  saveRef,
  onNew,
}: UseMasterKeyboardNavOptions) {
  useHotkeys(
    "/",
    (e) => {
      if (isOverlayOpen()) return;
      if (document.activeElement?.tagName === "INPUT") return;
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    },
    { enableOnFormTags: false }
  );

  useHotkeys(
    "ctrl+s",
    (e) => {
      if (isOverlayOpen()) return;
      e.preventDefault();
      if (saveRef.current && !saveRef.current.disabled) {
        saveRef.current.click();
      }
    },
    { enableOnFormTags: true }
  );

  useHotkeys(
    "alt+n",
    (e) => {
      if (isOverlayOpen()) return;
      e.preventDefault();
      onNew?.();
    },
    { enableOnFormTags: true }
  );
}
