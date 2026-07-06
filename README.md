# Isham Tutoring — live site (v6: real login + 2FA)

Wired to Supabase with proper authentication:
- Public: booking chart, sign-up, contact form, testimonials, Meet links.
- Protected (login required): student emails, messages, all admin edits.
- Admin login = Supabase Auth (email+password) with optional TOTP 2FA.

Deploy: push to GitHub -> Vercel auto-detects Vite -> Deploy.
Stripe: paste your Payment Links into STRIPE_LINKS in src/App.jsx.

REQUIRED SUPABASE SETUP (do once):
1. Authentication -> Users -> Add user -> your email + a strong password
   (tick auto-confirm). This is the only account that can see student data.
2. Run the SQL in supabase_v6.sql (SQL Editor).
3. First login on the site -> dashboard shows "Set up 2FA" -> scan QR
   with Google Authenticator / Authy / iPhone Passwords -> done.
