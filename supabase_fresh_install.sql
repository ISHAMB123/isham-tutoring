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
  stripe_customer_id text,
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
alter table waitlist enable row level security;

-- students: nobody can read the raw table publicly (emails/plans are
-- private) — the public-safe lookups go through find_student()/get_caps()
-- below. Only tutors can read the full table (for the admin dashboard).
-- Sign-up needs a public INSERT so new students can register before they
-- have a session.
create policy "tutor select students" on students for select using (is_tutor());
-- Anyone can create the initial row (needed for the public Checkout
-- signup step, before payment), but only leaving paid_until unset and
-- cancelled false — a direct API call can't grant itself paid access.
-- Only a signed-in tutor (Admin's manual-add/accept flows) or the
-- service-role Stripe webhook can set paid_until.
create policy "insert own or tutor students" on students for insert with check (
  (paid_until is null and cancelled = false) or is_tutor()
);
create policy "tutor update students" on students for update using (is_tutor());
create policy "tutor delete students" on students for delete using (is_tutor());

-- bookings: full rows require being signed in (any signed-in student can
-- currently see other students' bookings too, needed by the
-- waitlist-promotion logic; fully locking to "own only" is a bigger future
-- change). Anonymous seat-availability checks go through get_seat_counts()
-- below instead, which only ever returns counts, never names.
create policy "auth select bookings" on bookings for select using (auth.uid() is not null);
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

-- waitlist: anyone can join it (writing their own request), only tutors can see who's on it.
create policy "own insert waitlist" on waitlist for insert with check (
  lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);
create policy "tutor select waitlist" on waitlist for select using (is_tutor());
create policy "tutor delete waitlist" on waitlist for delete using (is_tutor());
create policy "own delete waitlist" on waitlist for delete
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- ---------------------------------------------------------------------
-- 4. Functions
-- ---------------------------------------------------------------------

-- Lookup used by the Book page: a student can find their own plan by email
-- without needing raw SELECT access to the students table. Only ever
-- matches the CALLER's own authenticated email, never an arbitrary one —
-- otherwise anyone could look up any other student's plan/payment status.
create or replace function find_student(p_email text)
returns table (id uuid, name text, plan text, paid_until date, cancelled boolean)
language sql security definer set search_path = public as $$
  select id, name, plan, paid_until, cancelled from students
  where lower(email) = lower(p_email)
    and lower(p_email) = lower(coalesce(auth.jwt() ->> 'email', ''));
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

-- Aggregate, name-free seat counts per (date, block, subject), safe for
-- anyone (including anonymous visitors) to call — all the public booking
-- calendar needs to show "how many seats are left" is a number, never who.
create or replace function get_seat_counts()
returns table (date date, block text, subject text, taken bigint)
language sql stable security definer set search_path = public as $$
  select date, block, subject, count(*)::bigint as taken
  from bookings
  group by date, block, subject;
$$;

-- Server-side backstop so a booking can never be inserted past a plan's
-- monthly lesson allowance, even via a direct API call that bypasses the
-- app's own client-side checks. Approximated by calendar month, not the
-- app's exact rolling-period math — a generous backstop, not the primary
-- UX limit. Keep in sync with PLANS in src/App.jsx if those ever change.
create or replace function enforce_monthly_booking_cap()
returns trigger
language plpgsql as $$
declare
  v_plan text;
  v_cap int;
  v_existing int;
begin
  select plan into v_plan from students where id = new.student_id;
  v_cap := case v_plan
    when 'gcse' then 4
    when 'gcse3' then 4
    when 'alevel' then 2
    when 'scholarship' then 8
    else 8
  end;

  select count(*) into v_existing
  from bookings
  where student_id = new.student_id
    and date_trunc('month', date) = date_trunc('month', new.date::date);

  if v_existing >= v_cap then
    raise exception 'Monthly booking limit reached for this plan';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_monthly_booking_cap on bookings;
create trigger trg_enforce_monthly_booking_cap
  before insert on bookings
  for each row execute function enforce_monthly_booking_cap();

-- Lets a signed-in student cancel one of their own bookings by id, more
-- than 24 hours before it starts. Uses the caller's own JWT email, never a
-- client-supplied parameter — otherwise anyone who knew a student's email
-- could cancel that student's booking without ever logging in as them.
create or replace function cancel_booking(p_booking uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_date date;
  v_block text;
  v_student_id uuid;
  v_start_minutes int;
  v_lesson_start timestamptz;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_email = '' then
    return false;
  end if;

  select date, block, student_id into v_date, v_block, v_student_id
  from bookings where id = p_booking;

  if v_student_id is null then
    return false;
  end if;

  if not exists (
    select 1 from students where id = v_student_id and lower(email) = v_email
  ) then
    return false;
  end if;

  -- Start-time offsets (minutes since midnight) must mirror the block
  -- definitions in src/App.jsx — keep the two in sync if slots ever change.
  v_start_minutes := case v_block
    when 'b1' then 540  when 'b2' then 645  when 'b3' then 780  when 'b4' then 885
    when 'e1' then 1140 when 'e2' then 1215
    when 'g1' then 1020
    when 'sc1' then 1125 when 'sc2' then 1200
    else null
  end;

  if v_start_minutes is null then
    return false;
  end if;

  v_lesson_start := v_date::timestamptz + (v_start_minutes || ' minutes')::interval;

  if v_lesson_start - now() <= interval '1 hour' then
    return false;
  end if;

  delete from bookings where id = p_booking;
  return true;
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
  foreach t in array array['bookings', 'students', 'meet_links', 'lesson_notes', 'waitlist'] loop
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
