-- platform_upgrade_12.sql: require a signed-in account to submit a
-- scholarship application, enforced at the database, not just by hiding
-- the button in the UI. Run once in the Supabase SQL editor, after
-- platform_upgrade_11.sql.

drop policy if exists "public insert scholarship_applications" on scholarship_applications;
create policy "auth insert scholarship_applications" on scholarship_applications for insert with check (
  auth.uid() is not null
  and lower(student_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

-- One application per student account. The app's submit handler already
-- expects and handles a "duplicate" error here, this makes that real.
create unique index if not exists scholarship_applications_student_email_key
  on scholarship_applications (lower(student_email));
