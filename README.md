# Isham Tutoring — live site (v6: real login + 2FA)

Wired to Supabase with proper authentication:
- Public: booking chart, sign-up, contact form, testimonials, Meet links.
- Protected (login required): student emails, messages, all admin edits.
- Admin login = Supabase Auth (email+password) with optional TOTP 2FA.

Deploy: push to GitHub -> Vercel auto-detects Vite -> Deploy.
Stripe: paste your Payment Links into STRIPE_LINKS in src/App.jsx.

REQUIRED SUPABASE SETUP (fresh/new project — do once):
1. Run the SQL in supabase_fresh_install.sql (SQL Editor). This creates
   every table, security rule, and function the app needs from scratch.
   (The old supabase_v6.sql / platform_upgrade*.sql files are historical
   incremental patches on top of an even older setup — don't use them on
   a new project, they assume tables that won't exist yet.)
2. Authentication -> Users -> Add user -> your email + a strong password
   (tick auto-confirm). This is the only account that can see student data.
3. Authentication -> URL Configuration -> add your live site URL
   (e.g. https://www.ishamtuition.com) as an allowed redirect URL, for
   password-reset emails to work.
4. Update SUPABASE_URL / SUPABASE_KEY at the top of src/App.jsx to your
   new project's values (Project Settings -> API).
5. First login on the site -> dashboard shows "Set up 2FA" -> scan QR
   with Google Authenticator / Authy / iPhone Passwords -> done.
