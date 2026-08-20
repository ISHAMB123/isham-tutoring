// Vercel serverless function — Stripe calls this the instant a payment
// succeeds, so a student's plan is confirmed automatically instead of
// Isham having to manually click "Confirm paid" for each one.
//
// Security: every request is checked against STRIPE_WEBHOOK_SECRET using
// Stripe's official signature verification (stripe.webhooks.constructEvent).
// That secret is only known to Stripe and this server — a request without
// a valid signature is rejected before any database write happens, so
// nobody can fake a "payment received" call from outside. The database
// write itself uses the Supabase *service role* key, which lives only in
// Vercel's server-side environment variables and is never sent to the
// browser or committed to the repo.

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const config = { api: { bodyParser: false } };

const SUPABASE_URL = "https://nhgaolgdzekzwywwdgat.supabase.co";
const PLAN_MONTHS = { gcse: 1, gcse3: 3, alevel: 1 };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("POST only");

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey || !webhookSecret || !serviceRoleKey) {
    console.error("stripe-webhook: missing required env vars");
    return res.status(500).end("Server not configured");
  }

  const signature = req.headers["stripe-signature"];
  if (!signature) return res.status(400).end("Missing signature");

  const stripe = new Stripe(secretKey);
  let event;
  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("stripe-webhook: signature verification failed:", err.message);
    return res.status(400).end("Invalid signature");
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email = (session.customer_details?.email || session.customer_email || "").trim().toLowerCase();

    if (email) {
      const supabaseAdmin = createClient(SUPABASE_URL, serviceRoleKey);
      const { data: student, error: findErr } = await supabaseAdmin
        .from("students")
        .select("id, plan, paid_until")
        .eq("email", email)
        .maybeSingle();

      if (findErr) {
        console.error("stripe-webhook: lookup failed:", findErr.message);
      } else if (!student) {
        console.warn("stripe-webhook: payment received for unknown email:", email);
      } else {
        const months = PLAN_MONTHS[student.plan] || 1;
        const base = student.paid_until && new Date(student.paid_until) > new Date()
          ? new Date(student.paid_until)
          : new Date();
        base.setMonth(base.getMonth() + months);
        const paidUntil = base.toISOString().slice(0, 10);
        const update = { paid_until: paidUntil, cancelled: false };
        // Payment Links create a Stripe Customer for the checkout — store its id so
        // Billing can hand out a real Stripe-hosted portal link (card, invoices, receipts)
        // instead of saying that's not available.
        if (session.customer) update.stripe_customer_id = session.customer;
        const { error: updateErr } = await supabaseAdmin
          .from("students")
          .update(update)
          .eq("id", student.id);
        if (updateErr) console.error("stripe-webhook: update failed:", updateErr.message);
      }
    }
  }

  return res.status(200).json({ received: true });
}
