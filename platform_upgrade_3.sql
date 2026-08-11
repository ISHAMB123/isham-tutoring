-- platform_upgrade_3.sql: per-lesson attendance + tutor notes, visible to
-- the student (and their parent, since that's who's logged into the
-- student's account in practice). Run once in the Supabase SQL editor,
-- after platform_upgrade_2.sql.
--
-- Deliberately a SEPARATE table from bookings, not new columns on it:
-- bookings is currently selected with no row-level restriction (every
-- visitor's browser fetches every student's name/date/subject just to
-- compute seat counts for the calendar) — a tutor's private note about a
-- student does not belong in that same open query. lesson_notes gets its
-- own RLS: tutors can read/write everything, a student can read only the
-- notes attached to their own bookings, and no policy grants anonymous
-- access at all.

create table if not exists lesson_notes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references bookings(id) on delete cascade,
  attended boolean,
  note text,
  created timestamptz not null default now()
);

alter table lesson_notes enable row level security;

drop policy if exists "tutor write lesson_notes" on lesson_notes;
create policy "tutor write lesson_notes" on lesson_notes for insert with check (is_tutor());

drop policy if exists "tutor update lesson_notes" on lesson_notes;
create policy "tutor update lesson_notes" on lesson_notes for update using (is_tutor());

drop policy if exists "tutor delete lesson_notes" on lesson_notes;
create policy "tutor delete lesson_notes" on lesson_notes for delete using (is_tutor());

drop policy if exists "read own or tutor lesson_notes" on lesson_notes;
create policy "read own or tutor lesson_notes" on lesson_notes for select using (
  is_tutor() or exists (
    select 1 from bookings b
    join students s on s.id = b.student_id
    where b.id = lesson_notes.booking_id
      and lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);
