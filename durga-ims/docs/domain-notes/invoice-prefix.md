# Invoice Prefix

## What is the Invoice Prefix field?

The `inv_prefix` column on the Tax Rate master is used in the Invoice module (Phase 5/6) to auto-generate invoice number series.

## Format

```
[prefix][sequence_no]/[financial_year]
```

Examples:
- `D001/2025-26`
- `D042/2025-26`
- `D001/2026-27` (resets each financial year)

## Why per-tax-rate?

Some businesses maintain separate invoice series for different GST rates (e.g., 18% goods vs 5% goods). Each rate can have its own prefix and its own running sequence number.

## Setup for Durga Industries

1. Go to **Tax Master**
2. Edit the **GST 18%** rate
3. Set Invoice Prefix to `D` (for Durga)
4. Save

If left blank, invoices will use plain numeric numbers (`001/2025-26`).

## Where it appears

- **Tax Master** → Invoice Prefix column (optional, 1–5 characters)
- **Sales Invoice** (Phase 5) → invoice number is generated using this prefix + sequence + FY
