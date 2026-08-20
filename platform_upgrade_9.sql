-- platform_upgrade_9.sql: let a student leave their own waitlist entry
-- (previously only a tutor could delete waitlist rows).
-- Run once in the Supabase SQL editor.

create policy "own delete waitlist" on waitlist for delete
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
