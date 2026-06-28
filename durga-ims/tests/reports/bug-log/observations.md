# Observations — Durga Industries IMS

Non-bug findings logged here. These are behaviors that are correct and working,
but worth documenting for developers building on top of this code.

Format:
```
## OBS-[PHASE]-[NUMBER] — [Short description]
- **Phase found:** Phase X
- **Category:** Architecture | Data | API | UX
- **File:** /src/path/to/file.ts
- **What was observed:** [description]
- **Why this is not a bug:** [explanation]
- **Developer note:** [guidance for future integrations]
```

---

## OBS-1-001 — calcAmountsForRow() returns strings, not numbers

- **Phase found:** Phase 1
- **Category:** Architecture
- **File:** src/lib/utils/row-calc.ts
- **What was observed:** `calcAmountsForRow()` accepts string inputs for qty, rate, and taxPct, and returns string outputs for amount, cgst_amount, sgst_amount, and igst_amount. All four output fields are strings (e.g., `"1000.00"`), not numbers.
- **Why this is not a bug:** Transaction grid rows are backed by form field state, which is always strings. Keeping the types consistent (string in, string out) avoids parsing/formatting at the boundary. The function internally converts to float for calculation, then converts back to string via `.toFixed(2)`.
- **Developer note:** If you call `calcAmountsForRow()` and try to do arithmetic with the result directly (e.g., `result.amount + result.igst_amount`), you will get string concatenation, not numeric addition. Parse first: `parseFloat(result.amount)`.

---
