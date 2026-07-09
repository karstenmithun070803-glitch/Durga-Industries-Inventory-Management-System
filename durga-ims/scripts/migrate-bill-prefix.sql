-- One-off migration: prepend "D-" to all existing bill numbers
-- Run ONCE after deploying the code change that sets inv_prefix = "D"
-- Before running: verify with the SELECT below to see which bills will be updated

-- Preview (run first):
-- SELECT bill_number FROM invoices WHERE bill_number NOT LIKE 'D-%';

-- Execute:
UPDATE invoices
SET bill_number = 'D-' || bill_number
WHERE bill_number NOT LIKE 'D-%';
