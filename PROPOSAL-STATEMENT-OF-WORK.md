# Statement of Work & Technical Architecture Proposal
**Project:** Enterprise Inventory & Manufacturing ERP
**Prepared For:** Sabari Steels
**Prepared By:** Mithun

## 1. Executive Summary
The objective of this project is to architect and develop a bespoke, cloud-native Enterprise Resource Planning (ERP) and Inventory Management System. The application will migrate the existing legacy desktop software to a highly scalable, web-based platform. Key objectives include real-time inventory reconciliation, stage-wise manufacturing tracking, and automated GST-compliant financial invoicing.

## 2. Technical Architecture
To ensure high availability, security, and future scalability, the application will be built on a modern, enterprise-grade technology stack:
*   **Frontend Framework:** Next.js (React) for server-side rendering and optimized performance.
*   **UI/UX Design System:** Tailwind CSS paired with shadcn/ui for a clean, accessible, and dashboard-optimized user interface.
*   **Backend & Database:** Supabase (PostgreSQL) providing a robust relational database, row-level security (RLS), and automated daily backups.
*   **Infrastructure & Deployment:** Vercel (Edge Network) for global, low-latency application delivery.

## 3. Core Database Entities & Modules
The system's relational database will be structured around three primary domains:

### 3.1. Master Data Management (MDM)
*   **Entities:** Customers, Vehicles, Suppliers, Materials, Stages, Units, and Tax Brackets (GST/HSN mappings).
*   **Function:** Serves as the single source of truth for all standard variables used across transactional workflows.

### 3.2. Transactional Workflows
*   **Purchase Orders (PO):** Supplier-wise material aggregation.
*   **Purchase Inward:** Stock receiving and ledger adjustments.
*   **Job Management:** Delivery Challans (New Vehicles) and Estimates (Old Vehicles) with stage-wise material allocation.

### 3.3. Financials & Invoicing
*   **Dynamic Taxation Engine:** Real-time calculation of CGST/SGST based on HSN master data.
*   **Dual-Rate Logic:** Conditional rendering of rates (With GST for Insurance billing vs. Without GST for direct retail).

## 4. The Inventory Engine (Double-Entry Ledger)
Unlike standard CRUD (Create, Read, Update, Delete) applications, this system implements a dynamic stock reconciliation engine. 
*   **Automated Credits/Debits:** Inventory levels are not manually edited. They are mathematically derived from `Purchase Inward` (Credits) and `Job Allocations/Challans` (Debits).
*   **State Rollback:** If a transactional document (like an Estimate) is edited or deleted, the associated materials are automatically re-credited to the warehouse master stock, preventing data drift and ensuring physical-to-digital parity.

## 5. Development Milestones & Timeline
The project will be executed over a strict 7-week timeline to ensure rigorous QA and UAT testing of financial logic.

*   **Week 1:** Database Schema Design & Architecture Setup
*   **Week 2:** Master Data Management (MDM) Development
*   **Week 3-4:** Transaction Workflows (PO, Inwards, Jobs)
*   **Week 5:** Inventory Engine & Automated Stock Ledger
*   **Week 6:** Tax Math, Invoicing, and PDF Generation
*   **Week 7:** User Acceptance Testing (UAT), UI Polish, and Production Deployment

## 6. Financial Investment
Total project cost covers full-stack architecture, development, and testing.

| Phase | Description | Cost (INR) |
| :--- | :--- | :--- |
| **Phase 1** | Architecture & Database Schema Design | ₹20,000 |
| **Phase 2** | Master Data Modules | ₹30,000 |
| **Phase 3** | Transactions & Job Management | ₹45,000 |
| **Phase 4** | Dynamic Inventory Engine (Stock Ledger) | ₹40,000 |
| **Phase 5** | Financials, Invoicing & Reporting Logic | ₹35,000 |
| **Phase 6** | QA Testing, UI Polish & Deployment | ₹20,000 |
| | **Total Project Investment** | **₹1,90,000** |

### Payment Schedule
*   **20% Advance:** ₹38,000 (Project Kickoff)
*   **30% Milestone 1:** ₹57,000 (Upon delivery of Masters & Transactions)
*   **30% Milestone 2:** ₹57,000 (Upon delivery of Inventory Engine & Invoicing)
*   **20% Final Handover:** ₹38,000 (Upon UAT sign-off and deployment)

## 7. Ongoing Infrastructure (Client Paid)
To maintain enterprise-grade security and uptime, the following third-party infrastructure costs will be billed directly to the client at cost:
*   **Supabase (Database Pro Plan):** ~$25 / month (Includes automated daily backups and SLA).
*   **Vercel (Hosting Pro Plan):** ~$20 / month (Commercial tier hosting).
*   **Custom Domain:** ~$12 / year.

---
*This document outlines the technical and financial parameters of the proposed software build. The architectural choices guarantee a system that is scalable, secure, and mathematically sound for financial compliance.*
