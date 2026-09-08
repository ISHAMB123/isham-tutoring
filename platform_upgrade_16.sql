-- platform_upgrade_16.sql: security hardening. Three real bypass paths
-- fixed at the database level (RLS/RPC), not just hidden by the app's UI —
-- anyone who called the Supabase REST/RPC endpoints directly with the
-- public anon key (which is, by design, visible in the browser) could get
-- past what the UI normally stops them doing. Run once in the Supabase SQL
-- editor, after platform_upgrade_15.sql.

-- 1. cancel_booking() used to trust a client-supplied email parameter
--    instead of the caller's own authenticated identity — it only checked
--    that the *given* email matched the booking's owner, never that it
--    matched whoever was actually calling. Anyone who knew (or guessed) a
--    student's email could cancel that student's real lesson by calling
--    the RPC directly, no login as that student required. Also fixes a
--    real bug: the block-time lookup never knew about the new GCSE (g1)
--    or scholarship (sc1/sc2) slots added this session, so self-cancel on
--    those bookings was silently always failing.
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

  if v_lesson_start - now() <= interval '24 hours' then
    return false;
  end if;

  delete from bookings where id = p_booking;
  return true;
end;
$$;

-- 2. students could be inserted by anyone (needed for the public Checkout
--    signup step, before payment), but the old policy placed no limit on
--    *which* fields could be set — so a direct API call could insert a row
--    with paid_until already set to a future date and get free, unpaid
--    booking access, bypassing Stripe and the GCSE/scholarship review
--    process entirely. Now a non-tutor insert must leave paid_until unset
--    and cancelled false; only a signed-in tutor (Admin's manual-add /
--    accept flows) or the service-role Stripe webhook can grant access.
drop policy if exists "public insert students" on students;
create policy "insert own or tutor students" on students for insert with check (
  (paid_until is null and cancelled = false) or is_tutor()
);

-- 3. waitlist entries could be inserted under any email, not just the
--    caller's own — matches the "own delete waitlist" policy already added
--    in platform_upgrade_9.sql.
drop policy if exists "public insert waitlist" on waitlist;
create policy "own insert waitlist" on waitlist for insert with check (
  lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);
