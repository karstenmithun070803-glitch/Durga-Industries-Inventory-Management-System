-- =============================================================================
-- RESET, KEEPING REFERENCE DATA ONLY
-- Clears all transactions AND the materials / customers / vehicles masters.
--
-- Preserves: suppliers, units, tax_rates, stages, contractors,
--            app_users (auth), company_settings (app config)
--
-- Stages survive but come back with no material lines: stage_materials
-- references materials with ON DELETE RESTRICT, so it must go when materials do.
--
-- Run via scripts/run-reset.ts (preferred — it pre-flights the table list first)
-- or paste into the Supabase SQL Editor.
-- =============================================================================

-- Children first. Every table is named explicitly; CASCADE is only a backstop.
--
-- Two of these would NOT be reached by CASCADE and must stay in this list:
--   stock_ledger    - reference_id is a polymorphic uuid with no FK, so
--                     truncating purchase_orders/material_issues leaves it
--                     behind as orphaned rows pointing at nothing.
--   invoice_insurance - the FK to invoices deliberately omits cascade (see the
--                     schema comment re: cancelInvoice + Finalized bills).
TRUNCATE TABLE
  invoice_insurance_items,
  invoice_insurance,
  invoice_slip_links,
  invoice_items,
  invoices,
  material_issue_items,
  material_issues,
  purchase_order_items,
  purchase_orders,
  stock_ledger,
  stage_materials,
  vehicles,
  materials,
  customers
RESTART IDENTITY CASCADE;

-- No `UPDATE materials SET current_stock = opening_stock` here, unlike
-- reset-transactions.sql — the materials rows are gone entirely.
