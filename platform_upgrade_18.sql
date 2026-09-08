-- platform_upgrade_18.sql: GCSE is back to 8 lessons a month (twice a week,
-- Friday/Saturday/Sunday evenings) instead of 4, restoring the advertised
-- £5-a-lesson / £3.33-an-hour pricing. The server-side monthly cap from
-- platform_upgrade_17.sql was left at the old (wrong) 4/month for
-- gcse/gcse3 — this brings it back in sync with PLANS in src/App.jsx.
-- Run once in the Supabase SQL editor, after platform_upgrade_17.sql.

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
    when 'gcse' then 8
    when 'gcse3' then 8
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
