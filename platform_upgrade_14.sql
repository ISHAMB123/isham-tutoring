-- platform_upgrade_14.sql: let a signed-in applicant read their OWN
-- scholarship application (and only their own), so the app can check "have
-- I already applied?" on load and show a status page instead of letting
-- them fill out the form a second time. Run once in the Supabase SQL
-- editor, after platform_upgrade_13.sql.
--
-- This adds to, not replaces, the existing tutor-select policy from
-- platform_upgrade_11.sql — Postgres combines multiple permissive SELECT
-- policies on the same table with OR, so tutors keep seeing everything and
-- an applicant additionally sees their own row.

drop policy if exists "own select scholarship_applications" on scholarship_applications;
create policy "own select scholarship_applications" on scholarship_applications for select using (
  lower(student_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);
