-- platform_upgrade_17.sql: more security hardening + business-rule changes.
-- Run once in the Supabase SQL editor, after platform_upgrade_16.sql.

-- 1. Belal (bghazala01@gmail.com) is no longer part of the team; is_tutor()
--    was still granting that email full tutor access (read every student's
--    data, edit/delete anything). Isham only, now.
create or replace function is_tutor() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'email', '') in ('ishambari6@gmail.com');
$$;

-- 2. find_student() returned any student's plan/paid_until/cancelled status
--    to anyone who called it with that student's email, signed in or not —
--    email enumeration plus a payment-status leak. Now it only ever returns
--    a match for the caller's OWN authenticated email.
create or replace function find_student(p_email text)
returns table (id uuid, name text, plan text, paid_until date, cancelled boolean)
language sql security definer set search_path = public as $$
  select id, name, plan, paid_until, cancelled from students
  where lower(email) = lower(p_email)
    and lower(p_email) = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

-- 3. bookings had no read restriction at all — every visitor's browser,
--    signed in or not, could fetch every student's full name, subject and
--    lesson time directly via the API. Now requires being signed in. This
--    still lets any signed-in family see other families' booking rows
--    (needed by the existing waitlist-promotion logic, which checks other
--    waitlisted students' remaining allowance) — fully locking that down
--    to "own bookings only" is a larger follow-up change, flagged
--    separately, not done here.
drop policy if exists "public select bookings" on bookings;
create policy "auth select bookings" on bookings for select using (auth.uid() is not null);

-- Anyone (including anonymous visitors) can still see aggregate seat counts
-- with no names attached, which is all the public booking calendar actually
-- needs to show "how many seats are left".
create or replace function get_seat_counts()
returns table (date date, block text, subject text, taken bigint)
language sql stable security definer set search_path = public as $$
  select date, block, subject, count(*)::bigint as taken
  from bookings
  group by date, block, subject;
$$;

-- 4. Server-side safety net so a booking can never be inserted past a
--    plan's monthly lesson allowance, even via a direct API call that
--    bypasses the app's own client-side checks. Approximated by calendar
--    month (not the app's exact rolling-period math) — deliberately a
--    generous backstop, not the primary UX limit. Keep the plan/lessons
--    values below in sync with PLANS in src/App.jsx if those ever change.
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

-- 5. Cancel/reschedule window shortened from 24 hours to 1 hour before the
--    lesson starts.
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
