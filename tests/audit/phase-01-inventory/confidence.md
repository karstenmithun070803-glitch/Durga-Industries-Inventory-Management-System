# Phase 1 — Confidence Assessment

---

## Confident (verified directly from source)

| Area | Basis |
|------|-------|
| Tech stack and versions | `package.json`, `drizzle.config.ts`, `tsconfig.json`, `next.config.mjs` |
| All 17 table schemas, columns, types, defaults, constraints | `src/lib/db/schema.ts` (481 lines, read in full) |
| All Drizzle ORM relation definitions | `schema.ts:340–480` |
| All 5 environment variables | `.env.local.example`, `middleware.ts`, `drizzle.config.ts` |
| Zero automated test coverage | `package.json` (no test deps), full `src/` tree scan |
| Authentication flow | `middleware.ts` read in full; `auth.actions.ts` |
| All server action functions (~80 total) and what tables each writes | All 15 action files read |
| Stock ledger mechanics (PO_INWARD, ISSUE, REVERSAL, ADJUSTMENT) | `purchase-orders.actions.ts` and `material-issues.actions.ts` read in full; `stock.actions.ts` read in full |
| Atomic transaction usage in all stock-mutating operations | Verified `db.transaction()` calls in 5 action functions |
| FY calculation logic (`getMonth() >= 3`, IST offset) | `src/lib/fy.ts` read in full |
| All 24 page routes and their purposes | `src/app/` directory structure |
| Core business rules | `CORE_RULES.md` read in full |
| Schema/migration discrepancy (21 columns + 2 tables out of sync) | Both files read and compared |
| No external email, SMS, accounting, or GST integrations | `package.json` (no such packages), full import scan |
| Single-role authentication (no RBAC) | `middleware.ts`, all action files, `app_users` schema |
| PDF generation is client-side only | `src/components/pdf/print-button.tsx` |

---

## Uncertain (requires verification against the live system)

| Area | Uncertainty | How to resolve |
|------|-------------|----------------|
| Actual live database schema | `schema.ts` may differ from what Supabase actually has. The migration file is outdated; the Phase 7 additions (`invoice_slip_links`, `company_settings`, 19 new columns) may or may not be in the live DB. | Run `drizzle-kit introspect` or `SELECT column_name FROM information_schema.columns WHERE table_name = '...'` against the live DB |
| RLS policy SQL | Found in archived docs (`docs/archive/08-payment-tracking-dashboard-rls.md`) but not in any migration file. Whether this was applied to the live DB is unconfirmed. | Check via Supabase Dashboard → Authentication → Policies |
| Whether `SUPABASE_SERVICE_ROLE_KEY` is imported anywhere at runtime | A grep found no imports in `src/`, but it is present in `.env.local.example`. | Verify in live `.env.local` that it is not used accidentally |
| Whether `affects_stock = false` POs or `affects_inventory = false` MI items exist in production data | Cannot determine from code alone. | Query `SELECT count(*) FROM purchase_orders WHERE affects_stock = false` on the live DB |
| `payment_status` field usage | The field exists and `updateFinalizedInvoice` can update it, but whether the client uses it is unknown. | Ask the user (see `questions.md` Q-4) |
| `rev_charge_status` downstream logic | No code found that changes calculation based on this flag. May be print-only or may be a missing implementation. | Ask the user (see `questions.md` Q-5) |

---

## Blockers for Phase 2 (Unit Tests)

| Blocker | Impact | Resolution |
|---------|--------|-----------|
| No test framework installed | Cannot run any tests | Install Vitest + @testing-library/react (for components) + vitest-mock-extended or a Drizzle test adapter (for server actions). Recommended: Vitest because the project uses ESM/TypeScript natively and Next.js 14. |
| No test database | Server action tests that exercise DB logic need an isolated database | Options: (a) local Supabase via Docker (`supabase start`), (b) a dedicated test Supabase project, (c) mock the `db` object with a library like `drizzle-mock`. Option (a) gives the most realistic tests. |
| Schema/migration drift (Q-1 in questions.md) | Phase 4 database integrity tests cannot proceed without knowing the actual live schema | User must confirm whether schema.ts matches the live DB; run introspection if uncertain |
| Domain questions (Q-2 through Q-6 in questions.md) | Some business rule tests depend on knowing the intended behaviour of `affects_stock`, `affects_inventory`, `rev_charge_status`, etc. | User answers required before writing those specific tests; other tests can proceed in parallel |

---

## Phase 1 Completion Status

| Deliverable | Status |
|-------------|--------|
| `inventory.md` | Done |
| `data_flow.md` | Done |
| `roles_matrix.md` | Done |
| `dependencies.md` | Done |
| `configuration.md` | Done |
| `coverage_gap.md` | Done |
| `questions.md` | Done |
| `confidence.md` | This file |
| Production files modified | None |
| Tests written | None (Phase 1 is read-only) |
