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
const SUPABASE_URL = "https://tmsvtiavhodtlvvaugdr.supabase.co";
const SUPABASE_KEY = "sb_publishable_uX2JC9t78GPJTMMgLcoeWA_9OVpc-8F";

/* ---- TUTORS & STRIPE ----
   Each tutor has their OWN Stripe account and payment links.
   Money goes directly to each tutor; dashboards report the platform fee each tutor owes (see FEES below). */
const TUTORS = {
  isham: { id: "isham", name: "Isham Bari",     email: "ishambari6@gmail.com", dept: "stem", master: true },
  belal: { id: "belal", name: "Belal Ghazalah", email: "bghazala01@gmail.com", dept: "stem" },
};
const FEES = { isham: 0, belal: 0.15 };
const feeRate = (tid) => FEES[tid] || 0;

const STRIPE = {
  isham: {
    gcse:  "https://buy.stripe.com/dRm3cudfR5297eHdT0es000",
    gcse3: "https://buy.stripe.com/8x200i6RtgKR8iL02aes001",
    alevel:"https://buy.stripe.com/5kQ4gy4JlfGN9mP6qyes002",
    ucat:  "https://buy.stripe.com/7sYeVc0t58elbuX9CKes003",
  },
  belal: { gcse: null, gcse3: null, alevel: null, ucat: null },
};

const CONTACT = { phone: "07477 514 013", phoneIntl: "+447477514013", email: "ishambari6@gmail.com" };
const CAP = 40;

const WEEKEND_BLOCKS = [
  { id: "b1", label: "9:00 – 10:30am · Isham",  s: 540,  e: 630 },
  { id: "c1", label: "9:00 – 10:30am · Belal",  s: 540,  e: 630 },
  { id: "b2", label: "10:45 – 12:15 · Isham",   s: 645,  e: 735 },
  { id: "c2", label: "10:45 – 12:15 · Belal",   s: 645,  e: 735 },
  { id: "b3", label: "1:00 – 2:30pm · Isham",   s: 780,  e: 870 },
  { id: "c3", label: "1:00 – 2:30pm · Belal",   s: 780,  e: 870 },
  { id: "b4", label: "2:45 – 4:15pm · Isham",   s: 885,  e: 975 },
  { id: "c4", label: "2:45 – 4:15pm · Belal",   s: 885,  e: 975 },
];
const EVENING_BLOCK = [
  { id: "e1", label: "7:00 – 8:00pm", s: 1140, e: 1200 },
  { id: "e2", label: "8:15 – 9:15pm", s: 1215, e: 1275 },
];
const UCAT_BLOCKS = [
  { id: "u1", label: "6:00 – 7:00pm", s: 1080, e: 1140 },
  { id: "u2", label: "7:00 – 8:00pm", s: 1140, e: 1200 },
  { id: "u3", label: "8:00 – 9:00pm", s: 1200, e: 1260 },
  { id: "u4", label: "9:00 – 10:00pm", s: 1260, e: 1320 },
];
const ALL_BLOCKS = [...WEEKEND_BLOCKS, ...EVENING_BLOCK, ...UCAT_BLOCKS];

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
  "UCAT Strategy": { bg: "#E8F7F4", border: "#0FB5A0", text: "#0A8A7A" },
};

const PLANS = {
  gcse: {
    id: "gcse", name: "GCSE Sciences & Maths", price: 40, per: "/month", lessons: 8, months: 1,
    blurb: "8 group lessons a month (90 minutes each) — 12 hours of live teaching for £3.33 an hour. Subjects rotate weekly: Maths, Biology, Chemistry, Physics — everything covered twice a month.",
    subjects: SUBJECT_CYCLE, cycle: SUBJECT_CYCLE, perSubjectCap: 2, days: "weekend", blocks: WEEKEND_BLOCKS, rotates: true, seats: 5, dept: "stem",
    deal: "£5 a lesson · £3.33 an hour",
  },
  gcse3: {
    id: "gcse3", name: "Term Deal (Sciences)", price: 110, per: " / 3 months", lessons: 8, months: 3,
    blurb: "The same GCSE sciences plan, paid for the term: 24 lessons across 3 months for £110 instead of £120 — sort it once and forget it.",
    subjects: SUBJECT_CYCLE, cycle: SUBJECT_CYCLE, perSubjectCap: 2, days: "weekend", blocks: WEEKEND_BLOCKS, rotates: true, seats: 5, dept: "stem",
  },
  alevel: {
    id: "alevel", name: "A-level STEM Support", price: 40, per: "/month", lessons: 2, months: 1,
    blurb: "2 private one-to-one evening lessons a month (1 hour each) in your chosen subject — just you and the tutor. Wednesdays & Fridays.",
    subjects: ["Maths", "Biology", "Chemistry"], perSubjectCap: 2, days: "evening", blocks: EVENING_BLOCK, rotates: false, seats: 1, dept: "stem", person: "isham",
  },
  ucat: {
    id: "ucat", name: "UCAT Session", price: 15, per: " one-off", lessons: 1, months: 0,
    blurb: "One private one-to-one 1-hour evening session from someone who's just sat it — timing, tactics and the sections that trip people up. Weekday evenings.",
    subjects: ["UCAT Strategy"], perSubjectCap: 1, days: "weekday", blocks: UCAT_BLOCKS, rotates: false, seats: 1, dept: "stem", person: "isham",
  },
};

const supa = createClient(SUPABASE_URL, SUPABASE_KEY);

const mapBooking = (r) => ({
  id: r.id, subscriberId: r.student_id, name: r.student_name, plan: r.plan,
  subject: r.subject, date: r.date, block: r.block, blockLabel: r.block_label, created: r.created,
});

async function fetchAll() {
  const [st, bk, ms, ml, ts, caps] = await Promise.all([
    supa.from("students").select("*").order("joined"),      // returns [] unless logged in as tutor
    supa.from("bookings").select("*").order("date"),
    supa.from("messages").select("*").order("created"),      // returns [] unless logged in as tutor
    supa.from("meet_links").select("*"),
    supa.from("testimonials").select("*").order("created"),
    supa.rpc("get_caps"),                                     // safe public per-department counts for the capacity meters
  ]);
  const meetLinks = {};
  for (const l of ml.data || []) meetLinks[l.slot] = l.link;
  const subscribers = st.data || [];
  // get_caps() may still return a "hum" field from the old dept split — ignore it, we only use "stem" now.
  const cnt = () => subscribers.filter((x) => (PLANS[x.plan] || {}).months > 0 && x.paid_until).length;
  const capsRow = (caps.data && caps.data[0]) || null;
  return {
    subscribers,
    bookings: (bk.data || []).map(mapBooking),
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
const overlaps = (a, b) => a.s < b.e && b.s < a.e;

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

function Home({ go, taken, testimonials }) {
  return (
    <div className="it-fade">
      <section style={{ padding: "70px 24px 44px", maxWidth: 1000, margin: "0 auto" }}>
        <span className="it-tag">Dental student · ranked top of my school for grades</span>
        <h1 className="it-display" style={{ fontSize: "clamp(34px,5.5vw,60px)", lineHeight: 1.07, margin: "18px 0 14px", fontWeight: 800 }}>
          Top-grade tuition, <span className="it-grad">£5 a lesson.</span><br />Because money shouldn't decide your grades.
        </h1>
        <p style={{ fontSize: 18, color: "var(--ink-soft)", maxWidth: 660, lineHeight: 1.65 }}>
          I was born to a single mum and we were made homeless when I was 3. I ranked top of my school for grades,
          and this September I start dental school. Tutoring got me nothing — hard work and free help did.
          This is that help for the next kid like me: £40 a month, 12 hours of live teaching — £3.33 an hour,
          a tenth of what a private tutor charges.
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
            {" "}Science weekends run two parallel rooms — one taught by me, one by {TUTORS.belal.name} (medical student at a top UK university) — so twice the places without bigger groups.
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
              ["Sixth form", "Ranked top of my school for grades — predicted A*A*A, AB in AS Chemistry & Maths — all while running a tutoring service teaching around 50 students a month."],
              ["This September", "Dental school. Now I teach the way I wish someone had taught me."],
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
            ["50/mo", "students I taught on average running my previous tutoring service"],
            ["40", "places across two tutors — me and a medic at a top university"],
            ["5", "max per GCSE group — A-level & UCAT are private 1-to-1"],
            ["£3.33", "per hour of live teaching — around a tenth of a private tutor"],
            ["5%", "of all earnings donated to charity & food banks"],
          ].map(([big, small]) => (
            <div key={big}>
              <div className="it-display" style={{ fontSize: 34, fontWeight: 800, color: "var(--mint-dark)" }}>{big}</div>
              <div style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.5 }}>{small}</div>
            </div>
          ))}
        </div>
      </section>

      {testimonials.length > 0 && (
        <section style={{ padding: "56px 24px 0", maxWidth: 1000, margin: "0 auto" }}>
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
      <section style={{ padding: "56px 24px 0", maxWidth: 1000, margin: "0 auto" }}>
        <h2 className="it-display" style={{ fontSize: 26, fontWeight: 800, marginBottom: 18 }}>Every lesson includes</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 16 }}>
          {[
            ["📋", "Exam-board specific", "Taught to your exact spec — AQA, Edexcel or OCR — not generic content. Tell me your board when you join."],
            ["📝", "Past-paper practice", "Real exam questions in every session, with mark-scheme walkthroughs so you learn how examiners think."],
            ["🎯", "Exam technique", "Command words, timing, how to squeeze marks from questions you half-know — the stuff school never has time for."],
            ["📈", "Homework & feedback", "Work set after every lesson and marked, so progress is visible week to week — to you and your parents."],
          ].map(([icon, t, b]) => (
            <div key={t} className="it-card" style={{ padding: 22 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
              <h3 className="it-display" style={{ fontSize: 16.5, fontWeight: 800, margin: "0 0 6px" }}>{t}</h3>
              <p style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.6, margin: 0 }}>{b}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: "40px 24px 64px", maxWidth: 1000, margin: "0 auto" }}>
        <div className="it-card" style={{ padding: 32 }}>
          <h2 className="it-display" style={{ fontSize: 26, fontWeight: 800, margin: "0 0 10px" }}>The Grade A Guarantee</h2>
          <p style={{ color: "var(--ink-soft)", lineHeight: 1.65, margin: "0 0 14px", maxWidth: 760, fontSize: 15.5 }}>
            Put the work in with me and I back the result with money. If a student meets all of the conditions below
            and their average across our assessments still isn't a grade 7 (A) or above, I'll refund their most
            recent 3 months of fees. To qualify, the student must have:
          </p>
          <ul style={{ color: "var(--ink-soft)", lineHeight: 1.9, margin: "0 0 14px", maxWidth: 760, fontSize: 15, paddingLeft: 22 }}>
            <li>been enrolled for a minimum of 6 months;</li>
            <li>attended the lessons they booked;</li>
            <li>followed the study guidance set in lessons;</li>
            <li>submitted every piece of homework on time, completed to a genuine standard.</li>
          </ul>
          <p style={{ color: "var(--ink-soft)", lineHeight: 1.65, margin: "0 0 12px", maxWidth: 760, fontSize: 14 }}>
            This isn't small print designed to wriggle out — homework and attendance are tracked from day one, so
            whether you qualify is a matter of record, not my opinion. Separately, plans are monthly or 3-monthly with
            no contract: cancelling is simply not renewing.
          </p>
          <p style={{ color: "var(--ink-soft)", fontSize: 14, margin: 0 }}>
            Questions first? Email <a href={"mailto:" + CONTACT.email} style={{ color: "var(--mint-dark)", fontWeight: 700 }}>{CONTACT.email}</a>.
          </p>
        </div>
      </section>
    </div>
  );
}

function Pricing({ startCheckout, taken }) {
  const fullFor = (p) => taken >= CAP;
  return (
    <div className="it-fade" style={{ padding: "56px 24px", maxWidth: 1000, margin: "0 auto" }}>
      <h1 className="it-display" style={{ fontSize: 36, fontWeight: 800, marginBottom: 8 }}>Plans</h1>
      <p style={{ color: "var(--ink-soft)", marginBottom: 28 }}>
        Priced for families who can't stretch to normal tutoring. No contracts — cancel any month.{" "}
        {`${Math.max(CAP - taken, 0)} of ${CAP} places left.`}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(270px,1fr))", gap: 20 }}>
        {Object.values(PLANS).filter((p) => !p.hidden).map((p) => (
          <div key={p.id} className="it-card" style={{ padding: 28, display: "flex", flexDirection: "column", ...(p.id === "gcse" ? { border: "2px solid var(--coral)" } : {}) }}>
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
              <li>✓ {p.months === 3 ? "24 × 90-min lessons (8 / month)" : p.days === "weekend" ? "8 × 90-min lessons / month" : `${p.lessons} × 1-hour 1-to-1 lesson${p.lessons > 1 ? "s" : ""}${p.id !== "ucat" ? " / month" : ""}`}</li>
              <li>✓ {p.days === "weekend" ? "Weekends, 9:00am–4:15pm" : p.days === "weekday" ? "Weekday evenings, 6:00–10:00pm" : "Wed & Fri evenings, 7:00–9:15pm"}</li>
              <li>✓ {p.seats === 1 ? "Private 1-to-1" : `Groups of ${p.seats} max`} · Google Meet</li>
            </ul>
            <button className="it-btn" disabled={fullFor(p) && p.months > 0} onClick={() => startCheckout(p.id)}>
              {p.months === 0 ? "Book session" : fullFor(p) ? "Programme full" : "Join plan"}
            </button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 26 }}><CharityBanner /></div>
    </div>
  );
}

function Checkout({ planId, onDone, onFinish, onCancel }) {
  const plan = PLANS[planId];
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(false);
  const stemChoice = plan.id === "gcse" || plan.id === "gcse3"; // GCSE sciences plans offer the tutor choice
  const [tutor, setTutor] = useState("isham");
  const payLink = (STRIPE[tutor] || {})[planId] || null;
  const submit = async () => {
    if (!name.trim() || !email.includes("@")) return alert("Please enter your name and a valid email.");
    if (password.length < 8) return alert("Password must be at least 8 characters.");
    if (password !== password2) return alert("Passwords don't match.");
    setPaying(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const { error: authErr } = await supa.auth.signUp({
        email: cleanEmail, password, options: { emailRedirectTo: "https://www.ishamtuition.com" },
      });
      if (authErr) throw authErr;
      // paid_until stays null until Isham confirms the payment in the dashboard
      await onDone({ name: name.trim(), email: cleanEmail, plan: planId, paid_until: null, tutor });
      notifyServer({ type: "signup", name: name.trim(), email: cleanEmail, plan: plan.name });
      /* send them to the chosen tutor's Stripe checkout */
      if (payLink) window.open(payLink, "_blank");
      setDone(true);
    } catch (e) {
      setPaying(false);
      if (String(e).includes("duplicate") || e.status === 409) alert("That email already has a plan — go to Book and sign in there.");
      else alert(e.message || "Something went wrong saving your details — please try again.");
    }
  };

  if (done) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(15,42,67,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}>
        <div className="it-card it-fade" style={{ padding: 30, width: 440, maxWidth: "100%" }}>
          <h3 className="it-display" style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800 }}>Almost there ✓</h3>
          <p style={{ color: "var(--ink-soft)", margin: "0 0 20px" }}>
            Check your inbox to verify your email — then once payment is confirmed you can book your lessons.
          </p>
          <button className="it-btn" onClick={onFinish}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,42,67,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}>
      <div className="it-card it-fade" style={{ padding: 30, width: 440, maxWidth: "100%", maxHeight: "88vh", overflowY: "auto" }}>
        <h3 className="it-display" style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800 }}>{plan.name}</h3>
        <p style={{ color: "var(--ink-soft)", margin: "0 0 18px" }}>{gbp(plan.price)}{plan.per} · 5% goes to charity & food banks</p>
        <div style={{ display: "grid", gap: 12 }}>
          <input className="it-input" placeholder="Student name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="it-input" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="it-input" placeholder="Password (min 8 characters)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <input className="it-input" placeholder="Repeat password" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
          {stemChoice && (
            <div style={{ display: "grid", gap: 8 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-soft)", fontWeight: 600 }}>Choose your tutor — same lessons, same price:</p>
              {[
                { id: "isham", name: "Isham Bari", lines: ["Incoming dental student", "Predicted A*A*A · ranked top of his school", "Offers for Medicine & Dentistry at top universities"] },
                { id: "belal", name: "Belal Ghazalah", lines: ["Medical student at one of the UK's top universities", "A*A*A — Biology, Chemistry & Business", "Ranked top of his class"] },
              ].map((t) => (
                <button key={t.id} type="button" onClick={() => setTutor(t.id)}
                  style={{ textAlign: "left", borderRadius: 12, padding: "12px 14px", cursor: "pointer", transition: "all .15s",
                    border: tutor === t.id ? "2px solid var(--mint)" : "1.5px solid var(--line)",
                    background: tutor === t.id ? "var(--aqua)" : "#fff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong className="it-display" style={{ fontSize: 15 }}>{t.name}</strong>
                    {tutor === t.id && <span style={{ color: "var(--mint-dark)", fontWeight: 800, fontSize: 13 }}>Selected ✓</span>}
                  </div>
                  {t.lines.map((l) => <div key={l} style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 2 }}>• {l}</div>)}
                </button>
              ))}
            </div>
          )}
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
  const personClash = (dk, blockId) => {
    if (!plan.person) return false;
    const me_ = blockById(blockId);
    return store.bookings.some((b) => b.date === dk && b.block !== blockId && (PLANS[b.plan] || {}).person === plan.person && overlaps(blockById(b.block), me_));
  };
  const isValid = (d) => d && wanted.includes(d.getDay()) && d >= today && d <= horizon;
  const cells = monthMatrix(view);
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
        <span style={{ marginLeft: "auto" }}>{plan.days === "weekend" ? "Weekends only" : "Wed & Fri evenings"} · tap a highlighted date</span>
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
            return (
              <button key={i} disabled={!valid}
                onClick={() => { setDay(isSelDay ? null : dk); setSel(null); }}
                style={{
                  aspectRatio: "1", minHeight: 34, borderRadius: 10, cursor: valid ? "pointer" : "default",
                  border: isSelDay ? "2.5px solid " + c.border : valid ? "1.5px solid " + c.border : "1px solid transparent",
                  background: valid ? (isSelDay ? c.border : c.bg) : "transparent",
                  color: valid ? (isSelDay ? "#fff" : c.text) : "#C6D4D1",
                  fontWeight: valid ? 800 : 500, fontSize: 13.5, transition: "all .15s",
                }}>
                {d.getDate()}
              </button>
            );
          })}
        </div>
      </div>

      {day && (
        <div className="it-fade it-card" style={{ padding: 18, marginTop: 14, border: "1.5px solid " + dayCol.border }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <strong className="it-display">{prettyDate(selDate)}</strong>
            <SubjectChip subject={daySubj} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8 }}>
            {plan.blocks.map((bl) => {
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
        {messages.length === 0 && <p style={{ color: "var(--ink-soft)", fontSize: 13.5, margin: 0 }}>No messages yet — ask the first question.</p>}
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

function Book({ store, addBooking, refresh, go }) {
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
      if (s) setSubject(PLANS[s.plan].subjects[0]);
      setMeChecked(true);
    })();
  }, [session]);

  const doSignIn = async () => {
    if (!email.includes("@") || !password) return setAuthErr("Enter your email and password.");
    setAuthBusy(true); setAuthErr("");
    const { error } = await supa.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setAuthBusy(false);
    if (error) setAuthErr("Wrong email or password.");
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
    return <p style={{ textAlign: "center", padding: 80, color: "var(--ink-soft)" }}>Loading…</p>;

  if (!session)
    return (
      <div className="it-fade" style={{ padding: "64px 24px", maxWidth: 420, margin: "0 auto" }}>
        <h1 className="it-display" style={{ fontSize: 30, fontWeight: 800 }}>{mode === "signup" ? "Create your account" : "Sign in to book"}</h1>
        <p style={{ color: "var(--ink-soft)" }}>
          {mode === "signup"
            ? "Already joined a plan but never made a login? Use the same email — once verified, we'll find your existing plan."
            : "Use the email and password you signed up with."}
        </p>
        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          <input className="it-input" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="it-input" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (mode === "signup" ? doSignUp() : doSignIn())} />
          <button className="it-btn" onClick={mode === "signup" ? doSignUp : doSignIn} disabled={authBusy}>
            {authBusy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
          {authErr && <p style={{ color: "var(--coral)", fontSize: 13, margin: 0 }}>{authErr}</p>}
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, fontSize: 13 }}>
            <button className="it-navlink" style={{ padding: 0 }} onClick={doForgot}>Forgot password?</button>
            <button className="it-navlink" style={{ padding: 0 }} onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setAuthErr(""); }}>
              {mode === "signup" ? "Already have an account? Sign in" : "Already a student but no account yet?"}
            </button>
          </div>
          <button className="it-btn ghost" onClick={() => go("pricing")}>I don't have a plan yet</button>
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
  const mine = store.bookings.filter((b) => b.subscriberId === me.id);
  const expired = plan.months > 0 && me.paid_until && daysLeft(me.paid_until) <= 0;
  const locked = plan.months > 0 && !me.paid_until;

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
    <div className="it-fade" style={{ padding: "48px 24px 90px", maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <h1 className="it-display" style={{ fontSize: 30, fontWeight: 800, marginBottom: 4 }}>Hi {me.name.split(" ")[0]} 👋</h1>
        <button className="it-btn ghost" style={{ padding: "8px 14px", fontSize: 13.5 }} onClick={signOut}>Sign out</button>
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

      {mine.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h3 className="it-display" style={{ fontSize: 18, fontWeight: 800 }}>Your upcoming lessons</h3>
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "2px 0 8px" }}>You can cancel and rebook any lesson up to 24 hours before it starts.</p>
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
            {[...mine].sort((a, b) => a.date.localeCompare(b.date)).map((b) => {
              const link = store.meetLinks[slotKey(b.date, b.block)];
              const c = SUBJECT_COLORS[b.subject] || SUBJECT_COLORS.Maths;
              const blk = blockById(b.block);
              const startMs = new Date(b.date + "T00:00:00").getTime() + blk.s * 60000;
              const cancellable = startMs - Date.now() > 24 * 3600 * 1000;
              return (
                <li key={b.id} style={{ background: c.bg, border: "1px solid " + c.border, borderRadius: 12, padding: "12px 14px", fontSize: 14, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <span><strong style={{ color: c.text }}>{b.subject}</strong> — {b.date} · {b.blockLabel}</span>
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
    <div className="it-fade" style={{ padding: "56px 24px", maxWidth: 560, margin: "0 auto" }}>
      <h1 className="it-display" style={{ fontSize: 30, fontWeight: 800 }}>Questions?</h1>
      <p style={{ color: "var(--ink-soft)" }}>Money worries, subjects, exam boards, availability — ask anything. I usually reply within a day.</p>
      <div className="it-card" style={{ padding: 18, margin: "14px 0 6px", display: "grid", gap: 8, fontSize: 14.5 }}>
        <div>💬 WhatsApp: <a href={"https://wa.me/" + CONTACT.phoneIntl.replace("+", "")} target="_blank" rel="noreferrer" style={{ color: "var(--mint-dark)", fontWeight: 700 }}>message me directly</a></div>
        <div>✉️ Email: <a href={"mailto:" + CONTACT.email} style={{ color: "var(--mint-dark)", fontWeight: 700 }}>{CONTACT.email}</a></div>
      </div>
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
          ["When are GCSE lessons?", "Weekends, in 90-minute sessions between 9:00am and 4:15pm, with 15-minute breaks between groups."],
          ["When are A-level & UCAT sessions?", "A-level: Wednesday and Friday evenings, two private 1-hour slots each night (7:00–8:00pm and 8:15–9:15pm). UCAT: weekday evenings, four private 1-hour slots between 6:00pm and 10:00pm."],
          ["Where are lessons held?", "Live on Google Meet — your join link appears on your booking page before each lesson."],
          ["How big are the groups?", "GCSE runs in groups of 5 max, so everyone gets airtime. A-level and UCAT sessions are private one-to-one."],
          ["Can I cancel?", "Yes — plans are monthly or 3-monthly with no contract. Just don't renew."],
          ["What's the Grade A Guarantee?", "Be enrolled 6+ months, attend your lessons, follow the guidance and hand in all homework on time to a genuine standard — if your assessment average still isn't a grade 7 (A) or above, your most recent 3 months of fees are refunded."],
          ["Can I get a refund for another reason?", "Plans have no contract, so you never pay for a month you don't want — just don't renew. For anything else, message, call or email and we'll talk like humans."],
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

function SessionCard({ dk, block, list, subj, link, saveLink, onMove, emails }) {
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
      <div style={{ fontSize: 13.5, margin: "8px 0", color: "var(--ink)", display: "flex", gap: 8, flexWrap: "wrap" }}>
        {list.length ? list.map((b) => (
          <span key={b.id} style={{ background: "#fff", border: "1px solid " + c.border, borderRadius: 999, padding: "4px 6px 4px 12px", display: "inline-flex", alignItems: "center", gap: 6 }}>
            {b.name}
            <button onClick={() => onMove(b)} title="Move this student to a different session"
              style={{ border: "none", background: c.bg, color: c.text, borderRadius: 999, fontSize: 11.5, fontWeight: 800, padding: "3px 9px", cursor: "pointer" }}>Move</button>
          </span>
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
                  {plan.blocks.map((bl) => (
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

function Admin({ store, saveMeet, removeSubscriber, refresh, moveBooking, addStudentManual, updatePaidUntil, addTestimonial, removeTestimonial }) {
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
    return <p style={{ textAlign: "center", padding: 80, color: "var(--ink-soft)" }}>Checking login…</p>;

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
  const feesToMaster = grossFor("belal") * feeRate("belal");
  const charity = grossFor("isham") * 0.05; // Isham's 5% charity pledge on his own earnings

  const byDate = {};
  for (const b of deptBookings) {
    byDate[b.date] = byDate[b.date] || {};
    byDate[b.date][b.block] = byDate[b.date][b.block] || [];
    byDate[b.date][b.block].push(b);
  }
  const dates = Object.keys(byDate).sort();
  const blockDef = (id) => blockById(id);

  return (
    <div className="it-fade" style={{ padding: "48px 24px", maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
        <h1 className="it-display" style={{ fontSize: 30, fontWeight: 800, margin: 0 }}>Dashboard</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="it-btn ghost" style={{ padding: "8px 14px", fontSize: 13.5 }} onClick={refresh}>↻ Refresh</button>
          <button className="it-btn ghost" style={{ padding: "8px 14px", fontSize: 13.5 }} onClick={signOut}>Sign out</button>
        </div>
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, marginBottom: 30 }}>
        {(isMaster ? [
          ["My gross / month", "£" + grossFor("isham").toFixed(0)],
          ["Fees from tutors", "£" + feesToMaster.toFixed(2)],
          ["My total", "£" + (grossFor("isham") + feesToMaster).toFixed(2)],
          ["Charity pot (5%)", "£" + charity.toFixed(2)],
          ["Places", `${store.takenCount || 0} / ${CAP}`],
          ["Registered students", String(store.subscribers.length)],
          ["Lessons booked", String(store.bookings.length)],
          ["Messages", String(store.messages.length)],
        ] : [
          ["Your gross / month", "£" + myGross.toFixed(2)],
          [`Platform fee (${Math.round(feeRate(role.id) * 100)}%)`, "£" + myFee.toFixed(2)],
          ["Stripe fees (est.)", "£" + stripeEst(role.id).toFixed(2)],
          ["You keep (approx)", "£" + Math.max(myGross - myFee - stripeEst(role.id), 0).toFixed(2)],
          ["Your students", String(subs.filter((s) => tutorOf(s) === role.id).length)],
          ["Lessons booked", String(deptBookings.length)],
        ]).map(([k, v]) => (
          <div key={k} className="it-card" style={{ padding: 20 }}>
            <div style={{ fontSize: 12.5, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 }}>{k}</div>
            <div className="it-display" style={{ fontSize: 27, fontWeight: 800, color: "var(--mint-dark)" }}>{v}</div>
          </div>
        ))}
      </div>

      <ChatPanel sender={role.name} isTutor={true} />

      {isMaster && (
        <div className="it-card" style={{ padding: 18, marginBottom: 26 }}>
          <strong className="it-display" style={{ fontSize: 15 }}>Per-tutor breakdown (monthly-equivalent)</strong>
          <table style={{ width: "100%", marginTop: 10, borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead><tr style={{ textAlign: "left", color: "var(--ink-soft)" }}><th style={{ padding: 5 }}>Tutor</th><th style={{ padding: 5 }}>Gross</th><th style={{ padding: 5 }}>Stripe (est.)</th><th style={{ padding: 5 }}>Fee to you</th><th style={{ padding: 5 }}>They keep</th></tr></thead>
            <tbody>
              {Object.values(TUTORS).map((t) => {
                const g = grossFor(t.id), se = stripeEst(t.id), fee = g * feeRate(t.id);
                return (
                  <tr key={t.id} style={{ borderTop: "1px solid var(--line)" }}>
                    <td style={{ padding: 5, fontWeight: 700 }}>{t.name}{t.master ? " (you)" : ""}</td>
                    <td style={{ padding: 5 }}>£{g.toFixed(2)}</td>
                    <td style={{ padding: 5, color: "var(--ink-soft)" }}>£{se.toFixed(2)}</td>
                    <td style={{ padding: 5 }}>£{fee.toFixed(2)}</td>
                    <td style={{ padding: 5 }}>£{Math.max(g - fee - se, 0).toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p style={{ fontSize: 11.5, color: "var(--ink-soft)", margin: "8px 0 0" }}>Stripe fees are estimates (1.5% + 20p per payment) — exact figures live in each tutor's own Stripe dashboard. Term Deal shown as £36.67/month equivalent.</p>
        </div>
      )}

      <h2 className="it-display" style={{ fontSize: 20, fontWeight: 800 }}>Timetable — who booked what & when</h2>
      <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 4 }}>Dates with bookings light up on the calendar (the little number is how many). Tap a date to see just that day. Paste a Google Meet link into any session — students instantly see it on their booking page.</p>
      <AdminCalendar bookings={store.bookings} active={calFilter} onPick={(dk) => setCalFilter(calFilter === dk ? null : dk)} />
      {dates.length === 0 && <p style={{ color: "var(--ink-soft)" }}>No bookings yet.</p>}
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
                emails={list.map((b) => (subs.find((s) => s.id === b.subscriberId) || {}).email)} />
            ))}
          </div>
        );
      })}

      <h2 className="it-display" style={{ fontSize: 20, fontWeight: 800, marginTop: 34 }}>Students</h2>
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
              const t = role.id === "belal" ? "belal" : "isham";
              await addStudentManual({ name: nf.name.trim(), email: nf.email.trim().toLowerCase(), plan: nf.plan, paid_until: nf.paid_until || null, tutor: t });
              setNf({ name: "", email: "", plan: "gcse3", paid_until: addMonths(3) });
            }
            catch (e) { alert(String(e).includes("duplicate") ? "That email is already registered." : "Couldn't add — try again."); }
          }}>Add</button>
        </div>
      </div>
      <div className="it-card" style={{ padding: 18, marginTop: 12, overflowX: "auto" }}>
        {subs.length === 0 ? <p style={{ color: "var(--ink-soft)", margin: 0 }}>No sign-ups yet.</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr style={{ textAlign: "left", color: "var(--ink-soft)" }}><th style={{ padding: 6 }}>Name</th><th style={{ padding: 6 }}>Email</th><th style={{ padding: 6 }}>Plan</th><th style={{ padding: 6 }}>Joined</th><th style={{ padding: 6 }}>Renewal</th><th /></tr></thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: 6, fontWeight: 600 }}>{s.name}</td>
                  <td style={{ padding: 6 }}>{s.email}</td>
                  <td style={{ padding: 6 }}>{PLANS[s.plan].name}</td>
                  <td style={{ padding: 6, color: "var(--ink-soft)" }}>{(s.joined || "").slice(0, 10)}</td>
                  <td style={{ padding: 6, whiteSpace: "nowrap" }}>
                    <RenewBadge paidUntil={s.paid_until} plan={s.plan} />{" "}
                    {!s.paid_until && s.plan !== "ucat" ? (
                      <button style={{ border: "none", background: "var(--mint)", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", borderRadius: 999, padding: "3px 10px" }}
                        title="Check the payment arrived in Stripe first, then click"
                        onClick={() => updatePaidUntil(s.id, addMonths(PLANS[s.plan].months || 1))}>Confirm paid ✓</button>
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
      <h2 className="it-display" style={{ fontSize: 20, fontWeight: 800, marginTop: 34 }}>Testimonials</h2>
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
  const [page, setPage] = useState("home");
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
    if (pl.person) { // 1-to-1 plans sharing a tutor: block overlapping sessions for that person
      const { data: same } = await supa.from("bookings").select("block,plan").eq("date", b.date);
      const mine_ = blockById(b.block);
      if ((same || []).some((x) => x.block !== b.block && (PLANS[x.plan] || {}).person === pl.person && overlaps(blockById(x.block), mine_))) {
        await refresh(); throw new Error("tutor busy");
      }
    }
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
  const nav = [["home", "Home"], ["pricing", "Plans"], ["book", "Book"], ["contact", "Questions"]];

  return (
    <div className="it-app">
      <style>{css}</style>
      {recovery && <PasswordRecoveryOverlay onDone={() => setRecovery(false)} />}
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(251,253,253,.92)", backdropFilter: "blur(8px)", borderBottom: "1px solid var(--line)" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px" }}>
          <button onClick={() => setPage("home")} className="it-display" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 19, fontWeight: 800, color: "var(--ink)" }}>
            isham<span className="it-grad">.tuition</span>
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
        <Home go={setPage} taken={taken} testimonials={store.testimonials || []} />
      ) : page === "pricing" ? (
        <Pricing taken={taken} startCheckout={(id) => setCheckoutPlan(id)} />
      ) : page === "book" ? (
        <Book store={store} go={setPage} addBooking={addBooking} refresh={refresh} />
      ) : page === "contact" ? (
        <Contact addMessage={addMessage} />
      ) : (
        <Admin store={store} saveMeet={saveMeet} removeSubscriber={removeSubscriber} refresh={refresh} moveBooking={moveBooking} addStudentManual={addStudentManual} updatePaidUntil={updatePaidUntil} addTestimonial={addTestimonial} removeTestimonial={removeTestimonial} />
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
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, fontSize: 13.5, color: "var(--ink-soft)" }}>
          <span>
            © {new Date().getFullYear()} Isham Tuition · 5% of earnings to charity & food banks ·{" "}
            <a href={"mailto:" + CONTACT.email} style={{ color: "var(--mint-dark)", fontWeight: 700 }}>{CONTACT.email}</a> ·{" "}
            TikTok <a href="https://www.tiktok.com/@ishamdoesdentistry" target="_blank" rel="noreferrer" style={{ color: "var(--mint-dark)", fontWeight: 700 }}>@ishamdoesdentistry</a>
          </span>
          <span style={{ display: "block", width: "100%", fontSize: 12, color: "var(--ink-soft)", marginTop: 6 }}>
            Privacy: I collect only names, emails and lesson bookings — used solely to run your lessons and contact you about them. Nothing is sold or shared with anyone, and you can ask me to delete your data at any time via the contact details above.
          </span>
          <button className="it-navlink" style={{ fontSize: 13.5 }} onClick={() => setPage("admin")}>Tutor login</button>
        </div>
      </footer>
    </div>
  );
}
