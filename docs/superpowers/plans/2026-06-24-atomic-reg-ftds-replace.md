# Atomic Replace-by-Date Upload (Postgres RPC) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Reg & FTDs replace-by-date atomic by moving the upload's three writes (history insert + delete + insert) into a single Postgres function called via `supabase.rpc(...)`, eliminating the data-loss window.

**Architecture:** A new plpgsql function `replace_reg_ftds_upload(p_filename, p_rows)` performs all three writes in one transaction; `commitUpload` is reduced to a single `rpc` call plus the existing reload. No pure logic changes, so no new unit tests — verification is SQL review + lint/build + the unchanged suite + one manual integration write.

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5, Supabase (PostgREST + plpgsql), Vitest.

## Global Constraints

- Function signature exactly: `replace_reg_ftds_upload(p_filename text, p_rows jsonb) returns uuid`, `security invoker`, `grant execute ... to anon, authenticated`.
- Per-row payload keys match table columns: `date`, `esp`, `ip`, `registrations`, `ftds` (the function assigns `upload_id`).
- `dates` and row count are derived inside the function from `p_rows` (not passed by the client).
- Do NOT change parsing, validation, the upload-review modal, `buildUploadPlan`, or `applyCorrections`.
- **Deploy ordering:** the function must be created in prod (run the SQL in the Supabase editor) and verified BEFORE the code PR merges — Vercel auto-deploys on merge, and the deployed app calls the function.
- Existing suite (79 tests) must still pass; no new unit tests (consistent with the untested `admin_*` RPCs).

---

### Task 1: Create the `replace_reg_ftds_upload` SQL function script

**Files:**
- Create: `sql/2026-06-24_atomic-reg-ftds-replace.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: a SQL script defining `replace_reg_ftds_upload(p_filename text, p_rows jsonb) returns uuid` (called by Task 2 via `supabase.rpc('replace_reg_ftds_upload', { p_filename, p_rows })`).

This is a committed artifact that is run in the Supabase SQL editor at deploy time; there is no automated test. Verification is a careful read of the SQL.

- [ ] **Step 1: Write the SQL script**

Create `sql/2026-06-24_atomic-reg-ftds-replace.sql`:

```sql
-- ============================================================================
-- Atomic replace-by-date for Reg & FTDs uploads.
-- Replaces commitUpload's three separate client writes (history insert +
-- delete-by-date + insert) with one transactional function, so a failed
-- insert can no longer leave the affected dates' data deleted.
--
-- DEPLOY: run this in the Supabase SQL editor and confirm the function exists
-- BEFORE merging the code that calls it (Vercel auto-deploys on merge).
-- Re-running is safe (CREATE OR REPLACE).
-- ============================================================================
create or replace function replace_reg_ftds_upload(p_filename text, p_rows jsonb)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_upload_id uuid;
  v_dates     text[];
begin
  -- distinct dates present in the payload
  select array_agg(distinct (r->>'date'))
    into v_dates
    from jsonb_array_elements(p_rows) r;

  -- 1) history record (count + dates derived from the payload itself)
  insert into reg_ftds_uploads (filename, rows, dates)
  values (p_filename, jsonb_array_length(p_rows), coalesce(v_dates, '{}'))
  returning id into v_upload_id;

  -- 2) clear existing daily rows for those dates
  delete from reg_ftds_daily where date = any(v_dates);

  -- 3) insert the new daily rows, linked to the new upload
  insert into reg_ftds_daily (date, esp, ip, registrations, ftds, upload_id)
  select r->>'date', r->>'esp', r->>'ip',
         (r->>'registrations')::int, (r->>'ftds')::int, v_upload_id
    from jsonb_array_elements(p_rows) r;

  return v_upload_id;
end;
$$;

grant execute on function replace_reg_ftds_upload(text, jsonb) to anon, authenticated;
```

- [ ] **Step 2: Self-check the SQL**

Read the script and confirm: signature matches the Global Constraints exactly; payload keys are `date/esp/ip/registrations/ftds`; the three writes are in order (history → delete → insert); `grant execute` to `anon, authenticated` is present. No syntax errors (balanced `$$`, semicolons).

- [ ] **Step 3: Commit**

```bash
git add sql/2026-06-24_atomic-reg-ftds-replace.sql
git commit -m "feat(regftds): add atomic replace_reg_ftds_upload SQL function"
```

---

### Task 2: Wire `commitUpload` to the RPC

**Files:**
- Modify: `src/components/views/RegFtdsView.tsx` (the `commitUpload` function, ~lines 397-421)

**Interfaces:**
- Consumes: `replace_reg_ftds_upload` (Task 1) via `supabase.rpc(...)`.
- Produces: no new exports; behavior change only.

Verified by lint + build + the unchanged 79-test suite; plus the manual integration write below.

- [ ] **Step 1: Replace the three writes + compensation with one RPC call**

In `src/components/views/RegFtdsView.tsx`, locate `commitUpload`. The plan's line numbers are approximate — read the current function. Replace the block that starts at the `reg_ftds_uploads` insert and runs through the `insertErr` compensation (currently roughly:)

```typescript
    const { data: uploadRec, error: histErr } = await supabase
      .from('reg_ftds_uploads')
      .insert({ filename, rows: rows.length, dates: datesArr })
      .select('id')
      .single()
    if (histErr) { setWarning('Upload failed while saving records. Please try again.'); return }
    const uploadId = uploadRec?.id

    await supabase.from('reg_ftds_daily').delete().in('date', datesArr)

    const toInsert = rows.map(a => ({
      date: a.date, esp: a.esp, ip: a.ip,
      registrations: a.reg, ftds: a.ftds,
      upload_id: uploadId ?? null,
    }))
    const { error: insertErr } = await supabase.from('reg_ftds_daily').insert(toInsert)
    if (insertErr) {
      // Compensate: remove the orphaned upload-history row so it doesn't point at no data.
      if (uploadId) await supabase.from('reg_ftds_uploads').delete().eq('id', uploadId)
      setWarning('Upload failed while saving records. Please try again.')
      return
    }
```

with this single atomic call:

```typescript
    // Atomic replace-by-date: history insert + delete + insert in one transaction.
    // On error nothing changed in the DB, so there is no partial state to compensate.
    const { error } = await supabase.rpc('replace_reg_ftds_upload', {
      p_filename: filename,
      p_rows: rows.map(a => ({
        date: a.date, esp: a.esp, ip: a.ip,
        registrations: a.reg, ftds: a.ftds,
      })),
    })
    if (error) { setWarning('Upload failed while saving records. Please try again.'); return }
```

- [ ] **Step 2: Fix the `toInsert.length` references**

The deleted block defined `toInsert`. Find its remaining uses lower in `commitUpload` (the `addLog` call and the `setLog({ ... })` call) and replace `toInsert.length` with `rows.length` (every row is inserted by the function; the counts are equal). Leave `datesArr` and everything else in those calls unchanged. Example:

```typescript
    await addLog('upload', `Reg & FTDs — ${filename}`, `${rows.length} IP records across ${datesArr.length} date(s)`)
```
and in `setLog`, `inserted: rows.length` / `rows: fileRowCount` (keep the other fields as-is).

- [ ] **Step 3: Lint and build**

Run: `npm run lint`
Expected: no new errors (19 pre-existing warnings are fine). If lint flags an unused variable from the removed block, remove it.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Run the test suite (no regression)**

Run: `npm run test:run`
Expected: 79 passed (no change — this task touches no pure logic).

- [ ] **Step 5: Commit**

```bash
git add src/components/views/RegFtdsView.tsx
git commit -m "feat(regftds): use atomic replace_reg_ftds_upload RPC in commitUpload"
```

---

## Deploy Step (manual, NOT a code task — run before merge)

1. In the Supabase SQL editor, run `sql/2026-06-24_atomic-reg-ftds-replace.sql`.
2. Confirm the function exists, e.g.:
   ```sql
   select proname from pg_proc where proname = 'replace_reg_ftds_upload';
   ```
3. **Manual integration test** (writes to prod — use a disposable date and clean up): via the dev server, upload a small file and Proceed; confirm the daily rows + a new history row appear and are correct; then remove the test upload with the existing Delete button.
4. Only after the function exists in prod: merge the code PR.

---

## Self-Review Notes

- **Spec coverage:** atomic function with all three writes (Task 1); `security invoker` + grant (Task 1 Step 1); Approach A derives dates/count from `p_rows` (Task 1 SQL); `commitUpload` collapses to one rpc + removes compensation (Task 2 Step 1); `toInsert.length` → `rows.length` (Task 2 Step 2); deploy ordering (Deploy Step). All covered.
- **No pure-logic change** → existing 79 tests unchanged; matches the spec's testing note.
- **Type/name consistency:** `replace_reg_ftds_upload(p_filename, p_rows)` and payload keys `date/esp/ip/registrations/ftds` identical between Task 1 and Task 2.
