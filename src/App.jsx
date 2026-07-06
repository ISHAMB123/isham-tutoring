import React, { useState, useEffect, useMemo } from "react";

/* ============================================================
   Isham Tutoring — LIVE version, connected to Supabase.
   Every booking / sign-up / message saves to your database.
   GCSE weekends rotate: Wk1 Maths → Bio → Chem → Physics.
   NOTE: payments still simulated — swap in Stripe Payment
   Links where marked STRIPE below.
   ============================================================ */

/* ---- YOUR DATABASE ---- */
const SUPABASE_URL = "https://tmsvtiavhodtlvvaugdr.supabase.co";
const SUPABASE_KEY = "sb_publishable_uX2JC9t78GPJTMMgLcoeWA_9OVpc-8F";

/* ---- STRIPE: when your payment links are ready, paste them
   here and the Join buttons will send people to real checkout.
   Leave as null to keep the demo checkout. ---- */
const STRIPE_LINKS = { gcse: null, alevel: null, ucat: null };

const CAP = 20;
const MAX_PER_SLOT = 4;

const WEEKEND_BLOCKS = [
  { id: "b1", label: "8:00 – 10:00am" },
  { id: "b2", label: "10:15am – 12:15pm" },
  { id: "b3", label: "12:30 – 2:30pm" },
  { id: "b4", label: "2:45 – 4:45pm" },
];
const EVENING_BLOCK = [{ id: "e1", label: "7:00 – 9:00pm" }];

const SUBJECT_CYCLE = ["Maths", "Biology", "Chemistry", "Physics"];
const CYCLE_EPOCH = Date.UTC(2026, 0, 5);
function weekSubject(d) {
  const week = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - CYCLE_EPOCH) / (7 * 864e5));
  return SUBJECT_CYCLE[((week % 4) + 4) % 4];
}

const SUBJECT_COLORS = {
  Maths:           { bg: "#E7F0FE", border: "#2E7CD6", text: "#1D5FAF" },
  Biology:         { bg: "#E8F8EC", border: "#2FA45B", text: "#1F7A41" },
  Chemistry:       { bg: "#F1EBFE", border: "#7C5CE0", text: "#5B3EC4" },
  Physics:         { bg: "#FEF0E4", border: "#E8842E", text: "#B85F14" },
  "UCAT Strategy": { bg: "#E8F7F4", border: "#0FB5A0", text: "#0A8A7A" },
};

const PLANS = {
  gcse: {
    id: "gcse", name: "GCSE Sciences & Maths", price: 40, per: "/month", lessons: 8,
    blurb: "8 two-hour group lessons a month. Subjects rotate weekly — Maths week, then Biology, Chemistry, Physics — so you cover everything, twice each, every month.",
    subjects: SUBJECT_CYCLE, perSubjectCap: 2, days: "weekend", blocks: WEEKEND_BLOCKS, rotates: true,
  },
  alevel: {
    id: "alevel", name: "A-level Support", price: 40, per: "/month", lessons: 2,
    blurb: "2 evening lessons a month in your chosen subject. Wednesdays & Fridays, 7–9pm.",
    subjects: ["Maths", "Biology", "Chemistry"], perSubjectCap: 2, days: "evening", blocks: EVENING_BLOCK, rotates: false,
  },
  ucat: {
    id: "ucat", name: "UCAT Session", price: 15, per: " one-off", lessons: 1,
    blurb: "One evening strategy session from someone who's just sat it — timing, tactics and the sections that trip people up.",
    subjects: ["UCAT Strategy"], perSubjectCap: 1, days: "evening", blocks: EVENING_BLOCK, rotates: false,
  },
};

/* ---------- Supabase REST helpers ---------- */
async function sb(path, opts = {}) {
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: "Bearer " + SUPABASE_KEY,
    "Content-Type": "application/json",
  };
  if (opts.method === "POST") headers.Prefer = opts.upsert ? "resolution=merge-duplicates,return=representation" : "return=representation";
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, { ...opts, headers });
  if (!res.ok) {
    const t = await res.text();
    const err = new Error(t); err.status = res.status; throw err;
  }
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

const mapBooking = (r) => ({
  id: r.id, subscriberId: r.student_id, name: r.student_name, plan: r.plan,
  subject: r.subject, date: r.date, block: r.block, blockLabel: r.block_label, created: r.created,
});

async function fetchAll() {
  const [students, bookings, messages, links, settings] = await Promise.all([
    sb("students?select=*&order=joined.asc"),
    sb("bookings?select=*&order=date.asc"),
    sb("messages?select=*&order=created.asc"),
    sb("meet_links?select=*"),
    sb("settings?select=*").catch(() => []),
  ]);
  const meetLinks = {};
  for (const l of links) meetLinks[l.slot] = l.link;
  const pinRow = (settings || []).find((s) => s.key === "admin_pin");
  return {
    subscribers: students,
    bookings: bookings.map(mapBooking),
    messages,
    meetLinks,
    adminPin: pinRow ? pinRow.value : null,
  };
}

/* ---------- misc helpers ---------- */
const gbp = (n) => "£" + n.toLocaleString("en-GB");
const dateKey = (d) => d.toISOString().slice(0, 10);
const prettyDate = (d) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
const slotKey = (date, block) => date + "|" + block;

function upcomingDays(mode, count = 8) {
  const wanted = mode === "weekend" ? [6, 0] : [3, 5];
  const days = [];
  const d = new Date(); d.setHours(0, 0, 0, 0);
  while (days.length < count) {
    d.setDate(d.getDate() + 1);
    if (wanted.includes(d.getDay())) days.push(new Date(d));
  }
  return days;
}

/* ---------- styles ---------- */
const css = `
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap');
:root{
  --ink:#0F2A43; --ink-soft:#3D5A75; --mint:#0FB5A0; --mint-dark:#0A8A7A;
  --aqua:#E8F7F4; --paper:#FBFDFD; --coral:#FF6A5C; --line:#DCEAE7;
  --pop:linear-gradient(92deg,#0FB5A0 0%,#2E9BD6 55%,#7C6CF0 100%);
}
*{box-sizing:border-box} body{margin:0}
.it-app{font-family:'Inter',system-ui,sans-serif;color:var(--ink);background:var(--paper);min-height:100vh}
.it-display{font-family:'Sora','Inter',system-ui,sans-serif;letter-spacing:-0.02em}
.it-grad{background:var(--pop);-webkit-background-clip:text;background-clip:text;color:transparent}
.it-fade{animation:itfade .45s ease both}
@keyframes itfade{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes itfloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
.it-float{animation:itfloat 5s ease-in-out infinite}
.it-card{background:#fff;border:1px solid var(--line);border-radius:18px;transition:transform .25s ease, box-shadow .25s ease}
.it-card:hover{transform:translateY(-3px);box-shadow:0 12px 30px rgba(15,42,67,.09)}
.it-btn{background:var(--pop);color:#fff;border:none;border-radius:12px;padding:13px 24px;font-weight:700;cursor:pointer;transition:filter .2s, transform .15s;font-family:'Inter',sans-serif;font-size:15px;box-shadow:0 6px 18px rgba(46,155,214,.25)}
.it-btn:hover{filter:brightness(1.08);transform:translateY(-1px)}
.it-btn.ghost{background:#fff;color:var(--ink);border:1.5px solid var(--line);box-shadow:none}
.it-btn.ghost:hover{background:var(--aqua);filter:none}
.it-btn:disabled{opacity:.45;cursor:not-allowed;transform:none;filter:none}
.it-pip{width:14px;height:18px;border-radius:7px 7px 9px 9px;background:#E3EFEC;transition:background .4s}
.it-pip.on{background:var(--mint)}
.it-navlink{background:none;border:none;font:inherit;font-weight:500;color:var(--ink-soft);cursor:pointer;padding:8px 12px;border-radius:8px;transition:all .2s}
.it-navlink:hover{color:var(--ink);background:var(--aqua)}
.it-navlink.active{color:var(--mint-dark);background:var(--aqua);font-weight:700}
.it-input{width:100%;padding:11px 14px;border:1.5px solid var(--line);border-radius:10px;font:inherit;transition:border-color .2s;background:#fff}
.it-input:focus{outline:none;border-color:var(--mint)}
.it-slot{border-radius:12px;padding:12px 8px;font-size:13.5px;font-weight:700;cursor:pointer;transition:all .15s;text-align:center;border:1.5px solid var(--line);background:#fff;color:var(--ink)}
.it-slot:hover:not(:disabled){transform:translateY(-2px)}
.it-slot:disabled{opacity:.35;cursor:not-allowed}
.it-tag{display:inline-block;background:var(--aqua);color:var(--mint-dark);font-size:12px;font-weight:700;padding:4px 11px;border-radius:999px;letter-spacing:.05em;text-transform:uppercase}
.it-charity{background:linear-gradient(120deg,#FFF7E8,#FFEDE0);border:1.5px solid #F6DDB2}
.it-chip{display:inline-block;font-size:12px;font-weight:800;padding:4px 12px;border-radius:999px;letter-spacing:.03em}
@media(prefers-reduced-motion:reduce){.it-fade,.it-card,.it-btn,.it-float{animation:none;transition:none}}
`;

const SubjectChip = ({ subject }) => {
  const c = SUBJECT_COLORS[subject] || SUBJECT_COLORS.Maths;
  return <span className="it-chip" style={{ background: c.bg, color: c.text, border: "1px solid " + c.border }}>{subject}</span>;
};

function CapacityMeter({ taken }) {
  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {Array.from({ length: CAP }).map((_, i) => (
          <div key={i} className={"it-pip" + (i < taken ? " on" : "")} style={{ transitionDelay: `${i * 40}ms` }} />
        ))}
      </div>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: 0 }}>
        <strong style={{ color: taken >= CAP ? "var(--coral)" : "var(--mint-dark)" }}>
          {Math.max(CAP - taken, 0)} of {CAP} places left
        </strong> — capped so groups stay tiny and prices stay low.
      </p>
    </div>
  );
}

function CharityBanner() {
  return (
    <div className="it-card it-charity" style={{ padding: "22px 26px", display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
      <div className="it-float" style={{ fontSize: 40 }}>🤝</div>
      <div style={{ flex: 1, minWidth: 240 }}>
        <h3 className="it-display" style={{ margin: "0 0 4px", fontSize: 19, fontWeight: 800 }}>5% of everything goes back</h3>
        <p style={{ margin: 0, fontSize: 14.5, color: "#7A5A2E", lineHeight: 1.55 }}>
          5% of all earnings from this tutoring go to charity and local food banks. Food banks kept my family going once — this is me paying it forward.
        </p>
      </div>
    </div>
  );
}

function Home({ go, taken }) {
  return (
    <div className="it-fade">
      <section style={{ padding: "70px 24px 44px", maxWidth: 1000, margin: "0 auto" }}>
        <span className="it-tag">Built for families who can't afford £30/hour tutors</span>
        <h1 className="it-display" style={{ fontSize: "clamp(34px,5.5vw,60px)", lineHeight: 1.07, margin: "18px 0 14px", fontWeight: 800 }}>
          Top-grade tuition, <span className="it-grad">£5 a lesson.</span><br />Because money shouldn't decide your grades.
        </h1>
        <p style={{ fontSize: 18, color: "var(--ink-soft)", maxWidth: 660, lineHeight: 1.65 }}>
          I was born to a single mum and we were made homeless when I was 3. This September I start dental school.
          Tutoring got me nothing — hard work and free help did. This is that free-ish help, for the next kid like me.
        </p>
        <div style={{ display: "flex", gap: 12, margin: "26px 0 36px", flexWrap: "wrap" }}>
          <button className="it-btn" onClick={() => go("book")}>Book a lesson</button>
          <button className="it-btn ghost" onClick={() => go("pricing")}>See plans</button>
        </div>
        <CapacityMeter taken={taken} />
      </section>

      <section style={{ padding: "0 24px 40px", maxWidth: 1000, margin: "0 auto" }}>
        <div className="it-card" style={{ padding: "22px 26px" }}>
          <h3 className="it-display" style={{ margin: "0 0 10px", fontSize: 19, fontWeight: 800 }}>One subject a week, on rotation</h3>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {SUBJECT_CYCLE.map((s, i) => (
              <React.Fragment key={s}>
                <SubjectChip subject={s} />
                {i < 3 && <span style={{ color: "var(--ink-soft)" }}>→</span>}
              </React.Fragment>
            ))}
            <span style={{ color: "var(--ink-soft)", fontSize: 14 }}>→ repeat. Every subject, twice a month, no clashes.</span>
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 13.5, color: "var(--ink-soft)" }}>
            This week is <strong style={{ color: SUBJECT_COLORS[weekSubject(new Date())].text }}>{weekSubject(new Date())} week</strong>.
          </p>
        </div>
      </section>

      <section style={{ padding: "0 24px 40px", maxWidth: 1000, margin: "0 auto" }}>
        <CharityBanner />
      </section>

      <section style={{ background: "var(--ink)", color: "#fff", padding: "52px 24px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <span className="it-tag" style={{ background: "rgba(255,255,255,.12)", color: "#9FE8DD" }}>My story</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 20, marginTop: 22 }}>
            {[
              ["Age 3", "Made homeless. Raised by a single mum who never let me feel it."],
              ["GCSEs", "No tutors, no quiet desk — just library sessions and free resources. It worked."],
              ["Sixth form", "Predicted A*AA, AB in AS Chemistry & Maths, tutored 50+ students along the way."],
              ["This September", "Incoming dental student. Now I teach the way I wish someone had taught me."],
            ].map(([t, b]) => (
              <div key={t}>
                <div className="it-display it-grad" style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>{t}</div>
                <p style={{ color: "#C4D6E4", fontSize: 14.5, lineHeight: 1.6, margin: 0 }}>{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: "var(--aqua)", padding: "40px 24px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 18 }}>
          {[
            ["50+", "students tutored across GCSE science & maths"],
            ["4", "students max per group — everyone gets airtime"],
            ["2 hrs", "per lesson, weekends 8am–4:45pm on Google Meet"],
            ["5%", "of all earnings donated to charity & food banks"],
          ].map(([big, small]) => (
            <div key={big}>
              <div className="it-display" style={{ fontSize: 34, fontWeight: 800, color: "var(--mint-dark)" }}>{big}</div>
              <div style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.5 }}>{small}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: "56px 24px 64px", maxWidth: 1000, margin: "0 auto" }}>
        <div className="it-card" style={{ padding: 32 }}>
          <h2 className="it-display" style={{ fontSize: 26, fontWeight: 800, margin: "0 0 10px" }}>The Grade Promise</h2>
          <p style={{ color: "var(--ink-soft)", lineHeight: 1.65, margin: 0, maxWidth: 720, fontSize: 15.5 }}>
            Turn up, do the work I set, and I'm confident you'll be on track for a grade 7+ (A).
            If after a full term you don't feel your grades are moving, I'll refund your last month — no arguments.
          </p>
        </div>
      </section>
    </div>
  );
}

function Pricing({ startCheckout, taken }) {
  const full = taken >= CAP;
  return (
    <div className="it-fade" style={{ padding: "56px 24px", maxWidth: 1000, margin: "0 auto" }}>
      <h1 className="it-display" style={{ fontSize: 36, fontWeight: 800, marginBottom: 8 }}>Plans</h1>
      <p style={{ color: "var(--ink-soft)", marginBottom: 28 }}>
        Priced for families who can't stretch to normal tutoring. No contracts — cancel any month.{" "}
        {full ? "The programme is currently full — send a message to join the waitlist." : `${CAP - taken} places left.`}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(270px,1fr))", gap: 20 }}>
        {Object.values(PLANS).map((p) => (
          <div key={p.id} className="it-card" style={{ padding: 28, display: "flex", flexDirection: "column", ...(p.id === "gcse" ? { border: "2px solid var(--mint)" } : {}) }}>
            {p.id === "gcse" && <span className="it-tag" style={{ alignSelf: "flex-start", marginBottom: 10 }}>Most popular</span>}
            <h3 className="it-display" style={{ fontSize: 21, fontWeight: 800, margin: "0 0 6px" }}>{p.name}</h3>
            <div style={{ margin: "6px 0 12px" }}>
              <span className="it-display" style={{ fontSize: 38, fontWeight: 800 }}>{gbp(p.price)}</span>
              <span style={{ color: "var(--ink-soft)" }}>{p.per}</span>
            </div>
            <p style={{ fontSize: 14.5, color: "var(--ink-soft)", lineHeight: 1.6, flex: 1 }}>{p.blurb}</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
              {p.subjects.map((s) => <SubjectChip key={s} subject={s} />)}
            </div>
            <ul style={{ padding: 0, listStyle: "none", margin: "0 0 18px", fontSize: 14, color: "var(--ink-soft)", lineHeight: 2 }}>
              <li>✓ {p.lessons} × 2-hour lesson{p.lessons > 1 ? "s" : ""}{p.id !== "ucat" ? " / month" : ""}</li>
              <li>✓ {p.days === "weekend" ? "Weekends, 8am–4:45pm" : "Wed & Fri evenings, 7–9pm"}</li>
              <li>✓ Groups of {MAX_PER_SLOT} max · Google Meet</li>
            </ul>
            <button className="it-btn" disabled={full && p.id !== "ucat"} onClick={() => startCheckout(p.id)}>
              {p.id === "ucat" ? "Book UCAT session" : full ? "Programme full" : "Join plan"}
            </button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 26 }}><CharityBanner /></div>
    </div>
  );
}

function Checkout({ planId, onDone, onCancel }) {
  const plan = PLANS[planId];
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [paying, setPaying] = useState(false);
  const submit = async () => {
    if (!name.trim() || !email.includes("@")) return alert("Please enter your name and a valid email.");
    setPaying(true);
    try {
      await onDone({ name: name.trim(), email: email.trim().toLowerCase(), plan: planId });
      /* STRIPE: after saving the student, send them to real payment */
      if (STRIPE_LINKS[planId]) window.open(STRIPE_LINKS[planId], "_blank");
    } catch (e) {
      setPaying(false);
      if (String(e).includes("duplicate") || e.status === 409) alert("That email already has a plan — go to Book and enter it there.");
      else alert("Something went wrong saving your details — please try again.");
    }
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,42,67,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}>
      <div className="it-card it-fade" style={{ padding: 30, width: 420, maxWidth: "100%" }}>
        <h3 className="it-display" style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800 }}>{plan.name}</h3>
        <p style={{ color: "var(--ink-soft)", margin: "0 0 18px" }}>{gbp(plan.price)}{plan.per} · 5% goes to charity & food banks</p>
        <div style={{ display: "grid", gap: 12 }}>
          <input className="it-input" placeholder="Student name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="it-input" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          {!STRIPE_LINKS[planId] && (
            <div style={{ background: "var(--aqua)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "var(--ink-soft)" }}>
              Demo checkout — no card is charged yet. Payment details will be arranged by email until online payment goes live.
            </div>
          )}
          <button className="it-btn" onClick={submit} disabled={paying}>{paying ? "Saving…" : STRIPE_LINKS[planId] ? `Continue to payment — ${gbp(plan.price)}` : `Join — ${gbp(plan.price)}`}</button>
          <button className="it-btn ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function BookingChart({ plan, store, subject, sel, setSel, mine }) {
  const days = useMemo(() => upcomingDays(plan.days, 8), [plan.days]);
  const monthStr = new Date().toISOString().slice(0, 7);
  const mineMonth = mine.filter((b) => b.date.startsWith(monthStr));
  const left = plan.lessons - mineMonth.length;

  const subjectFor = (d) => (plan.rotates ? weekSubject(d) : subject);
  const countAt = (dk, blockId, subj) =>
    store.bookings.filter((b) => b.date === dk && b.block === blockId && b.subject === subj).length;

  return (
    <div>
      <div style={{ display: "flex", gap: 16, fontSize: 12.5, color: "var(--ink-soft)", margin: "0 0 12px", flexWrap: "wrap", alignItems: "center" }}>
        {plan.rotates && SUBJECT_CYCLE.map((s) => <SubjectChip key={s} subject={s} />)}
        <span style={{ marginLeft: "auto" }}>15-min breaks between every block</span>
      </div>

      <div className="it-card" style={{ padding: 16, overflowX: "auto" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 8, width: "100%", minWidth: plan.blocks.length > 1 ? 680 : 400 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", fontSize: 12.5, color: "var(--ink-soft)", fontWeight: 600, padding: "0 4px" }}>Date · subject</th>
              {plan.blocks.map((bl) => (
                <th key={bl.id} style={{ fontSize: 12.5, color: "var(--ink-soft)", fontWeight: 600 }}>{bl.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const dk = dateKey(d);
              const subj = subjectFor(d);
              const col = SUBJECT_COLORS[subj];
              const subjLeft = plan.perSubjectCap - mineMonth.filter((b) => b.subject === subj).length;
              return (
                <tr key={dk}>
                  <td style={{ whiteSpace: "nowrap", padding: "0 4px" }}>
                    <div className="it-display" style={{ fontWeight: 700, fontSize: 13.5 }}>{prettyDate(d)}</div>
                    <SubjectChip subject={subj} />
                  </td>
                  {plan.blocks.map((bl) => {
                    const n = countAt(dk, bl.id, subj);
                    const already = mine.some((b) => b.date === dk && b.block === bl.id);
                    const isSel = sel && sel.date === dk && sel.block === bl.id;
                    const disabled = n >= MAX_PER_SLOT || left <= 0 || subjLeft <= 0 || already;
                    return (
                      <td key={bl.id}>
                        <button className="it-slot"
                          style={{ width: "100%", background: isSel ? col.border : col.bg, borderColor: col.border, color: isSel ? "#fff" : col.text }}
                          disabled={disabled && !isSel}
                          onClick={() => setSel(isSel ? null : { date: dk, block: bl.id, label: bl.label, subject: subj })}>
                          {already ? "Booked ✓" : n >= MAX_PER_SLOT ? "Full" : `${MAX_PER_SLOT - n} seats`}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 10 }}>
        {left <= 0 ? "You've used all your lessons this month — more unlock next month."
          : `${left} lesson${left === 1 ? "" : "s"} left this month · max ${plan.perSubjectCap} per subject.`}
      </p>
    </div>
  );
}

function Book({ store, addBooking, refresh, go }) {
  const [email, setEmail] = useState("");
  const [me, setMe] = useState(null);
  const [subject, setSubject] = useState(null);
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState(false);

  const find = async () => {
    await refresh();
    const s = store.subscribers.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
    if (!s) return alert("No plan found for that email — join a plan first on the Plans page.");
    setMe(s); setSubject(PLANS[s.plan].subjects[0]);
  };

  if (!me)
    return (
      <div className="it-fade" style={{ padding: "64px 24px", maxWidth: 460, margin: "0 auto" }}>
        <h1 className="it-display" style={{ fontSize: 30, fontWeight: 800 }}>Book your lessons</h1>
        <p style={{ color: "var(--ink-soft)" }}>Enter the email you joined with to open the booking chart.</p>
        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          <input className="it-input" placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && find()} />
          <button className="it-btn" onClick={find}>Open my booking chart</button>
          <button className="it-btn ghost" onClick={() => go("pricing")}>I don't have a plan yet</button>
        </div>
      </div>
    );

  const plan = PLANS[me.plan];
  const mine = store.bookings.filter((b) => b.subscriberId === me.id);

  const confirm = async () => {
    if (!sel || busy) return;
    setBusy(true);
    try {
      await addBooking({
        student_id: me.id, student_name: me.name, plan: me.plan,
        subject: sel.subject || subject, date: sel.date, block: sel.block, block_label: sel.label,
      });
      setSel(null);
    } catch (e) {
      alert("Couldn't save that booking — the seat may have just been taken. The chart has been refreshed.");
      await refresh();
    }
    setBusy(false);
  };

  return (
    <div className="it-fade" style={{ padding: "48px 24px", maxWidth: 1000, margin: "0 auto" }}>
      <h1 className="it-display" style={{ fontSize: 30, fontWeight: 800, marginBottom: 4 }}>Hi {me.name.split(" ")[0]} 👋</h1>
      <p style={{ color: "var(--ink-soft)", marginBottom: 18 }}>
        {plan.name} — {plan.rotates
          ? "each week is one subject (see the colour on each date). Tap a slot to book."
          : "pick a subject, then tap a slot. Wednesday & Friday evenings, 7–9pm."}
      </p>

      {!plan.rotates && plan.subjects.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 20px" }}>
          {plan.subjects.map((s) => {
            const c = SUBJECT_COLORS[s];
            const on = subject === s;
            return (
              <button key={s} className="it-slot" style={{ padding: "9px 18px", background: on ? c.border : c.bg, borderColor: c.border, color: on ? "#fff" : c.text }}
                onClick={() => { setSubject(s); setSel(null); }}>
                {s}
              </button>
            );
          })}
        </div>
      )}

      <BookingChart plan={plan} store={store} subject={subject} sel={sel} setSel={setSel} mine={mine} />

      <div style={{ position: "sticky", bottom: 16, marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
        <button className="it-btn" disabled={!sel || busy} onClick={confirm}>
          {busy ? "Booking…" : sel ? `Confirm ${sel.subject || subject} · ${sel.label}` : "Select a slot on the chart"}
        </button>
      </div>

      {mine.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h3 className="it-display" style={{ fontSize: 18, fontWeight: 800 }}>Your upcoming lessons</h3>
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
            {[...mine].sort((a, b) => a.date.localeCompare(b.date)).map((b) => {
              const link = store.meetLinks[slotKey(b.date, b.block)];
              const c = SUBJECT_COLORS[b.subject] || SUBJECT_COLORS.Maths;
              return (
                <li key={b.id} style={{ background: c.bg, border: "1px solid " + c.border, borderRadius: 12, padding: "12px 14px", fontSize: 14, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <span><strong style={{ color: c.text }}>{b.subject}</strong> — {b.date} · {b.blockLabel}</span>
                  {link ? (
                    <a href={link} target="_blank" rel="noreferrer" className="it-btn" style={{ padding: "8px 16px", fontSize: 13.5, textDecoration: "none" }}>Join Google Meet →</a>
                  ) : (
                    <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Meet link appears here before the lesson</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function Contact({ addMessage }) {
  const [f, setF] = useState({ name: "", email: "", text: "" });
  const [sent, setSent] = useState(false);
  const submit = async () => {
    if (!f.name.trim() || !f.text.trim()) return alert("Please add your name and a message.");
    try { await addMessage(f); setSent(true); }
    catch (e) { alert("Couldn't send — please try again."); }
  };
  return (
    <div className="it-fade" style={{ padding: "56px 24px", maxWidth: 560, margin: "0 auto" }}>
      <h1 className="it-display" style={{ fontSize: 30, fontWeight: 800 }}>Questions?</h1>
      <p style={{ color: "var(--ink-soft)" }}>Money worries, subjects, exam boards, availability — ask anything. I usually reply within a day.</p>
      {sent ? (
        <div className="it-card" style={{ padding: 24, marginTop: 16 }}>
          <strong>Message sent ✓</strong>
          <p style={{ color: "var(--ink-soft)", margin: "6px 0 0" }}>Thanks {f.name.split(" ")[0]} — I'll get back to you at {f.email || "your email"}.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          <input className="it-input" placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input className="it-input" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <textarea className="it-input" rows={5} placeholder="Your question…" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
          <button className="it-btn" onClick={submit}>Send message</button>
        </div>
      )}
      <div style={{ marginTop: 32 }}>
        <h3 className="it-display" style={{ fontSize: 18, fontWeight: 800 }}>Quick answers</h3>
        {[
          ["How do GCSE subjects work?", "One subject per week on rotation: Maths week → Biology → Chemistry → Physics → repeat. You get every subject twice a month."],
          ["When are GCSE lessons?", "Weekends, in 2-hour blocks between 8am and 4:45pm, with 15-minute breaks between groups."],
          ["When are A-level & UCAT sessions?", "Wednesday and Friday evenings, 7–9pm."],
          ["Where are lessons held?", "Live on Google Meet — your join link appears on your booking page before each lesson."],
          ["How big are the groups?", "Never more than 4 students, so everyone gets time to ask questions."],
          ["Can I cancel?", "Yes — plans are monthly with no contract. Just don't renew."],
        ].map(([q, a]) => (
          <div key={q} style={{ borderBottom: "1px solid var(--line)", padding: "14px 0" }}>
            <strong style={{ fontSize: 15 }}>{q}</strong>
            <p style={{ color: "var(--ink-soft)", margin: "4px 0 0", fontSize: 14 }}>{a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SessionCard({ dk, block, list, subj, link, saveLink }) {
  const [draft, setDraft] = useState(link || "");
  const c = SUBJECT_COLORS[subj] || SUBJECT_COLORS.Maths;
  const copyInvite = () => {
    const msg = `Hi! Your ${subj} lesson is on ${dk}, ${block.label}. Join here: ${draft || "(link coming soon)"} — Isham`;
    if (navigator.clipboard) navigator.clipboard.writeText(msg).then(() => alert("Invite message copied — paste it into email or WhatsApp."));
    else alert(msg);
  };
  return (
    <div style={{ border: "1.5px solid " + c.border, background: c.bg, borderRadius: 14, padding: 14, marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <div>
          <strong style={{ color: c.text }}>{block.label}</strong>{" "}
          <SubjectChip subject={subj} />{" "}
          <span style={{ fontSize: 13, fontWeight: 700, color: list.length >= MAX_PER_SLOT ? "var(--coral)" : c.text }}>
            {list.length}/{MAX_PER_SLOT} booked
          </span>
        </div>
      </div>
      <div style={{ fontSize: 13.5, margin: "8px 0", color: "var(--ink)" }}>
        {list.length ? list.map((b) => b.name).join(" · ") : "No students yet"}
      </div>
      {list.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input className="it-input" style={{ flex: 1, minWidth: 220, padding: "8px 12px", fontSize: 13.5 }} placeholder="Paste Google Meet link (meet.google.com/…)"
            value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button className="it-btn ghost" style={{ padding: "8px 14px", fontSize: 13 }} onClick={async () => { await saveLink(draft.trim()); alert("Saved — students now see this link on their booking page."); }}>Save link</button>
          <button className="it-btn" style={{ padding: "8px 14px", fontSize: 13 }} onClick={copyInvite}>Copy invite</button>
        </div>
      )}
    </div>
  );
}

function Admin({ store, setPin, saveMeet, removeSubscriber, refresh }) {
  const [pin, setPinInput] = useState("");
  const [pin2, setPin2] = useState("");
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { refresh(); }, []);

  if (!store.adminPin && !ok)
    return (
      <div className="it-fade" style={{ padding: "72px 24px", maxWidth: 400, margin: "0 auto" }}>
        <h1 className="it-display" style={{ fontSize: 26, fontWeight: 800 }}>Set up tutor access</h1>
        <p style={{ color: "var(--ink-soft)", fontSize: 14.5 }}>First time here — create a PIN only you know.</p>
        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          <input className="it-input" type="password" placeholder="Create a PIN (6+ characters)" value={pin} onChange={(e) => setPinInput(e.target.value)} />
          <input className="it-input" type="password" placeholder="Repeat PIN" value={pin2} onChange={(e) => setPin2(e.target.value)} />
          <button className="it-btn" onClick={async () => {
            if (pin.length < 6) return setErr("Use at least 6 characters.");
            if (pin !== pin2) return setErr("PINs don't match.");
            await setPin(pin); setOk(true); setErr("");
          }}>Create PIN & open dashboard</button>
          {err && <p style={{ color: "var(--coral)", fontSize: 13, margin: 0 }}>{err}</p>}
        </div>
      </div>
    );

  if (!ok)
    return (
      <div className="it-fade" style={{ padding: "72px 24px", maxWidth: 380, margin: "0 auto" }}>
        <h1 className="it-display" style={{ fontSize: 26, fontWeight: 800 }}>Tutor login</h1>
        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          <input className="it-input" type="password" placeholder="PIN" value={pin} onChange={(e) => setPinInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (pin === store.adminPin ? setOk(true) : setErr("Wrong PIN."))} />
          <button className="it-btn" onClick={() => (pin === store.adminPin ? setOk(true) : setErr("Wrong PIN."))}>Enter</button>
          {err && <p style={{ color: "var(--coral)", fontSize: 13, margin: 0 }}>{err}</p>}
        </div>
      </div>
    );

  const subs = store.subscribers;
  const monthly = subs.reduce((t, s) => t + (s.plan === "ucat" ? 0 : PLANS[s.plan].price), 0);
  const ucatRevenue = subs.filter((s) => s.plan === "ucat").length * PLANS.ucat.price;
  const charity = (monthly + ucatRevenue) * 0.05;
  const capped = subs.filter((s) => s.plan !== "ucat").length;

  const byDate = {};
  for (const b of store.bookings) {
    byDate[b.date] = byDate[b.date] || {};
    byDate[b.date][b.block] = byDate[b.date][b.block] || [];
    byDate[b.date][b.block].push(b);
  }
  const dates = Object.keys(byDate).sort();
  const blockDef = (id) => WEEKEND_BLOCKS.concat(EVENING_BLOCK).find((x) => x.id === id) || { id, label: id };

  return (
    <div className="it-fade" style={{ padding: "48px 24px", maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
        <h1 className="it-display" style={{ fontSize: 30, fontWeight: 800, margin: 0 }}>Dashboard</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="it-btn ghost" style={{ padding: "8px 14px", fontSize: 13.5 }} onClick={refresh}>↻ Refresh</button>
          <button className="it-btn ghost" style={{ padding: "8px 14px", fontSize: 13.5 }} onClick={async () => {
            const np = prompt("New PIN (6+ characters):");
            if (np && np.length >= 6) { await setPin(np); alert("PIN updated."); }
            else if (np) alert("Too short — PIN unchanged.");
          }}>Change PIN</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, marginBottom: 30 }}>
        {[
          ["Recurring / month", gbp(monthly)],
          ["UCAT (one-off)", gbp(ucatRevenue)],
          ["Charity pot (5%)", "£" + charity.toFixed(2)],
          ["Students on plans", `${capped} / ${CAP}`],
          ["Lessons booked", String(store.bookings.length)],
          ["Messages", String(store.messages.length)],
        ].map(([k, v]) => (
          <div key={k} className="it-card" style={{ padding: 20 }}>
            <div style={{ fontSize: 12.5, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 }}>{k}</div>
            <div className="it-display" style={{ fontSize: 27, fontWeight: 800, color: "var(--mint-dark)" }}>{v}</div>
          </div>
        ))}
      </div>

      <h2 className="it-display" style={{ fontSize: 20, fontWeight: 800 }}>Timetable — who booked what & when</h2>
      <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 4 }}>Paste a Google Meet link into any session — students instantly see it on their booking page. "Copy invite" gives you a ready-made message to send.</p>
      {dates.length === 0 && <p style={{ color: "var(--ink-soft)" }}>No bookings yet.</p>}
      {dates.map((dk) => {
        const d = new Date(dk + "T00:00:00");
        const total = Object.values(byDate[dk]).reduce((t, l) => t + l.length, 0);
        return (
          <div key={dk} className="it-card" style={{ padding: 18, marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <strong className="it-display" style={{ fontSize: 16 }}>{prettyDate(d)}</strong>
              <span style={{ fontSize: 13, color: "var(--ink-soft)", fontWeight: 700 }}>{total} booking{total === 1 ? "" : "s"}</span>
            </div>
            {Object.entries(byDate[dk]).sort().map(([blockId, list]) => (
              <SessionCard key={blockId} dk={dk} block={blockDef(blockId)} list={list} subj={list[0].subject}
                link={store.meetLinks[slotKey(dk, blockId)]}
                saveLink={(l) => saveMeet(slotKey(dk, blockId), l)} />
            ))}
          </div>
        );
      })}

      <h2 className="it-display" style={{ fontSize: 20, fontWeight: 800, marginTop: 34 }}>Students</h2>
      <div className="it-card" style={{ padding: 18, marginTop: 12, overflowX: "auto" }}>
        {subs.length === 0 ? <p style={{ color: "var(--ink-soft)", margin: 0 }}>No sign-ups yet.</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr style={{ textAlign: "left", color: "var(--ink-soft)" }}><th style={{ padding: 6 }}>Name</th><th style={{ padding: 6 }}>Email</th><th style={{ padding: 6 }}>Plan</th><th style={{ padding: 6 }}>Joined</th><th /></tr></thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: 6, fontWeight: 600 }}>{s.name}</td>
                  <td style={{ padding: 6 }}>{s.email}</td>
                  <td style={{ padding: 6 }}>{PLANS[s.plan].name}</td>
                  <td style={{ padding: 6, color: "var(--ink-soft)" }}>{(s.joined || "").slice(0, 10)}</td>
                  <td style={{ padding: 6 }}><button className="it-btn ghost" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => { if (confirm(`Remove ${s.name} and all their bookings?`)) removeSubscriber(s.id); }}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2 className="it-display" style={{ fontSize: 20, fontWeight: 800, marginTop: 34 }}>Messages</h2>
      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {store.messages.length === 0 && <p style={{ color: "var(--ink-soft)" }}>No questions yet.</p>}
        {[...store.messages].reverse().map((m) => (
          <div key={m.id} className="it-card" style={{ padding: 16 }}>
            <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>{(m.created || "").slice(0, 16).replace("T", " · ")} — <strong style={{ color: "var(--ink)" }}>{m.name}</strong> {m.email && `(${m.email})`}</div>
            <p style={{ margin: "6px 0 0", fontSize: 14.5 }}>{m.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- app shell ---------- */
export default function App() {
  const [page, setPage] = useState("home");
  const [store, setStore] = useState({ subscribers: [], bookings: [], messages: [], meetLinks: {}, adminPin: null });
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState(null);
  const [toast, setToast] = useState(null);

  const refresh = async () => {
    try { const d = await fetchAll(); setStore(d); setLoadErr(false); return d; }
    catch (e) { console.error(e); setLoadErr(true); }
  };
  useEffect(() => { refresh().finally(() => setLoaded(true)); }, []);
  const notify = (t) => { setToast(t); setTimeout(() => setToast(null), 3200); };

  const addStudent = async (s) => {
    const [row] = await sb("students", { method: "POST", body: JSON.stringify(s) });
    setStore((st) => ({ ...st, subscribers: [...st.subscribers, row] }));
    return row;
  };
  const addBooking = async (b) => {
    const [row] = await sb("bookings", { method: "POST", body: JSON.stringify(b) });
    setStore((st) => ({ ...st, bookings: [...st.bookings, mapBooking(row)] }));
    notify("Lesson booked ✓ — your Meet link will appear here");
  };
  const addMessage = async (m) => {
    const [row] = await sb("messages", { method: "POST", body: JSON.stringify(m) });
    setStore((st) => ({ ...st, messages: [...st.messages, row] }));
  };
  const saveMeet = async (slot, link) => {
    await sb("meet_links?on_conflict=slot", { method: "POST", upsert: true, body: JSON.stringify({ slot, link }) });
    setStore((st) => ({ ...st, meetLinks: { ...st.meetLinks, [slot]: link } }));
  };
  const setPin = async (value) => {
    await sb("settings?on_conflict=key", { method: "POST", upsert: true, body: JSON.stringify({ key: "admin_pin", value }) });
    setStore((st) => ({ ...st, adminPin: value }));
  };
  const removeSubscriber = async (id) => {
    await sb("students?id=eq." + id, { method: "DELETE" });
    setStore((st) => ({
      ...st,
      subscribers: st.subscribers.filter((s) => s.id !== id),
      bookings: st.bookings.filter((b) => b.subscriberId !== id),
    }));
  };

  const taken = store.subscribers.filter((s) => s.plan !== "ucat").length;
  const nav = [["home", "Home"], ["pricing", "Plans"], ["book", "Book"], ["contact", "Questions"]];

  return (
    <div className="it-app">
      <style>{css}</style>
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(251,253,253,.92)", backdropFilter: "blur(8px)", borderBottom: "1px solid var(--line)" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px" }}>
          <button onClick={() => setPage("home")} className="it-display" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 19, fontWeight: 800, color: "var(--ink)" }}>
            isham<span className="it-grad">.tutoring</span>
          </button>
          <nav style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            {nav.map(([id, label]) => (
              <button key={id} className={"it-navlink" + (page === id ? " active" : "")} onClick={() => setPage(id)}>{label}</button>
            ))}
          </nav>
        </div>
      </header>

      {loadErr && (
        <div style={{ background: "#FFF1EF", borderBottom: "1px solid #F6C4BC", padding: "10px 24px", fontSize: 13.5, color: "#8A3126", textAlign: "center" }}>
          Couldn't reach the booking database — check your connection and refresh.
        </div>
      )}

      {!loaded ? (
        <p style={{ textAlign: "center", padding: 80, color: "var(--ink-soft)" }}>Loading…</p>
      ) : page === "home" ? (
        <Home go={setPage} taken={taken} />
      ) : page === "pricing" ? (
        <Pricing taken={taken} startCheckout={(id) => setCheckoutPlan(id)} />
      ) : page === "book" ? (
        <Book store={store} go={setPage} addBooking={addBooking} refresh={refresh} />
      ) : page === "contact" ? (
        <Contact addMessage={addMessage} />
      ) : (
        <Admin store={store} setPin={setPin} saveMeet={saveMeet} removeSubscriber={removeSubscriber} refresh={refresh} />
      )}

      {checkoutPlan && (
        <Checkout planId={checkoutPlan} onCancel={() => setCheckoutPlan(null)}
          onDone={async (s) => {
            const row = await addStudent(s);
            setCheckoutPlan(null); setPage("book");
            notify(`Welcome, ${row.name.split(" ")[0]}! Now book your slots.`);
          }} />
      )}

      {toast && (
        <div className="it-fade" style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "var(--ink)", color: "#fff", padding: "12px 20px", borderRadius: 12, fontSize: 14.5, zIndex: 60, boxShadow: "0 10px 30px rgba(0,0,0,.25)" }}>
          {toast}
        </div>
      )}

      <footer style={{ borderTop: "1px solid var(--line)", padding: "28px 24px", marginTop: 40 }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, fontSize: 13.5, color: "var(--ink-soft)" }}>
          <span>© {new Date().getFullYear()} Isham Tutoring · 5% of earnings to charity & food banks · TikTok <a href="https://www.tiktok.com/@ishamdoesdentistry" target="_blank" rel="noreferrer" style={{ color: "var(--mint-dark)", fontWeight: 700 }}>@ishamdoesdentistry</a></span>
          <button className="it-navlink" style={{ fontSize: 13.5 }} onClick={() => setPage("admin")}>Tutor login</button>
        </div>
      </footer>
    </div>
  );
}
