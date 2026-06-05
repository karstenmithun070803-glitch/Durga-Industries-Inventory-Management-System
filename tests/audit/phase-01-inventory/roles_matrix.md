# Phase 1 — Roles and Permissions Matrix

---

## Role Structure

The application has **one effective role: authenticated user**.

- There is no RBAC (Role-Based Access Control) in the application layer.
- Any user who can log in has full access to every feature: masters, transactions, invoices, stock adjustments, settings, and reports.
- The only binary gate is: logged in vs not logged in.

**Evidence:**
- `src/middleware.ts:33` — only checks `if (!user && !isLoginPage)` → redirect to login. No role check.
- No role or permission fields exist in `app_users` table (`schema.ts:128–135`).
- No role checks in any of the 15 server action files.
- No conditional rendering based on role in any page or component.

---

## Database-Level Permissions (RLS)

**Policy name:** `authenticated_full_access`
**Command:** `FOR ALL` (SELECT, INSERT, UPDATE, DELETE)
**Using clause:** `USING (true)` — all authenticated users have unrestricted access to all rows.

Applied to all 17 tables (per `docs/archive/08-payment-tracking-dashboard-rls.md`):

| Table | RLS Enabled | Policy |
|-------|-------------|--------|
| `customers` | Yes | `authenticated_full_access FOR ALL USING (true)` |
| `contractors` | Yes | same |
| `suppliers` | Yes | same |
| `tax_rates` | Yes | same |
| `units` | Yes | same |
| `materials` | Yes | same |
| `vehicles` | Yes | same |
| `app_users` | Yes | same |
| `purchase_orders` | Yes | same |
| `purchase_order_items` | Yes | same |
| `material_issues` | Yes | same |
| `material_issue_items` | Yes | same |
| `invoices` | Yes | same |
| `invoice_items` | Yes | same |
| `invoice_slip_links` | Yes | same |
| `stock_ledger` | Yes | same |
| `company_settings` | Yes | same |

RLS does block anonymous (unauthenticated) requests at the database level. No authenticated user is restricted from any table or row.

---

## Permission Matrix

`A` = Allowed for all authenticated users. `—` = Not applicable.

| Action | customers | suppliers | contractors | materials | units | tax_rates | vehicles |
|--------|-----------|-----------|-------------|-----------|-------|-----------|---------|
| View list | A | A | A | A | A | A | A |
| Create | A | A | A | A | A | A | A |
| Edit | A | A | A | A | A | A | A |
| Soft-delete (deactivate) | A | A | A | A | A | A | A |
| Reactivate | A | A | A | A | A | A | A |
| Hard-delete | — | — | — | — | — | — | — |

| Action | purchase_orders | material_issues | invoices | stock_ledger | company_settings |
|--------|----------------|-----------------|----------|-------------|-----------------|
| View list | A | A | A | A (via stock history) | A |
| Create (draft) | A | A | A | — | — |
| Edit (draft) | A | A | A | — | A (upsert) |
| Receive / Issue (confirm) | A | A | — | — | — |
| Edit (confirmed) | A | A | A (payment only) | — | — |
| Delete (draft) | A | A | A | — | — |
| Delete (confirmed) | A (with stock check) | A (if not invoiced) | — | — | — |
| Finalize | — | — | A | — | — |
| Cancel | — | — | A | — | — |
| Manual stock adjustment | — | — | — | A (via adjustStock) | — |
| Export to PDF | A | A | A | — | — |
| View reports | A | A | A | — | — |

---

## Authentication Enforcement Layer

| Layer | Enforces? | Evidence |
|-------|-----------|---------|
| Middleware (Next.js) | Yes — redirects unauthenticated requests to `/login` | `middleware.ts:33–42` |
| Database (Supabase RLS) | Yes — blocks anonymous Supabase client calls | RLS policy on all 17 tables |
| Server actions | Partially — most actions rely on middleware; only `adjustStock` and `cancelInvoice` explicitly read the session to extract the username | `stock.actions.ts:263`, `invoices.actions.ts` |

---

## Frontend-Only Permission Checks

**None found.** All permission logic is either in the middleware or the server actions. There are no client-side permission gates that are not also enforced server-side.

---

## Security Gaps

| Gap | Severity | Evidence |
|-----|----------|---------|
| No RBAC — all users are admins | High | No role field in `app_users`; no role check in any action |
| No per-record ownership — any user can edit/delete any record created by another user | Medium | No `created_by` field on transactions |
| `adjustStock` and `cancelInvoice` extract username from session for audit trail, but most other write operations record no author | Medium | Only `adjusted_by` field exists on `stock_ledger`; no `created_by`/`updated_by` on POs, MI slips, or invoices |
| Supabase service role key exists in `.env.local` — if any server action accidentally used it instead of the anon key, RLS would be bypassed entirely | Medium | `.env.local.example` shows `SUPABASE_SERVICE_ROLE_KEY` |

---

## Notes for Future Phases

- Phase 10 (security review) should evaluate whether a single-user-role model is acceptable for this client, or whether at least a read-only viewer role is needed.
- If multi-user access is added in future, the lack of `created_by` on transactions means there is no audit trail for who created which PO or invoice.
