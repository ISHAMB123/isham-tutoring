-- platform_upgrade_8.sql: a real waitlist table, so a full slot gives you
-- actual names/emails to work from instead of a message buried in the inbox.
-- Run once in the Supabase SQL editor.

create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  name text not null,
  email text not null,
  date date not null,
  block text not null,
  subject text,
  created timestamptz not null default now()
);

alter table waitlist enable row level security;

create policy "public insert waitlist" on waitlist for insert with check (true);
create policy "tutor select waitlist" on waitlist for select using (is_tutor());
create policy "tutor delete waitlist" on waitlist for delete using (is_tutor());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'waitlist'
  ) then
    execute 'alter publication supabase_realtime add table public.waitlist';
  end if;
end $$;
