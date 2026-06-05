# Phase 1 — Configuration

---

## Environment Variables

Source: `.env.local.example` (template) + `src/middleware.ts:8–9` + `drizzle.config.ts:7`.

| Variable | Required | Sensitive | Where used | Notes |
|----------|----------|-----------|-----------|-------|
| `DATABASE_URL` | Yes | **Yes** (contains password) | `src/lib/db/index.ts` — Drizzle + postgres driver | Transaction pooler connection string. Format: `postgresql://postgres.[ref]:[password]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres` |
| `DIRECT_URL` | Migration only | **Yes** (contains password) | `drizzle.config.ts:7` — drizzle-kit migrations | Direct (non-pooled) connection. Required because Drizzle Kit cannot use the pooler for schema migrations. Only used on developer machines. |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | No (public) | `src/middleware.ts:8`, `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts` | Supabase project URL. Exposed to the browser (prefix `NEXT_PUBLIC_`). |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | No (public) | `src/middleware.ts:9` | Supabase anon/publishable key. Exposed to the browser. **Note:** `.env.local.example` names this `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the example and the actual code use different names. See questions.md Q-11. |
| `SUPABASE_SERVICE_ROLE_KEY` | Unknown | **Yes** (bypasses RLS) | Not imported in any source file found | Present in `.env.local.example` but not used in any server action or utility. If accidentally used, it bypasses all RLS policies. |

**Total: 5 environment variables. All 4 required ones lack defaults — the app will crash on startup if any are missing.**

---

## Hardcoded Configuration Flags

These values are embedded in source code and cannot be changed without a code deploy.

| Value | Location | Effect | Risk |
|-------|----------|--------|------|
| `eslint: { ignoreDuringBuilds: true }` | `next.config.mjs:3–5` | ESLint is silently skipped during `next build`. Linting errors never fail a production build. | Medium — real issues may ship undetected |
| `getMonth() >= 3` | `src/lib/fy.ts:5` | April (month index 3) marks the start of the financial year. Hardcoded assumption of Indian FY (April–March). | Low — correct for this client; would need change for different FY convention |
| `+05:30` IST offset | `src/lib/fy.ts:12–15` | FY date range boundaries use explicit IST offset. | Low — India has no DST; this is safe |
| `+05:30` IST offset in reports | `src/lib/actions/reports.actions.ts` | Date range queries for reports prepend `T00:00:00+05:30` and `T23:59:59+05:30` | Low — same rationale |
| `.limit(2000)` | `src/lib/actions/stock.actions.ts:133` | PO rates query fetches at most 2000 rows to find the last rate per material. With many received POs this may miss very old materials' rates. | Low |
| Default history limit: `50` | `src/lib/actions/stock.actions.ts:188` | Stock movement history shows 50 entries by default. | Low |
| Dashboard recents: `5` | `src/lib/actions/dashboard.actions.ts` | Dashboard shows 5 recent POs, 5 MI slips, 5 invoices. | Low |
| Username email suffix: `@durgaindustries.internal` | `src/lib/actions/auth.actions.ts` | Username is mapped to `{username}@durgaindustries.internal` for Supabase Auth. Changing the company name or domain would require updating this constant. | Low |
| `"Draft"`, `"Received"`, `"Issued"`, `"Finalized"`, `"Cancelled"` | Multiple action files | Status string literals used in WHERE clauses and SET statements throughout. Not DB-constrained enums. | Medium — a typo in a status string would silently fail without a test |
| `"PO_INWARD"`, `"ISSUE"`, `"REVERSAL"`, `"ADJUSTMENT"` | `stock_ledger` inserts across action files | Ledger transaction type literals. Not DB-constrained. | Medium — same typo risk |

---

## Config Files

| File | Purpose | Notable settings |
|------|---------|-----------------|
| `next.config.mjs` | Next.js config | `eslint.ignoreDuringBuilds: true` |
| `tsconfig.json` | TypeScript config | `strict: true`, `paths: { "@/*": ["./src/*"] }` |
| `tailwind.config.ts` | Tailwind CSS | Dark mode via CSS variables; shadcn color scheme |
| `drizzle.config.ts` | Drizzle Kit | schema: `./src/lib/db/schema.ts`, out: `./drizzle/migrations`, dialect: `postgresql` |
| `components.json` | shadcn UI | style: `base-nova`, RSC: true, icon library: lucide |
| `.eslintrc.json` | ESLint | extends `next/core-web-vitals` + `next/typescript` |

---

## Dev vs Production Differences

The application has no explicit `NODE_ENV`-based config branching in the source code. The only difference between environments is the contents of `.env.local`:

- **Dev:** `DATABASE_URL` points to dev/staging Supabase project; `DIRECT_URL` used for migrations.
- **Production:** `DATABASE_URL` points to production Supabase project; `DIRECT_URL` is not needed at runtime.
- There is no staging environment configuration found in the repo.
