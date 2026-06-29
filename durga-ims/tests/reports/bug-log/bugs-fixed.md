# Fixed Bugs — Durga Industries IMS

Bugs that have been fixed and verified.

<!-- Moved here from bugs-open.md when fix is verified -->

---

## BUG-1-001 — formatActionError() trailing period in error output

- **Phase found:** Phase 1
- **Severity:** Low
- **Category:** Data formatting
- **File:** `src/lib/utils.ts` (line 26)
- **What happened:** Regex third capture group `([\d.]+)` consumed the trailing period in error messages, so `\.?` suffix never stripped it. Result: error strings had a stray period at the end.
- **Fix:** Changed capture group to `(\d+(?:\.\d+)?)` — explicitly matches valid decimal notation, leaves trailing punctuation for `\.?` to strip.
- **Verified by:** `tests/unit/format-code.test.ts` — all 28 tests pass post-fix
- **Date fixed:** 2026-06-29

---

## BUG-4-001 — No server-side negative rate validation in PO items

- **Phase found:** Phase 4
- **Severity:** Medium
- **Category:** Data / Security
- **File:** `src/lib/actions/purchase-orders.actions.ts` → `validateItems()`
- **What happened:** `createPurchaseOrder()` with `rate: "-50"` inserted the PO with a negative rate. When received, the stock ledger recorded a negative-rate purchase, corrupting financial report values.
- **Reproduction:** Call `createPurchaseOrder({ items: [{ rate: "-50", qty: "10", ... }] })` — no error thrown, record inserted.
- **Fix:** Added to `validateItems()`:
  ```typescript
  for (const item of items) {
    if (parseFloat(item.rate || "0") < 0) throw new Error("Rate cannot be negative.");
  }
  ```
- **Verified by:** `tests/edge-cases/security-input-sanitization.test.ts` — B1 tests pass post-fix
- **Date fixed:** 2026-06-29

---

## BUG-4-002 — No server-side zero/negative quantity validation in PO items

- **Phase found:** Phase 4
- **Severity:** Medium
- **Category:** Data / Security
- **File:** `src/lib/actions/purchase-orders.actions.ts` → `validateItems()`
- **What happened:** `createPurchaseOrder()` with `qty: "-5"` inserted the PO. When received, `receivePurchaseOrder()` added `-5` to stock — a PO receipt REDUCED stock rather than increasing it, creating an undetectable discrepancy.
- **Reproduction:** Call `createPurchaseOrder({ items: [{ qty: "-5", rate: "100", ... }] })` — no error thrown, record inserted.
- **Fix:** Added to `validateItems()`:
  ```typescript
  for (const item of items) {
    if (parseFloat(item.qty || "0") <= 0) throw new Error("All quantities must be greater than zero.");
  }
  ```
- **Verified by:** `tests/edge-cases/security-input-sanitization.test.ts` — B2 tests pass post-fix
- **Date fixed:** 2026-06-29

---

## FIX-5-001 — Missing loading.tsx on invoice edit and view sub-routes

- **Phase found:** Phase 5
- **Severity:** Low
- **Category:** UX
- **Files:** `src/app/(dashboard)/invoice/[id]/edit/loading.tsx` and `src/app/(dashboard)/invoice/[id]/view/loading.tsx`
- **What happened:** Both invoice sub-routes were missing `loading.tsx` files. Without them, Next.js App Router showed a blank screen while the server component fetched invoice data. All sibling routes (`/invoice/[id]/loading.tsx`, `/invoice/new/loading.tsx`) already had loading states; only edit and view were missing.
- **Fix:** Added both files with `<FormPageSkeleton />` — the same pattern used by the existing `/invoice/[id]/loading.tsx`.
- **Verified by:** `tests/performance/large-dataset-handling.spec.ts` — Test 7 (`invoice/[id]/edit has a loading.tsx` and `invoice/[id]/view has a loading.tsx`) — both pass post-fix.
- **Date fixed:** 2026-06-29
