-- platform_upgrade_7.sql: capture a parent/student phone number at signup.
-- Run once in the Supabase SQL editor.

alter table students add column if not exists phone text;
