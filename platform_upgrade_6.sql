-- platform_upgrade_6.sql: live sync + richer lesson notes.
-- Run once in the Supabase SQL editor.

-- 1. Turn on realtime replication for the tables the app now subscribes to,
--    so a parent's dashboard and the tutor's dashboard update themselves the
--    instant a booking, payment confirmation, or link changes — no manual
--    "Refresh" click needed on either side.
do $$
declare
  t text;
begin
  foreach t in array array['bookings', 'students', 'meet_links', 'lesson_notes'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- 2. Give each lesson a bit more structure than one free-text note, so a
--    parent can see what was actually covered and what homework was set,
--    not just a one-line comment.
alter table lesson_notes add column if not exists topic text;
alter table lesson_notes add column if not exists homework text;
