// Vercel serverless function - actually cancels a student's Stripe subscription
// (if they're on one) instead of only flipping a local "won't renew" flag.
//
// Security: same pattern as billing-portal.js. The caller's Supabase access
// token is verified server-side via Supabase's own auth server, so the email
// used to look up the Stripe customer is the token's real owner.

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://nhgaolgdzekzwywwdgat.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_jLvc4iVio_-0ciLN5oPaSA_JsMr4Dej";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey || !serviceRoleKey) {
    console.error("cancel-subscription: missing required env vars");
    return res.status(500).json({ error: "Server not configured" });
  }

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Not signed in" });

  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(token);
  if (userErr || !userData?.user?.email) return res.status(401).json({ error: "Not signed in" });
  const email = userData.user.email.toLowerCase();

  const supabaseAdmin = createClient(SUPABASE_URL, serviceRoleKey);
  const { data: student, error: findErr } = await supabaseAdmin
    .from("students").select("stripe_customer_id").eq("email", email).maybeSingle();
  if (findErr) {
    console.error("cancel-subscription: lookup failed:", findErr.message);
    return res.status(500).json({ error: "Couldn't look that up" });
  }
  if (!student?.stripe_customer_id) {
    // No Stripe customer on file (e.g. paid a different way), nothing to cancel there.
    return res.status(200).json({ ok: true, cancelled: 0 });
  }

  const stripe = new Stripe(secretKey);
  try {
    const subs = await stripe.subscriptions.list({ customer: student.stripe_customer_id, status: "active" });
    let cancelled = 0;
    for (const sub of subs.data) {
      await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
      cancelled++;
    }
    return res.status(200).json({ ok: true, cancelled });
  } catch (err) {
    console.error("cancel-subscription: stripe error:", err.message);
    return res.status(502).json({ error: "Couldn't reach Stripe" });
  }
}
