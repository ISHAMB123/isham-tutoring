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

AUTOMATIC PAYMENT CONFIRMATION (optional, recommended — do once):
Without this, every student stays "pending payment" until Isham manually
clicks "Confirm paid" in the admin dashboard. api/stripe-webhook.js makes
Stripe confirm it automatically the moment a payment succeeds.
1. Supabase -> Project Settings -> API -> copy the "service_role" key
   (NOT the publishable/anon key — this one bypasses security rules, so
   never put it in src/App.jsx or anywhere client-side).
2. Stripe Dashboard -> Developers -> API keys -> copy the "Secret key"
   (starts with sk_test_... in test mode, sk_live_... in live mode).
3. Vercel -> your project -> Settings -> Environment Variables -> add:
   - SUPABASE_SERVICE_ROLE_KEY = (from step 1)
   - STRIPE_SECRET_KEY = (from step 2)
   Redeploy after adding these.
4. Stripe Dashboard -> Developers -> Webhooks -> Add endpoint.
   URL: https://www.ishamtuition.com/api/stripe-webhook
   Events to send: checkout.session.completed
   Create it, then copy the "Signing secret" (starts with whsec_...) and
   add it to Vercel as STRIPE_WEBHOOK_SECRET. Redeploy again.
   Do this once in Stripe's TEST mode toggle and once in LIVE mode when
   you switch STRIPE_MODE in src/App.jsx — each mode has its own webhook
   and its own secret key.
