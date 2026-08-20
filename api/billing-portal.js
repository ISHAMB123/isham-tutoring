// Vercel serverless function — hands a signed-in student a link into
// Stripe's own hosted billing portal (card details, invoice history,
// receipts) instead of the app trying to model any of that itself.
//
// Security: the caller's Supabase access token is verified server-side via
// Supabase's own auth server (supabaseAuth.auth.getUser), so the email used
// to look up a Stripe customer is the token's real owner — never a value
// the client could just type in. The Stripe secret key and the Supabase
// service-role key stay server-side only, same as api/stripe-webhook.js.

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://nhgaolgdzekzwywwdgat.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_jLvc4iVio_-0ciLN5oPaSA_JsMr4Dej";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey || !serviceRoleKey) {
    console.error("billing-portal: missing required env vars");
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
    console.error("billing-portal: lookup failed:", findErr.message);
    return res.status(500).json({ error: "Couldn't look that up" });
  }
  if (!student?.stripe_customer_id) {
    return res.status(404).json({ error: "no_customer" });
  }

  const stripe = new Stripe(secretKey);
  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: student.stripe_customer_id,
      return_url: "https://www.ishamtuition.com/",
    });
    return res.status(200).json({ url: portal.url });
  } catch (err) {
    console.error("billing-portal: stripe error:", err.message);
    return res.status(502).json({ error: "Couldn't open the billing portal" });
  }
}
