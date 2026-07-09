-- platform_upgrade_2.sql: lock personal data to tutors now that students have
-- real Supabase Auth accounts too. Run once in the Supabase SQL editor, after
-- platform_upgrade.sql.
--
-- Why: supabase_v6.sql's policies gate reads/writes on "auth.uid() is not
-- null" — back when only tutors could ever be logged in, that was equivalent
-- to "is a tutor". Students can now sign up and log in (see src/App.jsx
-- Checkout/Book), so those policies would let any signed-in student read
-- every other family's name/email/plan/payment status, and even edit or
-- delete other students' rows, bookings, meet links and testimonials
-- directly via the Supabase client. This migration replaces "any logged-in
-- user" with "a logged-in tutor" everywhere personal data or destructive
-- writes are gated.
--
-- NOTE: tutor emails are hardcoded here to mirror TUTORS in src/App.jsx —
-- there's no tutors table. If a tutor is added/removed/changes email, update
-- both places.

create or replace function is_tutor() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'email', '') in ('ishambari6@gmail.com', 'bghazala01@gmail.com');
$$;

drop policy if exists "auth read students" on students;
create policy "tutor read students" on students for select using (is_tutor());

drop policy if exists "auth update students" on students;
create policy "tutor update students" on students for update using (is_tutor());

drop policy if exists "auth del students" on students;
create policy "tutor del students" on students for delete using (is_tutor());

drop policy if exists "auth read messages" on messages;
create policy "tutor read messages" on messages for select using (is_tutor());

drop policy if exists "auth update bookings" on bookings;
create policy "tutor update bookings" on bookings for update using (is_tutor());

drop policy if exists "auth del bookings" on bookings;
create policy "tutor del bookings" on bookings for delete using (is_tutor());

drop policy if exists "auth write meet" on meet_links;
create policy "tutor write meet" on meet_links for insert with check (is_tutor());

drop policy if exists "auth update meet" on meet_links;
create policy "tutor update meet" on meet_links for update using (is_tutor());

drop policy if exists "auth add testimonials" on testimonials;
create policy "tutor add testimonials" on testimonials for insert with check (is_tutor());

drop policy if exists "auth del testimonials" on testimonials;
create policy "tutor del testimonials" on testimonials for delete using (is_tutor());

-- chat_messages is intentionally left as "any authenticated user" (student or
-- tutor) for both read and write — that's the community Q&A model.
