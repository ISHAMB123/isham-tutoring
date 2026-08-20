-- =====================================================================
-- supabase_fresh_install.sql
--
-- Complete database setup for a BRAND NEW, empty Supabase project.
-- Run this ONCE in the Supabase SQL editor (Project → SQL Editor → New
-- query → paste this whole file → Run). It creates every table, security
-- rule, and function the app needs, in one go — you do NOT need any of
-- the old supabase_v6.sql / platform_upgrade*.sql files on a fresh
-- project; they were incremental patches on top of an even older setup
-- that no longer exists. Keep this file as the source of truth from now
-- on.
--
-- After running this, you still need to do a few things in the Supabase
-- dashboard itself (not SQL) — see the checklist at the very bottom of
-- the chat message this file was sent with.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  phone text,
  plan text not null,
  paid_until date,
  tutor text default 'isham',
  cancelled boolean not null default false,
  joined timestamptz not null default now()
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  student_name text not null,
  plan text not null,
  subject text,
  date date not null,
  block text not null,
  block_label text,
  created timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  text text not null,
  created timestamptz not null default now()
);

create table if not exists meet_links (
  slot text primary key,
  link text not null
);

create table if not exists testimonials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  quote text not null,
  detail text,
  created timestamptz not null default now()
);

create table if not exists lesson_notes (
  booking_id uuid primary key references bookings(id) on delete cascade,
  attended boolean,
  note text,
  topic text,
  homework text
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  sender text not null,
  is_tutor boolean not null default false,
  text text not null,
  created timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. is_tutor() helper — used by every tutor-only RLS policy below.
--    Add every tutor email here. Only Isham for now.
-- ---------------------------------------------------------------------

create or replace function is_tutor()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'email', '') in ('ishambari6@gmail.com');
$$;

-- ---------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------

alter table students enable row level security;
alter table bookings enable row level security;
alter table messages enable row level security;
alter table meet_links enable row level security;
alter table testimonials enable row level security;
alter table lesson_notes enable row level security;
alter table chat_messages enable row level security;

-- students: nobody can read the raw table publicly (emails/plans are
-- private) — the public-safe lookups go through find_student()/get_caps()
-- below. Only tutors can read the full table (for the admin dashboard).
-- Sign-up needs a public INSERT so new students can register before they
-- have a session.
create policy "tutor select students" on students for select using (is_tutor());
create policy "public insert students" on students for insert with check (true);
create policy "tutor update students" on students for update using (is_tutor());
create policy "tutor delete students" on students for delete using (is_tutor());

-- bookings: needed publicly for the capacity/seat-taken checks on the
-- Book page before a student is necessarily "logged in" in the RLS
-- sense, and so a signed-in student's own dashboard can read their rows.
create policy "public select bookings" on bookings for select using (true);
create policy "public insert bookings" on bookings for insert with check (true);
create policy "tutor update bookings" on bookings for update using (is_tutor());
create policy "tutor delete bookings" on bookings for delete using (is_tutor());

-- messages: contact-form submissions are write-only from the public;
-- only tutors can read the inbox.
create policy "tutor select messages" on messages for select using (is_tutor());
create policy "public insert messages" on messages for insert with check (true);

-- meet_links: public read (students need to see their Meet link),
-- tutor-only write.
create policy "public select meet_links" on meet_links for select using (true);
create policy "tutor upsert meet_links" on meet_links for insert with check (is_tutor());
create policy "tutor update meet_links" on meet_links for update using (is_tutor());

-- testimonials: public read (shown on the home page), tutor-only write.
create policy "public select testimonials" on testimonials for select using (true);
create policy "tutor insert testimonials" on testimonials for insert with check (is_tutor());
create policy "tutor delete testimonials" on testimonials for delete using (is_tutor());

-- lesson_notes: tutors see/edit everything; a student can see only the
-- notes on their own bookings.
create policy "tutor select lesson_notes" on lesson_notes for select using (
  is_tutor() or exists (
    select 1 from bookings b join students s on s.id = b.student_id
    where b.id = lesson_notes.booking_id and lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);
create policy "tutor upsert lesson_notes" on lesson_notes for insert with check (is_tutor());
create policy "tutor update lesson_notes" on lesson_notes for update using (is_tutor());

-- chat_messages: public read/write (simple shared help-chat widget).
create policy "public select chat_messages" on chat_messages for select using (true);
create policy "public insert chat_messages" on chat_messages for insert with check (true);

-- ---------------------------------------------------------------------
-- 4. Functions
-- ---------------------------------------------------------------------

-- Public-safe lookup used by the Book page: a student can find their own
-- plan by email without needing raw SELECT access to the students table.
create or replace function find_student(p_email text)
returns table (id uuid, name text, plan text, paid_until date, cancelled boolean)
language sql security definer set search_path = public as $$
  select id, name, plan, paid_until, cancelled from students where lower(email) = lower(p_email);
$$;

-- Public-safe per-department seat counts for the capacity meters shown
-- on the Pricing page, without exposing student rows.
create or replace function get_caps()
returns table (dept text, taken bigint)
language sql stable security definer set search_path = public as $$
  select 'stem'::text as dept, count(*)::bigint as taken
  from students
  where paid_until is not null and paid_until >= current_date;
$$;

-- Lets a signed-in student cancel one of their own bookings by id,
-- checked against their own email so one student can't cancel another's.
create or replace function cancel_booking(p_booking uuid, p_email text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from bookings b
  using students s
  where b.id = p_booking
    and b.student_id = s.id
    and lower(s.email) = lower(p_email);
  return found;
end;
$$;

-- Lets a signed-in student mark their own plan as "not renewing" —
-- see the note in the app about this not touching a real Stripe
-- subscription via API (no server-side secret key available).
create or replace function cancel_my_plan()
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_email = '' then
    return false;
  end if;
  update students set cancelled = true where lower(email) = v_email;
  return found;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Realtime — so a parent's dashboard and the tutor's dashboard update
--    themselves the instant a booking/payment/link changes, no manual
--    "Refresh" click needed.
-- ---------------------------------------------------------------------
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

-- =====================================================================
-- Done. Next steps are NOT SQL — see the dashboard checklist sent
-- alongside this file (recreate the tutor login user, allow the live
-- domain as a redirect URL, etc).
-- =====================================================================
