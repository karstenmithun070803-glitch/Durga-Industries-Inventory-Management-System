-- =============================================================================
-- RESET TRANSACTIONAL DATA
-- Clears all transactions while preserving master data
-- (customers, suppliers, materials, vehicles, stages, units, tax_rates,
--  contractors, company_settings, app_users)
--
-- Run via Supabase SQL Editor or psql:
--   psql $DIRECT_URL -f scripts/reset-transactions.sql
-- =============================================================================

-- Children first, then parents; CASCADE handles any remaining FK edges
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
  stock_ledger
RESTART IDENTITY CASCADE;

-- Reset derived stock back to the opening balance on each material
UPDATE materials SET current_stock = opening_stock;
