# Soft Delete — Deactivate / Reactivate Pattern

## What is soft delete?

Instead of removing a record from the database, soft delete marks it as inactive (`is_active = false`). The record stays in the database permanently.

## Why not hard delete in an ERP?

- **History preservation** — a deactivated material still appears in old purchase orders and issue records
- **Referential integrity** — foreign keys from transactions point to the master record; deleting it breaks the link
- **Audit trail** — every record that ever existed is traceable
- **Reversibility** — mistakes can be undone instantly with Reactivate

## How it works in this system

| Action | What happens |
|--------|-------------|
| **Deactivate** (amber button) | `is_active = false` — record hidden from active lists and dropdowns |
| **Reactivate** (green button) | `is_active = true` — record returns to active lists |
| **Show Inactive** toggle | Reveals all deactivated records in the table with 50% opacity |

## What "deactivated" means in practice

- Will NOT appear in dropdown selectors (e.g., material picker in Purchase Order)
- Will NOT appear in default table view
- WILL still appear in historical transactions and reports
- CAN be reactivated at any time — no data is lost

## When to deactivate vs when to just edit

- **Deactivate** — record is no longer used going forward (e.g., discontinued material, old vehicle)
- **Edit** — fix a typo or update details for an active record

## Database columns

Every master table has `is_active BOOLEAN DEFAULT TRUE`.
Server actions:
- `deleteXxx(id)` → sets `is_active = false` (despite the name, it's a soft delete)
- `reactivateXxx(id)` → sets `is_active = true`
- `getAllXxx()` → fetches all records (for the master table view)
- `getXxx()` → fetches only active records (for dropdown selectors)
