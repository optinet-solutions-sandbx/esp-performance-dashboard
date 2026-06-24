-- ============================================================================
-- One-time relabel of reg_ftds_daily to match the IP Matrix registry
-- ----------------------------------------------------------------------------
-- Makes the date-stamped ledger agree with the IP Matrix (the registry is
-- already correct; only the ledger has wrong ESP labels).
--   * 141.206.158.86, 91.222.98.16  : "Kenscio"  -> "Map"     (these are MAP IPs)
--   * 194.127.197.7                  : "Maileroo" -> "Mailjet"
-- Kenscio's real IPs (103.162.246.x / 103.255.97.x) are NOT touched.
--
-- ⚠ HOW TO RUN IN THE SUPABASE SQL EDITOR — IMPORTANT
-- The editor runs the whole tab as ONE transaction. Do NOT paste BEGIN/ROLLBACK
-- and do NOT run the whole file at once. Run ONE BLOCK AT A TIME: select the
-- block's lines and click Run (Ctrl+Enter), in order 0 → 1 → 2 → 3.
-- Safety comes from the BACKUP table (Block 1) + the expected numbers in Block 3,
-- not from an in-editor rollback. If Block 3 looks wrong, run Block 4 to restore.
-- ============================================================================


-- ============================================================================
-- BLOCK 0 — PRE-FLIGHT (read-only). What will move, and the grand total to
-- conserve. Note the "grand_total_reg" value — Block 3 must reproduce it.
-- ============================================================================
SELECT esp, ip, count(*) AS rows, sum(registrations) AS reg, sum(ftds) AS ftds
FROM reg_ftds_daily
WHERE (esp = 'Kenscio'  AND ip IN ('141.206.158.86', '91.222.98.16'))
   OR (esp = 'Maileroo' AND ip = '194.127.197.7')
GROUP BY esp, ip ORDER BY esp, ip;

SELECT sum(registrations) AS grand_total_reg, sum(ftds) AS grand_total_ftds
FROM reg_ftds_daily
WHERE ip IN ('141.206.158.86', '91.222.98.16', '194.127.197.7');


-- ============================================================================
-- BLOCK 1 — BACKUP. Run this block ALONE first. It commits and persists, so
-- it survives as a restore point regardless of what happens next.
-- ============================================================================
DROP TABLE IF EXISTS reg_ftds_daily_backup_20260624;
CREATE TABLE reg_ftds_daily_backup_20260624 AS
SELECT * FROM reg_ftds_daily
WHERE ip IN ('141.206.158.86', '91.222.98.16', '194.127.197.7')
  AND esp IN ('Kenscio', 'Maileroo', 'Map', 'Mailjet');

-- Confirm the backup exists before continuing (should return a row count > 0):
SELECT count(*) AS backup_rows FROM reg_ftds_daily_backup_20260624;


-- ============================================================================
-- BLOCK 2 — THE RELABEL. Run this block ALONE, AFTER Block 1 succeeded.
-- These six statements auto-commit together. Per (date, ip): fold the source
-- label's numbers into the existing target row, delete the folded source row,
-- then relabel any source row that had no matching target row.
-- ============================================================================

-- Kenscio -> Map ------------------------------------------------------------
-- (a) Fold Kenscio numbers into the existing Map row for the same date+ip.
UPDATE reg_ftds_daily t
SET registrations = t.registrations + s.reg,
    ftds          = t.ftds          + s.ftds
FROM (
  SELECT date, ip, sum(registrations) AS reg, sum(ftds) AS ftds
  FROM reg_ftds_daily
  WHERE esp = 'Kenscio' AND ip IN ('141.206.158.86', '91.222.98.16')
  GROUP BY date, ip
) s
WHERE t.esp = 'Map' AND t.ip = s.ip AND t.date = s.date;

-- (b) Delete Kenscio rows that were just folded into a Map row.
DELETE FROM reg_ftds_daily s
WHERE s.esp = 'Kenscio' AND s.ip IN ('141.206.158.86', '91.222.98.16')
  AND EXISTS (
    SELECT 1 FROM reg_ftds_daily t
    WHERE t.esp = 'Map' AND t.ip = s.ip AND t.date = s.date
  );

-- (c) Relabel any remaining Kenscio rows (no Map row existed for that date+ip).
UPDATE reg_ftds_daily
SET esp = 'Map'
WHERE esp = 'Kenscio' AND ip IN ('141.206.158.86', '91.222.98.16');

-- Maileroo -> Mailjet -------------------------------------------------------
-- (a) Fold Maileroo numbers into the existing Mailjet row for the same date+ip.
UPDATE reg_ftds_daily t
SET registrations = t.registrations + s.reg,
    ftds          = t.ftds          + s.ftds
FROM (
  SELECT date, ip, sum(registrations) AS reg, sum(ftds) AS ftds
  FROM reg_ftds_daily
  WHERE esp = 'Maileroo' AND ip = '194.127.197.7'
  GROUP BY date, ip
) s
WHERE t.esp = 'Mailjet' AND t.ip = s.ip AND t.date = s.date;

-- (b) Delete Maileroo rows that were just folded into a Mailjet row.
DELETE FROM reg_ftds_daily s
WHERE s.esp = 'Maileroo' AND s.ip = '194.127.197.7'
  AND EXISTS (
    SELECT 1 FROM reg_ftds_daily t
    WHERE t.esp = 'Mailjet' AND t.ip = s.ip AND t.date = s.date
  );

-- (c) Relabel any remaining Maileroo rows.
UPDATE reg_ftds_daily
SET esp = 'Mailjet'
WHERE esp = 'Maileroo' AND ip = '194.127.197.7';


-- ============================================================================
-- BLOCK 3 — VERIFY (read-only). Run this block ALONE after Block 2.
-- Expected results:
--   1) leftover source rows  -> ZERO rows returned
--   2) Map @ 91.222.98.16     -> reg = 133   (was 129, +4 folded from Kenscio)
--      Map @ 141.206.158.86 and Mailjet @ 194.127.197.7 -> unchanged (source was 0)
--   3) grand_total_reg        -> identical to Block 0 (nothing created or lost)
-- ============================================================================
SELECT 'LEFTOVER SOURCE ROWS (expect none)' AS check, esp, ip, count(*) AS rows
FROM reg_ftds_daily
WHERE (esp = 'Kenscio'  AND ip IN ('141.206.158.86', '91.222.98.16'))
   OR (esp = 'Maileroo' AND ip = '194.127.197.7')
GROUP BY esp, ip;

SELECT 'TARGET TOTALS AFTER' AS check, esp, ip,
       count(*) AS rows, sum(registrations) AS reg, sum(ftds) AS ftds
FROM reg_ftds_daily
WHERE (esp = 'Map'     AND ip IN ('141.206.158.86', '91.222.98.16'))
   OR (esp = 'Mailjet' AND ip = '194.127.197.7')
GROUP BY esp, ip ORDER BY esp, ip;

SELECT 'GRAND TOTAL (must equal Block 0)' AS check,
       sum(registrations) AS grand_total_reg, sum(ftds) AS grand_total_ftds
FROM reg_ftds_daily
WHERE ip IN ('141.206.158.86', '91.222.98.16', '194.127.197.7');


-- ============================================================================
-- BLOCK 4 — RESTORE (only if Block 3 looks wrong). Run this block ALONE.
-- Restores the four affected (esp, ip) groups from the Block 1 backup.
-- ============================================================================
-- DELETE FROM reg_ftds_daily
-- WHERE ip IN ('141.206.158.86', '91.222.98.16', '194.127.197.7')
--   AND esp IN ('Kenscio', 'Maileroo', 'Map', 'Mailjet');
-- INSERT INTO reg_ftds_daily SELECT * FROM reg_ftds_daily_backup_20260624;
-- -- then re-run Block 0 to confirm you're back to the original state.
