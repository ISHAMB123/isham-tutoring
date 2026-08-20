-- platform_upgrade_5.sql: self-service plan cancellation. Run once in the
-- Supabase SQL editor, after platform_upgrade_4.sql.
--
-- This does NOT touch a real recurring Stripe subscription — Payment Links
-- created without a secret-key server integration aren't something this
-- app can cancel via API. cancel_my_plan() only records that the student
-- doesn't want to renew: they keep booking access through whatever they've
-- already paid for (paid_until), it just stops being chased/renewed after.
-- If a student's Stripe payment was set up as an actual recurring
-- subscription (not a one-off Payment Link charge), they may also need to
-- cancel it directly via the "Manage subscription" link in their Stripe
-- receipt email — tell them that in person if it comes up.

alter table students add column if not exists cancelled boolean not null default false;

-- find_student() needs to return the new column so the Book page can show
-- cancelled status.
create or replace function find_student(p_email text)
returns table (id uuid, name text, plan text, paid_until date, cancelled boolean)
language sql security definer set search_path = public as $$
  select id, name, plan, paid_until, cancelled from students where lower(email) = lower(p_email);
$$;

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
