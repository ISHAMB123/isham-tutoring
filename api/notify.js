// Vercel serverless function — sends emails via Resend.
// The API key lives in Vercel env vars (RESEND_API_KEY), never in the frontend.

const OWNER = "ishambari6@gmail.com";
const FROM = "Isham Tuition <hello@ishamtuition.com>";
const clip = (s, n) => String(s || "").slice(0, n);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.RESEND_API_KEY;
  if (!key) return res.status(500).json({ error: "RESEND_API_KEY not configured" });

  const { type } = req.body || {};
  const name = clip(req.body.name, 80);
  const email = clip(req.body.email, 120);
  let to, bcc, subject, html;

  if (type === "signup") {
    const plan = clip(req.body.plan, 60);
    to = [email]; bcc = [OWNER];
    subject = "Welcome to Isham Tuition 🎉";
    html = `<p>Hi ${name},</p>
      <p>You're signed up to the <strong>${plan}</strong>. Here's what happens next:</p>
      <ol>
        <li>Complete payment if you haven't already (link on the site / in your inbox).</li>
        <li>Once I confirm it, your place is locked in — you're free to book your lessons right away at <a href="https://ishamtuition.com">ishamtuition.com</a> (Book → enter this email).</li>
        <li>Your Google Meet link appears on your booking page before each lesson.</li>
      </ol>
      <p>Questions? Just reply to this email.</p>
      <p>— Isham</p>`;
  } else if (type === "booking") {
    const subj = clip(req.body.subject, 40);
    const date = clip(req.body.date, 20);
    const time = clip(req.body.time, 40);
    to = [email]; bcc = [OWNER];
    subject = `Booked ✓ ${subj} — ${date}`;
    html = `<p>Hi ${name},</p>
      <p>Your lesson is booked:</p>
      <p style="font-size:16px"><strong>${subj}</strong><br>${date}<br>${time}</p>
      <p>Your Google Meet link will appear on your booking page at <a href="https://ishamtuition.com">ishamtuition.com</a> before the lesson (Book → enter this email).</p>
      <p>Can't make it? Reply to this email and I'll move you.</p>
      <p>— Isham</p>`;
  } else if (type === "message") {
    const text = clip(req.body.text, 2000);
    to = [OWNER]; bcc = [];
    subject = `New question from ${name || "the website"}`;
    html = `<p><strong>${name}</strong> (${email || "no email given"}) asked:</p>
      <blockquote>${text.replace(/</g, "&lt;")}</blockquote>
      <p>Reply to them at: ${email || "—"}</p>`;
  } else {
    return res.status(400).json({ error: "unknown type" });
  }

  if (type !== "message" && !email.includes("@")) return res.status(400).json({ error: "bad email" });

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, bcc, reply_to: OWNER, subject, html }),
  });
  if (!r.ok) return res.status(502).json({ error: "send failed" });
  return res.status(200).json({ ok: true });
}
