-- =============================================================================
-- FULL DATA WIPE
-- Clears ALL application data.
-- Preserves: app_users (auth), company_settings (app config)
--
-- Run via Supabase SQL Editor or psql:
--   psql $DIRECT_URL -f scripts/reset-all-data.sql
-- =============================================================================

TRUNCATE TABLE
  -- transaction children
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
  -- master children (reference master parents)
  stage_materials,
  vehicles,
  -- master parents
  stages,
  materials,
  customers,
  contractors,
  suppliers,
  tax_rates,
  units
RESTART IDENTITY CASCADE;
