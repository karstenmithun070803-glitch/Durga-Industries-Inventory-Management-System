# Architectural Decisions — Durga Industries IMS

Design decisions that require human input before a fix can be applied.

Format:
```
## AD-[NUMBER] — [Short description]
- **Discovered in:** Phase X, Bug BUG-X-XXX
- **The problem:** [Clear description]
- **Why this can't be auto-fixed:** [Explain the tradeoff]
- **Option A:** ...pros/cons/effort
- **Option B:** ...pros/cons/effort
- **Recommendation:** Option X because [reasoning]
- **Decision:** PENDING
```

<!-- Entries will appear below -->

---

## AD-4-001 — Non-atomic PO number generation (`getNextPONumber`)

- **Discovered in:** Phase 4, OBS-4-001
- **The problem:** `getNextPONumber()` uses `SELECT MAX(po_number) + 1`. If two users submit a PO creation form at the same millisecond, both calls read the same MAX and attempt to insert the same `po_number`. The DB UNIQUE constraint blocks the second insert and returns a raw Postgres error (`duplicate key value violates unique constraint "po_number_fy_unique"`).
- **Why this can't be auto-fixed:** The options have different tradeoffs. A non-breaking fix (catch + retry) is low-effort but doesn't prevent the confusing error. A breaking fix (DB SEQUENCE) would require a migration.
- **Option A:** Wrap the `createPurchaseOrder` insert in a try/catch that translates the unique constraint error into `"PO number was taken by another user — please try again."` and retries once.  
  Pros: Zero migration, minimal code change.  
  Cons: Retry logic adds complexity; root race still exists.  
  Effort: ~30 min.
- **Option B:** Replace `getNextPONumber()` with a DB SEQUENCE (`po_number_seq` per FY) allocated atomically.  
  Pros: True fix; no race possible; no retry needed.  
  Cons: Requires a migration per FY (or a shared sequence with FY offset logic); more complex.  
  Effort: ~2–3 hours.
- **Recommendation:** Option A for now. The race is near-impossible with 4 users. If the app ever opens to more concurrent users, upgrade to Option B.
- **Decision:** PENDING

---

## AD-4-002 — Server Actions rely on middleware-only auth (no in-function `getUser()`)

- **Discovered in:** Phase 4, Middleware analysis
- **The problem:** 12 of 14 business Server Action files do not call `getUser()` inside the function. Auth relies entirely on Next.js middleware intercepting the request before it reaches the action. This works correctly for the current deployment. However, if any action were ever imported and called from a non-HTTP path (e.g., a background job, a script, or an external API layer), it would execute without auth.
- **Why this can't be auto-fixed:** Adding `getUser()` to every action is mechanical but touches 12 files. The risk of introducing bugs during that refactor outweighs the theoretical risk for a 4-user internal tool.
- **Option A:** Leave as-is. Document the design in this file. If the app ever exposes actions via a public API or background jobs, add in-function auth then.  
  Pros: No risk, no refactor.  
  Cons: Relies on middleware as a single point of auth enforcement.  
  Effort: 0.
- **Option B:** Add a shared `requireAuth()` helper and call it at the top of each business action.  
  Pros: Defense-in-depth; actions self-protect.  
  Cons: Refactor touches 12 files; must re-test all affected actions.  
  Effort: ~4–6 hours.
- **Recommendation:** Option A. The 4-user internal tool context makes Option B unnecessary now. Revisit if the app becomes multi-tenant or exposes a public API.
- **Decision:** PENDING

---

## AD-4-003 — No `user_id` ownership columns on transactional records

- **Discovered in:** Phase 4, ID authorization analysis
- **The problem:** `purchaseOrders`, `invoices`, `materialIssues` have no `user_id` or `owner_id` column. Any authenticated user can edit or delete any other user's records by knowing the ID.
- **Why this can't be auto-fixed:** Adding ownership columns requires a schema migration, backfill, and updating every action that reads/writes these tables. The app is intentionally a shared workspace for a small team — ownership isolation may not be desired.
- **Option A:** Accept the current behavior. For a 4-user team in a single workshop, shared access to all records is normal (one user can fix another's mistakes).  
  Effort: 0.
- **Option B:** Add a `created_by` column and restrict edits/deletes to the creator (except for an admin role).  
  Effort: ~1 day of schema + action changes + UI indicators.
- **Recommendation:** Option A. The 4-user workshop context makes shared-record access a feature, not a bug. Revisit if the app ever serves multiple organizations.
- **Decision:** PENDING
