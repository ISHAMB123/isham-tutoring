-- platform_upgrade_15.sql: GCSE moves from self-serve Stripe checkout to an
-- application-and-review programme, exactly like the Medicine & Dentistry
-- Access Scholarship (platform_upgrade_11-14). A parent applies, Isham
-- reviews and accepts, payment is arranged directly (bank transfer), not
-- through the site. Run once in the Supabase SQL editor, after
-- platform_upgrade_14.sql.

create table if not exists gcse_applications (
  id uuid primary key default gen_random_uuid(),
  student_name text not null,
  student_email text not null,
  student_phone text,
  parent_name text not null,
  parent_phone text not null,
  parent_email text not null,
  school text,
  plan text not null default 'gcse', -- 'gcse' or 'gcse3', which plan to provision on acceptance
  status text not null default 'pending', -- pending | accepted | declined
  created timestamptz not null default now()
);

alter table gcse_applications enable row level security;

drop policy if exists "auth insert gcse_applications" on gcse_applications;
create policy "auth insert gcse_applications" on gcse_applications for insert with check (
  auth.uid() is not null
  and lower(student_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

-- One application per student account, same as the scholarship.
create unique index if not exists gcse_applications_student_email_key
  on gcse_applications (lower(student_email));

drop policy if exists "tutor select gcse_applications" on gcse_applications;
create policy "tutor select gcse_applications" on gcse_applications for select using (is_tutor());

drop policy if exists "own select gcse_applications" on gcse_applications;
create policy "own select gcse_applications" on gcse_applications for select using (
  lower(student_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists "tutor update gcse_applications" on gcse_applications;
create policy "tutor update gcse_applications" on gcse_applications for update using (is_tutor());

drop policy if exists "tutor delete gcse_applications" on gcse_applications;
create policy "tutor delete gcse_applications" on gcse_applications for delete using (is_tutor());

-- Public-safe count for the "X of 10 spots" meter on the public page.
create or replace function get_gcse_count()
returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from gcse_applications where status = 'accepted';
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gcse_applications'
  ) then
    execute 'alter publication supabase_realtime add table public.gcse_applications';
  end if;
end $$;
