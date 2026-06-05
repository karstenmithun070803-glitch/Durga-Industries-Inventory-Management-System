# Phase 1 — External Dependencies

---

## Summary

The system has **two external runtime dependencies**: Supabase (database + auth) and the client-side PDF renderer. There are no email, SMS, file storage, GST portal, accounting, or payment gateway integrations.

---

## Dependency 1: Supabase (Auth + PostgreSQL)

| Attribute | Detail |
|-----------|--------|
| Purpose | Authentication and PostgreSQL database |
| Libraries | `@supabase/ssr@0.10.3`, `@supabase/supabase-js@2.106.0`, `postgres@3.4.9`, `drizzle-orm@0.45.2` |
| Call sites | `src/lib/supabase/client.ts` (browser client), `src/lib/supabase/server.ts` (server client), `src/middleware.ts:7` (session refresh), `src/lib/db/index.ts` (Drizzle + postgres driver) |
| Auth flow | `middleware.ts:7–26` — `createServerClient` + `supabase.auth.getUser()` on every request |
| DB access | All server actions via `db` from `src/lib/db/index.ts`; uses `DATABASE_URL` (pooler) |
| Migrations | `drizzle-kit` CLI uses `DIRECT_URL` (direct connection, bypasses pooler) |
| **On failure** | **All authentication and all data reads/writes fail. The app becomes completely non-functional.** There is no offline mode, no fallback database, and no retry logic beyond what the `postgres` driver provides at the connection level. |
| Fallback | None |
| Retry | None explicitly coded in the application; connection-level retries only |

---

## Dependency 2: @react-pdf/renderer (PDF Export)

| Attribute | Detail |
|-----------|--------|
| Purpose | Generate PDF documents for invoices, MI registers, PO registers, and reports |
| Library | `@react-pdf/renderer@4.5.1` |
| Call sites | `src/components/pdf/print-button.tsx:4` (the `<PrintButton>` wrapper used by all 9 PDF templates) |
| Rendering | **Client-side only** — PDF is generated in the user's browser as a Blob, then opened in a new tab via `window.open(URL.createObjectURL(blob))` |
| Memory management | `print-button.tsx:26` — Object URL is revoked after 60 seconds via `setTimeout` |
| Templates | `customer-invoice-pdf.tsx`, `insurance-invoice-pdf.tsx`, `invoice-summary-report-pdf.tsx`, `job-cost-pdf.tsx`, `mi-register-pdf.tsx`, `monthly-stock-report-pdf.tsx`, `po-register-pdf.tsx`, `purchase-report-pdf.tsx` (8 templates; 9th is a variant) |
| **On failure** | **PDF export silently fails or throws an unhandled client-side error.** No error boundary wraps the PDF generation call. User may see a blank new tab or no response. |
| Fallback | None — no server-side PDF generation path |
| Performance risk | Large reports (many line items) run synchronously on the main thread; may freeze the UI for several seconds |

---

## Dependency 3: Next.js / Vercel (Build + Hosting)

| Attribute | Detail |
|-----------|--------|
| Purpose | Framework and deployment platform |
| Library | `next@14.2.35` |
| **On failure** | App not reachable |
| Notes | Deployment target not explicitly specified in config; Vercel is mentioned in the boilerplate README only |

---

## No integrations found for the following

| Category | Status | Evidence |
|----------|--------|---------|
| Email (nodemailer, resend, sendgrid, etc.) | **Not integrated** | No such package in `package.json`; no imports found |
| SMS (Twilio, etc.) | **Not integrated** | No such package |
| File storage (S3, Supabase Storage) | **Not integrated** | No storage API calls found; PDFs are generated client-side and never persisted |
| GST portal / tax API | **Not integrated** | Tax rates are entered manually into the `tax_rates` table; no external lookup |
| Accounting software (Tally, etc.) | **Not integrated** | No such package or HTTP calls found |
| Payment gateway | **Not integrated** | Payment status is tracked manually (Unpaid/Partial/Paid) in `invoices.payment_status` |
| Analytics / monitoring | **Not integrated** | No Sentry, Datadog, Posthog, or similar |
| Push notifications | **Not integrated** | — |

---

## Failure Impact Summary

| Dependency | Failure impact | Recoverable? |
|-----------|----------------|-------------|
| Supabase (auth) | Login blocked; all authenticated pages inaccessible | When Supabase restores |
| Supabase (database) | All data reads and writes fail; app shows errors | When Supabase restores |
| @react-pdf/renderer | PDF export broken; all other features unaffected | N/A (client library; no network call) |

The application has no queuing, no local caching of write operations, and no graceful degradation mode. A Supabase outage = total outage for the client.
