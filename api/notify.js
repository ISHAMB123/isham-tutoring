// Vercel serverless function — sends emails via Resend.
// The API key lives in Vercel env vars (RESEND_API_KEY), never in the frontend.

const OWNER = "hello@ishamtuition.com";
const FROM = "Isham Tuition <hello@ishamtuition.com>";
const WHATSAPP_LINK = "https://chat.whatsapp.com/EZPjHGM5zlq5yt4RyFbrFO?s=cl&p=i&mlu=4&ilr=4";
const INK = "#0B1B33";
const MINT = "#0E7C86";
const MINT_DARK = "#0B5F68";
const PAPER = "#FAFAFA";
const LINE = "#E5E7EB";
const clip = (s, n) => String(s || "").slice(0, n);

// Shared branded shell so every email looks like it came from the same site,
// not three unrelated plain-text notes. Table-based layout and inline styles
// throughout, since email clients (Outlook especially) ignore modern CSS.
function wrapEmail(bodyHtml) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:${PAPER};font-family:Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${LINE};">
            <tr>
              <td style="background:${INK};padding:20px 28px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background:${MINT};width:28px;height:28px;border-radius:8px;text-align:center;vertical-align:middle;font-weight:800;font-size:16px;color:#ffffff;font-family:Arial,sans-serif;">i</td>
                    <td style="padding-left:10px;color:#ffffff;font-weight:700;font-size:16px;letter-spacing:.02em;">Isham Tuition</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;font-size:15px;line-height:1.6;color:${INK};">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;border-top:1px solid ${LINE};font-size:12px;color:#8A8878;">
                Isham Tuition · GCSE group tuition &amp; the Y13 Scholarship ·
                <a href="https://www.ishamtuition.com" style="color:${MINT_DARK};text-decoration:none;">ishamtuition.com</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function button(label, href) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0;">
    <tr><td style="background:${INK};border-radius:10px;">
      <a href="${href}" style="display:inline-block;padding:12px 22px;color:#ffffff;font-weight:700;font-size:14px;text-decoration:none;">${label}</a>
    </td></tr>
  </table>`;
}

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
    html = wrapEmail(`
      <p style="margin:0 0 14px;">Hi ${name},</p>
      <p style="margin:0 0 14px;">You're signed up to the <strong>${plan}</strong>. Here's what happens next:</p>
      <ol style="margin:0 0 14px;padding-left:20px;">
        <li style="margin-bottom:8px;">Complete payment if you haven't already (link on the site / in your inbox).</li>
        <li style="margin-bottom:8px;">Once I confirm it, your place is locked in, you're free to book your lessons right away.</li>
        <li>Your Google Meet link appears on your booking page before each lesson.</li>
      </ol>
      ${button("Book your lessons", "https://www.ishamtuition.com")}
      <p style="margin:0 0 14px;">Questions? Just reply to this email.</p>
      <p style="margin:0;">Isham</p>
    `);
  } else if (type === "applied") {
    const plan = clip(req.body.plan, 60);
    to = [email]; bcc = [OWNER];
    subject = "You're in, one last step (72 hours) — Isham Tuition";
    html = wrapEmail(`
      <p style="margin:0 0 14px;">Hi ${name},</p>
      <p style="margin:0 0 14px;">Good news, you've been accepted onto the <strong>${plan}</strong>.</p>
      <p style="margin:0 0 14px;">One last step to confirm your place: join the WhatsApp group below within the next <strong>72 hours</strong>. It's how we send lesson reminders, links and updates.</p>
      ${button("Join the WhatsApp group", WHATSAPP_LINK)}
      <p style="margin:0 0 14px;">If we haven't heard from you in 72 hours, we'll assume the place isn't needed any more and offer it to the next family on the list, so please don't leave it too late.</p>
      <p style="margin:0 0 14px;">Questions? Just reply to this email.</p>
      <p style="margin:0;">Isham</p>
    `);
  } else if (type === "booking") {
    const subj = clip(req.body.subject, 40);
    const date = clip(req.body.date, 20);
    const time = clip(req.body.time, 40);
    to = [email]; bcc = [OWNER];
    subject = `Booked ✓ ${subj}, ${date}`;
    html = wrapEmail(`
      <p style="margin:0 0 14px;">Hi ${name},</p>
      <p style="margin:0 0 6px;">Your lesson is booked:</p>
      <p style="margin:0 0 16px;font-size:17px;font-weight:700;">${subj}<br>${date}<br>${time}</p>
      <p style="margin:0 0 14px;">Your Google Meet link will appear on your booking page before the lesson.</p>
      ${button("Go to your booking page", "https://www.ishamtuition.com")}
      <p style="margin:0 0 14px;">Can't make it? Reply to this email and I'll move you.</p>
      <p style="margin:0;">Isham</p>
    `);
  } else if (type === "message") {
    const text = clip(req.body.text, 2000);
    to = [OWNER]; bcc = [];
    subject = `New question from ${name || "the website"}`;
    html = wrapEmail(`
      <p style="margin:0 0 10px;"><strong>${name}</strong> (${email || "no email given"}) asked:</p>
      <blockquote style="margin:0 0 14px;padding:12px 16px;background:#F3F7E9;border-left:3px solid ${MINT_DARK};border-radius:4px;">${text.replace(/</g, "&lt;")}</blockquote>
      <p style="margin:0;">Reply to them at: ${email || "not given"}</p>
    `);
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
