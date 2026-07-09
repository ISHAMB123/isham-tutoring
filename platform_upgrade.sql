-- platform_upgrade.sql: multi-tutor picker + lesson cancellation
-- Run once in the Supabase SQL editor, after supabase_v6.sql.

-- 1. Which tutor a student picked (stem plans only; humanities is always Daniella)
alter table students add column if not exists tutor text;

-- 2. Capacity meters now split by department (stem / humanities), replacing get_taken()
drop function if exists get_taken();

create or replace function get_caps() returns table (stem integer, hum integer)
language sql security definer set search_path = public as $$
  select
    count(*) filter (where plan in ('gcse', 'gcse3', 'alevel') and paid_until is not null)::int as stem,
    count(*) filter (where plan in ('hgcse') and paid_until is not null)::int as hum
  from students;
$$;

-- 3. Students can cancel their own lesson more than 24h before it starts.
--    Start times mirror the WEEKEND_BLOCKS / EVENING_BLOCK / UCAT_BLOCKS
--    minute offsets in src/App.jsx — keep the two in sync if slots ever change.
create or replace function cancel_booking(p_booking uuid, p_email text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_date date;
  v_block text;
  v_student_id uuid;
  v_start_minutes int;
  v_lesson_start timestamptz;
begin
  select date, block, student_id into v_date, v_block, v_student_id
  from bookings where id = p_booking;

  if v_student_id is null then
    return false;
  end if;

  if not exists (
    select 1 from students where id = v_student_id and lower(email) = lower(p_email)
  ) then
    return false;
  end if;

  v_start_minutes := case v_block
    when 'b1' then 540  when 'c1' then 540
    when 'b2' then 645  when 'c2' then 645
    when 'b3' then 780  when 'c3' then 780
    when 'b4' then 885  when 'c4' then 885
    when 'e1' then 1140
    when 'e2' then 1215
    when 'u1' then 1080
    when 'u2' then 1140
    when 'u3' then 1200
    when 'u4' then 1260
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
