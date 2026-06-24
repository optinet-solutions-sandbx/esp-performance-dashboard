-- ============================================================================
-- Fix legacy date misparse: two identical uploads of June-2 data landed on
-- 2026-02-05 and 2026-02-06 (day/month swap, from before the strict date parser).
-- Plan: relabel the kept upload's rows to 2026-06-02, delete the duplicate.
--   KEEP:   bc4c9e79-8172-4b65-9cf9-26a37c64b936  (Campaign Stats -02-06-2026.xlsx, was 2026-02-06)
--   DELETE: d28f47e4-b9e9-4226-9292-9a198680dc42  (Campaign Stats -02 -06-2026.xlsx, was 2026-02-05, identical dupe)
--
-- ⚠ Run ONE BLOCK AT A TIME (select the block, Ctrl+Enter), in order 0 -> 1 -> 2 -> 3.
-- Do not run the whole file at once. Safety = backup (Block 1) + verify (Block 3).
-- ============================================================================


-- ============================================================================
-- BLOCK 0 — PRE-FLIGHT (read-only). Confirm the two source dates and that the
-- target date 2026-06-02 is empty.
-- ============================================================================
SELECT date, count(*) AS rows, sum(registrations) AS reg, sum(ftds) AS ftds
FROM reg_ftds_daily
WHERE date IN ('2026-02-05', '2026-02-06', '2026-06-02')
GROUP BY date ORDER BY date;


-- ============================================================================
-- BLOCK 1 — BACKUP. Run alone first. Persists as a restore point.
-- ============================================================================
DROP TABLE IF EXISTS reg_ftds_daily_backup_feb_20260624;
CREATE TABLE reg_ftds_daily_backup_feb_20260624 AS
SELECT * FROM reg_ftds_daily WHERE date IN ('2026-02-05', '2026-02-06');

SELECT count(*) AS backup_rows FROM reg_ftds_daily_backup_feb_20260624;


-- ============================================================================
-- BLOCK 2 — THE FIX. Run alone, after Block 1. Auto-commits.
-- ============================================================================
-- Relabel the kept upload's rows to the correct date.
UPDATE reg_ftds_daily
SET date = '2026-06-02'
WHERE upload_id = 'bc4c9e79-8172-4b65-9cf9-26a37c64b936';

-- Keep its upload-history record accurate.
UPDATE reg_ftds_uploads
SET dates = ARRAY['2026-06-02']::text[]
WHERE id = 'bc4c9e79-8172-4b65-9cf9-26a37c64b936';

-- Remove the duplicate upload's daily rows, then its history record.
DELETE FROM reg_ftds_daily
WHERE upload_id = 'd28f47e4-b9e9-4226-9292-9a198680dc42';

DELETE FROM reg_ftds_uploads
WHERE id = 'd28f47e4-b9e9-4226-9292-9a198680dc42';


-- ============================================================================
-- BLOCK 3 — VERIFY (read-only). Run alone after Block 2.
-- Expected:
--   * 2026-02-05 and 2026-02-06 -> ZERO rows
--   * 2026-06-02 -> 15 rows (the relabeled data)
--   * earliest date in the table is now 2026-05-05 (no rows before May)
-- ============================================================================
SELECT date, count(*) AS rows
FROM reg_ftds_daily
WHERE date IN ('2026-02-05', '2026-02-06', '2026-06-02')
GROUP BY date ORDER BY date;

SELECT min(date) AS earliest_date, count(*) AS total_rows FROM reg_ftds_daily;


-- ============================================================================
-- BLOCK 4 — RESTORE (only if Block 3 looks wrong). Run alone.
-- Note: this restores the daily rows only; the deleted upload-history record
-- for d28f47e4 is not recreated (it was a duplicate).
-- ============================================================================
-- UPDATE reg_ftds_daily SET date = '2026-02-06'
--   WHERE upload_id = 'bc4c9e79-8172-4b65-9cf9-26a37c64b936';
-- UPDATE reg_ftds_uploads SET dates = ARRAY['2026-02-06']::text[]
--   WHERE id = 'bc4c9e79-8172-4b65-9cf9-26a37c64b936';
-- INSERT INTO reg_ftds_daily SELECT * FROM reg_ftds_daily_backup_feb_20260624
--   WHERE date = '2026-02-05';
