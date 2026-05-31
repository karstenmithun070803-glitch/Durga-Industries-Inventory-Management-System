# Durga Industries IMS — Task List & Progress Tracker
Last Updated: 2026-05-31 (post 7.1/7.3/7.7 implementation)

## STATUS KEY
[ ] Not started | [→] In progress | [x] Done | [!] Blocked | [~] Partial

## PHASE NAMING NOTE
The phase numbers here (1–8) are the **project-level phases**. During development, we tracked invoice improvements in separate internal iterations ("invoice iteration 1, 2, 3") — do not confuse those with these project phases. The invoice work is all part of **Phase 5** here.

---

## PHASE 1 — Foundation ✅ COMPLETE
[x] 1.1 Initialize Next.js 14 App Router project with TypeScript
[x] 1.2 Install and configure Tailwind CSS + shadcn/ui
[x] 1.3 Install Drizzle ORM + Supabase client (@supabase/supabase-js)
[x] 1.4 Install @react-pdf/renderer
[x] 1.5 Create Supabase project + migrate all tables (16 tables live in Supabase)
[x] 1.6 Create /src/lib/db/schema.ts with all tables
[x] 1.7 Apply all schema rules: UUID PKs, soft deletes, updated_at, GST split columns, tax lock, affects_inventory, composite unique constraints, current_stock CHECK >= 0
[ ] 1.8 Set up Cloudflare Workers deployment with OpenNext adapter — DEFERRED to Phase 7
[x] 1.9 Set up Supabase Auth integration (@supabase/ssr, middleware route protection)
[x] 1.10 Create login page — Auth user created (username: mithun → mithun@durgaindustries.internal)
[x] 1.11 Create full project folder structure
[x] 1.12 Create CORE_RULES.md in project root
[x] 1.13 OWNER REVIEW: Schema approved ✓

---

## PHASE 2 — Masters Module ✅ COMPLETE
[x] 2.1 Build reusable <MasterLayout /> component
[~] 2.2 Build reusable <DataTable /> — SKIPPED intentionally, each master has inline table
[x] 2.3 Customer Master — form + data table + add/edit/soft-delete/reactivate
[x] 2.4 Supplier Master — form + data table + add/edit/soft-delete/reactivate
[x] 2.5 Unit Master — form + data table
[x] 2.6 Tax Master — form + data table (inv_prefix field drives bill number prefix)
[x] 2.7 Contractor Master — form + data table (role + contact fields)
[x] 2.8 Material Master — form + data table + current_stock as read-only display
[x] 2.9 Vehicle/Job Master — form + data table + deactivation guards
[x] 2.10 Combobox component used across all master forms (src/components/ui/combobox.tsx)
[x] 2.11 ConfirmDialog used for all deactivate/delete actions
[x] 2.12 Financial Year context provider (FYProvider + useFY hook)

### Phase 2 — Extra work done beyond original scope
[x] 2.A Reactivation of soft-deleted records across all masters
[x] 2.B Search/filter on all master list pages
[x] 2.C Vehicle deactivation blocked if has Draft or Finalized invoices, or Draft MI slips
[!] 2.D Customer deactivation has NO guard against active vehicles — gap to fix in Phase 6

---

## PHASE 3 — Purchase Orders ✅ COMPLETE
[x] 3.1 Reusable <TransactionGrid /> component (src/components/forms/TransactionGrid.tsx)
[x] 3.2 Purchase Orders page — per-item supplier
[x] 3.3 Line item grid (material code, name, supplier, qty, unit, rate, tax%, CGST, SGST, IGST, amount)
[x] 3.4 Save as Draft
[x] 3.5 Mark as Received (atomic stock addition, respects affects_stock flag)
[x] 3.6 Edit received PO (atomic reverse + reapply stock)
[x] 3.7 Delete received PO (blocks if reversal causes negative stock, atomic reversal)
[x] 3.8 PO Register PDF — print with optional rate column (Insurance-style layout)
[x] 3.9 Stock Ledger — PO_INWARD entries on receive, REVERSAL on edit/delete

### Phase 3 — Extra work done beyond original scope
[x] 3.A "Update Stock" (affects_stock) checkbox on PO header
[x] 3.B Per-item GST type frozen at entry time (from supplier GSTIN state code)
[x] 3.C PO list — date range filter, status tabs, search
[x] 3.D Server-side validation: supplier per item, duplicate detection, zero-rate confirmation
[x] 3.E Header supplier_id auto-derived from items

---

## PHASE 4 — Material Issues ✅ COMPLETE
[x] 4.1 Material Issue page — header form (vehicle auto-fills customer + GST type)
[x] 4.2 Line item grid — material, qty, rate (auto-filled from last PO price), contractor per item, affects_inventory checkbox
[x] 4.3 Save as Draft (no stock impact)
[x] 4.4 Confirm Issue (Draft → Issued, atomic stock deduction for affects_inventory rows)
[x] 4.5 Edit Issued slip (atomic reverse old deductions + apply new, amber warning banner)
[x] 4.6 Delete Draft slip (no stock impact, cascade delete items)
[x] 4.7 Delete Issued slip (atomic stock reversal; blocked if slip is linked to an invoice)
[x] 4.8 GST logic — GSTIN-first: state code 33 = CGST+SGST, else IGST, frozen at entry
[x] 4.9 MI Register PDF — print with optional rate column
[x] 4.10 Stock Ledger — ISSUE entries on confirm; REVERSAL on edit/delete

### Phase 4 — Extra work done beyond original scope
[x] 4.A Per-item contractor assignment (not vehicle-level)
[x] 4.B Zero-rate confirmation requirement (explicit checkbox to allow ₹0 rate)
[x] 4.C Duplicate detection (same material + contractor + rate on one slip)
[x] 4.D Slip number preview (peekNextSlipNumber) shown before save
[x] 4.E MI slip deletion blocked if linked to an invoice (guard added in Phase 5)
[x] 4.F Date range filter, status tabs, search on list page

---

## PHASE 5 — Invoice ✅ COMPLETE
[x] 5.1 Invoice page — bill number auto-assigned with Tax Master prefix (e.g., D-00001)
[x] 5.2 Line item grid — material, qty, unit, rate, tax%, CGST/SGST/IGST, amount
[x] 5.3 GST logic — GSTIN-first same as Material Issue; frozen at item level in DB
[x] 5.4 GST rounding at line-item level; net amount stored in DB (not recalculated)
[x] 5.5 Insurance Company PDF — full GST breakdown, HSN column, amount in words
[x] 5.6 Customer/Direct PDF — simplified, no tax columns, same net amount
[x] 5.7 Discount hard block (cannot exceed gross total)
[x] 5.8 Reverse charge handling — checkbox + amber alert + PDF footnote

### Phase 5 — Extra work done beyond original scope
[x] 5.A Three invoice statuses: Draft → Finalized → Cancelled (permanent void)
[x] 5.B Cancel Invoice action — frees MI slips, keeps GST record permanently
[x] 5.C Revert Finalized → Draft
[x] 5.D MI Slip auto-populate — vehicle selection loads all Issued slips, auto-checks all, populates grid
[x] 5.E MI slip checklist — check/uncheck slips to add/remove items from grid
[x] 5.F Auto-merge duplicate rows — same material+rate from two slips becomes one row (summed qty)
[x] 5.G Double-billing guard — invoice_slip_links junction table prevents same slip in two invoices
[x] 5.H Customer data snapshot — name, GSTIN, state, address frozen at invoice creation (GST audit trail)
[x] 5.I Customer address shown in both PDFs
[x] 5.J Amount in words (Indian number system: "Rupees One Lakh Twenty Thousand Only")
[x] 5.K Place of Supply label in PDFs (GST legal requirement)
[x] 5.L Authorised Signatory block in PDFs (bottom right, with company name)
[x] 5.M Print buttons in invoice view and edit modes (single invoice PDF)
[x] 5.N Bulk PDF — print all filtered invoices at once from the list page
[x] 5.O Cancelled invoice tab + rose badge in list; read-only form with permanent banner
[x] 5.P Slip checklist in view mode — shows which MI slips sourced the invoice (read-only, for auditors)
[x] 5.Q Bill series read-only in edit mode (locked after creation, displayed as "D — locked at creation")
[x] 5.R Bill number race condition — friendly error message instead of raw Postgres constraint error
[x] 5.S Vehicle deactivation blocked if vehicle has Finalized invoices
[x] 5.T Status filter tabs (All / Draft / Finalized / Cancelled) with counts on list page
[x] 5.U Date range filter + search on list page (bill number, vehicle, customer, material, job no)

### Phase 5 — Company Settings (originally scoped to Phase 7.2, pulled forward)
[x] 5.V company_settings DB table — single row, stores company name, address, GSTIN
[x] 5.W Settings page (/settings) — edit company name, address, GSTIN with live save
[x] 5.X All invoice PDFs read company details from DB (not hardcoded); fallback to constants
[!] 5.Y PO Register PDF and MI Register PDF still use hardcoded company constants — gap

---

## PHASE 6 — Stock Dashboard & Reports ✅ COMPLETE
[x] 6.1 Stock Dashboard — live materials table (current stock, rate, value, color coding for low stock)
[x] 6.2 Stock Dashboard — summary cards (total materials, total stock value, low stock count)
[x] 6.3 Stock Dashboard — Job Search panel (job no → all materials + contractor + total cost, PDF)
[x] 6.4 Stock Dashboard — Manual Stock Adjustment (CONFIRM modal, reason required, cannot go below 0)
[x] 6.5 Reports — Material-wise Costing (filter: vehicle/job/date, includes contractor column, PDF)
[x] 6.6 Reports — Monthly Stock Report (with/without price toggle, opening/closing stock, PDF/Excel)
[x] 6.7 Reports — Purchase Report (filter: supplier/date, PDF/Excel)
[x] 6.8 Reports — Invoice Summary (filter: FY/customer/vehicle, total billed, PDF/CSV)
[x] 6.9 Download buttons — CSV export for invoice list, MI list, PO list

### Phase 6 — Gaps from earlier phases to fix here
[x] 6.A Customer deactivation guard — block if customer has active vehicles (done: customers.actions.ts checks active vehicles before deactivating)
[x] 6.B PO and MI PDFs — connect to company_settings (done: all PDF components accept companySetting prop; page.tsx files fetch and pass it; hardcoded constants used only as fallback)

---

## PHASE 7 — Settings, Polish & Deploy

### NOTE: Phase 7 as originally scoped was not fully implemented.
### What was actually built in Phase 7 is documented in docs/08-payment-tracking-dashboard-rls.md.
### The items below reflect the original plan status — incomplete items carry to Phase 8.

### Phase 7 — Features actually shipped (documented in docs/08-payment-tracking-dashboard-rls.md)
[x] 7.A Supplier Bill Reference on POs — supplier_bill_no + supplier_bill_date fields; shown on PO PDF
[x] 7.B Payment Status Tracking on Invoices — Unpaid / Partial / Paid badge; payment_status + payment_date + payment_notes columns on invoices table
[x] 7.C Home Dashboard — outstanding invoices card, stock alerts (out of stock + below min), FY sales/purchases totals, recent POs/MIs/Invoices
[x] 7.D Vehicle Type in Job Cost & Reports — vehicle_type column on vehicles; shown in job cost panel and invoice summary report
[x] 7.E Bank Details & Terms on Invoice PDFs — bank_name/account/IFSC/branch + invoice_terms stored in company_settings; printed on customer and insurance PDFs
[x] 7.F Low-stock → Create PO shortcut — button on stock dashboard row pre-fills new PO with the material
[x] 7.G RLS enabled on all 17 tables — authenticated_full_access policy FOR ALL TO authenticated USING (true)
[x] 7.H Centralised constants — src/lib/constants.ts (all status enums); src/lib/fy.ts (single source for FY logic)

[x] 7.1 Settings — Financial Year switching — getFYOptions() added to fy.ts; sidebar footer replaced with <select> dropdown using useFY(); sessionStorage persistence added to FYProvider (tab-scoped); FYBanner now activates automatically
[~] 7.2 Settings — PDF config — PARTIAL: company name/address/GSTIN done; logo upload NOT done (deferred to Phase 8)
[x] 7.3 Global financial year context — reports-client.tsx reads activeFY from useFY(); invoice-summary, purchase-report, monthly-stock all reset their filters via useEffect when activeFY changes; invoice list also wired to re-fetch on FY change (was missing, now fixed)
[x] 7.4 Historical year amber banner — fully operational now that 7.1 FY switcher is built; amber dot also shown in sidebar when viewing historical FY
[x] 7.5 GSTIN format validation — shared validateGstinFormat() in utils.ts; blur warning toast on customer/supplier/settings forms; settings save blocked if regex fails
[x] 7.6 Cross-year date validation — isDateInFY() in fy.ts; blocks PO save, Invoice draft/finalize, MI draft/reapply/confirm if date outside activeFY
[x] 7.7 Session timeout handling — middleware detects prior Supabase cookie and redirects to /login?reason=session_expired; login page shows amber "session expired" info box; AuthSessionGuard client component in dashboard layout catches in-app token expiry via onAuthStateChange and shows Sonner toast before redirecting
[ ] 7.8 Mobile responsiveness pass (Dashboard + Reports pages only) — NOT done
[ ] 7.9 End-to-end testing: PO → Received → MI → Issued → Invoice → Finalize → Stock Dashboard — NOT done (no test files exist)
[x] 7.10 Deploy to Vercel production (hosting decision changed from Cloudflare Workers to Vercel; app is live on Vercel)
[ ] 7.11 Client UAT with Durga Industries owner — NOT done

---

## PHASE 8 — Future (Post-Launch)
[ ] 8.1 User role-based access control (owner vs staff)
[ ] 8.2 Company logo upload in Settings (Supabase Storage bucket)
[ ] 8.3 Material Margin % on invoices (pending client decision on business rule)
[ ] 8.4 GSTR-1 export for GST portal filing
[ ] 8.5 e-Invoice / IRN generation (only mandatory above ₹5 Cr turnover)
[ ] 8.6 Rate Date on invoices — clarify with client what this field means

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
- Max concurrent users: 4 (same access level for now, roles deferred to Phase 8)
- All stock math: server-side only, atomic DB transactions, never client-side
- Hosting: Vercel (switched from original Cloudflare Workers plan; app deployed and live)
- Database: Supabase free tier (real-time built-in, 500MB, 200 concurrent connections)
- Auth: Supabase Auth + @supabase/ssr, username-only login (maps to username@durgaindustries.internal)
- RLS: ENABLED on all 17 tables (Phase 7). Policy: authenticated_full_access FOR ALL TO authenticated USING (true).
- Invoice module documentation: INVOICE-MODULE-DOCUMENTATION.md
