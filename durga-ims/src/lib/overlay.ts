/**
 * True while a modal dialog or a combobox/cmdk dropdown is open.
 *
 * Dialogs are rendered as React children of the page, so their key events still
 * bubble through the React tree to page-level handlers — and `react-hotkeys-hook`
 * bindings listen on document and fire regardless. Global shortcuts (save, new,
 * print, focus-search, …) must therefore yield while an overlay is open, or they
 * act on the record *behind* the dialog.
 */
export function isOverlayOpen(): boolean {
  if (typeof document === "undefined") return false;
  return !!document.querySelector('[role="dialog"], [cmdk-root]');
}
