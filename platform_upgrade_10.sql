-- platform_upgrade_10.sql: capture the Stripe customer id when a payment
-- confirms, so Billing can link to Stripe's own portal for card/invoice
-- management instead of saying "not available".
-- Run once in the Supabase SQL editor.

alter table students add column if not exists stripe_customer_id text;
