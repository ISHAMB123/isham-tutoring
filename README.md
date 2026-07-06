# Isham Tutoring — live site

Already wired to your Supabase database. To deploy:

1. Run the extra SQL (below) in Supabase SQL Editor once.
2. Push this folder to GitHub (or drag-drop into Vercel).
3. On vercel.com: New Project -> import the repo -> Framework: Vite -> Deploy.
4. When your Stripe Payment Links exist, paste them into STRIPE_LINKS at the top of src/App.jsx and redeploy.

Extra SQL to run once (adds the settings table + delete permissions for the dashboard):

create table settings (key text primary key, value text not null);
alter table settings enable row level security;
create policy "read settings"   on settings for select using (true);
create policy "write settings"  on settings for insert with check (true);
create policy "update settings" on settings for update using (true);
create policy "del students" on students for delete using (true);
create policy "del bookings" on bookings for delete using (true);
create policy "update meet"  on meet_links for update using (true);
