UPDATE stages
SET stage_code = 'S-' || SUBSTRING(stage_code, 2)
WHERE stage_code NOT LIKE 'S-%';
