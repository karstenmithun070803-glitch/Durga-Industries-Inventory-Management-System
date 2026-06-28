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
- **Fix verified:** Yes — re-ran full Phase 1 suite (128 tests), all passing
- **Regression check:** Full Phase 1 suite re-run after fix — 128/128 passing. No other tests affected.

---

## BUG-2-001 CANDIDATE — adjustStock() missing db.transaction() wrapper

- **Phase found:** Phase 2
- **Severity:** Medium
- **Category:** Concurrency / Data Integrity
- **File:** src/lib/actions/stock.actions.ts (~line 355–381)
- **What was expected:** `UPDATE materials` and `INSERT stockLedger` execute atomically inside `db.transaction()`, so a failure mid-way leaves no partial state.
- **What actually happened (code audit):** Both statements are issued as two separate, non-transactional `db` calls. If the `INSERT stockLedger` fails after `UPDATE materials` succeeds, stock is permanently changed with no audit trail.
- **Test name:** `GAP-1 evidence: UPDATE materials without ledger → inconsistency possible > updating current_stock without inserting a ledger entry creates a stock/ledger mismatch` (tests/integration/stock-ledger.test.ts)
- **Reproduction:** See stock-ledger.test.ts Group 2 test #6 — directly reproduces the pattern by updating materials without a ledger entry.
- **Evidence:**
  - **Test:** tests/integration/stock-ledger.test.ts (GAP-1 evidence describe block)
  - **Output:** Test passed — pattern confirmed reproducible. `getMaterialStock()` returned 12, `getLatestLedger()` returned `null`. Stock was updated but no ledger entry existed — mismatch confirmed.
  - **Screenshot:** N/A
- **Impact:** If `adjustStock()` crashes between the UPDATE and INSERT, `materials.current_stock` is changed but the ledger has no record. Stock discrepancy goes undetected. Only affects manual stock adjustments — the main PO/MI flows are fully transactional.
- **Status:** Candidate — pattern confirmed reproducible by test; no user-facing failure observed yet
- **Fix applied:** None — RULE 1: do not touch working code until test confirms real-world bug
- **Fix verified:** N/A
- **Regression check:** N/A
