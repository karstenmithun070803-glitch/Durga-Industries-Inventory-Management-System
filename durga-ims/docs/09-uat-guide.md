# Client UAT Guide — Durga Industries IMS
**Version:** Post Phase 7 | **Date:** May 2026
**Attendees:** Durga Industries owner + operator, developer (Mithun)
**Duration:** Allow 2–3 hours for a thorough first pass

---

## Before the Session

### Setup checklist (do before the client arrives)
- [ ] Open the app and confirm you can log in
- [ ] Verify company name, address, and GSTIN are set correctly in Settings
- [ ] Verify bank details and invoice terms are set in Settings (these appear on PDFs)
- [ ] Have at least one supplier, one customer, one vehicle, and a handful of materials in masters
- [ ] Have a printed copy of a previous real invoice (if any) to compare PDF output
- [ ] Prepare one complete real-world scenario to walk through end-to-end (a recent job)

---

## UAT Workflow Scenarios

Work through these in order — each builds on the previous.

---

### Scenario 1 — Receive Stock via Purchase Order

**Business context:** Supplier delivers materials. Record the PO to bring them into stock.

**Steps:**
1. Go to Transactions → Purchase Orders → New
2. Enter today's date (verify the FY validation: try entering a date from last year → should show an error)
3. Add 2–3 line items with real materials and rates
4. Optionally enter the supplier's own bill number (Supplier Bill No. field)
5. Save as Draft → verify it appears in the PO list with "Draft" status
6. Open the draft, click Mark as Received
7. Go to Stock Dashboard → verify the quantities increased

**What to verify:**
- [ ] Stock numbers match what was received
- [ ] PO Register PDF looks correct (company name, GSTIN, bank details at top)
- [ ] Supplier bill number shows on the PDF if entered
- [ ] PO appears in the Purchases report with correct amounts

**Questions to ask client:**
- Is the PO form missing any field you need in your workflow?
- Is the supplier bill number field useful? Do you need a supplier bill date too?
- Are the PDF columns (material, qty, rate, tax, amount) correct for your records?

---

### Scenario 2 — Issue Materials to a Vehicle/Job

**Business context:** Materials are taken out of stock and issued against a job (vehicle).

**Steps:**
1. Go to Transactions → Material Issues → New
2. Select a vehicle/job from the dropdown
3. Add 3–4 line items — verify the rate auto-fills from the last PO price
4. Assign a contractor to at least one line item
5. Save as Draft → confirm it shows in the list
6. Open the draft → click Confirm Issue
7. Go to Stock Dashboard → verify quantities decreased

**What to verify:**
- [ ] Auto-filled rates match the last PO prices for those materials
- [ ] Stock went down by the correct amounts
- [ ] MI Register PDF looks correct
- [ ] Slip number is sequential (MI-0001, MI-0002, etc.)

**Questions to ask client:**
- Do the material rates auto-fill correctly from your PO history?
- Is there a scenario where you'd want to override the rate on an MI slip?
- Is the contractor assignment per-item (not per-slip) the right level of detail?
- Any materials where `affects inventory` should be unchecked by default?

---

### Scenario 3 — Create and Finalize an Invoice

**Business context:** Job is complete. Bill the customer.

**Steps:**
1. Go to Invoice → New Invoice
2. Select the same vehicle used in Scenario 2
3. The MI slips for that vehicle appear — tick the ones to include
4. Verify line items auto-populate from the MI slips (materials, qty, rate)
5. Check the customer's GSTIN auto-determines CGST+SGST or IGST correctly
6. Enter a bill date (try a date outside the current FY → should block)
7. Save as Draft → review the PDF preview
8. Finalize the invoice

**What to verify:**
- [ ] Customer copy PDF: company letterhead, customer address, correct GST breakdown
- [ ] Insurance copy PDF: HSN codes, full GST columns, rate date if applicable
- [ ] Bank details appear at the bottom of both PDFs
- [ ] Invoice terms appear in the footer
- [ ] Bill number is sequential with the right prefix (e.g. D-00001)
- [ ] Amount in words is correct (Indian number system)

**Questions to ask client:**
- Does the customer PDF layout match what you send to customers?
- Does the insurance PDF have all columns the insurance company needs?
- Is the "rate date" field on insurance invoices something you use? What does it represent?
- Should finalized invoices be editable? (Currently: yes, revert to draft first)
- Is the bill number prefix correct? (Set via Tax Master)

---

### Scenario 4 — Record Payment on an Invoice

**Business context:** Customer pays. Track receipt against the invoice.

**Steps:**
1. Open the invoice finalized in Scenario 3
2. On the invoice list, click the "Unpaid" badge next to the invoice
3. Mark it as Paid, enter the payment date
4. Verify the home dashboard Outstanding count decreases
5. Try marking it as Partial — enter a note

**What to verify:**
- [ ] Payment badge updates immediately (Unpaid → Partial → Paid)
- [ ] Home dashboard Outstanding card reflects the change
- [ ] Payment date and notes are visible when you re-open the payment dialog

**Questions to ask client:**
- Is Unpaid / Partial / Paid the right set of statuses? Do you need "Advance" or "Cheque pending"?
- Do you need to record the payment amount (not just status)?
- Do you need to record how payment was made (cash/NEFT/cheque)?

---

### Scenario 5 — Cancel an Invoice

**Business context:** Invoice was created by mistake or customer cancelled.

**Steps:**
1. Create a new draft invoice (don't finalize)
2. Cancel it using the Cancel button
3. Verify it appears in the Cancelled tab in the invoice list
4. Open the cancelled invoice — verify the rose/red banner shows who cancelled it and when
5. Verify the MI slips that were linked are now free again (check they appear in vehicle's available slips)

**What to verify:**
- [ ] Cancelled invoices are permanently marked — cannot be un-cancelled
- [ ] MI slips are freed and can be linked to a new invoice
- [ ] Stock was NOT affected (stock only changes on MI Confirm Issue, not on invoice)

---

### Scenario 6 — Stock Dashboard and Job Cost

**Business context:** Check current stock levels and see what a job cost.

**Steps:**
1. Go to Stock → verify all materials show current stock
2. Find a low-stock material (red/amber row) → click the "Create PO" button → verify it pre-fills
3. Click the history icon on any material → verify ledger shows PO_INWARD and ISSUE entries
4. Click Adjust stock on a material → enter a reason → verify the ledger records the adjustment
5. In the Job Cost panel, search for the vehicle used in Scenario 2
6. Verify all materials, quantities, rates, and costs appear
7. Print the Job Cost PDF

**What to verify:**
- [ ] Stock levels match physical count (if client has done a count)
- [ ] Job cost totals are mathematically correct
- [ ] Low-stock threshold (min level) triggers the correct color coding
- [ ] Job Cost PDF is suitable for management reporting

**Questions to ask client:**
- Are the min/max stock levels set correctly for each material?
- Is the Job Cost useful? Do you need it to include labour/contractor costs?
- Do you want to export the stock data to Excel?

---

### Scenario 7 — Reports

**Business context:** Period-end review — sales, purchases, stock movement.

**Steps:**
1. Go to Reports → Invoice Summary → filter by current FY → view and export CSV
2. Go to Reports → Purchase Report → filter by current FY → export CSV
3. Go to Reports → Monthly Stock Report → select date range → toggle price visibility
4. Go to Reports → Material Costing → search by vehicle used in Scenario 2

**What to verify:**
- [ ] Invoice Summary totals match the invoices created in this session
- [ ] Purchase Report totals match POs created
- [ ] CSV downloads open correctly in Excel
- [ ] Material costing matches the MI slip items

**Questions to ask client:**
- Are these the reports you need for monthly/quarterly review?
- Is there a report you need that's not here?
- Do you need a GST summary report (GSTR-1 format)?

---

### Scenario 8 — Masters Management

**Business context:** Add a new customer, supplier, and material.

**Steps:**
1. Masters → Customers → Add new customer with a GSTIN
2. Enter a wrong GSTIN format → blur the field → verify warning toast appears
3. Masters → Suppliers → Add a supplier
4. Masters → Materials → Add a new material, set min/max stock levels
5. Try to deactivate a customer who has active vehicles → verify the block message

**What to verify:**
- [ ] GSTIN validation shows a useful error (not just "invalid")
- [ ] Deactivation guards work (can't deactivate if linked to active records)
- [ ] Search works on all master lists

---

### Scenario 9 — Settings and PDFs

**Business context:** Verify company info appears correctly on all document types.

**Steps:**
1. Go to Settings → verify all company details (name, address, GSTIN, bank details, terms)
2. Print a Customer Invoice PDF → verify company block at top, bank details at bottom
3. Print an Insurance Invoice PDF → verify GST table, place of supply, authorized signatory
4. Print a PO Register → verify company info at top
5. Print an MI Register → verify company info at top

**What to verify:**
- [ ] Company name and GSTIN are correct on all PDF types
- [ ] Bank details appear correctly on invoice PDFs
- [ ] Invoice terms appear in the PDF footer
- [ ] Authorised signatory line is correct

**Questions to ask client:**
- Should the company logo appear on PDFs? (Currently not implemented — needs your logo file)
- Is "Authorised Signatory" the right label, or should it say a specific person's name?
- Are the invoice terms text correct?

---

## Home Dashboard Walkthrough

Show the client the home dashboard and explain each section:

| Section | What it shows |
|---------|--------------|
| Outstanding | Finalized invoices not yet marked Paid — count + total amount |
| Out of Stock | Materials at zero + count of materials below min level |
| FY Sales | Total of all finalized invoices this financial year |
| FY Purchases | Total of all received POs this financial year |
| Recent POs | Last 5 purchase orders |
| Recent MIs | Last 5 material issue slips |
| Recent Invoices | Last 5 invoices with payment status |

**Questions to ask client:**
- Is this the right information to see first thing in the morning?
- Would you want to see anything else on this screen?
- Is the Outstanding amount useful for following up on payments?

---

## Known Gaps — Tell the Client Upfront

Be transparent about what is not yet built. This prevents surprises and builds trust.

| Item | Status | Timeline |
|------|--------|----------|
| Company logo on PDFs | Not built — needs your logo file | Phase 8 (after this session) |
| Financial year switching | Infrastructure ready, no UI switcher yet | Phase 8 |
| GSTR-1 export | Not built | Phase 8 (confirm if needed) |
| User roles (owner vs staff) | Everyone has full access currently | Phase 8 |
| Mobile phone access | Not optimised for phones | Phase 8 (confirm if needed) |
| Rate date on customer invoice PDF | Not shown | Phase 8 (clarify what it means) |

---

## Feedback to Collect

Use this section to take notes during the session.

### Business rule clarifications needed
- **Rate date field** — What does "rate date" mean for insurance invoices? Is it the date the material rate was agreed, or the contract rate date?
- **Conversion value on materials** — There's a "conversion value" field (currently stores data but unused in calculations). What was this intended for? Purchase unit → sales unit conversion?
- **Material margin %** — Was there ever a plan to show margin on invoices? If so, what's the business rule?

### Client feedback (fill during session)

| Screen | Feedback | Action Required |
|--------|----------|-----------------|
| | | |
| | | |
| | | |

### Features client requests (not in current build)

| Feature requested | Priority (H/M/L) | Phase |
|-------------------|-----------------|-------|
| | | |
| | | |

---

## After the Session

### Immediate actions
- [ ] Update TASK_LIST.md with any new items uncovered
- [ ] Fix any critical bugs found during UAT
- [ ] Capture client feedback in a follow-up document
- [ ] Confirm Phase 8 priorities based on what the client asked for

### Sign-off criteria
UAT is considered passed when:
- All 9 scenarios complete without data corruption or crashes
- Client confirms the core workflow (PO → MI → Invoice) matches their real process
- PDF outputs are acceptable for sending to customers and insurance companies
- Client understands all known gaps and agrees to proceed

---

---

## New Questions — Pre Go-Live Checklist

These questions are separate from the 9 UAT scenarios above. They must be answered **before the client goes live** — they are go-live blockers or will cause confusion on day 1 if not resolved.

---

### A — Opening Stock (Critical)

The system starts with zero stock for every material. Before real work begins, current warehouse stock levels must be entered.

**Questions to ask:**
- Have you done a recent physical stock count? If yes, when?
- Do you want to enter opening stock via the **Stock Adjustment** tool (Stock page → Adjust) for each material?
- What date do you want to treat as the official go-live date? (All stock adjustments should be dated that day)
- Should opening stock adjustments carry a reason like "Opening balance — [date]"?

**Action required:** Do not go live until opening stock is entered. Every MI slip after go-live will reduce from zero otherwise.

---

### B — Invoice and PO Number Continuity (Critical)

The system starts bill numbers from **D-00001** and PO numbers from **PO-0001** for FY 2026-2027. If the client has already issued invoices or placed orders manually since April 1, 2026, the system will generate duplicate numbers — which is illegal under GST.

**Questions to ask:**
- Have you issued any invoices since April 1, 2026? What was the last invoice number?
- Have you raised any purchase orders since April 1, 2026? What was the last PO number?

**If yes:** The starting sequence in the system needs to be adjusted before the first real invoice/PO is created. (This requires a one-time DB fix — flag for developer.)

---

### C — Customer GSTIN Verification (Critical)

Every invoice's GST type (CGST+SGST vs IGST) is determined entirely by the customer's GSTIN state code. A missing or incorrect GSTIN means the wrong tax is applied — this is a legal compliance issue.

**Questions to ask:**
- Have all your regular customers been entered in the system with their correct GSTIN?
- For customers without a GSTIN (unregistered individuals or small businesses), do you still issue them formal GST invoices? How do you currently handle tax for them?
- Can you show your CA's or accountant's customer list and verify it matches what's in the system?

---

### D — HSN Codes (Critical for Insurance Invoices)

Insurance company PDFs require an HSN code on every line item. Materials without HSN codes will show a blank HSN column on the PDF, which the insurance company may reject.

**Questions to ask:**
- Have HSN codes been filled in for all materials in the Materials master?
- Who provided the HSN codes — your CA or accountant?
- Are there any materials where you are unsure of the correct HSN code?

**Tip:** Go to Masters → Materials → check each material's HSN field. Any blank = needs to be filled before the insurance PDF is used.

---

### E — Go-Live Date and Historical Data (Important)

**Questions to ask:**
- When do you plan to start using this system for real, day-to-day work?
- Between April 1, 2026 and the go-live date, have you done jobs and issued invoices manually? Do you want to enter those into the system, or start fresh from the go-live date?
- If starting fresh: are you comfortable that old jobs won't appear in stock history or reports?

---

### F — "Affects Inventory" Flag (Important)

On every Material Issue slip, each line item has an **Affects Inventory** checkbox. When checked, issuing that material reduces your warehouse stock. When unchecked, the material appears on the slip but does NOT reduce stock.

**Questions to ask:**
- Are there materials you issue on slips that you do NOT want to deduct from warehouse stock? (Examples: materials bought specifically for one job and never stored in your warehouse, or small consumables you don't track)
- For each such material, should "Affects Inventory" be unchecked by default in the Material master?

---

### G — Contractor Tracking (Important)

Each line item on a Material Issue slip can be assigned to a specific contractor. This is for tracking which contractor used which materials.

**Questions to ask:**
- Do you work with outside contractors (labour contractors, fabricators, etc.)?
- If yes, are all your regular contractors entered in Masters → Contractors?
- Is assigning a different contractor per material line item how your work is structured — or do you assign one contractor to the whole job?
- If you don't use contractors at all, leave the contractor field blank — it is optional.

---

### H — Internet and Daily Users (Nice to Have)

**Questions to ask:**
- Is there reliable internet at the Durga Industries premises where this app will be used?
- Who will use the app day-to-day — the owner only, or also a staff member?
- If a staff member uses it, are you comfortable that they currently have full access (same as the owner)? User roles are planned for Phase 8.

---

### I — Reverse Charge (Nice to Have)

The invoice form has a **Reverse Charge** checkbox. Under GST reverse charge, the buyer (your customer) is responsible for paying the tax directly to the government instead of you.

**Questions to ask:**
- Do any of your customers ever ask you to issue invoices under reverse charge?
- Do you receive any services where reverse charge applies to you as the buyer? (Examples: goods transport by road, legal services, security services)
- If reverse charge is not relevant to your business, this checkbox can simply be ignored.

---

## Session Notes

*(Fill during UAT)*

**Date:**
**Attendees:**
**App URL:**
**Overall verdict:** Pass / Fail / Pass with conditions

**Critical issues found:**

**Minor issues found:**

**Client sign-off:** Yes / No / Conditional

**Conditions for sign-off:**
