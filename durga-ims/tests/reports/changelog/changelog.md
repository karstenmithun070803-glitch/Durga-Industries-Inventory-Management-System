# Changelog — Durga Industries IMS

All code changes made during the testing process are logged here.
Format: date, phase, bug fixed, files changed, why, risk level.

## 2026-06-29 — Phase 4 Fixes

### FIX: BUG-4-001 — Negative rate allowed in PO items server-side

- **Files changed:**
  - `src/lib/actions/purchase-orders.actions.ts` — added `rate < 0` guard to `validateItems()` (~line 408)
- **Why:** `validateItems()` checked for zero-rate confirmation but had no `rate >= 0` check. A user could submit a negative rate via DevTools; it would reach the DB and corrupt financial ledger values.
- **Test that caught it:** `tests/edge-cases/security-input-sanitization.test.ts` → "throws validation error when item rate is negative (-50)"
- **Risk level:** Low (only affects users who deliberately manipulate form fields)
- **Verified:** Re-ran `security-input-sanitization.test.ts` — all B1 tests pass

### FIX: BUG-4-002 — Zero/negative quantity allowed in PO items server-side

- **Files changed:**
  - `src/lib/actions/purchase-orders.actions.ts` — added `qty <= 0` guard to `validateItems()` (~line 405)
- **Why:** PO validation checked supplier, duplicates, and zero-rate, but not `qty > 0`. Submitting `qty: "-5"` via DevTools caused a PO receipt to REDUCE stock rather than increase it, creating an undetectable inventory discrepancy.
- **Test that caught it:** `tests/edge-cases/security-input-sanitization.test.ts` → "throws validation error when item qty is zero"
- **Risk level:** Medium (a negative-qty PO receipt corrupts stock ledger silently)
- **Verified:** Re-ran `security-input-sanitization.test.ts` — all B2 tests pass

No other application code was modified in Phase 4.

---

## 2026-06-29 — Phase 1 Fixes

### FIX: BUG-1-001 — formatActionError() trailing period in error output

- **Files changed:**
  - src/lib/utils.ts (line 26): regex third capture group changed from `([\d.]+)` to `(\d+(?:\.\d+)?)`
- **Why:** `[\d.]` includes `.` in the character class, causing the greedy match to consume the trailing period from error messages ending in `.`. The `\.?` suffix never had a chance to strip it. The new pattern explicitly matches only valid decimal notation (digits with optional `.digits`), leaving any trailing punctuation for `\.?` to consume.
- **Tests affected:** tests/unit/format-code.test.ts — all 28 tests now passing
- **Risk level:** Low — changes only the regex parsing of stock error messages in the error formatter function. No impact on DB, stock calculations, or any other feature.
