-- Migration: Fix VMI New item amounts (stored base+tax instead of base only)
-- Run Step 1 first, verify, then run Step 2.
-- Safe to run multiple times — WHERE conditions prevent double-fixing.

-- ─────────────────────────────────────────────────────────────
-- Step 1: Fix item amounts
-- Identifies rows where: amount ≈ qty×rate + tax (wrong)
--                    AND amount ≠ qty×rate (not already correct)
-- Sets:             amount = qty×rate (taxable only, pre-tax)
-- ─────────────────────────────────────────────────────────────

UPDATE material_issue_items
SET amount = (qty::numeric * rate::numeric)::text
WHERE
  ABS(
    amount::numeric
    - (
        qty::numeric * rate::numeric
        + COALESCE(cgst_amount::numeric, 0)
        + COALESCE(sgst_amount::numeric, 0)
        + COALESCE(igst_amount::numeric, 0)
      )
  ) < 0.02
  AND ABS(amount::numeric - (qty::numeric * rate::numeric)) > 0.01;

-- ─────────────────────────────────────────────────────────────
-- Step 2: Recompute header total_amount for VMI New records
-- total_amount = SUM of (base + tax) across all items in that issue
-- Scoped to issue_type = 'NEW' only — Old VMI headers untouched
-- ─────────────────────────────────────────────────────────────

UPDATE material_issues mi
SET total_amount = (
  SELECT SUM(
    mii.qty::numeric * mii.rate::numeric
    + COALESCE(mii.cgst_amount::numeric, 0)
    + COALESCE(mii.sgst_amount::numeric, 0)
    + COALESCE(mii.igst_amount::numeric, 0)
  )::text
  FROM material_issue_items mii
  WHERE mii.issue_id = mi.id
)
WHERE mi.issue_type = 'NEW';
