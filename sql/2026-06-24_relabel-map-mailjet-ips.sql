-- ============================================================================
-- One-time relabel of reg_ftds_daily to match the IP Matrix registry
-- ----------------------------------------------------------------------------
-- Context: the client's uploaded Campaign Stats files carried ESP labels that
-- contradict the IP Matrix (the registry of which ESP owns which IP). The
-- IP Matrix is already correct; only the date-stamped ledger (reg_ftds_daily)
-- has the wrong labels. This script makes the ledger agree with the registry.
--
-- Client request (Telegram, 2026-06-24):
--   * 141.206.158.86, 91.222.98.16  -> these are MAP IPs (mislabeled "Kenscio")
--   * 194.127.197.7                 -> rename "Maileroo" to "Mailjet"
--
-- IP Matrix confirms: Map owns 141.206.158.86 + 91.222.98.16; Mailjet owns
-- 194.127.197.7. Kenscio's real IPs (103.162.246.x / 103.255.97.x) are NOT
-- touched by this script.
--
-- Run order:
--   1. Run STEP 0 (pre-flight) by itself and eyeball the rows that will move.
--   2. Run STEP 1 (backup) — creates a restore point.
--   3. Run STEP 2 (the transaction) — review the verification output BEFORE
--      you remove the ROLLBACK / switch it to COMMIT.
--   4. Keep ROLLBACK.sql handy in case you need to undo.
-- ============================================================================


-- ============================================================================
-- STEP 0 — PRE-FLIGHT (read-only). Run this alone first.
-- Shows exactly what will be moved and the registrations/ftds at stake.
-- ============================================================================
SELECT esp, ip, count(*) AS rows, sum(registrations) AS reg, sum(ftds) AS ftds
FROM reg_ftds_daily
WHERE (esp = 'Kenscio'  AND ip IN ('141.206.158.86', '91.222.98.16'))
   OR (esp = 'Maileroo' AND ip = '194.127.197.7')
GROUP BY esp, ip
ORDER BY esp, ip;

-- Current state of the TARGET labels (for before/after comparison):
SELECT esp, ip, count(*) AS rows, sum(registrations) AS reg, sum(ftds) AS ftds
FROM reg_ftds_daily
WHERE (esp = 'Map'     AND ip IN ('141.206.158.86', '91.222.98.16'))
   OR (esp = 'Mailjet' AND ip = '194.127.197.7')
GROUP BY esp, ip
ORDER BY esp, ip;


-- ============================================================================
-- STEP 1 — BACKUP. Run this alone. Snapshots every source AND target row so
-- the change is fully reversible (see ROLLBACK section at the bottom).
-- ============================================================================
DROP TABLE IF EXISTS reg_ftds_daily_backup_20260624;
CREATE TABLE reg_ftds_daily_backup_20260624 AS
SELECT * FROM reg_ftds_daily
WHERE (esp = 'Kenscio'  AND ip IN ('141.206.158.86', '91.222.98.16'))
   OR (esp = 'Maileroo' AND ip = '194.127.197.7')
   OR (esp = 'Map'      AND ip IN ('141.206.158.86', '91.222.98.16'))
   OR (esp = 'Mailjet'  AND ip = '194.127.197.7');


-- ============================================================================
-- STEP 2 — THE RELABEL (transactional). Review the verification SELECT at the
-- end, THEN change the final `ROLLBACK;` to `COMMIT;` and re-run.
--
-- Strategy per (date, ip): fold the source label's numbers into the existing
-- target-label row, then delete the source row. If no target row exists for
-- that date+ip, just relabel the source row. This preserves the canonical
-- "one row per (date, esp, ip)" shape the upload pipeline produces.
-- ============================================================================
BEGIN;

-- ---- Kenscio -> Map  (141.206.158.86, 91.222.98.16) -----------------------

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

-- ---- Maileroo -> Mailjet  (194.127.197.7) ---------------------------------

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

-- ---- VERIFICATION (review this output before committing) ------------------

-- Expect: ZERO rows. No Kenscio/Maileroo rows should remain for these IPs.
SELECT 'LEFTOVER SOURCE ROWS (expect none)' AS check, esp, ip, count(*)
FROM reg_ftds_daily
WHERE (esp = 'Kenscio'  AND ip IN ('141.206.158.86', '91.222.98.16'))
   OR (esp = 'Maileroo' AND ip = '194.127.197.7')
GROUP BY esp, ip;

-- Target totals AFTER the move. Compare against STEP 0's "before" output:
--   Map @ 91.222.98.16  reg should be +4 vs before (Kenscio had 4 regs here)
--   Map @ 141.206.158.86, Mailjet @ 194.127.197.7  reg/ftds unchanged (source was all 0)
SELECT 'TARGET TOTALS AFTER' AS check, esp, ip,
       count(*) AS rows, sum(registrations) AS reg, sum(ftds) AS ftds
FROM reg_ftds_daily
WHERE (esp = 'Map'     AND ip IN ('141.206.158.86', '91.222.98.16'))
   OR (esp = 'Mailjet' AND ip = '194.127.197.7')
GROUP BY esp, ip
ORDER BY esp, ip;

-- Conservation check — grand total reg/ftd across the FOUR labels involved
-- must be identical before and after (nothing created or lost, only moved).
SELECT 'GRAND TOTAL (must match STEP 0 source+target sum)' AS check,
       sum(registrations) AS reg, sum(ftds) AS ftds
FROM reg_ftds_daily
WHERE ip IN ('141.206.158.86', '91.222.98.16', '194.127.197.7');

-- Leave as ROLLBACK while reviewing. Change to COMMIT; and re-run to apply.
ROLLBACK;
-- COMMIT;


-- ============================================================================
-- ROLLBACK / RESTORE (only if you committed and need to undo)
-- ----------------------------------------------------------------------------
-- Restores the four affected (esp, ip) groups to their pre-change state from
-- the backup taken in STEP 1.
-- ============================================================================
-- BEGIN;
-- DELETE FROM reg_ftds_daily
-- WHERE ip IN ('141.206.158.86', '91.222.98.16', '194.127.197.7')
--   AND esp IN ('Kenscio', 'Maileroo', 'Map', 'Mailjet');
-- INSERT INTO reg_ftds_daily
-- SELECT * FROM reg_ftds_daily_backup_20260624;
-- COMMIT;
-- DROP TABLE reg_ftds_daily_backup_20260624;
