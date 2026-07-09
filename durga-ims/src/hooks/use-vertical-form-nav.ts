/**
 * Vertical form keyboard navigation — extracted from MasterLayout so the masters
 * pages and the Clone dialog share one implementation.
 *
 * Semantics (unchanged from the masters forms):
 *  - Enter / ArrowDown / ArrowRight  → next field
 *  - ArrowUp / ArrowLeft             → previous field
 *  - A `:not([disabled])` selector means DISABLED FIELDS ARE SKIPPED automatically.
 *    (This is what makes "pick an existing customer ⇒ everything below is disabled
 *     ⇒ the next stop is the submit button" work with no special-casing.)
 *  - While a cmdk dropdown is open it owns every key (the popover is DOM-portaled,
 *    but React still bubbles its events through the component tree).
 */
export const FORM_FOCUSABLE =
  "input:not([disabled]), select:not([disabled]), [role='combobox']:not([disabled]), textarea:not([disabled])";

export interface VerticalFormNavOptions {
  /** Trap Tab (masters forms do). A dialog must NOT trap it — base-ui already focus-traps. */
  trapTab?: boolean;
  /** Elements appended after the fields, e.g. a submit button as the final Enter stop. */
  extraStops?: () => (HTMLElement | null | undefined)[];
  /**
   * Let Enter on a closed combobox trigger ADVANCE the chain instead of firing natively.
   * Pair with `advanceOnEnter` on the Combobox (which stops it from opening).
   * Default false → masters keep their existing behavior.
   */
  advanceOnComboboxEnter?: boolean;
}

export function handleVerticalFormKeyDown(
  e: React.KeyboardEvent<HTMLElement>,
  { trapTab = true, extraStops, advanceOnComboboxEnter = false }: VerticalFormNavOptions = {}
): void {
  // A combobox dropdown is open → pass all keys through to cmdk.
  if (document.querySelector("[cmdk-root]")) return;

  if (e.key === "Tab") {
    if (trapTab) e.preventDefault();
    return;
  }

  const isDown = e.key === "ArrowDown" || e.key === "Enter" || e.key === "ArrowRight";
  const isUp = e.key === "ArrowUp" || e.key === "ArrowLeft";
  if (!isDown && !isUp) return;

  // Let Enter fire natively on real action buttons (submit / cancel). A combobox
  // trigger is also a BUTTON, but may opt into advancing the chain instead.
  const target = e.target as HTMLElement;
  if (e.key === "Enter" && target.tagName === "BUTTON") {
    const isCombobox = advanceOnComboboxEnter && target.matches("[role='combobox']");
    if (!isCombobox) return;
  }

  const root = e.currentTarget;
  const fields = Array.from(root.querySelectorAll<HTMLElement>(FORM_FOCUSABLE)).filter(
    (el) => !el.closest("[hidden]") && (el as HTMLInputElement).type !== "hidden"
  );
  const extras = (extraStops?.() ?? []).filter(
    (el): el is HTMLElement => !!el && !(el as HTMLButtonElement).disabled
  );
  const chain = [...fields, ...extras];

  const idx = chain.indexOf(document.activeElement as HTMLElement);

  // ←/→ while on an extra stop (a footer button) belong to the dialog's footer nav.
  if (idx >= fields.length && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return;

  e.preventDefault();

  if (idx === -1) {
    // Focus sits outside the chain (e.g. the footer Cancel button). Only when the
    // caller supplied extras do we treat "up" as "back into the last field".
    if (extras.length && isUp && fields.length) fields[fields.length - 1].focus();
    else chain[0]?.focus();
    return;
  }

  const next = chain[isDown ? idx + 1 : idx - 1];
  next?.focus();
  next?.scrollIntoView({ block: "nearest" });
}
