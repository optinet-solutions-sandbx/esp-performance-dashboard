# Reg & FTDs — Atomic Replace-by-Date Upload (Postgres RPC)

**Date:** 2026-06-24
**Status:** Design approved, pending spec review
**Area:** `src/components/views/RegFtdsView.tsx`, new SQL function
**Builds on:** [2026-06-24-reg-ftds-ip-authority-design.md](2026-06-24-reg-ftds-ip-authority-design.md) (introduced `commitUpload`)

---

## Problem

`commitUpload` ([RegFtdsView.tsx](../../../src/components/views/RegFtdsView.tsx)) persists an upload in three separate client-side writes: insert the upload-history row, **delete** existing `reg_ftds_daily` rows for the affected dates, then **insert** the new daily rows. These are not transactional. If the insert fails after the delete succeeds, the old data for those dates is gone — the current compensation logic only deletes the orphaned history row, it cannot restore the deleted daily data. So a transient insert failure causes silent data loss for the overwritten dates.

This was flagged as a known follow-up during the IP-authority and upload-review features.

---

## Goal

Make replace-by-date atomic: all three writes succeed together or none take effect, eliminating the data-loss window and the need for client-side compensation.

Non-goals (YAGNI):
- No fallback path for "function not yet created" — handled by deployment ordering.
- No failure-injection test harness — rollback is guaranteed by Postgres transaction semantics.
- No change to parsing, validation, the upload-review modal, or `buildUploadPlan`/`applyCorrections`.

---

## Decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| Atomicity scope | **All three writes** (history insert + delete + insert) in one Postgres function. Removes the compensation logic; true all-or-nothing. |
| Function shape | **Approach A:** the function derives the distinct `dates` and the row count from the `p_rows` jsonb itself, so the history record can't drift from what's actually stored. Client sends only `p_filename` + `p_rows`. |
| Privileges | `security invoker` + `grant execute to anon, authenticated` — the app already inserts/deletes these tables with the anon key, so no elevation is needed. (Confirm RLS posture in implementation; escalate to `definer` only if a policy actually blocks it.) |
| Deployment | SQL script in `sql/`, run in the Supabase editor (same pattern as the `admin_*` functions). **The function must be created in prod before the calling code deploys.** |

---

## Architecture & Data Flow

One new Postgres function, called via `supabase.rpc(...)` (the existing pattern in `src/lib/profile.ts`). A plpgsql function body is a single transaction, so any error rolls back all three writes.

```
commitUpload:
  build rows (unchanged)
    → supabase.rpc('replace_reg_ftds_upload', { p_filename, p_rows })   [ONE atomic call]
          error? → setWarning, return    (DB unchanged — nothing to compensate)
    → reload regFtdsDaily from DB         (unchanged)
    → fetchUploadHistory / fetchBadDates / addLog / setLog   (unchanged)
```

**Deployment ordering (critical):** Vercel auto-deploys on merge to `main`. Sequence:
1. Run the SQL script in the Supabase editor to create `replace_reg_ftds_upload`.
2. Verify it exists.
3. Then merge the code PR.

Reversing this would make the live app call a missing function and uploads would fail until it's created.

---

## Components

### `sql/2026-06-24_atomic-reg-ftds-replace.sql` (new — run in Supabase editor)

```sql
create or replace function replace_reg_ftds_upload(p_filename text, p_rows jsonb)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_upload_id uuid;
  v_dates     text[];
begin
  select array_agg(distinct (r->>'date'))
    into v_dates
    from jsonb_array_elements(p_rows) r;

  insert into reg_ftds_uploads (filename, rows, dates)
  values (p_filename, jsonb_array_length(p_rows), coalesce(v_dates, '{}'))
  returning id into v_upload_id;

  delete from reg_ftds_daily where date = any(v_dates);

  insert into reg_ftds_daily (date, esp, ip, registrations, ftds, upload_id)
  select r->>'date', r->>'esp', r->>'ip',
         (r->>'registrations')::int, (r->>'ftds')::int, v_upload_id
    from jsonb_array_elements(p_rows) r;

  return v_upload_id;
end;
$$;

grant execute on function replace_reg_ftds_upload(text, jsonb) to anon, authenticated;
```

- Atomic by construction — all three writes in one function body.
- `dates` and `rows` count derived from `p_rows` (Approach A).
- Payload keys match column names (`registrations`, `ftds`).
- Returns the new `upload_id` (client doesn't require it; useful for logging).

### `src/components/views/RegFtdsView.tsx` (modify `commitUpload`)

Replace the three writes + compensation block (currently the history insert through the `insertErr` compensation, ~lines 400-421) with a single `rpc` call:

```typescript
    const { error } = await supabase.rpc('replace_reg_ftds_upload', {
      p_filename: filename,
      p_rows: rows.map(a => ({
        date: a.date, esp: a.esp, ip: a.ip,
        registrations: a.reg, ftds: a.ftds,
      })),
    })
    if (error) { setWarning('Upload failed while saving records. Please try again.'); return }
```

- `datesArr` (computed at the top) stays — used by `addLog`/`setLog` for the date count.
- `toInsert.length` references become `rows.length` (every row is inserted; they were equal).
- The reload, `fetchUploadHistory`, `fetchBadDates`, `addLog`, `setLog` are unchanged.
- No other part of the function changes.

---

## Edge Cases & Error Handling

- **Partial failure → full rollback.** Any error inside the function rolls back all three writes; client sees `{ error }`, warns, DB unchanged. (The fix.)
- **Empty payload.** Not reachable (`commitUpload` only runs with `aggregated.size > 0`); the function handles it safely regardless (`v_dates` → `'{}'`).
- **Date type.** `reg_ftds_daily.date` holds ISO `yyyy-mm-dd`; `r->>'date'` text inserts cleanly.
- **Numeric casts.** Client always sends numeric `registrations`/`ftds` (default 0); `::int` is safe.
- **Function missing.** Prevented by deployment ordering; no code fallback.

---

## Testing

- **Unit tests:** unchanged — no new pure logic, so the existing 79 still pass. (Consistent with the existing `admin_*` RPCs, which have no TS unit tests.)
- **Manual integration (after the function exists in prod):** via the dev server, upload a real file and Proceed on a disposable date, confirm the daily rows + history row are correct, then remove the test upload with the existing Delete button. This is the one test that writes to prod; do it on a throwaway date and clean up.
- **Rollback:** guaranteed by Postgres transaction semantics; explicit failure-injection is optional and not in the plan.

---

## Files

| File | Change |
|------|--------|
| `sql/2026-06-24_atomic-reg-ftds-replace.sql` | NEW — `replace_reg_ftds_upload` function + grant (run in Supabase editor before deploy) |
| `src/components/views/RegFtdsView.tsx` | MODIFY `commitUpload` — replace 3 writes + compensation with one `rpc` call |
