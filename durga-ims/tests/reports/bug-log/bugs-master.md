# Bug Master Log — Durga Industries IMS

All bugs found across all phases are logged here.

Format:
```
## BUG-[PHASE]-[NUMBER] — [Short description]
- **Phase found:** Phase X
- **Severity:** Critical | High | Medium | Low
- **Category:** Logic | UI/UX | Data | Security | Performance | Concurrency
- **File:** /src/path/to/file.tsx (line XX)
- **What was expected:** [description]
- **What actually happened:** [description]
- **Test name:** [exact test name that proves this bug]
- **Reproduction:** [exact steps]
- **Evidence:**
  - **Test:** [test file and line number]
  - **Output:** [failing test output]
  - **Screenshot:** [path or N/A]
- **Impact:** [what goes wrong for the actual user]
- **Status:** Open | Fixed | Deferred | Needs Architectural Decision
- **Fix applied:** [description or link to decisions.md]
- **Fix verified:** Yes/No
- **Regression check:** [result of re-running previous phases]
```

---

## BUG-1-001 — formatActionError() retains trailing period in "needed" quantity

- **Phase found:** Phase 1
- **Severity:** Low
- **Category:** Logic / UI-UX
- **File:** src/lib/utils.ts (line 26)
- **What was expected:** `"Not enough stock — Steel Rod (available: 5.00, needed: 10.00)"`
- **What actually happened:** `"Not enough stock — Steel Rod (available: 5.00, needed: 10.00.)"`
- **Test name:** `formatActionError() > formats an insufficient-stock error into a user-friendly message`
- **Reproduction:** Call `formatActionError(new Error('Insufficient stock for "Steel Rod": available 5.00, requested 10.00.'))`
- **Evidence:**
  - **Test:** tests/unit/format-code.test.ts (line 86 in new structure; was utils.test.ts:89)
  - **Output:** `AssertionError: expected 'Not enough stock — Steel Rod (available: 5.00, needed: 10.00.)' to be 'Not enough stock — Steel Rod (available: 5.00, needed: 10.00)'`
  - **Screenshot:** N/A (unit test failure; no browser interaction)
- **Impact:** Users see "needed: 10.00." with stray trailing period in stock insufficiency error toasts — cosmetic but incorrect
- **Status:** Fixed
- **Fix applied:** Changed regex third capture group from `([\d.]+)` to `(\d+(?:\.\d+)?)` in `src/lib/utils.ts:26`. Root cause: `[\d.]` character class includes `.`, so the greedy match consumed the trailing period from error messages, leaving nothing for the `\.?` suffix to strip. The new pattern explicitly matches a decimal number (digits with optional `.digits` suffix) without consuming trailing punctuation.
- **Fix verified:** Yes — re-ran full Phase 1 suite (129 tests), all passing
- **Regression check:** Full Phase 1 suite re-run after fix — 129/129 passing. No other tests affected.
