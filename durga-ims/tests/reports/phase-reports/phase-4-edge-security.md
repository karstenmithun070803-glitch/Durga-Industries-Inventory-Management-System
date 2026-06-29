# Phase 4 — Edge Cases + Security

**Date:** 2026-06-29  
**Status:** ✅ COMPLETE  
**Run against:** `tests/edge-cases/` (6 files, 27 tests)

---

## Summary

| Metric | Value |
|---|---|
| Tests written | 27 |
| Tests passed | 27 |
| Tests failed | 0 |
| Features confirmed working | 7 |
| Bugs found | 2 |
| Bugs fixed | 2 |
| Application files changed | 1 (`purchase-orders.actions.ts`) |

---

## Test Files

| File | Category | Tests |
|---|---|---|
| `tests/edge-cases/stock-edge-cases.test.ts` | Edge Case | 11 |
| `tests/edge-cases/invoice-edge-cases.test.ts` | Edge Case | 2 |
| `tests/edge-cases/bulk-import-edge-cases.test.ts` | Edge Case | 5 |
| `tests/edge-cases/security-auth-guards.test.ts` | Edge Case / Security | 4 |
| `tests/edge-cases/security-input-sanitization.test.ts` | Edge Case / Security | 5 |
| `tests/edge-cases/security-bundle-check.test.ts` | Edge Case / Security | 2 |

---

## Confirmed Working ✅

### ✅ A1 — PO Revert Guards: TWO-LAYER PROTECTION CONFIRMED WORKING

`revertPOToDraft()` in `src/lib/actions/purchase-orders.actions.ts`

**Guard 1:** If any `materialIssueItems` row references a material that also appears in the PO's items, the function returns `{ error: "Cannot revert to draft — materials from this PO have already been issued..." }` without touching the DB.

**Guard 2:** For each PO item, if `current_stock - qty < 0` (stock would go negative), the function returns `{ error: "Cannot revert — insufficient stock for: [material name]" }` listing every blocking material.

**DB backstop:** A CHECK constraint `current_stock >= 0` on `materials` table prevents any negative stock even if app-layer checks were bypassed.

**Confirmed by:** 3 tests in `stock-edge-cases.test.ts`, all PASS. No code change needed.

---

### ✅ A2 — Material Issue affects_inventory Filtering: CONFIRMED WORKING

`saveVehicleMaterialIssue()` in `src/lib/actions/material-issues.actions.ts`

`data.items.filter((i) => i.affects_inventory)` correctly separates billing-only items from stock-deducting items:
- `affects_inventory=true` item: stock deducted, ledger entry inserted
- `affects_inventory=false` item: saved to `materialIssueItems` for billing, NO stock change, NO ledger entry

**Confirmed by:** 2 tests in `invoice-edge-cases.test.ts`, both PASS. No code change needed.

---

### ✅ A3 — adjustStock Validation: CONFIRMED WORKING

`adjustStock()` in `src/lib/actions/stock.actions.ts`

All three validation guards work:
1. `newQty < 0` → throws `"Stock cannot go below zero."` (no DB write)
2. `reason.length < 10` → throws `"Reason must be at least 10 characters."` (no DB write)
3. `standardCost < 0` → throws `"Unit cost cannot be negative."` (no DB write)

Zero is allowed (`newQty = 0`) and correctly records a negative delta in the ledger.

**Confirmed by:** 6 tests in `stock-edge-cases.test.ts`, all PASS. No code change needed.

---

### ✅ A4 — bulkImportMaterials Deduplication: CONFIRMED WORKING

`bulkImportMaterials()` in `src/lib/actions/materials.actions.ts`

Three deduplication layers all work:
1. Within-batch: `batchSeen` Set prevents same name appearing twice in one import
2. Against active DB materials: case-insensitive match increments `skipped`
3. Against inactive DB materials: increments `skippedInactive` (does NOT re-activate)

**Confirmed by:** 5 tests in `bulk-import-edge-cases.test.ts`, all PASS. No code change needed.

---

### ✅ A5 — Middleware Auth Coverage: CONFIRMED CORRECT CONFIGURATION

`src/middleware.ts`

Matcher pattern: `/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)`

Correctly excludes static assets only. All application routes — including Server Action POST endpoints — fall through to the auth check. Unauthenticated users are redirected to `/login`.

**Confirmed by:** 4 tests in `security-auth-guards.test.ts` + manual verification checklist. No code change needed.

> **Manual verification** (run once): Start dev server, clear `sb-*` cookies in browser DevTools, replay any Server Action POST in Network tab. Expected: 302 redirect to `/login`.

---

### ✅ A6 — SERVICE_ROLE_KEY Bundle Scan: PASS

Command run: `bash tests/scripts/bundle-scan.sh`  
Result: `PASS: SERVICE_ROLE_KEY not found in client bundle (.next/static/).`

Also verified by: `tests/edge-cases/security-bundle-check.test.ts` — 2 tests PASS.

The server-side secret is correctly isolated. No code change needed.

---

### ✅ B4 — Stage Deletion with MIs: CONFIRMED WORKING (soft delete, intentional design)

`deleteStage()` in `src/lib/actions/stages.actions.ts`

This is a **soft delete** (`is_active = false`), not a hard delete:
- **Draft MI references stage** → throws with count: `"Stage has N Draft issue slip(s) — complete or delete those slips before deactivating this stage."`
- **Issued MI references stage** → deletion SUCCEEDS (stage deactivated, historical MI records intact)
- **No MIs** → deletion always succeeds

**Confirmed by:** 2 tests in `stock-edge-cases.test.ts`, both PASS. No code change needed.

---

## Bugs Found 🐛

### 🐛 BUG-4-001 — No server-side negative rate validation in PO items

**Severity:** Medium | **Category:** Data / Security | **Status:** FIXED

**File:** `src/lib/actions/purchase-orders.actions.ts` → `validateItems()`

**What happened:** `createPurchaseOrder()` with `rate: "-50"` inserted the PO without error. When received, the ledger recorded a negative-rate purchase, corrupting financial values.

**Fix:** Added `rate < 0` guard to `validateItems()`. See `tests/reports/bug-log/bugs-fixed.md` → BUG-4-001.

**Verified by:** `tests/edge-cases/security-input-sanitization.test.ts` — all B1 tests pass post-fix.

---

### 🐛 BUG-4-002 — No server-side zero/negative quantity validation in PO items

**Severity:** Medium | **Category:** Data / Security | **Status:** FIXED

**File:** `src/lib/actions/purchase-orders.actions.ts` → `validateItems()`

**What happened:** `createPurchaseOrder()` with `qty: "-5"` inserted the PO. When received, `receivePurchaseOrder()` added `-5` to stock — a receipt that REDUCED inventory rather than increasing it.

**Fix:** Added `qty <= 0` guard to `validateItems()`. See `tests/reports/bug-log/bugs-fixed.md` → BUG-4-002.

**Verified by:** `tests/edge-cases/security-input-sanitization.test.ts` — all B2 tests pass post-fix.

---

## Observations (Unconfirmed) ⚪

### ⚪ OBS-4-001 — PO number race condition surfaces raw Postgres error to user

**Severity:** Low | **Category:** UX / Concurrency

`getNextPONumber()` uses `MAX(po_number) + 1` without a row lock. Concurrent creation by two users would surface a raw Postgres `duplicate key` error to the caller.

**For a 4-user internal tool:** Virtually impossible in practice. No code change taken.  
**Logged as:** AD-4-001 in `architectural-decisions/decisions.md`

---

## Claims Verified Safe Before Testing ⚪

The following items from the original Phase 4 plan were verified safe before writing tests. No tests needed for these specific claims:

| Claim | Verdict |
|---|---|
| XSS via `customer_name` with `<script>` tag | SAFE — no `dangerouslySetInnerHTML`; React JSX auto-escapes; `@react-pdf/renderer` doesn't execute JS |
| SQL injection via Drizzle | SAFE — all `sql\`` template literals use parameterized interpolation; no string concatenation |
| Invoice discount exceeding net_amount | NON-ISSUE — `discount` field is never written in `createInvoice`/`updateInvoice` |
| SERVICE_ROLE_KEY in client bundle | SAFE — verified by bundle-scan.sh (PASS) |
| Middleware gaps | SAFE — matcher covers all routes including Server Action endpoints |

---

## Regression Check

All Phase 3 tests and Phase 1–2 tests must still pass after the two bug fixes:

```bash
npm run test:unit        # Phase 1 — expect 128/128 PASS
npm run test:integration # Phase 2 — expect 67/67 PASS
npm run test:edge        # Phase 4 — expect 27/27 PASS
```

No Phase 3 (E2E / Playwright) tests are affected — the fixes are server-side validation only.

---

## Run Instructions

```bash
# Edge case tests (Phase 4)
npm run test:edge

# Bundle scan (requires npm run build first)
bash tests/scripts/bundle-scan.sh

# Full test suite
npm run test:all
```
