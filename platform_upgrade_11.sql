-- platform_upgrade_11.sql: Medicine & Dentistry Access Scholarship
-- applications. Run once in the Supabase SQL editor, after
-- supabase_fresh_install.sql (or the prior platform_upgrade_*.sql files).
--
-- This table holds sensitive information: a minor's parent/guardian
-- contact details and self-declared widening-participation circumstances
-- (free school meals, care experience, household income band, etc).
-- Nobody gets public SELECT access to the raw table, ever. The public
-- "Featured Scholars" showcase on the site is served instead by
-- get_featured_scholars() below, which only ever returns the handful of
-- non-sensitive fields needed for that public card (first name, subjects,
-- headline) — never contact details or the widening-participation answers.

create table if not exists scholarship_applications (
  id uuid primary key default gen_random_uuid(),
  student_name text not null,
  student_email text not null,
  student_phone text,
  parent_name text not null,
  parent_phone text not null,
  parent_email text not null,
  school text,
  year_group text not null default 'Year 12',
  subjects text[] not null default '{}',
  predicted_grades text,
  gcse_summary text,
  personal_statement text,
  widening_participation jsonb not null default '{}'::jsonb,
  consent_public boolean not null default false,
  status text not null default 'pending', -- pending | waiting | featured | accepted | declined
  headline text, -- short public blurb, only ever set/edited by the tutor, only shown if featured
  created timestamptz not null default now()
);

alter table scholarship_applications enable row level security;

drop policy if exists "public insert scholarship_applications" on scholarship_applications;
create policy "public insert scholarship_applications" on scholarship_applications for insert with check (true);

drop policy if exists "tutor select scholarship_applications" on scholarship_applications;
create policy "tutor select scholarship_applications" on scholarship_applications for select using (is_tutor());

drop policy if exists "tutor update scholarship_applications" on scholarship_applications;
create policy "tutor update scholarship_applications" on scholarship_applications for update using (is_tutor());

drop policy if exists "tutor delete scholarship_applications" on scholarship_applications;
create policy "tutor delete scholarship_applications" on scholarship_applications for delete using (is_tutor());

-- Public-safe count, for the "X of 10 spots" meter on the public page.
create or replace function get_scholarship_count()
returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from scholarship_applications where status in ('featured', 'accepted');
$$;

-- Public-safe showcase feed: only ever the fields a featured applicant
-- explicitly consented to show, never contact info or widening-participation answers.
-- First name only (split_part on the stored full name) since these are minors:
-- even with consent, a full name should never be the thing a public,
-- unauthenticated RPC hands back.
create or replace function get_featured_scholars()
returns table (id uuid, student_name text, subjects text[], headline text)
language sql stable security definer set search_path = public as $$
  select id, split_part(student_name, ' ', 1) as student_name, subjects, headline
  from scholarship_applications
  where status in ('featured', 'accepted') and consent_public = true
  order by created desc;
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'scholarship_applications'
  ) then
    execute 'alter publication supabase_realtime add table public.scholarship_applications';
  end if;
end $$;
