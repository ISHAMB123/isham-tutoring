-- platform_upgrade_13.sql: public-safe "applications this week" count, used
-- on the Scholarship landing page to build real urgency instead of a fixed
-- deadline date. Run once in the Supabase SQL editor, after
-- platform_upgrade_12.sql.

create or replace function get_scholarship_recent_count()
returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from scholarship_applications where created >= now() - interval '7 days';
$$;
