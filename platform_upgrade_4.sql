-- platform_upgrade_4.sql: re-assert that anyone can create a student row via
-- Checkout. Run once in the Supabase SQL editor, after platform_upgrade_3.sql.
--
-- Why: a signup was failing with a vague/empty error, which is the classic
-- symptom of an INSERT silently getting blocked by row-level security rather
-- than a normal validation error. This table has gone through several rounds
-- of RLS changes (supabase_v6.sql, platform_upgrade_2.sql) across different
-- sessions, and we can't be 100% sure the original "public insert" policy
-- from before this repo's history survived all of them intact. This
-- statement doesn't assume a particular existing policy name — it drops
-- every current INSERT policy on students and replaces it with one, so it's
-- safe to run regardless of what's there now.

do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'students' and cmd = 'INSERT'
  loop
    execute format('drop policy %I on students', pol.policyname);
  end loop;
end $$;

create policy "public insert students" on students for insert with check (true);
