import React, { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

/* ============================================================
   Isham Tutoring — LIVE version, connected to Supabase.
   Every booking / sign-up / message saves to your database.
   GCSE weekends rotate: Wk1 Maths → Bio → Chem → Physics.
   NOTE: payments still simulated — swap in Stripe Payment
   Links where marked STRIPE below.
   ============================================================ */

/* ---- YOUR DATABASE ---- */
const SUPABASE_URL = "https://nhgaolgdzekzwywwdgat.supabase.co";
const SUPABASE_KEY = "sb_publishable_jLvc4iVio_-0ciLN5oPaSA_JsMr4Dej";

/* ---- TUTOR & STRIPE ---- */
const TUTORS = {
  isham: { id: "isham", name: "Isham Bari", email: "ishambari6@gmail.com", dept: "stem", master: true },
};
const FEES = { isham: 0 };
const feeRate = (tid) => FEES[tid] || 0;

const STRIPE_LIVE = {
  isham: {
    gcse:  "https://buy.stripe.com/dRm3cudfR5297eHdT0es000",
    gcse3: "https://buy.stripe.com/8x200i6RtgKR8iL02aes001",
    alevel:"https://buy.stripe.com/5kQ4gy4JlfGN9mP6qyes002",
  },
};

/* Stripe TEST-mode links — pay with card 4242 4242 4242 4242, any future
   expiry/CVC, nothing real is charged. Plans with no test link below fall
   back to the demo-checkout notice while STRIPE_MODE is "test". Flip
   STRIPE_MODE back to "live" once you're done testing. */
const STRIPE_TEST = {
  isham: {
    gcse: "https://buy.stripe.com/test_dRm3cudfR5297eHdT0es000",
  },
};

const STRIPE_MODE = "test"; // "test" | "live"
const STRIPE = STRIPE_MODE === "test" ? STRIPE_TEST : STRIPE_LIVE;

const CONTACT = { phone: "07477 514 013", phoneIntl: "+447477514013", email: "ishambari6@gmail.com" };
const CAP = 20;

const WEEKEND_BLOCKS = [
  { id: "b1", label: "9:00 – 10:30am",  s: 540,  e: 630 },
  { id: "b2", label: "10:45 – 12:15",   s: 645,  e: 735 },
  { id: "b3", label: "1:00 – 2:30pm",   s: 780,  e: 870 },
  { id: "b4", label: "2:45 – 4:15pm",   s: 885,  e: 975 },
];
const EVENING_BLOCK = [
  { id: "e1", label: "7:00 – 8:00pm",  s: 1140, e: 1200 },
  { id: "e2", label: "8:15 – 9:15pm",  s: 1215, e: 1275 },
];
const ALL_BLOCKS = [...WEEKEND_BLOCKS, ...EVENING_BLOCK];

const SUBJECT_CYCLE = ["Maths", "Biology", "Chemistry", "Physics"];
const CYCLE_EPOCH = Date.UTC(2026, 0, 5);
function weekSubject(d, cycle = SUBJECT_CYCLE) {
  const week = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - CYCLE_EPOCH) / (7 * 864e5));
  return cycle[((week % cycle.length) + cycle.length) % cycle.length];
}

const SUBJECT_COLORS = {
  Maths:           { bg: "#E7F0FE", border: "#2E7CD6", text: "#1D5FAF" },
  Biology:         { bg: "#E8F8EC", border: "#2FA45B", text: "#1F7A41" },
  Chemistry:       { bg: "#F1EBFE", border: "#7C5CE0", text: "#5B3EC4" },
  Physics:         { bg: "#FEF0E4", border: "#E8842E", text: "#B85F14" },
};

const PLANS = {
  gcse: {
    id: "gcse", name: "GCSE Sciences & Maths", price: 40, per: "/month", lessons: 8, months: 1,
    blurb: "8 group lessons a month (90 minutes each) — 12 hours of live teaching for £3.33 an hour. Subjects rotate weekly: Maths, Biology, Chemistry, Physics — everything covered twice a month. Every place is subsidised — priced well below what tutoring normally costs, on purpose, so any family can afford it.",
    subjects: SUBJECT_CYCLE, cycle: SUBJECT_CYCLE, perSubjectCap: 2, days: "weekend", blocks: WEEKEND_BLOCKS, rotates: true, seats: 5, dept: "stem",
    deal: "Subsidised place · £5 a lesson",
  },
  gcse3: {
    id: "gcse3", name: "Term Deal (Sciences)", price: 110, per: " / 3 months", lessons: 8, months: 3,
    blurb: "The same subsidised GCSE sciences plan, paid for the term: 24 lessons across 3 months for £110 instead of £120 — sort it once and forget it.",
    subjects: SUBJECT_CYCLE, cycle: SUBJECT_CYCLE, perSubjectCap: 2, days: "weekend", blocks: WEEKEND_BLOCKS, rotates: true, seats: 5, dept: "stem",
  },
  alevel: {
    id: "alevel", name: "A-level STEM Support", price: 40, per: "/month", lessons: 2, months: 1,
    blurb: "2 private one-to-one evening lessons a month (1 hour each) in your chosen subject — just you and the tutor. Wednesdays & Fridays.",
    subjects: ["Maths", "Biology", "Chemistry"], perSubjectCap: 2, days: "evening", blocks: EVENING_BLOCK, rotates: false, seats: 1, dept: "stem",
  },
};

const supa = createClient(SUPABASE_URL, SUPABASE_KEY);

const mapBooking = (r) => ({
  id: r.id, subscriberId: r.student_id, name: r.student_name, plan: r.plan,
  subject: r.subject, date: r.date, block: r.block, blockLabel: r.block_label, created: r.created,
});

async function fetchAll() {
  const [st, bk, ms, ml, ts, caps, ln] = await Promise.all([
    supa.from("students").select("*").order("joined"),      // returns [] unless logged in as tutor
    supa.from("bookings").select("*").order("date"),
    supa.from("messages").select("*").order("created"),      // returns [] unless logged in as tutor
    supa.from("meet_links").select("*"),
    supa.from("testimonials").select("*").order("created"),
    supa.rpc("get_caps"),                                     // safe public per-department counts for the capacity meters
    supa.from("lesson_notes").select("*"),                    // RLS-scoped: tutors see all, a student sees only their own
  ]);
  const meetLinks = {};
  for (const l of ml.data || []) meetLinks[l.slot] = l.link;
  const subscribers = st.data || [];
  // get_caps() may still return a "hum" field from the old dept split — ignore it, we only use "stem" now.
  const cnt = () => subscribers.filter((x) => (PLANS[x.plan] || {}).months > 0 && x.paid_until).length;
  const capsRow = (caps.data && caps.data[0]) || null;
  const notesByBooking = {};
  for (const n of ln.data || []) notesByBooking[n.booking_id] = n;
  const bookings = (bk.data || []).map((r) => {
    const b = mapBooking(r);
    const n = notesByBooking[b.id];
    return { ...b, attended: n ? n.attended : null, note: n ? n.note : null };
  });
  return {
    subscribers,
    bookings,
    messages: ms.data || [],
    meetLinks,
    testimonials: ts.data || [],
    takenCount: capsRow ? (capsRow.stem || 0) : cnt(),
  };
}

/* ---------- misc helpers ---------- */
const addMonths = (n) => { const d = new Date(); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); };
const daysLeft = (paidUntil) => paidUntil ? Math.ceil((new Date(paidUntil + "T00:00:00") - new Date()) / 864e5) : null;

const blockById = (id) => ALL_BLOCKS.find((b) => b.id === id) || { id, label: id, s: 0, e: 0 };

/* Billing-period allowance: lessons count against the student's own paid month,
   not the calendar month — joining on the 25th no longer loses 6 lessons a week later. */
function periodFor(me) {
  const months = (PLANS[me.plan] || {}).months || 1;
  let anchor;
  if (me.paid_until) {
    const end = new Date(me.paid_until + "T00:00:00");
    anchor = new Date(end); anchor.setMonth(anchor.getMonth() - months);
  } else {
    anchor = new Date(((me.joined || new Date().toISOString()).slice(0, 10)) + "T00:00:00");
  }
  const now = new Date();
  let k = 0, s = new Date(anchor), e = new Date(anchor); e.setMonth(e.getMonth() + 1);
  while (e <= now && k < 36) { k++; s.setMonth(s.getMonth() + 1); e.setMonth(e.getMonth() + 1); }
  return { start: dateKey(s), end: dateKey(e) };
}

const notifyServer = (payload) => {
  try { fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => {}); } catch (e) {}
};
const gbp = (n) => "£" + n.toLocaleString("en-GB");
const dateKey = (d) => d.toISOString().slice(0, 10);
const prettyDate = (d) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
const slotKey = (date, block) => date + "|" + block;
const classroomKey = (planId) => {
  const p = PLANS[planId];
  return "classroom-" + (p && p.rotates ? "gcse-group" : planId);
};

function upcomingDays(mode, count = 8) {
  const wanted = mode === "weekend" ? [6, 0] : mode === "weekday" ? [1, 2, 3, 4, 5] : [3, 5];
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
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap');
:root{
  --ink:#0B1B33; --ink-soft:#55677E; --mint:#9BE13D; --mint-dark:#5C9A1B;
  --aqua:#F3F7E9; --paper:#FBF9F3; --coral:#FF6A5C; --line:#E6E1D2;
  --pop:linear-gradient(92deg,#0B1B33 0%,#2F4F6B 55%,#8FD13F 100%);
}
*{box-sizing:border-box} body{margin:0}
.it-app{font-family:'Inter',system-ui,sans-serif;color:var(--ink);background:var(--paper);min-height:100vh}
.it-display{font-family:'Space Grotesk','Inter',system-ui,sans-serif;letter-spacing:-0.02em}
.it-grad{background:var(--pop);-webkit-background-clip:text;background-clip:text;color:transparent}
.it-fade{animation:itfade .45s ease both}
@keyframes itfade{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes itfloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
.it-float{animation:itfloat 5s ease-in-out infinite}
.it-card{background:#fff;border:1px solid var(--line);border-radius:18px;transition:transform .25s ease, box-shadow .25s ease}
.it-card:hover{transform:translateY(-3px);box-shadow:0 12px 30px rgba(11,27,51,.09)}
.it-btn{background:var(--ink);color:#fff;border:none;border-radius:12px;padding:13px 24px;font-weight:700;cursor:pointer;transition:filter .2s, transform .15s;font-family:'Inter',sans-serif;font-size:15px;box-shadow:0 6px 18px rgba(11,27,51,.22)}
.it-btn:hover{filter:brightness(1.35);transform:translateY(-1px)}
.it-btn.ghost{background:#fff;color:var(--ink);border:1.5px solid var(--line);box-shadow:none}
.it-btn.ghost:hover{background:var(--aqua);filter:none}
.it-btn:disabled{opacity:.45;cursor:not-allowed;transform:none;filter:none}
.it-pip{width:14px;height:18px;border-radius:7px 7px 9px 9px;background:#E3EFEC;transition:background .4s}
.it-pip.on{background:var(--mint)}
.it-navrow{display:flex;gap:2px;overflow-x:auto;scrollbar-width:none;max-width:100%}
.it-navrow::-webkit-scrollbar{display:none}
.it-navlink{display:flex;align-items:center;gap:6px;flex:none;background:none;border:none;font:inherit;font-weight:500;color:var(--ink-soft);cursor:pointer;padding:8px 12px;border-radius:8px;transition:all .2s;white-space:nowrap}
.it-navlink:hover{color:var(--ink);background:var(--aqua)}
.it-navlink.active{color:var(--mint-dark);background:var(--aqua);font-weight:700}
@media(max-width:480px){.it-navlink span{display:none}}
.it-input{width:100%;padding:11px 14px;border:1.5px solid var(--line);border-radius:10px;font:inherit;transition:border-color .2s;background:#fff}
.it-input:focus{outline:none;border-color:var(--mint)}
.it-slot{border-radius:12px;padding:12px 8px;font-size:13.5px;font-weight:700;cursor:pointer;transition:all .15s;text-align:center;border:1.5px solid var(--line);background:#fff;color:var(--ink)}
.it-slot:hover:not(:disabled){transform:translateY(-2px)}
.it-slot:disabled{opacity:.35;cursor:not-allowed}
.it-tag{display:inline-block;background:var(--aqua);color:var(--mint-dark);font-size:12px;font-weight:700;padding:4px 11px;border-radius:999px;letter-spacing:.05em;text-transform:uppercase}
.it-chip{display:inline-block;font-size:12px;font-weight:800;padding:4px 12px;border-radius:999px;letter-spacing:.03em}
.it-timeline{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:28px 20px}
.it-timeline-item{position:relative;padding-left:22px}
.it-timeline-dot{position:absolute;left:0;top:6px;width:9px;height:9px;border-radius:50%;background:var(--mint);box-shadow:0 0 0 4px rgba(15,181,160,.22)}
.it-timeline-line{position:absolute;left:4px;top:15px;bottom:-28px;width:1px;background:rgba(255,255,255,.16)}
@media(max-width:719px){.it-timeline{grid-template-columns:1fr}.it-timeline-line{bottom:-28px}}
.it-accordion{border-top:1px solid var(--line)}
.it-accordion-item{border-bottom:1px solid var(--line)}
.it-accordion-btn{width:100%;text-align:left;background:none;border:none;padding:16px 2px;font:inherit;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:12px;color:var(--ink)}
.it-accordion-btn:hover strong{color:var(--mint-dark)}
.it-accordion-icon{flex:none;width:20px;height:20px;border-radius:50%;border:1.5px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:var(--ink-soft);transition:transform .2s ease, background .2s ease, color .2s ease}
.it-accordion-item.open .it-accordion-icon{transform:rotate(45deg);background:var(--mint);color:#fff;border-color:var(--mint)}
.it-accordion-body{max-height:0;overflow:hidden;transition:max-height .25s ease}
.it-accordion-item.open .it-accordion-body{max-height:240px}
.it-reveal{opacity:0;transform:translateY(16px);transition:opacity .5s ease, transform .5s ease}
.it-reveal.in{opacity:1;transform:none}
.it-hero-grid{display:grid;grid-template-columns:1.05fr 0.95fr;gap:40px;align-items:center}
.it-preview{transform:rotate(-1deg)}
.it-preview:hover{transform:rotate(0deg) translateY(-3px)}
.it-barfill{width:0;animation:itbar 1s ease forwards .2s}
@keyframes itbar{from{width:0}}
@media(max-width:820px){.it-hero-grid{grid-template-columns:1fr}.it-preview{transform:none;max-width:440px;margin:0 auto}.it-preview:hover{transform:translateY(-3px)}}
.it-header-badge{display:none}
@media(min-width:640px){.it-header-badge{display:inline-block}}
.it-steps{display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap}
.it-step{display:flex;gap:10px;align-items:flex-start;flex:1;min-width:200px}
.it-step-icon{width:34px;height:34px;border-radius:10px;background:var(--aqua);color:var(--mint-dark);display:flex;align-items:center;justify-content:center;flex:none}
.it-step-connector{width:32px;height:1px;background:var(--line);margin-top:17px;flex:none}
@media(max-width:700px){.it-step-connector{display:none}}
.it-plan-card{position:relative;transition:transform .25s ease, box-shadow .25s ease, border-color .25s ease}
.it-plan-card.featured{border:2px solid var(--coral)}
.it-plan-ribbon{position:absolute;top:-1px;right:18px;background:var(--coral);color:#fff;font-size:11px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;padding:5px 12px;border-radius:0 0 8px 8px}
.it-contact-tile{display:flex;align-items:center;gap:12px;padding:14px 16px;text-decoration:none;color:inherit}
.it-admin-jumpnav{position:sticky;top:53px;z-index:20;display:flex;gap:6px;overflow-x:auto;background:var(--paper);padding:10px 0;margin-bottom:18px;border-bottom:1px solid var(--line)}
.it-admin-jumpnav button{flex:none;background:var(--aqua);color:var(--mint-dark);border:none;border-radius:999px;padding:7px 15px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;transition:background .15s}
.it-admin-jumpnav button:hover{background:var(--mint);color:#fff}
.it-spinner{width:34px;height:34px;border-radius:50%;border:3px solid var(--line);border-top-color:var(--mint);margin:0 auto;animation:itspin .8s linear infinite}
@keyframes itspin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.it-spinner{animation-duration:1.6s}}
.it-cal-day.today::after{content:"";position:absolute;inset:-4px;border-radius:13px;border:1.5px dashed var(--mint);pointer-events:none}
.it-day-panel{animation:itslide .3s ease both}
@keyframes itslide{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.it-day-panel{animation:none}}
@media(prefers-reduced-motion:reduce){.it-fade,.it-card,.it-btn,.it-float,.it-accordion-body,.it-accordion-icon,.it-preview{animation:none;transition:none}.it-reveal{opacity:1;transform:none;transition:none}.it-barfill{animation:none;width:var(--w,100%)}}
button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:3px solid var(--mint);outline-offset:2px}
`;

const SubjectChip = ({ subject }) => {
  const c = SUBJECT_COLORS[subject] || SUBJECT_COLORS.Maths;
  return <span className="it-chip" style={{ background: c.bg, color: c.text, border: "1px solid " + c.border }}>{subject}</span>;
};

const ICONS = {
  cap: "M12 3 1 8l11 5 9-4.1V16h2V8L12 3Zm-7 8.7V16c0 1.9 3.1 3.5 7 3.5s7-1.6 7-3.5v-4.3l-7 3.2-7-3.2Z",
  heart: "M12 20.5s-7.4-4.5-9.9-9C.6 8.1 1.8 4.8 5 4.1c2-.4 3.9.5 5 2.1 1.1-1.6 3-2.5 5-2.1 3.2.7 4.4 4 2.9 7.4-2.5 4.5-9.9 9-9.9 9Z",
  users: "M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.3 0-8 1.7-8 5v1.5h16V19c0-3.3-4.7-5-8-5Zm9-8a3.5 3.5 0 1 0 0 7c-.5 0-1-.1-1.4-.2M17 13.3c2.7.5 5 1.9 5 3.7v1.5h-4",
  calendar: "M7 2v3M17 2v3M3.5 8.5h17M4 5.5h16A1.5 1.5 0 0 1 21.5 7v13a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 20V7A1.5 1.5 0 0 1 4 5.5Z",
  check: "M4 12.5 9.5 18 20 6.5",
  shield: "M12 2.5 4.5 5.5v6c0 5 3.2 8.4 7.5 10 4.3-1.6 7.5-5 7.5-10v-6L12 2.5Z",
  star: "M12 2.8l2.7 5.9 6.4.7-4.8 4.4 1.3 6.4-5.6-3.2-5.6 3.2 1.3-6.4-4.8-4.4 6.4-.7L12 2.8Z",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  mail: "M3.5 5.5h17A1 1 0 0 1 21.5 6.5v11a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Zm0 0 8.5 7 8.5-7",
  home: "M4 11 12 4l8 7M6 10v9.5h5V14h2v5.5h5V10",
};
function Icon({ name, size = 20, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d={ICONS[name]} />
    </svg>
  );
}
function EmptyState({ icon, text }) {
  return (
    <div style={{ textAlign: "center", padding: "28px 16px", color: "var(--ink-soft)" }}>
      <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--aqua)", color: "var(--mint-dark)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}><Icon name={icon} size={19} /></div>
      <p style={{ margin: 0, fontSize: 13.5 }}>{text}</p>
    </div>
  );
}

function Spinner({ label }) {
  return (
    <div style={{ textAlign: "center", padding: 80 }}>
      <div className="it-spinner" />
      {label && <p style={{ color: "var(--ink-soft)", marginTop: 14, fontSize: 14 }}>{label}</p>}
    </div>
  );
}

function Avatar({ initials, size = 64 }) {
  return (
    <div className="it-display" style={{
      width: size, height: size, borderRadius: "50%", background: "var(--pop)", color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: size * 0.34, flex: "none",
    }}>{initials}</div>
  );
}

function Reveal({ children, style, className }) {
  const ref = React.useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); io.disconnect(); }
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={"it-reveal" + (inView ? " in" : "") + (className ? " " + className : "")} style={style}>{children}</div>;
}

function Accordion({ items }) {
  const [open, setOpen] = useState(null);
  return (
    <div className="it-accordion">
      {items.map(([q, a], i) => (
        <div key={q} className={"it-accordion-item" + (open === i ? " open" : "")}>
          <button className="it-accordion-btn" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
            <strong style={{ fontSize: 15 }}>{q}</strong>
            <span className="it-accordion-icon">+</span>
          </button>
          <div className="it-accordion-body">
            <p style={{ color: "var(--ink-soft)", margin: "0 0 16px", fontSize: 14, lineHeight: 1.6 }}>{a}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function CapacityMeter({ taken }) {
  return (
    <div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 5 }}>
        {Array.from({ length: CAP }).map((_, i) => (
          <div key={i} className={"it-pip" + (i < taken ? " on" : "")} style={{ width: 10, height: 14, transitionDelay: `${i * 25}ms` }} />
        ))}
      </div>
      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: 0 }}>
        <strong style={{ color: taken >= CAP ? "var(--coral)" : "var(--mint-dark)" }}>{Math.max(CAP - taken, 0)} of {CAP} places left</strong> — capped so groups stay tiny and prices stay low.
      </p>
    </div>
  );
}

function ProgressBar({ subject, pct }) {
  const c = SUBJECT_COLORS[subject] || SUBJECT_COLORS.Maths;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
      <span style={{ fontSize: 12.5, color: "var(--ink-soft)", width: 78, flex: "none" }}>{subject}</span>
      <div style={{ flex: 1, height: 7, borderRadius: 999, background: "var(--aqua)", overflow: "hidden" }}>
        <div className="it-barfill" style={{ height: "100%", width: pct + "%", borderRadius: 999, background: c.border }} />
      </div>
      <span className="it-display" style={{ fontSize: 12.5, fontWeight: 800, width: 30, textAlign: "right", flex: "none" }}>{pct}%</span>
    </div>
  );
}

function DashboardPreview() {
  return (
    <Reveal className="it-card it-preview" style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div className="it-display" style={{ fontSize: 15, fontWeight: 800 }}>Aisha's progress</div>
          <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>Year 10 · GCSE Plan</div>
        </div>
        <span className="it-chip" style={{ background: "var(--aqua)", color: "var(--mint-dark)" }}>Sample data</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--aqua)", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 14px", marginBottom: 16 }}>
        <span style={{ fontSize: 20 }}>🏆</span>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--mint-dark)", fontWeight: 700, lineHeight: 1.4 }}>Nice work — Chemistry attendance is up this month.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 18 }}>
        {[["Attendance", "96%"], ["Lessons", "8/8"], ["Homework", "7/8"]].map(([k, v]) => (
          <div key={k} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "9px 8px", textAlign: "center" }}>
            <div className="it-display" style={{ fontSize: 17, fontWeight: 800 }}>{v}</div>
            <div style={{ fontSize: 10.5, color: "var(--ink-soft)" }}>{k}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 10 }}>Subject progress</div>
      <ProgressBar subject="Maths" pct={82} />
      <ProgressBar subject="Biology" pct={74} />
      <ProgressBar subject="Chemistry" pct={91} />
      <ProgressBar subject="Physics" pct={68} />

      <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 10.5, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: ".04em" }}>Next lesson</div>
          <div className="it-display" style={{ fontSize: 13.5, fontWeight: 800 }}>Sat · 10:45am · Chemistry</div>
        </div>
        <span className="it-chip" style={{ background: "var(--aqua)", color: "var(--mint-dark)" }}>Booked ✓</span>
      </div>
    </Reveal>
  );
}

function Home({ go, taken, testimonials }) {
  return (
    <div className="it-fade">
      <section style={{ padding: "70px 24px 44px", maxWidth: 1120, margin: "0 auto" }}>
        <div className="it-hero-grid">
          <div>
            <span className="it-tag" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="cap" size={13} /> Dental student · ranked top of my school for grades</span>
            <h1 className="it-display" style={{ fontSize: "clamp(34px,4.6vw,58px)", lineHeight: 1.05, margin: "18px 0 10px", fontWeight: 800 }}>
              GCSE tuition for <span className="it-grad">£5 a lesson.</span>
            </h1>
            <p style={{ fontSize: 19, fontWeight: 700, color: "var(--ink)", maxWidth: 560, lineHeight: 1.5, margin: "0 0 14px" }}>
              Serious GCSE support without the serious price tag — £40/month for 8 lessons.
              Not a discount, a subsidy: grades shouldn't depend on what your family can afford.
            </p>
            <p style={{ fontSize: 15, color: "var(--ink-soft)", maxWidth: 560, lineHeight: 1.65 }}>
              I was born to a single mum and we were made homeless when I was 3. I ranked top of my school for grades,
              and this September I start dental school — now I'm doing the same for the next kid like me.
            </p>
            <div style={{ display: "flex", gap: 12, margin: "26px 0 14px", flexWrap: "wrap" }}>
              <button className="it-btn" onClick={() => go("pricing")}>Start learning — from £5 a lesson</button>
              <button className="it-btn ghost" onClick={() => go("book")}>Already a student? Book</button>
            </div>
            <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 26px" }}>
              Live group lessons, taught by real tutors. No contract, cancel any month. See exactly what's included on the <button onClick={() => go("pricing")} style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "var(--mint-dark)", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>Plans page</button>.
            </p>
            <CapacityMeter taken={taken} />
          </div>
          <DashboardPreview />
        </div>
      </section>

      <section style={{ borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", background: "var(--aqua)" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "18px 24px", display: "flex", flexWrap: "wrap", gap: "14px 32px", justifyContent: "center" }}>
          {[
            ["cap", "Dental student, from Sept"],
            ["star", "Predicted A*A*A"],
            ["users", "20 places"],
          ].map(([icon, label]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--mint-dark)" }}>
              <Icon name={icon} size={17} />
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: "56px 24px 0", maxWidth: 1120, margin: "0 auto" }}>
        <Reveal>
          <div className="it-card" style={{ padding: "26px 28px", background: "linear-gradient(160deg,#fff 0%,var(--aqua) 130%)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--pop)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="calendar" size={19} /></div>
              <h3 className="it-display" style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>One subject a week, on rotation</h3>
            </div>
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
        </Reveal>
      </section>

      <section style={{ padding: "56px 24px 0", maxWidth: 1120, margin: "0 auto" }}>
        <Reveal>
          <span className="it-tag">Who's teaching</span>
          <h2 className="it-display" style={{ fontSize: 26, fontWeight: 800, margin: "10px 0 4px" }}>Meet your tutor</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, margin: "0 0 22px", maxWidth: 640 }}>Teaching because I remember exactly what it's like to need this.</p>
          <div className="it-card" style={{ padding: 24, maxWidth: 400 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14 }}>
              <Avatar initials="IB" />
              <div>
                <div className="it-display" style={{ fontSize: 17, fontWeight: 800 }}>Isham Bari</div>
                <div style={{ fontSize: 13, color: "var(--mint-dark)", fontWeight: 700 }}>Dental student, from September</div>
              </div>
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8, fontSize: 13.5, color: "var(--ink-soft)" }}>
              {["Predicted A*A*A · ranked top of his school", "Ran a tutoring service teaching ~50 students/month", "Personally tutored 65 students for the UCAT", "Teaches Maths, Biology, Chemistry, Physics"].map((l) => (
                <li key={l} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><span style={{ color: "var(--mint)", flex: "none", marginTop: 2 }}><Icon name="check" size={14} /></span>{l}</li>
              ))}
            </ul>
          </div>
        </Reveal>
      </section>

      <section style={{ background: "var(--ink)", color: "#fff", padding: "52px 24px" }}>
        <Reveal style={{ maxWidth: 1120, margin: "0 auto" }}>
          <span className="it-tag" style={{ background: "rgba(255,255,255,.12)", color: "#9FE8DD" }}>My story</span>
          <div className="it-timeline" style={{ marginTop: 28 }}>
            {[
              ["Age 3", "Made homeless. Raised by a single mum who never let me feel it."],
              ["GCSEs", "No tutors, no quiet desk — just library sessions and free resources. It worked."],
              ["Sixth form", "Ranked top of my school for grades — predicted A*A*A, AB in AS Chemistry & Maths — all while running a tutoring service teaching around 50 students a month."],
              ["This September", "Dental school. Now I teach the way I wish someone had taught me."],
            ].map(([t, b], i, arr) => (
              <div key={t} className="it-timeline-item">
                <div className="it-timeline-dot" />
                {i < arr.length - 1 && <div className="it-timeline-line" />}
                <div className="it-display it-grad" style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>{t}</div>
                <p style={{ color: "#C4D6E4", fontSize: 14.5, lineHeight: 1.6, margin: 0 }}>{b}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      <section style={{ background: "var(--aqua)", padding: "40px 24px" }}>
        <Reveal style={{ maxWidth: 1120, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 18 }}>
          {[
            ["50/mo", "students I taught on average running my previous tutoring service"],
            ["65", "students I've personally tutored for the UCAT"],
            ["20", "places, kept small so everyone gets airtime"],
            ["5", "max per GCSE group — A-level is private 1-to-1"],
            ["£3.33", "per hour of live teaching — around a tenth of a private tutor"],
          ].map(([big, small]) => (
            <div key={big}>
              <div className="it-display" style={{ fontSize: 34, fontWeight: 800, color: "var(--mint-dark)" }}>{big}</div>
              <div style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.5 }}>{small}</div>
            </div>
          ))}
        </Reveal>
      </section>

      {testimonials.length > 0 && (
        <section style={{ padding: "56px 24px 0", maxWidth: 1120, margin: "0 auto" }}>
          <h2 className="it-display" style={{ fontSize: 26, fontWeight: 800, marginBottom: 18 }}>What students say</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
            {testimonials.map((t) => (
              <div key={t.id} className="it-card" style={{ padding: 24 }}>
                <div style={{ fontSize: 22, color: "var(--mint)", lineHeight: 1 }}>"</div>
                <p style={{ fontSize: 14.5, lineHeight: 1.65, margin: "6px 0 12px" }}>{t.quote}</p>
                <strong className="it-display" style={{ fontSize: 14 }}>{t.name}</strong>
                {t.detail && <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{t.detail}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* what every lesson includes */}
      <section style={{ padding: "56px 24px 0", maxWidth: 1120, margin: "0 auto" }}>
        <Reveal>
          <h2 className="it-display" style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>Every lesson includes</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, margin: "0 0 24px", maxWidth: 640 }}>Not generic content — every session is built around exam technique and what actually earns marks.</p>
          <div style={{ display: "grid", gap: 0 }}>
            {[
              ["01", "Exam-board specific", "Taught to your exact spec — AQA, Edexcel or OCR — not generic content. Tell me your board when you join."],
              ["02", "Past-paper practice", "Real exam questions in every session, with mark-scheme walkthroughs so you learn how examiners think."],
              ["03", "Exam technique", "Command words, timing, how to squeeze marks from questions you half-know — the stuff school never has time for."],
              ["04", "Homework & feedback", "Work set after every lesson and marked, so progress is visible week to week — to you and your parents."],
            ].map(([n, t, b], i) => (
              <div key={t} style={{ display: "flex", gap: 20, alignItems: "flex-start", padding: "18px 0", borderTop: i === 0 ? "1px solid var(--line)" : "none", borderBottom: "1px solid var(--line)" }}>
                <div className="it-display" style={{ fontSize: 14, fontWeight: 800, color: "var(--mint)", minWidth: 28, paddingTop: 2 }}>{n}</div>
                <div>
                  <h3 className="it-display" style={{ fontSize: 17, fontWeight: 800, margin: "0 0 4px" }}>{t}</h3>
                  <p style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.6, margin: 0, maxWidth: 560 }}>{b}</p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      <section style={{ padding: "40px 24px 64px", maxWidth: 1120, margin: "0 auto" }}>
        <Reveal className="it-card" style={{ padding: 32 }}>
          <span className="it-tag">The Grade A Guarantee</span>
          <h2 className="it-display" style={{ fontSize: "clamp(24px,3.4vw,34px)", lineHeight: 1.2, fontWeight: 800, margin: "14px 0 16px", maxWidth: 760 }}>
            Do the work, and if you still don't average a 7 (A): your last 3 months of fees back.
          </h2>
          <p style={{ color: "var(--ink-soft)", lineHeight: 1.6, margin: "0 0 10px", maxWidth: 760, fontSize: 14 }}>To qualify, the student must have:</p>
          <ul style={{ color: "var(--ink-soft)", lineHeight: 1.8, margin: "0 0 14px", maxWidth: 760, fontSize: 13.5, paddingLeft: 22 }}>
            <li>been enrolled for a minimum of 6 months;</li>
            <li>attended the lessons they booked;</li>
            <li>followed the study guidance set in lessons;</li>
            <li>submitted every piece of homework on time, completed to a genuine standard.</li>
          </ul>
          <p style={{ color: "var(--ink-soft)", lineHeight: 1.6, margin: "0 0 12px", maxWidth: 760, fontSize: 13 }}>
            This isn't small print designed to wriggle out — homework and attendance are tracked from day one, so
            whether you qualify is a matter of record, not my opinion. Separately, plans are monthly or 3-monthly with
            no contract: cancelling is simply not renewing.
          </p>
          <p style={{ color: "var(--ink-soft)", fontSize: 13, margin: 0 }}>
            Questions first? Email <a href={"mailto:" + CONTACT.email} style={{ color: "var(--mint-dark)", fontWeight: 700 }}>{CONTACT.email}</a>.
          </p>
        </Reveal>
      </section>
    </div>
  );
}

const PLAN_ICON = { gcse: "users", gcse3: "calendar", alevel: "target" };

function Pricing({ startCheckout, taken }) {
  const fullFor = (p) => taken >= CAP;
  return (
    <div className="it-fade" style={{ padding: "56px 24px", maxWidth: 1120, margin: "0 auto" }}>
      <span className="it-tag">Plans &amp; pricing</span>
      <h1 className="it-display" style={{ fontSize: 36, fontWeight: 800, margin: "12px 0 8px" }}>Simple, transparent plans</h1>
      <p style={{ color: "var(--ink-soft)", marginBottom: 28, maxWidth: 620 }}>
        Priced for families who can't stretch to normal tutoring. No contracts — cancel any month.{" "}
        {`${Math.max(CAP - taken, 0)} of ${CAP} places left.`}
      </p>
      <div className="it-steps">
        {[
          ["users", "Pick a plan & create your account"],
          ["shield", "Verify your email and pay securely with Stripe"],
          ["check", "Booking unlocks the moment payment is confirmed (usually within hours)"],
        ].map(([icon, t], i, arr) => (
          <React.Fragment key={t}>
            <div className="it-step">
              <div className="it-step-icon"><Icon name={icon} size={17} /></div>
              <span style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.5 }}>{t}</span>
            </div>
            {i < arr.length - 1 && <div className="it-step-connector" />}
          </React.Fragment>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(270px,1fr))", gap: 20, marginTop: 30 }}>
        {Object.values(PLANS).filter((p) => !p.hidden).map((p) => (
          <div key={p.id} className={"it-card it-plan-card" + (p.id === "gcse" ? " featured" : "")} style={{ padding: 28, display: "flex", flexDirection: "column" }}>
            {p.id === "gcse" && <div className="it-plan-ribbon">Most popular</div>}
            <div style={{ width: 40, height: 40, borderRadius: 11, background: "var(--pop)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
              <Icon name={PLAN_ICON[p.id] || "star"} size={20} />
            </div>
            {p.deal && <span className="it-tag" style={{ alignSelf: "flex-start", marginBottom: 10, background: "#FFEDE9", color: "#C2402F" }}>{p.deal} — places go fast</span>}
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
              <li style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><span style={{ color: "var(--mint)", flex: "none", marginTop: 4 }}><Icon name="check" size={13} /></span>{p.months === 3 ? "24 × 90-min lessons (8 / month)" : p.days === "weekend" ? "8 × 90-min lessons / month" : `${p.lessons} × 1-hour 1-to-1 lesson${p.lessons > 1 ? "s" : ""} / month`}</li>
              <li style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><span style={{ color: "var(--mint)", flex: "none", marginTop: 4 }}><Icon name="check" size={13} /></span>{p.days === "weekend" ? "Weekends, 9:00am–4:15pm" : "Wed & Fri evenings, 7:00–9:15pm"}</li>
              <li style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><span style={{ color: "var(--mint)", flex: "none", marginTop: 4 }}><Icon name="check" size={13} /></span>{p.seats === 1 ? "Private 1-to-1" : `Groups of ${p.seats} max`} · Google Meet</li>
            </ul>
            <button className="it-btn" disabled={fullFor(p)} onClick={() => startCheckout(p.id)}>
              {fullFor(p) ? "Programme full" : "Join plan"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Checkout({ planId, onDone, onFinish, onCancel }) {
  const plan = PLANS[planId];
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(false);
  const payLink = (STRIPE.isham || {})[planId] || null;
  const submit = async () => {
    if (!name.trim() || !email.includes("@")) return alert("Please enter your name and a valid email.");
    if (password.length < 8) return alert("Password must be at least 8 characters.");
    setPaying(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const { data: authData, error: authErr } = await supa.auth.signUp({
        email: cleanEmail, password, options: { emailRedirectTo: "https://www.ishamtuition.com" },
      });
      if (authErr) throw authErr;
      // paid_until stays null until Isham confirms the payment in the dashboard
      await onDone({ name: name.trim(), email: cleanEmail, plan: planId, paid_until: null });
      notifyServer({ type: "signup", name: name.trim(), email: cleanEmail, plan: plan.name });
      if (payLink) window.open(payLink, "_blank");
      if (authData && authData.session) {
        // email confirmation isn't required on this project — already signed in, skip straight to the dashboard
        onFinish();
      } else {
        setDone(true);
      }
    } catch (e) {
      setPaying(false);
      console.error("Checkout failed:", e); // full detail for diagnosing — never rely on the alert text alone
      const raw = (e && e.message) || "";
      const msg = raw && raw !== "{}" ? raw : "";
      if (String(e).includes("duplicate") || e.status === 409) {
        alert("That email already has a plan — go to Book and sign in there.");
      } else if (msg) {
        alert(msg);
      } else {
        alert("Something went wrong saving your details — this usually means a temporary connection hiccup. Please wait a few seconds and try again, and message Isham if it keeps happening.");
      }
    }
  };

  if (done) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(15,42,67,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}>
        <div className="it-card it-fade" style={{ padding: 30, width: 440, maxWidth: "100%" }}>
          <h3 className="it-display" style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800 }}>Almost there ✓</h3>
          <p style={{ color: "var(--ink-soft)", margin: "0 0 20px" }}>
            Check your inbox to verify your email. Booking unlocks the moment payment is confirmed — usually within hours.
          </p>
          <button className="it-btn" onClick={onFinish}>Done</button>
        </div>
      </div>
    );
  }

  const fieldLabel = { fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", margin: "0 0 5px", display: "block" };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,42,67,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}>
      <div className="it-card it-fade" style={{ padding: 32, width: 440, maxWidth: "100%", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <h3 className="it-display" style={{ margin: 0, fontSize: 21, fontWeight: 800 }}>{plan.name}</h3>
          <span className="it-display" style={{ fontSize: 22, fontWeight: 800, whiteSpace: "nowrap" }}>{gbp(plan.price)}<span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-soft)" }}>{plan.per}</span></span>
        </div>
        <p style={{ color: "var(--ink-soft)", fontSize: 13, margin: "0 0 22px" }}>Enter your details to set up your login, then continue to payment.</p>
        <div style={{ display: "grid", gap: 16 }}>
          <div>
            <label style={fieldLabel}>Student name</label>
            <input className="it-input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label style={fieldLabel}>Email</label>
            <input className="it-input" placeholder="you@example.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label style={fieldLabel}>Password</label>
            <input className="it-input" placeholder="Min 8 characters" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {!payLink && (
            <div style={{ background: "var(--aqua)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "var(--ink-soft)" }}>
              Demo checkout — no card is charged yet. Payment details will be arranged by email until online payment goes live.
            </div>
          )}
          <button className="it-btn" onClick={submit} disabled={paying}>{paying ? "Saving…" : payLink ? `Continue to payment — ${gbp(plan.price)}` : `Join — ${gbp(plan.price)}`}</button>
          <button className="it-btn ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- calendar helpers ---------- */
function monthMatrix(view) {
  const startDow = (new Date(view.getFullYear(), view.getMonth(), 1).getDay() + 6) % 7; // Monday first
  const cells = Array.from({ length: startDow }, () => null);
  const dim = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  for (let d = 1; d <= dim; d++) cells.push(new Date(view.getFullYear(), view.getMonth(), d));
  return cells;
}
const monthName = (d) => d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const DOW = ["M", "T", "W", "T", "F", "S", "S"];

/* ---------- read-only "at a glance" month view of a student's own bookings ---------- */
function MyLessonsCalendar({ mine }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const view = new Date(today.getFullYear(), today.getMonth(), 1);
  const cells = monthMatrix(view);
  const byDate = {};
  for (const b of mine) (byDate[b.date] = byDate[b.date] || []).push(b);
  return (
    <div className="it-card" style={{ padding: 18 }}>
      <strong className="it-display" style={{ fontSize: 15, fontWeight: 800 }}>{monthName(view)}</strong>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginTop: 12 }}>
        {DOW.map((d, i) => <div key={i} style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-soft)", textAlign: "center" }}>{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const dk = dateKey(d);
          const lessons = byDate[dk] || [];
          const isToday = dk === dateKey(today);
          const c = lessons.length ? (SUBJECT_COLORS[lessons[0].subject] || SUBJECT_COLORS.Maths) : null;
          return (
            <div key={i} style={{
              textAlign: "center", padding: "7px 0 5px", borderRadius: 8, fontSize: 12.5, fontWeight: isToday ? 800 : 500,
              background: c ? c.bg : "transparent", border: isToday ? "1.5px dashed var(--mint-dark)" : "1px solid transparent",
            }}>
              {d.getDate()}
              {c && <div style={{ width: 5, height: 5, borderRadius: "50%", background: c.border, margin: "3px auto 0" }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- student booking calendar ---------- */
function BookingChart({ plan, store, subject, sel, setSel, mine, me }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const horizon = new Date(today); horizon.setDate(horizon.getDate() + 56);
  const wanted = plan.days === "weekend" ? [6, 0] : plan.days === "weekday" ? [1, 2, 3, 4, 5] : [3, 5];
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [day, setDay] = useState(null);
  const seats = plan.seats || 5;
  const period = periodFor(me);
  const mineMonth = mine.filter((b) => b.date >= period.start && b.date < period.end);
  const left = plan.lessons - mineMonth.length;
  const subjectFor = (d) => (plan.rotates ? weekSubject(d, plan.cycle) : subject);
  const countAt = (dk, blockId, subj) =>
    store.bookings.filter((b) => b.date === dk && b.block === blockId && (seats === 1 || b.subject === subj)).length;
  const visibleBlocks = plan.blocks; // single tutor — no per-block ownership filtering needed
  const personClash = () => false; // no second tutor to clash with
  const isValid = (d) => d && wanted.includes(d.getDay()) && d >= today && d <= horizon;
  const dayStatus = (d) => {
    const dk = dateKey(d);
    const subj = subjectFor(d);
    const subjLeftForDay = plan.perSubjectCap - mineMonth.filter((b) => b.subject === subj).length;
    if (left <= 0 || subjLeftForDay <= 0) return "full";
    const openBlocks = visibleBlocks.filter((bl) =>
      !personClash(dk, bl.id) && countAt(dk, bl.id, subj) < seats && !mine.some((b) => b.date === dk && b.block === bl.id));
    if (openBlocks.length === 0) return "full";
    if (openBlocks.length <= 1 || openBlocks.some((bl) => seats - countAt(dk, bl.id, subj) <= 1)) return "limited";
    return "open";
  };
  const cells = monthMatrix(view);
  const isToday = (d) => dateKey(d) === dateKey(today);
  const selDate = day ? new Date(day + "T00:00:00") : null;
  const daySubj = selDate ? subjectFor(selDate) : null;
  const dayCol = daySubj ? (SUBJECT_COLORS[daySubj] || SUBJECT_COLORS.Maths) : null;
  const subjLeft = daySubj ? plan.perSubjectCap - mineMonth.filter((b) => b.subject === daySubj).length : 0;
  const canPrev = view > new Date(today.getFullYear(), today.getMonth(), 1);
  const canNext = new Date(view.getFullYear(), view.getMonth() + 1, 1) <= horizon;

  return (
    <div>
      <div style={{ display: "flex", gap: 10, fontSize: 12.5, color: "var(--ink-soft)", margin: "0 0 12px", flexWrap: "wrap", alignItems: "center" }}>
        {plan.rotates && SUBJECT_CYCLE.map((s) => <SubjectChip key={s} subject={s} />)}
        <span style={{ marginLeft: "auto" }}>{plan.days === "weekend" ? "Weekends only" : plan.days === "weekday" ? "Weekday evenings" : "Wed & Fri evenings"} · tap a highlighted date</span>
      </div>

      <div className="it-card" style={{ padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <button className="it-btn ghost" style={{ padding: "6px 12px" }} disabled={!canPrev}
            onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}>‹</button>
          <strong className="it-display" style={{ fontSize: 16 }}>{monthName(view)}</strong>
          <button className="it-btn ghost" style={{ padding: "6px 12px" }} disabled={!canNext}
            onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}>›</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
          {DOW.map((d, i) => <div key={i} style={{ textAlign: "center", fontSize: 11.5, fontWeight: 700, color: "var(--ink-soft)" }}>{d}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const dk = dateKey(d);
            const valid = isValid(d);
            const subj = valid ? subjectFor(d) : null;
            const c = subj ? (SUBJECT_COLORS[subj] || SUBJECT_COLORS.Maths) : null;
            const isSelDay = day === dk;
            const status = valid ? dayStatus(d) : null;
            const dotColor = status === "open" ? "#2FA45B" : status === "limited" ? "#E8842E" : "#C2402F";
            return (
              <button key={i} disabled={!valid}
                onClick={() => { setDay(isSelDay ? null : dk); setSel(null); }}
                className={"it-cal-day" + (isToday(d) ? " today" : "")}
                style={{
                  aspectRatio: "1", minHeight: 40, borderRadius: 10, cursor: valid ? "pointer" : "default", position: "relative",
                  border: isSelDay ? "2.5px solid " + c.border : valid ? "1.5px solid " + c.border : "1px solid transparent",
                  background: valid ? (isSelDay ? c.border : c.bg) : "transparent",
                  color: valid ? (isSelDay ? "#fff" : c.text) : "#C6D4D1",
                  fontWeight: valid ? 800 : 500, fontSize: 13.5, transition: "all .15s",
                }}>
                {d.getDate()}
                {valid && status !== "full" && (
                  <span style={{ position: "absolute", bottom: 5, left: "50%", transform: "translateX(-50%)", width: 5, height: 5, borderRadius: "50%", background: isSelDay ? "#fff" : dotColor }} />
                )}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--line)", fontSize: 11.5, color: "var(--ink-soft)" }}>
          {[["#2FA45B", "Plenty of seats"], ["#E8842E", "Filling up"], ["#C2402F", "Full / no lessons left"]].map(([color, label]) => (
            <span key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block" }} />{label}
            </span>
          ))}
        </div>
      </div>

      {day && (
        <div className="it-fade it-card it-day-panel" style={{ padding: 18, marginTop: 14, border: "1.5px solid " + dayCol.border }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <strong className="it-display">{prettyDate(selDate)}</strong>
            <SubjectChip subject={daySubj} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8 }}>
            {visibleBlocks.map((bl) => {
              const n = countAt(day, bl.id, daySubj);
              const already = mine.some((b) => b.date === day && b.block === bl.id);
              const isSel = sel && sel.date === day && sel.block === bl.id;
              const disabled = n >= seats || left <= 0 || subjLeft <= 0 || already || personClash(day, bl.id);
              return (
                <button key={bl.id} className="it-slot"
                  style={{ background: isSel ? dayCol.border : dayCol.bg, borderColor: dayCol.border, color: isSel ? "#fff" : dayCol.text }}
                  disabled={disabled && !isSel}
                  onClick={() => setSel(isSel ? null : { date: day, block: bl.id, label: bl.label, subject: daySubj })}>
                  {bl.label}
                  <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.8, whiteSpace: "nowrap" }}>
                    {already ? "booked ✓" : personClash(day, bl.id) ? "tutor busy" : n >= seats ? (seats === 1 ? "taken" : "full") : seats === 1 ? "available" : `${seats - n} seats`}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 10 }}>
        {left <= 0 ? "You've used all the lessons in your current paid month — more unlock when it renews."
          : `${left} lesson${left === 1 ? "" : "s"} left in your paid month (to ${period.end}) · max ${plan.perSubjectCap} per subject.`}
      </p>
    </div>
  );
}

/* ---------- admin bookings calendar ---------- */
function AdminCalendar({ bookings, active, onPick }) {
  const [view, setView] = useState(() => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), 1); });
  const counts = {};
  for (const b of bookings) counts[b.date] = (counts[b.date] || 0) + 1;
  const cells = monthMatrix(view);
  return (
    <div className="it-card" style={{ padding: 18, marginTop: 12, maxWidth: 420 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <button className="it-btn ghost" style={{ padding: "5px 11px" }} onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}>‹</button>
        <strong className="it-display" style={{ fontSize: 15 }}>{monthName(view)}</strong>
        <button className="it-btn ghost" style={{ padding: "5px 11px" }} onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
        {DOW.map((d, i) => <div key={i} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 700, color: "var(--ink-soft)" }}>{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const dk = dateKey(d);
          const n = counts[dk] || 0;
          const on = active === dk;
          return (
            <button key={i} disabled={!n} onClick={() => onPick(dk)}
              className={dk === dateKey(new Date()) ? "it-cal-day today" : ""}
              style={{
                aspectRatio: "1", minHeight: 30, borderRadius: 8, position: "relative", fontSize: 12, fontWeight: n ? 800 : 500,
                border: on ? "2px solid var(--mint-dark)" : n ? "1.5px solid var(--mint)" : "1px solid transparent",
                background: on ? "var(--mint)" : n ? "var(--aqua)" : "transparent",
                color: on ? "#fff" : n ? "var(--mint-dark)" : "#C6D4D1", cursor: n ? "pointer" : "default",
              }}>
              {d.getDate()}
              {n > 0 && <span style={{ position: "absolute", top: 1, right: 3, fontSize: 8.5, fontWeight: 800 }}>{n}</span>}
            </button>
          );
        })}
      </div>
      {active && <button className="it-btn ghost" style={{ marginTop: 10, padding: "6px 12px", fontSize: 12.5, width: "100%" }} onClick={() => onPick(active)}>Show all dates</button>}
    </div>
  );
}

/* ---------- community chat ---------- */
function ChatPanel({ sender, isTutor }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const load = async () => {
    const { data } = await supa.from("chat_messages").select("*").order("created", { ascending: false }).limit(50);
    setMessages((data || []).slice().reverse());
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    const { error } = await supa.from("chat_messages").insert({ sender, is_tutor: isTutor, text: text.trim() });
    setSending(false);
    if (!error) { setText(""); load(); }
  };

  return (
    <div className="it-card" style={{ padding: 18, marginTop: 20 }}>
      <strong className="it-display" style={{ fontSize: 16 }}>Group Q&A</strong>
      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "4px 0 12px" }}>
        Group Q&A — visible to all students and tutors. Keep it to study questions.
      </p>
      <div style={{ maxHeight: 320, overflowY: "auto", display: "grid", gap: 8, marginBottom: 12 }}>
        {messages.length === 0 && <p style={{ color: "var(--ink-soft)", fontSize: 13.5, margin: 0 }}>No messages yet — ask the first question!</p>}
        {messages.map((m) => (
          <div key={m.id} style={{ fontSize: 13.5, lineHeight: 1.5 }}>
            <strong>{m.sender}</strong>{" "}
            {m.is_tutor && <span className="it-chip" style={{ background: "var(--aqua)", color: "var(--mint-dark)", fontSize: 10, padding: "2px 8px", marginRight: 4 }}>TUTOR</span>}
            <span style={{ color: "var(--ink-soft)" }}>{m.text}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input className="it-input" placeholder="Ask a question…" value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()} />
        <button className="it-btn" style={{ padding: "10px 18px" }} onClick={send} disabled={sending || !text.trim()}>Send</button>
      </div>
    </div>
  );
}

function Book({ store, addBooking, addMessage, refresh, go }) {
  const [session, setSession] = useState(undefined); // undefined = checking, null = signed out
  const [me, setMe] = useState(null);
  const [meChecked, setMeChecked] = useState(false);
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authErr, setAuthErr] = useState("");
  const [subject, setSubject] = useState(null);
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supa.auth.getSession().then(({ data: { session } }) => setSession(session || null));
    const { data: sub } = supa.auth.onAuthStateChange((_evt, sess) => setSession(sess || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    (async () => {
      if (!session || !session.user || !session.user.email) { setMe(null); setMeChecked(true); return; }
      setMeChecked(false);
      await refresh();
      const { data } = await supa.rpc("find_student", { p_email: session.user.email.toLowerCase() });
      const s = data && data[0];
      setMe(s || null);
      if (s) setSubject((PLANS[s.plan] || {}).subjects?.[0] || null);
      setMeChecked(true);
    })();
  }, [session]);

  const doSignIn = async () => {
    if (!email.includes("@") || !password) return setAuthErr("Enter your email and password.");
    setAuthBusy(true); setAuthErr("");
    const { error } = await supa.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setAuthBusy(false);
    if (error) {
      setAuthErr(
        /confirm/i.test(error.message)
          ? "Check your inbox and click the verification link before signing in."
          : "Wrong email or password."
      );
    }
  };
  const doSignUp = async () => {
    if (!email.includes("@") || password.length < 8) return setAuthErr("Enter your email and a password of at least 8 characters.");
    setAuthBusy(true); setAuthErr("");
    const { error } = await supa.auth.signUp({ email: email.trim().toLowerCase(), password, options: { emailRedirectTo: "https://www.ishamtuition.com" } });
    setAuthBusy(false);
    if (error) return setAuthErr(error.message);
    alert("Check your inbox to verify your email, then sign in.");
    setMode("signin");
  };
  const doForgot = async () => {
    if (!email.includes("@")) return setAuthErr("Enter your email first.");
    setAuthErr("");
    const { error } = await supa.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: "https://www.ishamtuition.com" });
    if (error) setAuthErr(error.message);
    else alert("Reset link sent");
  };
  const signOut = async () => { await supa.auth.signOut(); };

  if (session === undefined || (session && !meChecked))
    return <Spinner label="Loading your account…" />;

  if (!session)
    return (
      <div className="it-fade" style={{ padding: "64px 24px", maxWidth: 420, margin: "0 auto" }}>
        <div className="it-card" style={{ padding: 32 }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: "var(--pop)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <Icon name="shield" size={21} />
          </div>
          <h1 className="it-display" style={{ fontSize: 25, fontWeight: 800, margin: "0 0 6px" }}>{mode === "signup" ? "Set up your login" : "Sign in to book"}</h1>
          <p style={{ color: "var(--ink-soft)", fontSize: 13.5, margin: "0 0 20px" }}>
            {mode === "signup"
              ? "Already joined a plan but never made a login? Use the same email — once verified, we'll find it."
              : "Use the email and password you signed up with."}
          </p>

          <div style={{ display: "flex", background: "var(--aqua)", borderRadius: 10, padding: 4, marginBottom: 20 }}>
            <button type="button" onClick={() => { setMode("signin"); setAuthErr(""); }}
              style={{ flex: 1, border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer",
                background: mode === "signin" ? "#fff" : "transparent", color: mode === "signin" ? "var(--ink)" : "var(--ink-soft)",
                boxShadow: mode === "signin" ? "0 1px 4px rgba(15,42,67,.12)" : "none" }}>Sign in</button>
            <button type="button" onClick={() => { setMode("signup"); setAuthErr(""); }}
              style={{ flex: 1, border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer",
                background: mode === "signup" ? "#fff" : "transparent", color: mode === "signup" ? "var(--ink)" : "var(--ink-soft)",
                boxShadow: mode === "signup" ? "0 1px 4px rgba(15,42,67,.12)" : "none" }}>Already a student</button>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <input className="it-input" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="it-input" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (mode === "signup" ? doSignUp() : doSignIn())} />
            {mode === "signin" && (
              <button type="button" className="it-navlink" style={{ padding: 0, justifySelf: "start", fontSize: 12.5 }} onClick={doForgot}>Forgot password?</button>
            )}
            <button className="it-btn" onClick={mode === "signup" ? doSignUp : doSignIn} disabled={authBusy}>
              {authBusy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
            </button>
            {authErr && <p style={{ color: "var(--coral)", fontSize: 13, margin: 0 }}>{authErr}</p>}
          </div>
        </div>

        <div className="it-card" style={{ padding: "14px 18px", marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>New to Isham Tuition?</span>
          <button className="it-btn ghost" style={{ padding: "8px 14px", fontSize: 13.5 }} onClick={() => go("pricing")}>See plans & join first →</button>
        </div>
      </div>
    );

  if (!me)
    return (
      <div className="it-fade" style={{ padding: "64px 24px", maxWidth: 460, margin: "0 auto" }}>
        <h1 className="it-display" style={{ fontSize: 30, fontWeight: 800 }}>No plan found yet</h1>
        <p style={{ color: "var(--ink-soft)" }}>We couldn't find a plan for {session.user.email} — join a plan first on the Plans page.</p>
        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          <button className="it-btn" onClick={() => go("pricing")}>See plans</button>
          <button className="it-btn ghost" onClick={signOut}>Sign out</button>
        </div>
      </div>
    );

  const plan = PLANS[me.plan];
  if (!plan)
    return (
      <div className="it-fade" style={{ padding: "64px 24px", maxWidth: 460, margin: "0 auto", textAlign: "center" }}>
        <EmptyState icon="calendar" text="This plan is no longer bookable online — message Isham directly to arrange your lessons." />
        <button className="it-btn ghost" style={{ marginTop: 12 }} onClick={signOut}>Sign out</button>
      </div>
    );
  const mine = store.bookings.filter((b) => b.subscriberId === me.id);
  const expired = plan.months > 0 && me.paid_until && daysLeft(me.paid_until) <= 0;
  const locked = plan.months > 0 && !me.paid_until;
  const period = periodFor(me);
  const mineMonth = mine.filter((b) => b.date >= period.start && b.date < period.end);
  const lessonsLeft = Math.max(plan.lessons - mineMonth.length, 0);
  const today = dateKey(new Date());
  const nextLesson = [...mine].filter((b) => b.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  const totalAttended = mine.filter((b) => b.attended === true).length;
  const totalMarked = mine.filter((b) => b.attended === true || b.attended === false).length;

  const confirmBooking = async () => {
    if (expired) return alert("Your plan has expired — renew (or message Isham) to book new lessons.");
    if (!sel || busy) return;
    setBusy(true);
    try {
      await addBooking({
        student_id: me.id, student_name: me.name, plan: me.plan,
        subject: sel.subject || subject, date: sel.date, block: sel.block, block_label: sel.label,
      });
      notifyServer({ type: "booking", name: me.name, email: session.user.email, subject: sel.subject || subject, date: sel.date, time: sel.label });
      setSel(null);
    } catch (e) {
      alert("Couldn't save that booking — the seat may have just been taken. The chart has been refreshed.");
      await refresh();
    }
    setBusy(false);
  };

  return (
    <div className="it-fade" style={{ padding: "48px 24px 90px", maxWidth: 1120, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <h1 className="it-display" style={{ fontSize: 30, fontWeight: 800, marginBottom: 4 }}>Hi {me.name.split(" ")[0]} 👋</h1>
        <button className="it-btn ghost" style={{ padding: "8px 14px", fontSize: 13.5 }} onClick={signOut}>Sign out</button>
      </div>

      {nextLesson && (
        <div className="it-card" style={{ padding: "20px 24px", margin: "18px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14, background: "var(--ink)", border: "none" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "rgba(255,255,255,.6)", marginBottom: 4 }}>Next lesson</div>
            <div className="it-display" style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{nextLesson.subject} · {nextLesson.date} · {nextLesson.blockLabel}</div>
          </div>
          {store.meetLinks[slotKey(nextLesson.date, nextLesson.block)] ? (
            <a href={store.meetLinks[slotKey(nextLesson.date, nextLesson.block)]} target="_blank" rel="noreferrer" className="it-btn" style={{ background: "var(--mint)", color: "var(--ink)", textDecoration: "none" }}>Join Google Meet →</a>
          ) : (
            <span style={{ fontSize: 13, color: "rgba(255,255,255,.7)" }}>Meet link appears before the lesson</span>
          )}
        </div>
      )}

      {!locked && (
        <div className="it-card" style={{ padding: "18px 20px", margin: "18px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-soft)", marginBottom: 4 }}>Classroom</div>
            {store.meetLinks[classroomKey(me.plan)] ? (
              <div className="it-display" style={{ fontSize: 15, fontWeight: 800 }}>Worksheets, resources & past papers live here</div>
            ) : (
              <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>Your Google Classroom link will appear here once it's set up — check back soon.</div>
            )}
          </div>
          {store.meetLinks[classroomKey(me.plan)] && (
            <a href={store.meetLinks[classroomKey(me.plan)]} target="_blank" rel="noreferrer" className="it-btn ghost" style={{ textDecoration: "none" }}>Open Google Classroom →</a>
          )}
        </div>
      )}

      <div className="it-card" style={{ padding: "18px 20px", margin: "18px 0", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 18 }}>
        {[
          ["Plan", plan.name, `${gbp(plan.price)}${plan.per} · ${plan.lessons} lesson${plan.lessons > 1 ? "s" : ""}/month`],
          ["Covered until", me.paid_until || (locked ? "Pending payment" : "—"),
            me.cancelled ? "Not renewing" : me.paid_until && !expired ? `${daysLeft(me.paid_until)} days left` : locked ? "Confirmed once Isham verifies payment" : ""],
          ["This period", `${lessonsLeft} of ${plan.lessons} left`, "lessons to book"],
          ["Attendance", totalMarked > 0 ? `${totalAttended}/${totalMarked}` : "—",
            nextLesson ? `Next: ${nextLesson.date} · ${nextLesson.blockLabel}` : "No upcoming lesson"],
        ].map(([label, big, small]) => (
          <div key={label}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 4 }}>{label}</div>
            <div className="it-display" style={{ fontSize: 16, fontWeight: 800, color: expired && label === "Covered until" ? "var(--coral)" : "var(--ink)" }}>{big}</div>
            {small && <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 2 }}>{small}</div>}
          </div>
        ))}
      </div>

      {locked && (
        <div style={{ background: "#FFF7E8", border: "1px solid #F6DDB2", borderRadius: 12, padding: "10px 14px", fontSize: 13.5, color: "#7A5A2E", marginBottom: 12 }}>
          Payment received? You'll be able to book the moment Isham confirms it — usually within a few hours.
        </div>
      )}
      {expired && (
        <div style={{ background: "#FFF1EF", border: "1px solid #F6C4BC", borderRadius: 12, padding: "10px 14px", fontSize: 13.5, color: "#8A3126", marginBottom: 12 }}>
          Your plan ended on {me.paid_until}. Message Isham or renew to keep booking — your existing bookings are safe.
        </div>
      )}
      <p style={{ color: "var(--ink-soft)", marginBottom: 18 }}>
        {plan.name} — {plan.rotates
          ? "each week is one subject (see the colour on each date). Tap a slot to book."
          : plan.days === "weekday"
            ? "pick a subject, then tap a slot — weekday evenings, private 1-hour sessions."
            : "pick a subject, then tap a slot. Wednesday & Friday evenings — private 1-hour sessions."}
      </p>

      {!locked && (
        <>
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

          <BookingChart plan={plan} store={store} subject={subject} sel={sel} setSel={setSel} mine={mine} me={me} />

          <div style={{ position: "sticky", bottom: 16, marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
            <button className="it-btn" disabled={!sel || busy} onClick={confirmBooking}>
              {busy ? "Booking…" : sel ? `Confirm ${sel.subject || subject} · ${sel.label}` : "Select a slot on the chart"}
            </button>
          </div>
        </>
      )}

      {mine.length === 0 && !locked && (
        <div style={{ marginTop: 28 }}>
          <EmptyState icon="calendar" text="Your timetable is empty — let's fix that. Pick a highlighted date above to book your first lesson." />
        </div>
      )}

      {mine.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ maxWidth: 340, marginBottom: 20 }}>
            <MyLessonsCalendar mine={mine} />
          </div>
          <h3 className="it-display" style={{ fontSize: 18, fontWeight: 800 }}>Your lessons</h3>
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "2px 0 8px" }}>You can cancel and rebook any lesson up to 24 hours before it starts.</p>
          {(() => {
            const marked = mine.filter((b) => b.attended === true || b.attended === false);
            const attended = mine.filter((b) => b.attended === true).length;
            return marked.length > 0 ? (
              <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "0 0 10px" }}>
                Attendance: <strong style={{ color: "var(--ink)" }}>{attended} of {marked.length}</strong> lessons attended so far.
              </p>
            ) : null;
          })()}
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
            {[...mine].sort((a, b) => a.date.localeCompare(b.date)).map((b) => {
              const link = store.meetLinks[slotKey(b.date, b.block)];
              const c = SUBJECT_COLORS[b.subject] || SUBJECT_COLORS.Maths;
              const blk = blockById(b.block);
              const startMs = new Date(b.date + "T00:00:00").getTime() + blk.s * 60000;
              const cancellable = startMs - Date.now() > 24 * 3600 * 1000;
              return (
                <li key={b.id} style={{ background: c.bg, border: "1px solid " + c.border, borderRadius: 12, padding: "12px 14px", fontSize: 14, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <span>
                    <strong style={{ color: c.text }}>{b.subject}</strong> — {b.date} · {b.blockLabel}
                    {b.attended === true && <span className="it-chip" style={{ marginLeft: 8, background: "var(--aqua)", color: "var(--mint-dark)" }}>Attended</span>}
                    {b.attended === false && <span className="it-chip" style={{ marginLeft: 8, background: "#FFEDE9", color: "#C2402F" }}>Missed</span>}
                    {b.note && <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 4, fontStyle: "italic" }}>"{b.note}"</div>}
                  </span>
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {link ? (
                      <a href={link} target="_blank" rel="noreferrer" className="it-btn" style={{ padding: "8px 16px", fontSize: 13.5, textDecoration: "none" }}>Join Google Meet →</a>
                    ) : (
                      <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Meet link appears before the lesson</span>
                    )}
                    {cancellable && (
                      <button className="it-btn ghost" style={{ padding: "7px 12px", fontSize: 12.5 }}
                        onClick={async () => {
                          if (!confirm("Cancel this lesson? The lesson returns to your allowance and the seat is freed — you can rebook a different slot.")) return;
                          const { data, error } = await supa.rpc("cancel_booking", { p_booking: b.id, p_email: session.user.email });
                          if (error || data === false) alert("Couldn't cancel — lessons can only be cancelled more than 24 hours in advance.");
                          else await refresh();
                        }}>Cancel</button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="it-card" style={{ padding: 20, marginTop: 28 }}>
        <h3 className="it-display" style={{ fontSize: 16, fontWeight: 800, margin: "0 0 4px" }}>Account</h3>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "0 0 14px" }}>{session.user.email}</p>
        {me.cancelled ? (
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: 0 }}>
            Your plan is set to not renew.{me.paid_until ? ` You can keep booking until ${me.paid_until}.` : " Message Isham if you'd like to rejoin."}
          </p>
        ) : (
          <button className="it-btn ghost" style={{ fontSize: 13.5, padding: "9px 16px" }}
            onClick={async () => {
              if (!confirm("Cancel your plan? You'll keep access to lessons you've already paid for, but it won't renew after that.\n\nNote: this doesn't automatically cancel a recurring Stripe subscription if you set one up that way — message Isham if you're not sure.")) return;
              const { data, error } = await supa.rpc("cancel_my_plan");
              if (error || data === false) alert("Couldn't cancel — please message Isham directly.");
              else { alert("Done — your plan won't renew."); await refresh(); }
            }}>Cancel my plan</button>
        )}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
          <button className="it-navlink" style={{ padding: 0, fontSize: 12.5, color: "var(--coral)" }}
            onClick={async () => {
              if (!confirm("Request that Isham delete your account and all your data? He'll action this and confirm by email — it can't be undone once done.")) return;
              try {
                await addMessage({ name: me.name, email: session.user.email, text: "DATA DELETION REQUEST — please delete my account and all associated data (right to erasure)." });
                alert("Request sent — Isham will confirm once it's done.");
              } catch (e) { alert("Couldn't send that — please email Isham directly."); }
            }}>Request my data be deleted</button>
        </div>
      </div>

      <ChatPanel sender={me.name} isTutor={false} />
    </div>
  );
}

function Contact({ addMessage }) {
  const [f, setF] = useState({ name: "", email: "", text: "" });
  const [sent, setSent] = useState(false);
  const submit = async () => {
    if (!f.name.trim() || !f.text.trim()) return alert("Please add your name and a message.");
    try { await addMessage(f); notifyServer({ type: "message", name: f.name, email: f.email, text: f.text }); setSent(true); }
    catch (e) { alert("Couldn't send — please try again."); }
  };
  return (
    <div className="it-fade" style={{ padding: "56px 24px", maxWidth: 620, margin: "0 auto" }}>
      <span className="it-tag">Get in touch</span>
      <h1 className="it-display" style={{ fontSize: 30, fontWeight: 800, margin: "12px 0 6px" }}>Questions?</h1>
      <p style={{ color: "var(--ink-soft)" }}>Money worries, subjects, exam boards, availability — ask anything. I usually reply within a day.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10, margin: "16px 0 6px" }}>
        <a href={"https://wa.me/" + CONTACT.phoneIntl.replace("+", "")} target="_blank" rel="noreferrer" className="it-card it-contact-tile">
          <div className="it-step-icon"><Icon name="users" size={16} /></div>
          <div><div style={{ fontSize: 12, color: "var(--ink-soft)", fontWeight: 600 }}>WhatsApp</div><div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--mint-dark)" }}>Message directly</div></div>
        </a>
        <a href={"mailto:" + CONTACT.email} className="it-card it-contact-tile">
          <div className="it-step-icon"><Icon name="check" size={16} /></div>
          <div><div style={{ fontSize: 12, color: "var(--ink-soft)", fontWeight: 600 }}>Email</div><div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--mint-dark)" }}>{CONTACT.email}</div></div>
        </a>
      </div>
      {sent ? (
        <div className="it-card" style={{ padding: 24, marginTop: 16, display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--aqua)", color: "var(--mint-dark)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Icon name="check" size={20} /></div>
          <div>
            <strong>Message sent</strong>
            <p style={{ color: "var(--ink-soft)", margin: "4px 0 0" }}>Thanks {f.name.split(" ")[0]} — I'll get back to you at {f.email || "your email"}.</p>
          </div>
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
        <h3 className="it-display" style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Quick answers</h3>
        <Accordion items={[
          ["Is this a scholarship?", "Every GCSE place is subsidised — you still pay the £40/month listed price, it's not free or means-tested. But it's priced well below what tutoring normally costs, on purpose, so any family can access it. Think subsidised place, not discount."],
          ["How do GCSE subjects work?", "One subject per week on rotation: Maths week → Biology → Chemistry → Physics → repeat. You get every subject twice a month."],
          ["When are GCSE lessons?", "Weekends, in 90-minute sessions between 9:00am and 4:15pm, with 15-minute breaks between groups."],
          ["When are A-level sessions?", "Wednesday and Friday evenings, private 1-hour slots."],
          ["Where are lessons held?", "Live on Google Meet — your join link appears on your booking page before each lesson."],
          ["How big are the groups?", "GCSE runs in groups of 5 max, so everyone gets airtime. A-level sessions are private one-to-one."],
          ["Can I cancel?", "Yes — there's a \"Cancel my plan\" button on your Book page under Account. You keep booking access through whatever you've already paid for, it just won't renew after that. No contract either way."],
          ["What's the Grade A Guarantee?", "Be enrolled 6+ months, attend your lessons, follow the guidance and hand in all homework on time to a genuine standard — if your assessment average still isn't a grade 7 (A) or above, your most recent 3 months of fees are refunded."],
          ["Can I get a refund for another reason?", "Plans have no contract, so you never pay for a month you don't want — just don't renew. For anything else, message, call or email and we'll talk like humans."],
        ]} />
      </div>
    </div>
  );
}

function StudentAttendanceRow({ b, c, onMove, saveNote }) {
  const [note, setNote] = useState(b.note || "");
  return (
    <div style={{ background: "#fff", border: "1px solid " + c.border, borderRadius: 10, padding: "6px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 13 }}>{b.name}</strong>
        <button onClick={() => onMove(b)} title="Move this student to a different session"
          style={{ border: "none", background: c.bg, color: c.text, borderRadius: 999, fontSize: 11, fontWeight: 800, padding: "3px 9px", cursor: "pointer" }}>Move</button>
        <button onClick={() => saveNote(b.id, { attended: b.attended === true ? null : true })} title="Mark present"
          style={{ border: "none", borderRadius: 999, fontSize: 11, fontWeight: 800, padding: "3px 9px", cursor: "pointer",
            background: b.attended === true ? "var(--mint)" : "#EEF3F1", color: b.attended === true ? "#fff" : "var(--ink-soft)" }}>✓ Present</button>
        <button onClick={() => saveNote(b.id, { attended: b.attended === false ? null : false })} title="Mark absent"
          style={{ border: "none", borderRadius: 999, fontSize: 11, fontWeight: 800, padding: "3px 9px", cursor: "pointer",
            background: b.attended === false ? "var(--coral)" : "#EEF3F1", color: b.attended === false ? "#fff" : "var(--ink-soft)" }}>✗ Absent</button>
      </div>
      <textarea rows={1} placeholder="Note for this student — visible to them"
        value={note} onChange={(e) => setNote(e.target.value)}
        onBlur={() => { if (note !== (b.note || "")) saveNote(b.id, { note: note.trim() || null }); }}
        style={{ width: "100%", marginTop: 6, fontSize: 12, padding: "5px 8px", border: "1px solid var(--line)", borderRadius: 8, fontFamily: "inherit", resize: "vertical" }} />
    </div>
  );
}

function SessionCard({ dk, block, list, subj, link, saveLink, onMove, saveNote, emails }) {
  const cap = (PLANS[(list[0] || {}).plan] || {}).seats || 5;
  const [draft, setDraft] = useState(link || "");
  const c = SUBJECT_COLORS[subj] || SUBJECT_COLORS.Maths;
  const inviteMsg = () => `Hi! Your ${subj} lesson is on ${dk}, ${block.label}. Join here: ${draft || "(link coming soon)"} — Isham`;
  const copyInvite = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(inviteMsg()).then(() => alert("Invite message copied — paste it into email or WhatsApp."));
    else alert(inviteMsg());
  };
  const emailInvite = () => {
    const to = (emails || []).filter(Boolean).join(",");
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(`Your ${subj} lesson — ${dk}`)}&body=${encodeURIComponent(inviteMsg())}`;
  };
  return (
    <div style={{ border: "1.5px solid " + c.border, background: c.bg, borderRadius: 14, padding: 14, marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <div>
          <strong style={{ color: c.text }}>{block.label}</strong>{" "}
          <SubjectChip subject={subj} />{" "}
          <span style={{ fontSize: 13, fontWeight: 700, color: list.length >= cap ? "var(--coral)" : c.text }}>
            {cap === 1 ? "1-to-1" : `${list.length}/${cap} booked`}
          </span>
        </div>
      </div>
      <div style={{ display: "grid", gap: 8, margin: "8px 0" }}>
        {list.length ? list.map((b) => (
          <StudentAttendanceRow key={b.id} b={b} c={c} onMove={onMove} saveNote={saveNote} />
        )) : "No students yet"}
      </div>
      {list.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input className="it-input" style={{ flex: 1, minWidth: 220, padding: "8px 12px", fontSize: 13.5 }} placeholder="Paste Google Meet link (meet.google.com/…)"
            value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button className="it-btn ghost" style={{ padding: "8px 14px", fontSize: 13 }} onClick={async () => { await saveLink(draft.trim()); alert("Saved — students now see this link on their booking page."); }}>Save link</button>
          <button className="it-btn" style={{ padding: "8px 14px", fontSize: 13 }} onClick={copyInvite}>Copy invite</button>
          <button className="it-btn" style={{ padding: "8px 14px", fontSize: 13 }} onClick={emailInvite}>✉️ Email invites</button>
        </div>
      )}
    </div>
  );
}


function MoveModal({ booking, onClose, onSave }) {
  const plan = PLANS[booking.plan] || PLANS.gcse;
  const days = upcomingDays(plan.days, 8);
  const [saving, setSaving] = useState(false);
  const visibleBlocks = plan.blocks;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,42,67,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}>
      <div className="it-card it-fade" style={{ padding: 26, width: 560, maxWidth: "100%", maxHeight: "85vh", overflowY: "auto" }}>
        <h3 className="it-display" style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800 }}>Move {booking.name}</h3>
        <p style={{ color: "var(--ink-soft)", margin: "0 0 16px", fontSize: 14 }}>
          Currently: {booking.subject} · {booking.date} · {booking.blockLabel}. Pick the new session:
        </p>
        <div style={{ display: "grid", gap: 10 }}>
          {days.map((d) => {
            const dk = dateKey(d);
            const subj = plan.rotates ? weekSubject(d, plan.cycle) : booking.subject;
            const c = SUBJECT_COLORS[subj] || SUBJECT_COLORS.Maths;
            return (
              <div key={dk}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }} className="it-display">{prettyDate(d)} <SubjectChip subject={subj} /></div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: 6 }}>
                  {visibleBlocks.map((bl) => (
                    <button key={bl.id} className="it-slot" disabled={saving || (dk === booking.date && bl.id === booking.block)}
                      style={{ background: c.bg, borderColor: c.border, color: c.text, fontSize: 12.5, padding: "9px 4px" }}
                      onClick={async () => { setSaving(true); await onSave(booking, { date: dk, block: bl.id, block_label: bl.label, subject: subj }); }}>
                      {bl.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <button className="it-btn ghost" style={{ marginTop: 16, width: "100%" }} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

function ClassroomLinksCard({ meetLinks, saveMeet }) {
  const groups = [
    { key: classroomKey("gcse"), label: "GCSE group class (GCSE & Term Deal)" },
    { key: classroomKey("alevel"), label: "A-level STEM Support" },
  ];
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(null);
  return (
    <div className="it-card" style={{ padding: 18, marginBottom: 20 }}>
      <strong style={{ fontSize: 14.5 }}>Google Classroom links</strong>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "4px 0 12px" }}>
        Paste each class's Google Classroom link here — students see it on their Book dashboard once their payment's confirmed.
      </p>
      <div style={{ display: "grid", gap: 10 }}>
        {groups.map((g) => (
          <div key={g.key} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 13, minWidth: 240, color: "var(--ink-soft)" }}>{g.label}</span>
            <input className="it-input" style={{ flex: 1, minWidth: 200 }} placeholder="https://classroom.google.com/c/…"
              value={drafts[g.key] ?? meetLinks[g.key] ?? ""} onChange={(e) => setDrafts({ ...drafts, [g.key]: e.target.value })} />
            <button className="it-btn ghost" style={{ padding: "9px 14px", fontSize: 13 }} disabled={saving === g.key}
              onClick={async () => {
                setSaving(g.key);
                await saveMeet(g.key, (drafts[g.key] ?? meetLinks[g.key] ?? "").trim());
                setSaving(null);
              }}>{saving === g.key ? "Saving…" : "Save"}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function RenewBadge({ paidUntil, plan }) {
  if (plan === "ucat") return <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>one-off</span>;
  if (!paidUntil) return <span className="it-chip" style={{ background: "#FFEDE9", color: "#C2402F", border: "1px solid #C2402F" }}>payment unconfirmed</span>;
  const dl = daysLeft(paidUntil);
  const col = dl <= 0 ? "#C2402F" : dl <= 7 ? "#B87A14" : "var(--mint-dark)";
  const bg = dl <= 0 ? "#FFEDE9" : dl <= 7 ? "#FFF4E0" : "var(--aqua)";
  return (
    <span className="it-chip" style={{ background: bg, color: col, border: "1px solid " + col }}>
      {dl <= 0 ? `expired ${-dl}d ago` : `${dl}d left`}
    </span>
  );
}

function Admin({ store, saveMeet, saveLessonNote, removeSubscriber, refresh, moveBooking, addStudentManual, updatePaidUntil, addTestimonial, removeTestimonial }) {
  const [step, setStep] = useState("checking"); // checking | login | challenge | in
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState(null); // {factorId, challengeId}
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState(null);
  const [nf, setNf] = useState({ name: "", email: "", plan: "gcse3", paid_until: addMonths(3) });
  const [tf, setTf] = useState({ name: "", quote: "", detail: "" });
  const [calFilter, setCalFilter] = useState(null);
  const [enroll, setEnroll] = useState(null); // {factorId, qr, secret}
  const [enrollCode, setEnrollCode] = useState("");
  const [hasMfa, setHasMfa] = useState(true);

  const [role, setRole] = useState(null);
  const finishLogin = async () => {
    const { data: { session } } = await supa.auth.getSession();
    const em = ((session && session.user && session.user.email) || "").toLowerCase();
    const r = Object.values(TUTORS).find((t) => t.email.toLowerCase() === em);
    if (!r) { setErr("This account isn't a tutor on this site."); await supa.auth.signOut(); return setStep("login"); }
    setRole(r);
    const { data: f } = await supa.auth.mfa.listFactors();
    setHasMfa((f && f.totp && f.totp.length > 0) || false);
    setStep("in");
    const d = await refresh();
    if (d) {
      const cutoff = Date.now() - 48 * 3600 * 1000;
      const ghosts = d.bookings.filter((b) => {
        const s = d.subscribers.find((x) => x.id === b.subscriberId);
        return s && !s.paid_until && (PLANS[s.plan] || {}).months > 0 && new Date(b.created).getTime() < cutoff;
      });
      for (const g of ghosts) await supa.from("bookings").delete().eq("id", g.id);
      if (ghosts.length) { await refresh(); alert(`Auto-cleared ${ghosts.length} unpaid booking hold${ghosts.length > 1 ? "s" : ""} (older than 48h).`); }
    }
  };

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supa.auth.getSession();
      if (!session) return setStep("login");
      const { data: aal } = await supa.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") return setStep("login");
      await finishLogin();
    })();
  }, []);

  const doLogin = async () => {
    setBusy(true); setErr("");
    const { error } = await supa.auth.signInWithPassword({ email: email.trim(), password });
    if (error) { setBusy(false); return setErr("Wrong email or password."); }
    const { data: aal } = await supa.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const { data: f } = await supa.auth.mfa.listFactors();
      const factor = f.totp && f.totp[0];
      if (factor) {
        const { data: ch, error: chErr } = await supa.auth.mfa.challenge({ factorId: factor.id });
        if (chErr) { setBusy(false); return setErr(chErr.message); }
        setChallenge({ factorId: factor.id, challengeId: ch.id });
        setBusy(false);
        return setStep("challenge");
      }
    }
    setBusy(false);
    await finishLogin();
  };

  const doVerify = async () => {
    setBusy(true); setErr("");
    const { error } = await supa.auth.mfa.verify({ factorId: challenge.factorId, challengeId: challenge.challengeId, code: code.trim() });
    setBusy(false);
    if (error) return setErr("Wrong code — check your authenticator app.");
    await finishLogin();
  };

  const startEnroll = async () => {
    setErr("");
    const { data, error } = await supa.auth.mfa.enroll({ factorType: "totp" });
    if (error) return setErr(error.message);
    setEnroll({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };
  const confirmEnroll = async () => {
    setBusy(true); setErr("");
    const { data: ch, error: chErr } = await supa.auth.mfa.challenge({ factorId: enroll.factorId });
    if (chErr) { setBusy(false); return setErr(chErr.message); }
    const { error } = await supa.auth.mfa.verify({ factorId: enroll.factorId, challengeId: ch.id, code: enrollCode.trim() });
    setBusy(false);
    if (error) return setErr("Code didn't match — try the newest code in your app.");
    setEnroll(null); setEnrollCode(""); setHasMfa(true);
    alert("2FA is on ✓ — from now on, logging in needs your password AND a code from your app.");
  };
  const signOut = async () => { await supa.auth.signOut(); setStep("login"); setPassword(""); setCode(""); };

  if (step === "checking")
    return <Spinner label="Checking login…" />;

  if (step === "login")
    return (
      <div className="it-fade" style={{ padding: "72px 24px", maxWidth: 400, margin: "0 auto" }}>
        <h1 className="it-display" style={{ fontSize: 26, fontWeight: 800 }}>Tutor login</h1>
        <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Sign in with the admin account you created in Supabase.</p>
        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          <input className="it-input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="it-input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doLogin()} />
          <button className="it-btn" onClick={doLogin} disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          {err && <p style={{ color: "var(--coral)", fontSize: 13, margin: 0 }}>{err}</p>}
        </div>
      </div>
    );

  if (step === "challenge")
    return (
      <div className="it-fade" style={{ padding: "72px 24px", maxWidth: 400, margin: "0 auto" }}>
        <h1 className="it-display" style={{ fontSize: 26, fontWeight: 800 }}>Two-factor code</h1>
        <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Open your authenticator app and enter the 6-digit code.</p>
        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          <input className="it-input" inputMode="numeric" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doVerify()} style={{ letterSpacing: "0.3em", fontSize: 18, textAlign: "center" }} />
          <button className="it-btn" onClick={doVerify} disabled={busy}>{busy ? "Checking…" : "Verify"}</button>
          {err && <p style={{ color: "var(--coral)", fontSize: 13, margin: 0 }}>{err}</p>}
        </div>
      </div>
    );

  const isMaster = !!(role && role.master);
  const tutorOf = (s) => s.tutor || "isham";
  // Scoped to this tutor's own students, not every student — a non-master tutor
  // must not see or manage another tutor's students, even within the same subject.
  const subs = store.subscribers.filter((s) => isMaster || tutorOf(s) === role.id);
  const mySubIds = new Set(subs.map((s) => s.id));
  const deptBookings = store.bookings.filter((b) => isMaster || mySubIds.has(b.subscriberId));
  const thisMonth = new Date().toISOString().slice(0, 7);
  const grossFor = (tid) => store.subscribers.reduce((t, s) => {
    if (tutorOf(s) !== tid) return t;
    const p = PLANS[s.plan] || {};
    if (p.months > 0) return t + (s.paid_until ? p.price / p.months : 0);
    return t + ((s.joined || "").startsWith(thisMonth) ? p.price : 0);
  }, 0);
  const payersFor = (tid) => store.subscribers.filter((s) => tutorOf(s) === tid && ((PLANS[s.plan] || {}).months > 0 ? s.paid_until : (s.joined || "").startsWith(thisMonth))).length;
  const stripeEst = (tid) => grossFor(tid) * 0.015 + 0.20 * payersFor(tid);
  const myGross = grossFor(role.id);
  const myFee = isMaster ? 0 : myGross * feeRate(role.id);

  const byDate = {};
  for (const b of deptBookings) {
    byDate[b.date] = byDate[b.date] || {};
    byDate[b.date][b.block] = byDate[b.date][b.block] || [];
    byDate[b.date][b.block].push(b);
  }
  const dates = Object.keys(byDate).sort();
  const blockDef = (id) => blockById(id);

  return (
    <div className="it-fade" style={{ padding: "48px 24px", maxWidth: 1120, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
        <h1 className="it-display" style={{ fontSize: 30, fontWeight: 800, margin: 0 }}>Dashboard</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="it-btn ghost" style={{ padding: "8px 14px", fontSize: 13.5 }} onClick={refresh}>↻ Refresh</button>
          <button className="it-btn ghost" style={{ padding: "8px 14px", fontSize: 13.5 }} onClick={signOut}>Sign out</button>
        </div>
      </div>

      <div className="it-admin-jumpnav">
        {[["overview", "Overview"], ["timetable", "Timetable"], ["students", "Students"], ["testimonials", "Testimonials"], ["messages", "Messages"]].map(([id, label]) => (
          <button key={id} onClick={() => document.getElementById("admin-" + id)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{label}</button>
        ))}
      </div>

      {!hasMfa && (
        <div className="it-card" style={{ padding: 20, marginBottom: 20, border: "1.5px solid var(--coral)" }}>
          <h3 className="it-display" style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 800 }}>🔐 Turn on two-factor authentication</h3>
          {!enroll ? (
            <>
              <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 10px" }}>
                Protect the student list with a 6-digit code from your phone. You'll need a free authenticator app (Google Authenticator, Authy, or iPhone's built-in Passwords app).
              </p>
              <button className="it-btn" style={{ padding: "9px 16px", fontSize: 13.5 }} onClick={startEnroll}>Set up 2FA</button>
            </>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: 0 }}>
                Step 1: scan this QR code with your authenticator app — or type the secret in manually. Step 2: enter the 6-digit code it shows.
              </p>
              <img src={enroll.qr} alt="2FA QR code" style={{ width: 170, height: 170, background: "#fff", borderRadius: 8, border: "1px solid var(--line)" }} />
              <code style={{ fontSize: 12, background: "var(--aqua)", padding: "6px 10px", borderRadius: 8, wordBreak: "break-all" }}>{enroll.secret}</code>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input className="it-input" inputMode="numeric" placeholder="123456" style={{ maxWidth: 140, textAlign: "center", letterSpacing: "0.2em" }}
                  value={enrollCode} onChange={(e) => setEnrollCode(e.target.value)} />
                <button className="it-btn" style={{ padding: "9px 16px", fontSize: 13.5 }} onClick={confirmEnroll} disabled={busy}>{busy ? "Checking…" : "Confirm & enable"}</button>
              </div>
              {err && <p style={{ color: "var(--coral)", fontSize: 13, margin: 0 }}>{err}</p>}
            </div>
          )}
        </div>
      )}

      <div id="admin-overview" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, marginBottom: 30, scrollMarginTop: 90 }}>
        {(isMaster ? [
          ["My gross / month", "£" + grossFor("isham").toFixed(0), "💷"],
          ["Places", `${store.takenCount || 0} / ${CAP}`, "🎓"],
          ["Registered students", String(store.subscribers.length), "👥"],
          ["Lessons booked", String(store.bookings.length), "📅"],
          ["Messages", String(store.messages.length), "✉️"],
        ] : [
          ["Your gross / month", "£" + myGross.toFixed(2), "💷"],
          [`Platform fee (${Math.round(feeRate(role.id) * 100)}%)`, "£" + myFee.toFixed(2), "🤝"],
          ["Stripe fees (est.)", "£" + stripeEst(role.id).toFixed(2), "📊"],
          ["You keep (approx)", "£" + Math.max(myGross - myFee - stripeEst(role.id), 0).toFixed(2), "💰"],
          ["Your students", String(subs.filter((s) => tutorOf(s) === role.id).length), "👥"],
          ["Lessons booked", String(deptBookings.length), "📅"],
        ]).map(([k, v, icon]) => (
          <div key={k} className="it-card" style={{ padding: 18 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: "var(--aqua)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, marginBottom: 10 }}>{icon}</div>
            <div style={{ fontSize: 12, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 }}>{k}</div>
            <div className="it-display" style={{ fontSize: 25, fontWeight: 800, color: "var(--mint-dark)" }}>{v}</div>
          </div>
        ))}
      </div>

      {isMaster && <ClassroomLinksCard meetLinks={store.meetLinks} saveMeet={saveMeet} />}

      <ChatPanel sender={role.name} isTutor={true} />

      <h2 id="admin-timetable" className="it-display" style={{ fontSize: 20, fontWeight: 800, scrollMarginTop: 90 }}>Timetable — who booked what & when</h2>
      <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 4 }}>Dates with bookings light up on the calendar (the little number is how many). Tap a date to see just that day. Paste a Google Meet link into any session — students instantly see it on their booking page.</p>
      <AdminCalendar bookings={store.bookings} active={calFilter} onPick={(dk) => setCalFilter(calFilter === dk ? null : dk)} />
      {dates.length === 0 && <EmptyState icon="calendar" text="No bookings yet." />}
      {(calFilter ? dates.filter((d) => d === calFilter) : dates).map((dk) => {
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
                saveLink={(l) => saveMeet(slotKey(dk, blockId), l)} onMove={setMoving}
                saveNote={saveLessonNote}
                emails={list.map((b) => (subs.find((s) => s.id === b.subscriberId) || {}).email)} />
            ))}
          </div>
        );
      })}

      <h2 id="admin-students" className="it-display" style={{ fontSize: 20, fontWeight: 800, marginTop: 34, scrollMarginTop: 90 }}>Students</h2>
      <div className="it-card" style={{ padding: 18, marginTop: 12 }}>
        <strong style={{ fontSize: 14.5 }}>Add a student manually</strong>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "4px 0 10px" }}>For anyone who paid or arranged differently (bank transfer, cash, DM) — adds them so they can book like everyone else.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input className="it-input" style={{ flex: 2, minWidth: 140 }} placeholder="Name" value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} />
          <input className="it-input" style={{ flex: 2, minWidth: 160 }} placeholder="Email" value={nf.email} onChange={(e) => setNf({ ...nf, email: e.target.value })} />
          <select className="it-input" style={{ flex: 1, minWidth: 130 }} value={nf.plan}
            onChange={(e) => { const pl = e.target.value; setNf({ ...nf, plan: pl, paid_until: PLANS[pl].months ? addMonths(PLANS[pl].months) : "" }); }}>
            {Object.values(PLANS).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input className="it-input" type="date" style={{ flex: 1, minWidth: 140 }} value={nf.paid_until || ""} onChange={(e) => setNf({ ...nf, paid_until: e.target.value })} />
          <button className="it-btn" style={{ padding: "10px 18px" }} onClick={async () => {
            if (!nf.name.trim() || !nf.email.includes("@")) return alert("Name and a valid email needed.");
            try {
              await addStudentManual({ name: nf.name.trim(), email: nf.email.trim().toLowerCase(), plan: nf.plan, paid_until: nf.paid_until || null, tutor: "isham" });
              setNf({ name: "", email: "", plan: "gcse3", paid_until: addMonths(3) });
            }
            catch (e) { alert(String(e).includes("duplicate") ? "That email is already registered." : "Couldn't add — try again."); }
          }}>Add</button>
        </div>
      </div>
      <div className="it-card" style={{ padding: 18, marginTop: 12, overflowX: "auto" }}>
        {subs.length === 0 ? <EmptyState icon="users" text="No sign-ups yet." /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr style={{ textAlign: "left", color: "var(--ink-soft)" }}><th style={{ padding: 6 }}>Name</th><th style={{ padding: 6 }}>Email</th><th style={{ padding: 6 }}>Plan</th><th style={{ padding: 6 }}>Joined</th><th style={{ padding: 6 }}>Renewal</th><th /></tr></thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: 6, fontWeight: 600 }}>
                    {s.name}
                    {s.cancelled && <span className="it-chip" style={{ marginLeft: 6, background: "#FFEDE9", color: "#C2402F" }}>Not renewing</span>}
                  </td>
                  <td style={{ padding: 6 }}>{s.email}</td>
                  <td style={{ padding: 6 }}>{(PLANS[s.plan] || {}).name || s.plan}</td>
                  <td style={{ padding: 6, color: "var(--ink-soft)" }}>{(s.joined || "").slice(0, 10)}</td>
                  <td style={{ padding: 6, whiteSpace: "nowrap" }}>
                    <RenewBadge paidUntil={s.paid_until} plan={s.plan} />{" "}
                    {!s.paid_until && s.plan !== "ucat" ? (
                      <button style={{ border: "none", background: "var(--mint)", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", borderRadius: 999, padding: "3px 10px" }}
                        title="Check the payment arrived in Stripe first, then click"
                        onClick={() => updatePaidUntil(s.id, addMonths((PLANS[s.plan] || {}).months || 1))}>Confirm paid ✓</button>
                    ) : (
                      <button style={{ border: "none", background: "none", color: "var(--mint-dark)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                        onClick={async () => { const nd = prompt("Paid until (YYYY-MM-DD):", s.paid_until || addMonths(1)); if (nd) await updatePaidUntil(s.id, nd); }}>edit</button>
                    )}
                  </td>
                  <td style={{ padding: 6 }}><button className="it-btn ghost" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => { if (confirm(`Remove ${s.name} and all their bookings?`)) removeSubscriber(s.id); }}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isMaster && (<>
      <h2 id="admin-testimonials" className="it-display" style={{ fontSize: 20, fontWeight: 800, marginTop: 34, scrollMarginTop: 90 }}>Testimonials</h2>
      <div className="it-card" style={{ padding: 18, marginTop: 12 }}>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "0 0 10px" }}>
          Only add real quotes with the student's (or parent's) permission — these show publicly on the home page. Ask past students today; three honest lines beat any design tweak.
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          <input className="it-input" placeholder="Student / parent name (e.g. Amira K.)" value={tf.name} onChange={(e) => setTf({ ...tf, name: e.target.value })} />
          <input className="it-input" placeholder="Detail (e.g. GCSE Maths — grade 5 → 8)" value={tf.detail} onChange={(e) => setTf({ ...tf, detail: e.target.value })} />
          <textarea className="it-input" rows={2} placeholder="Their quote, in their words" value={tf.quote} onChange={(e) => setTf({ ...tf, quote: e.target.value })} />
          <button className="it-btn" style={{ justifySelf: "start" }} onClick={async () => {
            if (!tf.name.trim() || !tf.quote.trim()) return alert("Name and quote needed.");
            await addTestimonial({ name: tf.name.trim(), quote: tf.quote.trim(), detail: tf.detail.trim() || null });
            setTf({ name: "", quote: "", detail: "" });
          }}>Add testimonial</button>
        </div>
        {(store.testimonials || []).length > 0 && (
          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            {store.testimonials.map((t) => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", background: "var(--aqua)", borderRadius: 10, padding: "9px 12px", fontSize: 13.5 }}>
                <span>"{t.quote}" — <strong>{t.name}</strong>{t.detail ? ` (${t.detail})` : ""}</span>
                <button className="it-btn ghost" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => removeTestimonial(t.id)}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <h2 id="admin-messages" className="it-display" style={{ fontSize: 20, fontWeight: 800, marginTop: 34, scrollMarginTop: 90 }}>Messages</h2>
      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {store.messages.length === 0 && <EmptyState icon="mail" text="No questions yet." />}
        {[...store.messages].reverse().map((m) => (
          <div key={m.id} className="it-card" style={{ padding: 16 }}>
            <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>{(m.created || "").slice(0, 16).replace("T", " · ")} — <strong style={{ color: "var(--ink)" }}>{m.name}</strong> {m.email && `(${m.email})`}</div>
            <p style={{ margin: "6px 0 0", fontSize: 14.5 }}>{m.text}</p>
          </div>
        ))}
      </div>

      </>)}

      {moving && <MoveModal booking={moving} onClose={() => setMoving(null)}
        onSave={async (b, upd) => { await moveBooking(b, upd); setMoving(null); }} />}
    </div>
  );
}

function PasswordRecoveryOverlay({ onDone }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const submit = async () => {
    if (pw.length < 8) return setErr("Password must be at least 8 characters.");
    if (pw !== pw2) return setErr("Passwords don't match.");
    setBusy(true); setErr("");
    const { error } = await supa.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setErr(error.message);
    setDone(true);
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,42,67,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, padding: 20 }}>
      <div className="it-card it-fade" style={{ padding: 30, width: 400, maxWidth: "100%" }}>
        {done ? (
          <>
            <h3 className="it-display" style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800 }}>Password updated ✓</h3>
            <p style={{ color: "var(--ink-soft)", margin: "0 0 16px" }}>You can now sign in with your new password.</p>
            <button className="it-btn" onClick={onDone}>Done</button>
          </>
        ) : (
          <>
            <h3 className="it-display" style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800 }}>Set a new password</h3>
            <div style={{ display: "grid", gap: 12 }}>
              <input className="it-input" type="password" placeholder="New password (min 8 characters)" value={pw} onChange={(e) => setPw(e.target.value)} />
              <input className="it-input" type="password" placeholder="Repeat password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
              <button className="it-btn" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Update password"}</button>
              {err && <p style={{ color: "var(--coral)", fontSize: 13, margin: 0 }}>{err}</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- app shell ---------- */
export default function App() {
  const [page, setPage] = useState(() => (new URLSearchParams(window.location.search).get("paid") ? "book" : "home"));
  const [store, setStore] = useState({ subscribers: [], bookings: [], messages: [], meetLinks: {}, testimonials: [], takenCount: 0 });
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState(null);
  const [toast, setToast] = useState(null);
  const [recovery, setRecovery] = useState(false);

  const refresh = async () => {
    try { const d = await fetchAll(); setStore(d); setLoadErr(false); return d; }
    catch (e) { console.error(e); setLoadErr(true); }
  };
  useEffect(() => { refresh().finally(() => setLoaded(true)); }, []);
  useEffect(() => {
    const { data: sub } = supa.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  const notify = (t) => { setToast(t); setTimeout(() => setToast(null), 3200); };
  useEffect(() => {
    // Stripe redirects here with ?paid=1 after a successful payment (set that as the Payment Link's
    // "after payment" redirect URL in Stripe) — land straight on the booking dashboard instead of the homepage.
    if (new URLSearchParams(window.location.search).get("paid")) {
      notify("Payment received ✓ — here's your booking dashboard.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const addStudent = async (s) => {
    const { error } = await supa.from("students").insert(s);
    if (error) { const e = new Error(error.message); e.status = error.code === "23505" ? 409 : 500; throw e; }
    const { data } = await supa.rpc("find_student", { p_email: s.email });
    const row = (data && data[0]) || { id: null, name: s.name, plan: s.plan, paid_until: s.paid_until };
    // unconfirmed sign-ups do NOT count toward the cap until payment is confirmed
    setStore((st) => ({ ...st, subscribers: [...st.subscribers, { ...s, ...row }] }));
    return row;
  };
  const addBooking = async (b) => {
    const pl = PLANS[b.plan] || PLANS.gcse;
    let q = supa.from("bookings").select("id", { count: "exact", head: true }).eq("date", b.date).eq("block", b.block);
    if ((pl.seats || 5) > 1) q = q.eq("subject", b.subject);
    const { count } = await q;
    if ((count || 0) >= (pl.seats || 5)) { await refresh(); throw new Error("slot full"); }
    const { data, error } = await supa.from("bookings").insert(b).select();
    if (error) throw new Error(error.message);
    setStore((st) => ({ ...st, bookings: [...st.bookings, mapBooking(data[0])] }));
    notify("Lesson booked ✓ — your Meet link will appear here");
  };
  const addMessage = async (m) => {
    const { error } = await supa.from("messages").insert(m);
    if (error) throw new Error(error.message);
    setStore((st) => ({ ...st, messages: [...st.messages, { ...m, id: "local-" + Date.now(), created: new Date().toISOString() }] }));
  };
  const saveMeet = async (slot, link) => {
    const { error } = await supa.from("meet_links").upsert({ slot, link });
    if (error) throw new Error(error.message);
    setStore((st) => ({ ...st, meetLinks: { ...st.meetLinks, [slot]: link } }));
  };
  const saveLessonNote = async (bookingId, patch) => {
    const { error } = await supa.from("lesson_notes").upsert({ booking_id: bookingId, ...patch }, { onConflict: "booking_id" });
    if (error) throw new Error(error.message);
    setStore((st) => ({ ...st, bookings: st.bookings.map((b) => b.id === bookingId ? { ...b, ...patch } : b) }));
  };
  const moveBooking = async (b, upd) => {
    const { error } = await supa.from("bookings").update(upd).eq("id", b.id);
    if (error) throw new Error(error.message);
    setStore((st) => ({
      ...st,
      bookings: st.bookings.map((x) => x.id === b.id ? { ...x, date: upd.date, block: upd.block, blockLabel: upd.block_label, subject: upd.subject } : x),
    }));
    notify("Moved " + b.name + " ✓");
  };
  const addStudentManual = async (s) => {
    const { data, error } = await supa.from("students").insert(s).select();
    if (error) throw new Error(error.message);
    setStore((st) => {
      const subscribers = [...st.subscribers, data[0]];
      const cnt = subscribers.filter((x) => (PLANS[x.plan] || {}).months > 0 && x.paid_until).length;
      return { ...st, subscribers, takenCount: cnt };
    });
    notify("Added " + data[0].name + " ✓");
  };
  const updatePaidUntil = async (id, paid_until) => {
    const { error } = await supa.from("students").update({ paid_until }).eq("id", id);
    if (error) throw new Error(error.message);
    setStore((st) => {
      const subscribers = st.subscribers.map((s) => s.id === id ? { ...s, paid_until } : s);
      const cnt = subscribers.filter((x) => (PLANS[x.plan] || {}).months > 0 && x.paid_until).length;
      return { ...st, subscribers, takenCount: cnt };
    });
  };
  const addTestimonial = async (t) => {
    const { data, error } = await supa.from("testimonials").insert(t).select();
    if (error) throw new Error(error.message);
    setStore((st) => ({ ...st, testimonials: [...(st.testimonials || []), data[0]] }));
    notify("Testimonial added ✓ — now live on the home page");
  };
  const removeTestimonial = async (id) => {
    await supa.from("testimonials").delete().eq("id", id);
    setStore((st) => ({ ...st, testimonials: (st.testimonials || []).filter((t) => t.id !== id) }));
  };
  const removeSubscriber = async (id) => {
    const gone = store.subscribers.find((s) => s.id === id);
    await supa.from("students").delete().eq("id", id);
    setStore((st) => ({
      ...st,
      subscribers: st.subscribers.filter((s) => s.id !== id),
      bookings: st.bookings.filter((b) => b.subscriberId !== id),
      takenCount: st.takenCount - (gone && (PLANS[gone.plan] || {}).months > 0 && gone.paid_until ? 1 : 0),
    }));
  };

  const taken = store.takenCount || 0;
  const nav = [["home", "Home", "home"], ["pricing", "Plans", "star"], ["book", "Book", "calendar"], ["contact", "FAQ & Contact", "mail"]];

  return (
    <div className="it-app">
      <style>{css}</style>
      {recovery && <PasswordRecoveryOverlay onDone={() => setRecovery(false)} />}
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(251,253,253,.92)", backdropFilter: "blur(8px)", borderBottom: "1px solid var(--line)" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => setPage("home")} style={{ display: "flex", alignItems: "center", gap: 9, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <span className="it-display" style={{ width: 30, height: 30, borderRadius: 9, background: "var(--mint)", color: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, flex: "none" }}>i</span>
              <span className="it-display" style={{ fontSize: 19, fontWeight: 800, color: "var(--ink)", display: "flex", alignItems: "baseline", gap: 5 }}>
                isham<span style={{ color: "var(--mint-dark)" }}>.</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-soft)" }}>Tuition</span>
              </span>
            </button>
            <span className="it-chip it-header-badge" style={{ background: "var(--aqua)", color: "var(--mint-dark)" }}>Dental student</span>
          </div>
          <nav className="it-navrow">
            {nav.map(([id, label, icon]) => (
              <button key={id} className={"it-navlink" + (page === id ? " active" : "")} onClick={() => setPage(id)}>
                <Icon name={icon} size={15} style={{ flex: "none" }} /><span>{label}</span>
              </button>
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
        <Spinner label="Loading…" />
      ) : page === "home" ? (
        <Home go={setPage} taken={taken} testimonials={store.testimonials || []} />
      ) : page === "pricing" ? (
        <Pricing taken={taken} startCheckout={(id) => setCheckoutPlan(id)} />
      ) : page === "book" ? (
        <Book store={store} go={setPage} addBooking={addBooking} addMessage={addMessage} refresh={refresh} />
      ) : page === "contact" ? (
        <Contact addMessage={addMessage} />
      ) : (
        <Admin store={store} saveMeet={saveMeet} saveLessonNote={saveLessonNote} removeSubscriber={removeSubscriber} refresh={refresh} moveBooking={moveBooking} addStudentManual={addStudentManual} updatePaidUntil={updatePaidUntil} addTestimonial={addTestimonial} removeTestimonial={removeTestimonial} />
      )}

      {checkoutPlan && (
        <Checkout planId={checkoutPlan} onCancel={() => setCheckoutPlan(null)}
          onDone={async (s) => { await addStudent(s); }}
          onFinish={() => { setCheckoutPlan(null); setPage("book"); }} />
      )}

      {toast && (
        <div className="it-fade" style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "var(--ink)", color: "#fff", padding: "12px 20px", borderRadius: 12, fontSize: 14.5, zIndex: 60, boxShadow: "0 10px 30px rgba(0,0,0,.25)" }}>
          {toast}
        </div>
      )}

      <footer style={{ borderTop: "1px solid var(--line)", padding: "28px 24px", marginTop: 40 }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, fontSize: 13.5, color: "var(--ink-soft)" }}>
          <span>
            © {new Date().getFullYear()} Isham Tuition ·{" "}
            <a href={"mailto:" + CONTACT.email} style={{ color: "var(--mint-dark)", fontWeight: 700 }}>{CONTACT.email}</a> ·{" "}
            TikTok <a href="https://www.tiktok.com/@ishamdoesdentistry" target="_blank" rel="noreferrer" style={{ color: "var(--mint-dark)", fontWeight: 700 }}>@ishamdoesdentistry</a>
          </span>
          <span style={{ display: "block", width: "100%", fontSize: 12, color: "var(--ink-soft)", marginTop: 6 }}>
            Privacy: only names, emails and bookings are collected — never sold or shared. Cancel your plan or request your data be deleted any time from your Book page account settings, or email me.
          </span>
          <button className="it-navlink" style={{ fontSize: 13.5 }} onClick={() => setPage("admin")}>Tutor login</button>
        </div>
      </footer>
    </div>
  );
}
