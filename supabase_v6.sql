-- v6: lock personal data behind login, keep public booking working

-- 1. Reads of personal data: logged-in tutor only
drop policy if exists "public read students" on students;
create policy "auth read students" on students for select using (auth.uid() is not null);
drop policy if exists "public read messages" on messages;
create policy "auth read messages" on messages for select using (auth.uid() is not null);

-- 2. Edits and deletes: logged-in tutor only
drop policy if exists "update students" on students;
create policy "auth update students" on students for update using (auth.uid() is not null);
drop policy if exists "del students" on students;
create policy "auth del students" on students for delete using (auth.uid() is not null);
drop policy if exists "update bookings" on bookings;
create policy "auth update bookings" on bookings for update using (auth.uid() is not null);
drop policy if exists "del bookings" on bookings;
create policy "auth del bookings" on bookings for delete using (auth.uid() is not null);
drop policy if exists "public write meet" on meet_links;
create policy "auth write meet" on meet_links for insert with check (auth.uid() is not null);
drop policy if exists "update meet" on meet_links;
create policy "auth update meet" on meet_links for update using (auth.uid() is not null);
drop policy if exists "add testimonials" on testimonials;
create policy "auth add testimonials" on testimonials for insert with check (auth.uid() is not null);
drop policy if exists "del testimonials" on testimonials;
create policy "auth del testimonials" on testimonials for delete using (auth.uid() is not null);

-- 3. Safe public helpers so the site still works for visitors
create or replace function get_taken() returns integer
language sql security definer set search_path = public as $$
  select count(*)::int from students where plan <> 'ucat';
$$;

create or replace function find_student(p_email text)
returns table (id uuid, name text, plan text, paid_until date)
language sql security definer set search_path = public as $$
  select id, name, plan, paid_until from students where lower(email) = lower(p_email);
$$;

-- 4. Old PIN storage no longer used
drop table if exists settings;
