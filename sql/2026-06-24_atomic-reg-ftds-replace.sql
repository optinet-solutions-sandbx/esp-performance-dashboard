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
