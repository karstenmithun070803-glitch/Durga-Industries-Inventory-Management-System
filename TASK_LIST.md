# Durga Industries IMS — Task List & Progress Tracker
Last Updated: 2026-05-20

## STATUS KEY
[ ] Not started | [→] In progress | [x] Done | [!] Blocked

---

## PHASE 1 — Foundation (Week 1)
[ ] 1.1 Initialize Next.js 14 App Router project with TypeScript
[ ] 1.2 Install and configure Tailwind CSS + shadcn/ui
[ ] 1.3 Install Drizzle ORM + Supabase client (@supabase/supabase-js)
[ ] 1.4 Install @react-pdf/renderer
[ ] 1.5 Create Supabase project (get URL + anon key → add to .env.local)
[ ] 1.6 Create /src/db/schema.ts with all tables (see CLAUDE_CONTEXT.md Section 6)
[ ] 1.7 Apply all schema rules: UUID PKs, soft deletes, updated_at, GST split columns, tax lock, affects_inventory, composite unique constraints, current_stock CHECK >= 0
[ ] 1.8 Set up Cloudflare Workers deployment with OpenNext adapter
[ ] 1.9 Set up Supabase Auth + username-to-internal-email mapping (app_users table)
[ ] 1.10 Create login page (/src/app/(auth)/login/page.tsx) — username + password fields only
[ ] 1.11 Create full project folder structure (empty placeholder files)
[ ] 1.12 Create CORE_RULES.md in project root
[ ] 1.13 OWNER REVIEW: Schema approval before any UI work begins

---

## PHASE 2 — Masters Module (Week 2)
[ ] 2.1 Build reusable <MasterLayout /> component (shared by all masters pages)
[ ] 2.2 Build reusable <DataTable /> component (sortable, searchable, compact, sticky headers)
[ ] 2.3 Customer Master — form + data table + add/edit/soft-delete
[ ] 2.4 Supplier Master — form + data table + add/edit/soft-delete
[ ] 2.5 Unit Master — form + data table
[ ] 2.6 Tax Master — form + data table (inv_prefix field drives bill number prefix)
[ ] 2.7 Contractor Master — form + data table (role + contact fields)
[ ] 2.8 Material Master — form + data table + current_stock as read-only display
[ ] 2.9 Vehicle/Job Master — form + data table (no contractor assignment here)

---

## PHASE 3 — Purchase Orders (Week 3)
[ ] 3.1 Build reusable <TransactionGrid /> component (inline editable rows, Tab/Enter keyboard flow)
[ ] 3.2 Purchase Orders page — header form (supplier dropdown, date, status)
[ ] 3.3 Purchase Orders — line item grid (material, qty, unit, rate, tax%, amounts)
[ ] 3.4 Purchase Orders — Save as Draft
[ ] 3.5 Purchase Orders — Mark as Received (atomic stock addition via Server Action)
[ ] 3.6 Purchase Orders — Edit received PO (atomic reverse + reapply stock)
[ ] 3.7 Purchase Orders — Delete received PO (atomic stock reversal, hard block if stock already issued)
[ ] 3.8 Purchase Orders — PDF generation (CGST+SGST or IGST based on supplier GSTIN)
[ ] 3.9 Stock Ledger — verify PO_INWARD entries created correctly

---

## PHASE 4 — Material Issue / Delivery Challan (Week 4)
[ ] 4.1 Material Issue page — header form (job no auto-fills vehicle/customer/GST from Vehicle Master)
[ ] 4.2 Material Issue — line item grid (material, qty, rate auto-fill from last PO price, contractor dropdown, affects_inventory checkbox)
[ ] 4.3 Material Issue — Save (immediate atomic stock deduction for affects_inventory=TRUE rows)
[ ] 4.4 Material Issue — Edit (atomic reverse old deductions + apply new)
[ ] 4.5 Material Issue — Delete (fully reverse stock deductions for affected rows)
[ ] 4.6 Material Issue — GST logic (GSTIN-first: first 2 digits of customer GSTIN determines CGST+SGST vs IGST)
[ ] 4.7 Material Issue — PDF generation
[ ] 4.8 Stock Ledger — verify ISSUE entries created correctly

---

## PHASE 5 — Invoice (Week 5)
[ ] 5.1 Invoice page — header form (bill number auto-assigned with Tax Master prefix)
[ ] 5.2 Invoice — line item grid
[ ] 5.3 Invoice — GST logic (GSTIN-first, same as Material Issue)
[ ] 5.4 Invoice — Rounding: round cgst/sgst/igst at LINE ITEM level, total = sum of rounded items
[ ] 5.5 Invoice — Insurance Company PDF (full GST breakdown)
[ ] 5.6 Invoice — Customer/Direct PDF (simplified, same Net Amount)
[ ] 5.7 Invoice — Discount hard block (cannot exceed total, Net Amount cannot be negative)
[ ] 5.8 Invoice — Reverse charge handling (alert when rev_charge = TRUE)

---

## PHASE 6 — Stock Dashboard & Reports (Week 6)
[ ] 6.1 Stock Dashboard — live materials table (current stock, rate, value, color coding)
[ ] 6.2 Stock Dashboard — summary cards (total materials, total stock value, low stock count)
[ ] 6.3 Stock Dashboard — Job Search panel (job no → all materials + contractor + total cost, PDF download)
[ ] 6.4 Stock Dashboard — Manual Stock Adjustment (CONFIRM modal, reason required, cannot go below 0)
[ ] 6.5 Reports — Material-wise Costing (filters: vehicle/job/date, output includes contractor column, PDF)
[ ] 6.6 Reports — Monthly Stock Report (with/without price toggle, opening/closing stock, PDF/Excel)
[ ] 6.7 Reports — Purchase Report (filter supplier/date, PDF/Excel)
[ ] 6.8 Download buttons on source pages (PO page, Material Issue page, Invoice page)

---

## PHASE 7 — Settings, Polish & Deploy (Week 7)
[ ] 7.1 Settings — Financial Year (create new year, switch between years)
[ ] 7.2 Settings — PDF config (company name, address, GSTIN, logo upload)
[ ] 7.3 Global financial year context (filters all screens + reports)
[ ] 7.4 Historical year amber banner (persistent, non-dismissable, on all pages)
[ ] 7.5 GSTIN format validation (blur validation, state code cross-check warning)
[ ] 7.6 Cross-year date validation (hard block if transaction date outside active FY)
[ ] 7.7 Session timeout handling (redirect to login, restore sessionStorage form state)
[ ] 7.8 Mobile responsiveness pass (Dashboard + Reports only)
[ ] 7.9 End-to-end testing: Create PO → Mark Received → Create Material Issue → Create Invoice → Check Stock Dashboard
[ ] 7.10 Deploy to Cloudflare Workers production
[ ] 7.11 Client UAT (User Acceptance Testing) with Durga Industries owner

---

## PHASE 8 — Future (Post-Launch, If Needed)
[ ] 8.1 User role-based access control (owner vs staff permissions)

---

## PERMANENTLY EXCLUDED (will never be built)
- Specification Master / Specification Types
- Stage Master / Stage tracking / Materialwise Stages List / Stage Display Order
- Stagewise Costing Report / WIP Materials Report / Planning Report
- Customer Specification / Bill of Materials / Quotation
- DC Material Allocation / Purchase Mat Allocation

---

## BUGS & ISSUES LOG
(Add bugs here as they are discovered during development)
Format: [Date] [Phase] [Description] [Status]

---

## NOTES
- Client: Durga Industries (bus body manufacturer)
- Company state: Tamil Nadu (GST code 33)
- Financial year: India April 1 → March 31 (current: 2026-2027)
- Max concurrent users: 4 (same access level)
- All stock math: server-side only, atomic DB transactions, never client-side
- Hosting: Cloudflare Workers (free, commercial OK) via OpenNext adapter
- Database: Supabase free tier (real-time built-in, 500MB, 200 concurrent connections)
- Auth: Supabase Auth, username-only login (no email shown to users)
- Context document: CLAUDE_CONTEXT.md (paste into every new Claude Code session)
