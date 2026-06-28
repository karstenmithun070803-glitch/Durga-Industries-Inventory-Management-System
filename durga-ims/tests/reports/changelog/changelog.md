# Changelog — Durga Industries IMS

All code changes made during the testing process are logged here.
Format: date, phase, bug fixed, files changed, why, risk level.

## 2026-06-29 — Phase 1 Fixes

### FIX: BUG-1-001 — formatActionError() trailing period in error output

- **Files changed:**
  - src/lib/utils.ts (line 26): regex third capture group changed from `([\d.]+)` to `(\d+(?:\.\d+)?)`
- **Why:** `[\d.]` includes `.` in the character class, causing the greedy match to consume the trailing period from error messages ending in `.`. The `\.?` suffix never had a chance to strip it. The new pattern explicitly matches only valid decimal notation (digits with optional `.digits`), leaving any trailing punctuation for `\.?` to consume.
- **Tests affected:** tests/unit/format-code.test.ts — all 28 tests now passing
- **Risk level:** Low — changes only the regex parsing of stock error messages in the error formatter function. No impact on DB, stock calculations, or any other feature.
