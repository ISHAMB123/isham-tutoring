import React, { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

/* ============================================================
   Isham Tutoring: LIVE version, connected to Supabase.
   Every booking / sign-up / message saves to your database.
   GCSE weekends rotate: Wk1 Maths → Bio → Chem → Physics.
   NOTE: payments still simulated, swap in Stripe Payment
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

/* Stripe TEST-mode links, pay with card 4242 4242 4242 4242, any future
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

const CONTACT = { email: "hello@ishamtuition.com" };
const CAP = 20;
const TERM_START = "2026-10-01"; // registration & payment are open now, but no lesson can be booked before this date

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
// GCSE moved off weekend daytime to a single 90-minute evening slot, offered
// on both Friday and Saturday so two groups of 5 (10 students) can each pick
// whichever day suits them. Friday only has room for one GCSE group before
// the existing A-level slot starts at 7pm, so the second group falls on
// Saturday, the exact "weekend as fallback" spillover asked for.
const GCSE_EVENING_BLOCK = [
  { id: "g1", label: "5:00 – 6:30pm", s: 1020, e: 1110 },
];
// Scholarship (Y12) runs in groups of 5, same as GCSE, on Saturday evening
// (after the GCSE slot ends) and all of Sunday evening, so it never
// collides with GCSE or the existing Wed/Fri A-level slots. Two groups of
// 5 (10 students) each need a Biology slot and a Chemistry slot a week,
// which is exactly the 4 slot-instances these two blocks give across Sat+Sun.
const SCHOLARSHIP_BLOCKS = [
  { id: "sc1", label: "6:45 – 7:45pm", s: 1125, e: 1185 },
  { id: "sc2", label: "8:00 – 9:00pm", s: 1200, e: 1260 },
];
const ALL_BLOCKS = [...WEEKEND_BLOCKS, ...EVENING_BLOCK, ...GCSE_EVENING_BLOCK, ...SCHOLARSHIP_BLOCKS];

const SUBJECT_CYCLE = ["Maths", "Biology", "Chemistry", "Physics"];
const CYCLE_EPOCH = Date.UTC(2026, 0, 5);
function weekSubject(d, cycle = SUBJECT_CYCLE) {
  const week = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - CYCLE_EPOCH) / (7 * 864e5));
  return cycle[((week % cycle.length) + cycle.length) % cycle.length];
}
// Calendar-month rotation (e.g. scholarship: Biology one month, Chemistry the
// next), not week-based like GCSE. An absolute month index naturally
// alternates forever with no epoch needed for a short cycle like this.
function monthSubject(d, cycle) {
  const idx = d.getFullYear() * 12 + d.getMonth();
  return cycle[((idx % cycle.length) + cycle.length) % cycle.length];
}

const SUBJECT_COLORS = {
  Maths:           { bg: "#E7F0FE", border: "#2E7CD6", text: "#1D5FAF" },
  Biology:         { bg: "#E8F8EC", border: "#2FA45B", text: "#1F7A41" },
  Chemistry:       { bg: "#F1EBFE", border: "#7C5CE0", text: "#5B3EC4" },
  Physics:         { bg: "#FEF0E4", border: "#E8842E", text: "#9C4E10" }, // darkened from #B85F14 since that stop was 4.01:1 on the tint, below the 4.5:1 floor
};

const GCSE_SPOTS = 10;

const PLANS = {
  gcse: {
    id: "gcse", name: "GCSE Sciences & Maths", price: 40, per: "/month", lessons: 4, months: 1,
    blurb: "Weekly group lessons (90 minutes each), 6 hours of live teaching for £6.67 an hour. Subjects rotate weekly: Maths, Biology, Chemistry, Physics, everything covered once a month. Every place is subsidised, priced well below what tutoring normally costs, on purpose, so any family can afford it.",
    subjects: SUBJECT_CYCLE, cycle: SUBJECT_CYCLE, perSubjectCap: 2, days: "fri-sat", blocks: GCSE_EVENING_BLOCK, rotates: true, seats: 5, dept: "stem",
    hidden: true, // application-and-review only, see GCSELanding/GCSEApply — never a self-serve Stripe checkout
  },
  gcse3: {
    id: "gcse3", name: "Term Deal (Sciences)", price: 110, per: " / 3 months", lessons: 12, months: 3,
    blurb: "The same subsidised GCSE sciences plan, paid for the term: 12 lessons across 3 months for £110 instead of £120. Sort it once and forget it.",
    subjects: SUBJECT_CYCLE, cycle: SUBJECT_CYCLE, perSubjectCap: 2, days: "fri-sat", blocks: GCSE_EVENING_BLOCK, rotates: true, seats: 5, dept: "stem",
    hidden: true, // kept for admin to assign manually; not offered on the public application form
  },
  alevel: {
    id: "alevel", name: "A-level STEM Support", price: 40, per: "/month", lessons: 2, months: 1,
    blurb: "2 private one-to-one evening lessons a month (1 hour each) in your chosen subject, just you and the tutor. Wednesdays & Fridays.",
    subjects: ["Maths", "Biology", "Chemistry"], perSubjectCap: 2, days: "evening", blocks: EVENING_BLOCK, rotates: false, seats: 1, dept: "stem",
  },
  scholarship: {
    id: "scholarship", name: "Medicine & Dentistry Access Scholarship", price: 40, per: "/month", lessons: 8, months: 1,
    blurb: "Weekly group lessons (groups of 5) around Saturday and Sunday evenings, on a monthly rotation: Biology one month, Chemistry the next, plus UCAT strategy and interview/personal statement support arranged directly by email.",
    subjects: ["Biology", "Chemistry"], cycle: ["Biology", "Chemistry"], monthlyRotates: true, perSubjectCap: 8, days: "weekend", blocks: SCHOLARSHIP_BLOCKS, rotates: false, seats: 5, dept: "stem",
    hidden: true, // application-and-review only; never a self-serve checkout on the public Plans page
  },
};

/* ---- Medicine & Dentistry Access Scholarship ----
   An application-and-review programme, not a self-serve checkout: no
   plan/Stripe link, students apply, Isham reviews and features/accepts.
   Rolling admissions, no fixed deadline: applications close once
   SCHOLARSHIP_SPOTS is reached. get_scholarship_count() is the real source
   of truth for "spots taken" (counts featured+accepted rows). */
const SCHOLARSHIP_SPOTS = 10;
const WIDENING_CRITERIA = [
  ["firstGen", "First in my family to go to university"],
  ["freeSchoolMeals", "Currently or previously eligible for free school meals"],
  ["care", "Currently or previously in care, or a young carer"],
  ["areaAccess", "Live in an area with low progression to higher education"],
  ["schoolAccess", "Attend a school with below-average GCSE/A-level results"],
  ["disability", "Long-term illness or disability affecting my studies"],
  ["refugee", "Refugee, asylum seeker, or newly arrived in the UK"],
  ["noMedicalParent", "No parent or guardian has ever worked as a doctor or dentist"],
];

const supa = createClient(SUPABASE_URL, SUPABASE_KEY);

const mapBooking = (r) => ({
  id: r.id, subscriberId: r.student_id, name: r.student_name, plan: r.plan,
  subject: r.subject, date: r.date, block: r.block, blockLabel: r.block_label, created: r.created,
});

async function fetchAll() {
  const [st, bk, seatc, ms, ml, ts, caps, ln, wl, sa, sc, scc, scr, ga, gac] = await Promise.all([
    supa.from("students").select("*").order("joined"),      // returns [] unless logged in as tutor
    supa.from("bookings").select("*").order("date"),        // now requires being signed in; anonymous visitors get []
    supa.rpc("get_seat_counts"),                              // safe public per-slot counts (no names), for seat availability
    supa.from("messages").select("*").order("created"),      // returns [] unless logged in as tutor
    supa.from("meet_links").select("*"),
    supa.from("testimonials").select("*").order("created"),
    supa.rpc("get_caps"),                                     // safe public per-department counts for the capacity meters
    supa.from("lesson_notes").select("*"),                    // RLS-scoped: tutors see all, a student sees only their own
    supa.from("waitlist").select("*").order("created"),       // returns [] unless logged in as tutor
    supa.from("scholarship_applications").select("*").order("created"), // returns [] unless logged in as tutor
    supa.rpc("get_featured_scholars"),                        // safe public showcase: only consented, non-sensitive fields
    supa.rpc("get_scholarship_count"),                        // safe public "spots taken" count
    supa.rpc("get_scholarship_recent_count"),                 // safe public "applications this week" count, for urgency copy
    supa.from("gcse_applications").select("*").order("created"), // returns [] unless logged in as tutor
    supa.rpc("get_gcse_count"),                               // safe public "spots taken" count for GCSE
  ]);
  const meetLinks = {};
  for (const l of ml.data || []) meetLinks[l.slot] = l.link;
  const subscribers = st.data || [];
  // get_caps() may still return a "hum" field from the old dept split; ignore it, we only use "stem" now.
  const cnt = () => subscribers.filter((x) => (PLANS[x.plan] || {}).months > 0 && x.paid_until).length;
  const capsRow = (caps.data && caps.data[0]) || null;
  const notesByBooking = {};
  for (const n of ln.data || []) notesByBooking[n.booking_id] = n;
  const bookings = (bk.data || []).map((r) => {
    const b = mapBooking(r);
    const n = notesByBooking[b.id];
    return { ...b, attended: n ? n.attended : null, note: n ? n.note : null, topic: n ? n.topic : null, homework: n ? n.homework : null };
  });
  // Aggregate, name-free seat counts (date+block+subject and date+block totals),
  // safe to show anyone: how many seats are taken in a slot, never who's in it.
  const seatCounts = {};
  const seatCountsBySlot = {};
  for (const r of seatc.data || []) {
    seatCounts[`${r.date}|${r.block}|${r.subject || ""}`] = r.taken;
    const k2 = `${r.date}|${r.block}`;
    seatCountsBySlot[k2] = (seatCountsBySlot[k2] || 0) + r.taken;
  }
  return {
    subscribers,
    bookings,
    seatCounts,
    seatCountsBySlot,
    messages: ms.data || [],
    meetLinks,
    testimonials: ts.data || [],
    waitlist: wl.data || [],
    takenCount: capsRow ? (capsRow.stem || 0) : cnt(),
    scholarshipApps: sa.data || [],
    featuredScholars: sc.data || [],
    scholarshipSpotsTaken: typeof scc.data === "number" ? scc.data : 0,
    scholarshipRecentCount: typeof scr.data === "number" ? scr.data : 0,
    gcseApps: ga.data || [],
    gcseSpotsTaken: typeof gac.data === "number" ? gac.data : 0,
  };
}

/* ---------- misc helpers ---------- */
const addMonths = (n) => { const d = new Date(); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); };
const daysLeft = (paidUntil) => paidUntil ? Math.ceil((new Date(paidUntil + "T00:00:00") - new Date()) / 864e5) : null;

const blockById = (id) => ALL_BLOCKS.find((b) => b.id === id) || { id, label: id, s: 0, e: 0 };

/* Billing-period allowance: lessons count against the student's own paid month,
   not the calendar month; joining on the 25th no longer loses 6 lessons a week later. */
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

function lessonsLeftFor(student, bookings) {
  const plan = PLANS[student.plan];
  if (!plan) return 0;
  const period = periodFor(student);
  const count = bookings.filter((b) => b.subscriberId === student.id && b.date >= period.start && b.date < period.end).length;
  return Math.max(plan.lessons - count, 0);
}

const notifyServer = (payload) => {
  try { fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => {}); } catch (e) {}
};
const gbp = (n) => "£" + n.toLocaleString("en-GB");
const dateKey = (d) => d.toISOString().slice(0, 10);
const prettyDate = (d) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
const humanDate = (dateStr) => new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const slotKey = (date, block) => date + "|" + block;
function countdownWords(dateStr, block) {
  const startMs = new Date(dateStr + "T00:00:00").getTime() + block.s * 60000;
  const diff = startMs - Date.now();
  if (diff <= 0) return "starting now";
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `in ${mins} minute${mins === 1 ? "" : "s"}`;
  const hrs = Math.round(diff / 3600000);
  if (hrs < 24) return `in ${hrs} hour${hrs === 1 ? "" : "s"}`;
  const days = Math.round(diff / 86400000);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}
const classroomKey = (planId) => {
  const p = PLANS[planId];
  return "classroom-" + (p && p.rotates ? "gcse-group" : planId);
};

function daysOfWeekFor(mode) {
  return mode === "weekend" ? [6, 0] : mode === "weekday" ? [1, 2, 3, 4, 5] : mode === "fri-sat" ? [5, 6] : [3, 5];
}
function upcomingDays(mode, count = 8) {
  const wanted = daysOfWeekFor(mode);
  const days = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const termStart = new Date(TERM_START + "T00:00:00");
  const d = new Date(Math.max(today, termStart));
  d.setDate(d.getDate() - 1); // so the loop's first ++ lands on d itself if it's already a wanted day
  while (days.length < count) {
    d.setDate(d.getDate() + 1);
    if (wanted.includes(d.getDay())) days.push(new Date(d));
  }
  return days;
}

/* ---------- styles ---------- */
const css = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
:root{
  --ink:#0B1B33; --ink-soft:#55677E; --mint:#0E7C86; --mint-dark:#0B5F68;
  --aqua:#E8F4F4; --paper:#FAFAFA; --coral:#FF6A5C; --line:#E5E7EB;
  --pop:#0B1B33;
}
*{box-sizing:border-box} body{margin:0}
.it-app{font-family:'Inter',system-ui,sans-serif;color:var(--ink);background:var(--paper);min-height:100vh;font-size:16px}
@media(max-width:640px){.it-app{font-size:17px}}
.it-display{font-family:'Inter',system-ui,sans-serif;letter-spacing:-0.02em}
.it-grad{background:var(--pop);-webkit-background-clip:text;background-clip:text;color:transparent}
.it-fade{animation:itfade .5s cubic-bezier(.16,1,.3,1) both}
@keyframes itfade{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes itfloat{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-14px) rotate(4deg)}}
.it-float{animation:itfloat 6s ease-in-out infinite}
@keyframes itpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(1.35)}}
.it-pulse{animation:itpulse 1.8s ease-in-out infinite}
.it-card{background:#fff;border:1px solid var(--line);border-radius:12px;transition:transform .3s cubic-bezier(.16,1,.3,1), box-shadow .3s ease}
.it-card:hover{transform:translateY(-4px);box-shadow:0 10px 24px rgba(11,27,51,.08)}
.it-btn{background:var(--ink);color:#fff;border:none;border-radius:10px;padding:13px 24px;font-weight:700;cursor:pointer;transition:filter .2s, transform .2s cubic-bezier(.16,1,.3,1);font-family:'Inter',sans-serif;font-size:15px}
.it-btn:hover{filter:brightness(1.35);transform:translateY(-2px) scale(1.02)}
.it-btn.ghost{background:#fff;color:var(--ink);border:1.5px solid var(--line);box-shadow:none}
.it-chip{transition:transform .2s cubic-bezier(.16,1,.3,1)}
.it-chip:hover{transform:translateY(-2px) scale(1.06)}
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
.it-timeline-dot{position:absolute;left:0;top:6px;width:9px;height:9px;border-radius:50%;background:var(--mint)}
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
.it-reveal{opacity:0;transform:translateY(26px);transition:opacity .6s cubic-bezier(.16,1,.3,1), transform .6s cubic-bezier(.16,1,.3,1)}
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

/* ---- parent portal shell (sidebar + bottom tabs) ---- */
.it-shell{display:flex;align-items:flex-start;max-width:1200px;margin:0 auto;padding:0 24px 90px}
.it-sidebar{width:186px;flex:none;position:sticky;top:69px;padding:22px 10px 22px 0;display:flex;flex-direction:column;gap:2px;max-height:calc(100vh - 69px)}
.it-sidebar-link{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:10px;border:none;background:none;font:inherit;font-size:13.5px;font-weight:600;color:var(--ink-soft);cursor:pointer;text-align:left;width:100%}
.it-sidebar-link:hover{background:var(--aqua);color:var(--ink)}
.it-sidebar-link.active{background:var(--ink);color:#fff}
.it-sidebar-help{margin-top:18px;padding:12px;border-top:1px solid var(--line);font-size:12px;color:var(--ink-soft)}
.it-sidebar-help a{color:var(--mint-dark);font-weight:700;text-decoration:none}
.it-shell-main{flex:1;min-width:0;padding:22px 0 22px 26px}
@media(max-width:1100px){
  .it-sidebar{width:56px}
  .it-sidebar-link span{display:none}
  .it-sidebar-link{justify-content:center;padding:10px}
  .it-sidebar-help{display:none}
}
@media(max-width:768px){
  .it-shell{padding:0 16px 82px;display:block}
  .it-sidebar{display:none}
  .it-shell-main{padding:16px 0}
  .it-bottomtabs{position:fixed;left:0;right:0;bottom:0;z-index:45;display:flex;background:#fff;border-top:1px solid var(--line)}
}
@media(min-width:769px){.it-bottomtabs{display:none}}
.it-bottomtabs button{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:9px 4px 8px;border:none;background:none;font:inherit;font-size:10.5px;font-weight:700;color:var(--ink-soft);cursor:pointer}
.it-bottomtabs button.active{color:var(--mint-dark)}
.it-weekrail{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px;scroll-snap-type:x proximity}
.it-weekcard{flex:1;min-width:84px;scroll-snap-align:start;border-radius:10px;padding:9px 8px;text-align:center;cursor:pointer;border:1.5px solid var(--line);background:#fff;font:inherit}
.it-weekcard.selected{border-width:2px}
.it-weekcard.disabled{opacity:.45;cursor:not-allowed}
.it-seatpill{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;white-space:nowrap}
`;

const SubjectChip = ({ subject }) => {
  const c = SUBJECT_COLORS[subject] || SUBJECT_COLORS.Maths;
  return <span className="it-chip" style={{ background: c.bg, color: c.text, border: "1px solid " + c.border }}>{subject}</span>;
};

// Seat availability is a status signal, never a subject colour: green/amber/grey only, so it
// never gets mistaken for "which subject" the way a subject-tinted pill would.
function SeatPill({ taken, cap }) {
  if (cap === 1) {
    return taken >= 1
      ? <span className="it-seatpill" style={{ background: "#EEF3F1", color: "var(--ink-soft)" }}>Booked</span>
      : <span className="it-seatpill" style={{ background: "#E1F5EE", color: "#0F6E56" }}>Available</span>;
  }
  const left = cap - taken;
  if (left <= 0) return <span className="it-seatpill" style={{ background: "#EEF3F1", color: "var(--ink-soft)" }}>Full</span>;
  if (left <= 2) return <span className="it-seatpill" style={{ background: "#FAEEDA", color: "#854F0B" }}>{left} seat{left === 1 ? "" : "s"} left</span>;
  return <span className="it-seatpill" style={{ background: "#E1F5EE", color: "#0F6E56" }}>{left} seats left</span>;
}

const ICONS = {
  cap: "M8 3c-1.8 0-3 1.3-3 3.2 0 2 .6 4.3 1.3 6.6.5 1.7 1 3.7 1.9 3.7.8 0 1-1.7 1.3-3 .3-1.2.6-2.3 1.5-2.3s1.2 1.1 1.5 2.3c.3 1.3.5 3 1.3 3 .9 0 1.4-2 1.9-3.7.7-2.3 1.3-4.6 1.3-6.6 0-1.9-1.2-3.2-3-3.2-1 0-1.7.6-2.8.6S9 3 8 3Z",
  heart: "M12 20.5s-7.4-4.5-9.9-9C.6 8.1 1.8 4.8 5 4.1c2-.4 3.9.5 5 2.1 1.1-1.6 3-2.5 5-2.1 3.2.7 4.4 4 2.9 7.4-2.5 4.5-9.9 9-9.9 9Z",
  users: "M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.3 0-8 1.7-8 5v1.5h16V19c0-3.3-4.7-5-8-5Zm9-8a3.5 3.5 0 1 0 0 7c-.5 0-1-.1-1.4-.2M17 13.3c2.7.5 5 1.9 5 3.7v1.5h-4",
  calendar: "M7 2v3M17 2v3M3.5 8.5h17M4 5.5h16A1.5 1.5 0 0 1 21.5 7v13a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 20V7A1.5 1.5 0 0 1 4 5.5Z",
  check: "M4 12.5 9.5 18 20 6.5",
  shield: "M12 2.5 4.5 5.5v6c0 5 3.2 8.4 7.5 10 4.3-1.6 7.5-5 7.5-10v-6L12 2.5Z",
  star: "M12 2.8l2.7 5.9 6.4.7-4.8 4.4 1.3 6.4-5.6-3.2-5.6 3.2 1.3-6.4-4.8-4.4 6.4-.7L12 2.8Z",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  mail: "M3.5 5.5h17A1 1 0 0 1 21.5 6.5v11a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Zm0 0 8.5 7 8.5-7",
  home: "M4 11 12 4l8 7M6 10v9.5h5V14h2v5.5h5V10",
  eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  eyeOff: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M3 3l18 18",
};
function Icon({ name, size = 20, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d={ICONS[name]} />
    </svg>
  );
}
function PasswordField({ value, onChange, placeholder, onKeyDown }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input className="it-input" style={{ paddingRight: 42 }} type={show ? "text" : "password"}
        placeholder={placeholder} value={value} onChange={onChange} onKeyDown={onKeyDown} />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}
        style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", padding: 8, cursor: "pointer", color: "var(--ink-soft)", display: "flex" }}>
        <Icon name={show ? "eyeOff" : "eye"} size={18} />
      </button>
    </div>
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

function CapacityMeter({ taken, cap = CAP }) {
  return (
    <div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 5 }}>
        {Array.from({ length: cap }).map((_, i) => (
          <div key={i} className={"it-pip" + (i < taken ? " on" : "")} style={{ width: 10, height: 14, transitionDelay: `${i * 25}ms` }} />
        ))}
      </div>
      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
        {taken < cap && <span className="it-pulse" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--mint)", flex: "none" }} />}
        <span><strong style={{ color: taken >= cap ? "var(--coral)" : "var(--mint-dark)" }}>{Math.max(cap - taken, 0)} of {cap} places left</strong>, capped so groups stay tiny and prices stay low.</span>
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
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--mint-dark)", fontWeight: 700, lineHeight: 1.4 }}>Nice work, Chemistry attendance is up this month.</p>
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
      <section style={{ padding: "70px 24px 44px", maxWidth: 1120, margin: "0 auto", position: "relative", overflow: "hidden" }}>
        <span className="it-float" aria-hidden="true" style={{ position: "absolute", top: 10, right: 8, color: "var(--mint)", opacity: 0.14, pointerEvents: "none" }}>
          <Icon name="cap" size={120} />
        </span>
        <div className="it-hero-grid">
          <div>
            <span className="it-tag" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="cap" size={13} /> Dental student · ranked top of my school for grades</span>
            <h1 className="it-display" style={{ fontSize: "clamp(34px,4.6vw,58px)", lineHeight: 1.05, margin: "18px 0 10px", fontWeight: 800 }}>
              GCSE tuition for <span className="it-grad">£10 a lesson.</span>
            </h1>
            <p style={{ fontSize: 19, fontWeight: 700, color: "var(--ink)", maxWidth: 560, lineHeight: 1.5, margin: "0 0 14px" }}>
              Serious GCSE support without the serious price tag: £40/month for 4 weekly lessons.
              I subsidise it myself: no premises, no staff, just me teaching straight after school, so the saving goes to your family, not cut from the lessons.
            </p>
            <p style={{ fontSize: 15, color: "var(--ink-soft)", maxWidth: 560, lineHeight: 1.65 }}>
              I was born to a single mum and we were made homeless when I was 3. I ranked top of my school for grades,
              and this September I start dental school. Now I'm doing the same for the next kid like me.
            </p>
            <div style={{ display: "flex", gap: 12, margin: "26px 0 14px", flexWrap: "wrap" }}>
              <button className="it-btn" onClick={() => go("gcse")}>Apply now, from £10 a lesson</button>
              <button className="it-btn ghost" onClick={() => go("book")}>Already a student? Book</button>
            </div>
            <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 26px" }}>
              Live group lessons, taught by real tutors. No contract, cancel any month. See exactly what's included on the <button onClick={() => go("gcse")} style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "var(--mint-dark)", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>GCSE page</button>.
            </p>
            <CapacityMeter taken={taken} cap={GCSE_SPOTS} />
          </div>
          <DashboardPreview />
        </div>
      </section>

      <section style={{ borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", background: "var(--aqua)" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "18px 24px", display: "flex", flexWrap: "wrap", gap: "14px 32px", justifyContent: "center" }}>
          {[
            ["cap", "Dental student, from Sept"],
            ["star", "Predicted A*A*A"],
            ["users", "10 places"],
          ].map(([icon, label], i) => (
            <Reveal key={label} style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--mint-dark)", transitionDelay: i * 0.08 + "s" }}>
              <Icon name={icon} size={17} />
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{label}</span>
            </Reveal>
          ))}
        </div>
      </section>

      <section style={{ padding: "40px 24px 0", maxWidth: 1120, margin: "0 auto" }}>
        <Reveal>
          <div className="it-card" style={{ padding: "22px 26px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--aqua)", color: "var(--mint-dark)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Icon name="shield" size={19} /></div>
              <h3 className="it-display" style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Keeping lessons safe</h3>
            </div>
            <p style={{ margin: 0, fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.65 }}>
              I teach under my real name and public TikTok (@ishamdoesdentistry): I'm not anonymous. Every lesson is live on video in a small group, never one-to-one for GCSE students, and attendance is logged for every session. See the <button onClick={() => go("privacy")} style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "var(--mint-dark)", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>privacy policy</button> for exactly what data is kept.
            </p>
          </div>
        </Reveal>
      </section>

      <section style={{ padding: "40px 24px 0", maxWidth: 1120, margin: "0 auto" }}>
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
              <span style={{ color: "var(--ink-soft)", fontSize: 14 }}>→ repeat. Every subject, once a month, no clashes.</span>
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
              <div style={{ position: "relative", flex: "none" }}>
                <Avatar initials="IB" />
                <span style={{ position: "absolute", bottom: -2, right: -2, width: 22, height: 22, borderRadius: 7, background: "var(--mint)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>
                  <Icon name="cap" size={12} />
                </span>
              </div>
              <div>
                <div className="it-display" style={{ fontSize: 17, fontWeight: 800 }}>Isham Bari</div>
                <div style={{ fontSize: 13, color: "var(--mint-dark)", fontWeight: 700 }}>Dental student, from September</div>
              </div>
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8, fontSize: 13.5, color: "var(--ink-soft)" }}>
              {[["star", "Predicted A*A*A · ranked top of his school"], ["users", "Ran a tutoring service teaching ~50 students/month"], ["target", "Personally tutored 65 students for the UCAT"], ["check", "Teaches Maths, Biology, Chemistry, Physics"]].map(([icon, l]) => (
                <li key={l} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><span style={{ color: "var(--mint)", flex: "none", marginTop: 2 }}><Icon name={icon} size={14} /></span>{l}</li>
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
              ["GCSEs", "No tutors, no quiet desk, just library sessions and free resources. It worked."],
              ["Sixth form", "Ranked top of my school for grades: predicted A*A*A, AB in AS Chemistry & Maths, all while running a tutoring service teaching around 50 students a month."],
              ["This September", "Dental school. Now I teach the way I wish someone had taught me."],
            ].map(([t, b], i, arr) => (
              <Reveal key={t} className="it-timeline-item" style={{ transitionDelay: i * 0.1 + "s" }}>
                <div className="it-timeline-dot" />
                {i < arr.length - 1 && <div className="it-timeline-line" />}
                <div className="it-display it-grad" style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>{t}</div>
                <p style={{ color: "#C4D6E4", fontSize: 14.5, lineHeight: 1.6, margin: 0 }}>{b}</p>
              </Reveal>
            ))}
          </div>
        </Reveal>
      </section>

      <section style={{ background: "var(--aqua)", padding: "40px 24px" }}>
        <Reveal style={{ maxWidth: 1120, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 18 }}>
          {[
            ["50/mo", "students I taught on average running my previous tutoring service"],
            ["65", "students I've personally tutored for the UCAT"],
            ["10", "GCSE places, kept small so everyone gets airtime"],
            ["5", "max per GCSE group, A-level is private 1-to-1"],
            ["£6.67", "per hour of live teaching, well below a private tutor"],
          ].map(([big, small], i) => (
            <Reveal key={big} style={{ transitionDelay: i * 0.07 + "s" }}>
              <div className="it-display" style={{ fontSize: 34, fontWeight: 800, color: "var(--mint-dark)" }}>{big}</div>
              <div style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.5 }}>{small}</div>
            </Reveal>
          ))}
        </Reveal>
      </section>

      {testimonials.length > 0 && (
        <section style={{ padding: "56px 24px 0", maxWidth: 1120, margin: "0 auto" }}>
          <h2 className="it-display" style={{ fontSize: 26, fontWeight: 800, marginBottom: 18 }}>What students say</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
            {testimonials.map((t, i) => (
              <Reveal key={t.id} className="it-card" style={{ padding: 24, transitionDelay: (i % 3) * 0.08 + "s" }}>
                <div style={{ fontSize: 22, color: "var(--mint)", lineHeight: 1 }}>"</div>
                <p style={{ fontSize: 14.5, lineHeight: 1.65, margin: "6px 0 12px" }}>{t.quote}</p>
                <strong className="it-display" style={{ fontSize: 14 }}>{t.name}</strong>
                {t.detail && <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{t.detail}</div>}
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* what every lesson includes */}
      <section style={{ padding: "56px 24px 0", maxWidth: 1120, margin: "0 auto" }}>
        <Reveal>
          <h2 className="it-display" style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>Every lesson includes</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, margin: "0 0 24px", maxWidth: 640 }}>Not generic content: every session is built around exam technique and what actually earns marks.</p>
          <div style={{ display: "grid", gap: 0 }}>
            {[
              ["01", "Exam-board specific", "Taught to your exact spec, AQA, Edexcel or OCR, not generic content. Tell me your board when you join."],
              ["02", "Past-paper practice", "Real exam questions in every session, with mark-scheme walkthroughs so you learn how examiners think."],
              ["03", "Exam technique", "Command words, timing, how to squeeze marks from questions you half-know, the stuff school never has time for."],
              ["04", "Homework & feedback", "Work set after every lesson and marked, so progress is visible week to week, to you and your parents."],
            ].map(([n, t, b], i) => (
              <Reveal key={t} style={{ display: "flex", gap: 20, alignItems: "flex-start", padding: "18px 0", borderTop: i === 0 ? "1px solid var(--line)" : "none", borderBottom: "1px solid var(--line)", transitionDelay: i * 0.08 + "s" }}>
                <div className="it-display" style={{ fontSize: 14, fontWeight: 800, color: "var(--mint)", minWidth: 28, paddingTop: 2 }}>{n}</div>
                <div>
                  <h3 className="it-display" style={{ fontSize: 17, fontWeight: 800, margin: "0 0 4px" }}>{t}</h3>
                  <p style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.6, margin: 0, maxWidth: 560 }}>{b}</p>
                </div>
              </Reveal>
            ))}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", padding: "20px 0 0" }}>
              <span style={{ fontSize: 12.5, color: "var(--ink-soft)", fontWeight: 600 }}>Exam boards covered:</span>
              {["AQA", "Edexcel", "OCR"].map((b) => (
                <span key={b} className="it-chip" style={{ background: "var(--aqua)", color: "var(--mint-dark)" }}>{b}</span>
              ))}
            </div>
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
            This isn't small print designed to wriggle out. Homework and attendance are tracked from day one, so
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

function Pricing({ startCheckout }) {
  const fullFor = () => false; // no shared cap on this page any more, GCSE/scholarship have their own apply-and-accept spot counters
  return (
    <div className="it-fade" style={{ padding: "56px 24px", maxWidth: 1120, margin: "0 auto" }}>
      <span className="it-tag">Plans &amp; pricing</span>
      <h1 className="it-display" style={{ fontSize: 36, fontWeight: 800, margin: "12px 0 8px" }}>Simple, transparent plans</h1>
      <p style={{ color: "var(--ink-soft)", marginBottom: 28, maxWidth: 620 }}>
        Priced for families who can't stretch to normal tutoring. No contracts, cancel any month.
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
            {p.deal && <span className="it-tag" style={{ alignSelf: "flex-start", marginBottom: 10, background: "#FFEDE9", color: "#C2402F" }}>{p.deal}, places go fast</span>}
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

const ALEVEL_GRADE_OPTIONS = ["A*", "A", "B", "C", "D", "E"];
const GCSE_GRADE_OPTIONS = ["9", "8", "7", "6", "5", "4", "3", "2", "1"];
const EXAM_BOARDS = ["AQA", "OCR", "Pearson Edexcel", "WJEC/Eduqas", "CCEA"];

// Fixed to Biology and Chemistry, that's the only A-level tutoring on offer
// here, so there's no free-text subject entry or add/remove rows.
function AlevelGradesForm({ value, setValue }) {
  const setSubject = (key, patch) => setValue({ ...value, [key]: { ...value[key], ...patch } });
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {[["biology", "Biology"], ["chemistry", "Chemistry"]].map(([key, label]) => (
        <div key={key} className="it-card" style={{ padding: 12 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>{label}</div>
          <div style={{ display: "grid", gap: 8 }}>
            <select className="it-input" value={value[key].grade} onChange={(e) => setSubject(key, { grade: e.target.value })}>
              <option value="">Grade</option>
              {ALEVEL_GRADE_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <select className="it-input" value={value[key].board} onChange={(e) => setSubject(key, { board: e.target.value })}>
              <option value="">Exam board</option>
              {EXAM_BOARDS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>
      ))}
    </div>
  );
}

function FieldGroup({ icon, title, subtitle, children }) {
  return (
    <div style={{ marginBottom: 26, paddingBottom: 26, borderBottom: "1px solid var(--line)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: subtitle ? 4 : 12 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--aqua)", color: "var(--mint-dark)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
          <Icon name={icon} size={14} />
        </div>
        <strong className="it-display" style={{ fontSize: 14.5 }}>{title}</strong>
      </div>
      {subtitle && <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "0 0 12px 38px" }}>{subtitle}</p>}
      <div style={{ marginLeft: 38 }}>{children}</div>
    </div>
  );
}

const GCSE_SCIENCE_LABELS = {
  double: ["Combined Science (grade 1)", "Combined Science (grade 2)"],
  triple: ["Biology", "Chemistry", "Physics"],
};
function GcseScienceForm({ value, setValue }) {
  const setType = (type) => setValue({ ...value, type, science: (type === "double" ? [0, 1] : [0, 1, 2]).map((i) => value.science[i] || "") });
  const setScience = (i, g) => setValue({ ...value, science: value.science.map((s, idx) => idx === i ? g : s) });
  const GradeSelect = ({ v, onChange }) => (
    <select className="it-input" value={v} onChange={(e) => onChange(e.target.value)}>
      <option value="">Grade</option>
      {GCSE_GRADE_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
    </select>
  );
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {[["double", "Double Science"], ["triple", "Triple Science"]].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setType(id)}
            style={{ flex: 1, padding: "9px 10px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer",
              border: value.type === id ? "1.5px solid var(--mint)" : "1.5px solid var(--line)",
              background: value.type === id ? "var(--aqua)" : "#fff", color: value.type === id ? "var(--mint-dark)" : "var(--ink-soft)" }}>
            {label}
          </button>
        ))}
      </div>
      {GCSE_SCIENCE_LABELS[value.type].map((label, i) => (
        <div key={label} className="it-card" style={{ padding: 12 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>{label}</div>
          <GradeSelect v={value.science[i] || ""} onChange={(g) => setScience(i, g)} />
        </div>
      ))}
      <div className="it-card" style={{ padding: 12 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>English Language</div>
        <GradeSelect v={value.english} onChange={(g) => setValue({ ...value, english: g })} />
      </div>
      <div className="it-card" style={{ padding: 12 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>Maths</div>
        <GradeSelect v={value.maths} onChange={(g) => setValue({ ...value, maths: g })} />
      </div>
    </div>
  );
}
function gcseToText(v) {
  const parts = GCSE_SCIENCE_LABELS[v.type].map((label, i) => v.science[i] ? `${label}: ${v.science[i]}` : null).filter(Boolean);
  if (v.english) parts.push(`English Language: ${v.english}`);
  if (v.maths) parts.push(`Maths: ${v.maths}`);
  return parts.join(", ");
}

function alevelToText(v) {
  return [["biology", "Biology"], ["chemistry", "Chemistry"]]
    .filter(([key]) => v[key].grade)
    .map(([key, label]) => `${label}: ${v[key].grade}${v[key].board ? ` (${v[key].board})` : ""}`)
    .join(", ");
}

function ScholarshipLanding({ store, go }) {
  const spotsLeft = Math.max(SCHOLARSHIP_SPOTS - (store.scholarshipSpotsTaken || 0), 0);
  const closed = spotsLeft <= 0;
  return (
    <div className="it-fade" style={{ padding: "56px 24px", maxWidth: 760, margin: "0 auto" }}>
      <span className="it-tag" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="heart" size={13} /> Medicine &amp; Dentistry Access Scholarship</span>
      <h1 className="it-display" style={{ fontSize: 32, fontWeight: 800, margin: "12px 0 8px" }}>A funded place for Year 12s aiming at medicine or dentistry</h1>
      <p style={{ color: "var(--ink-soft)", lineHeight: 1.6, maxWidth: 640 }}>
        Taught by a UK dental student and a UCL medical student: A-level Biology and Chemistry, UCAT strategy, interview coaching and personal statement support, in one place. Built for families who couldn't otherwise afford this kind of help.
      </p>

      <Reveal style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, margin: "22px 0" }}>
        <div className="it-card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11.5, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700 }}>Spots</div>
          <div className="it-display" style={{ fontSize: 24, fontWeight: 800, color: spotsLeft <= 3 ? "var(--coral)" : "var(--mint-dark)" }}>{spotsLeft} of {SCHOLARSHIP_SPOTS} left</div>
        </div>
        <div className="it-card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11.5, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700 }}>Group size</div>
          <div className="it-display" style={{ fontSize: 24, fontWeight: 800, color: "var(--mint-dark)" }}>Max 5</div>
        </div>
        <div className="it-card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11.5, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700 }}>Track record</div>
          <div className="it-display" style={{ fontSize: 24, fontWeight: 800, color: "var(--mint-dark)" }}>102 tutored</div>
        </div>
      </Reveal>
      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "-12px 0 22px" }}>Rolling admissions, no fixed deadline: applications close automatically the moment all {SCHOLARSHIP_SPOTS} spots are filled, so earlier is better.</p>

      <Reveal className="it-card" style={{ padding: "18px 20px", marginBottom: 22 }}>
        <strong className="it-display" style={{ fontSize: 15 }}>What's included</strong>
        <Accordion items={[
          ["Biology and Chemistry, monthly rotation", "Weekly group teaching (groups of 5) against your exact exam board specification (AQA, OCR or Edexcel), past-paper practice and mark-scheme technique for every topic. One subject at a time: Biology for a full month, then Chemistry the next, so each gets proper depth instead of splitting every session."],
          ["UCAT strategy", "Section-by-section technique for Verbal Reasoning, Decision Making, Quantitative Reasoning and Situational Judgement, timed practice, and the tactics for the sections that trip people up."],
          ["Interview & personal statement workshops", "MMI and panel-style mock interviews, ethical scenario practice, and structured line-by-line feedback on personal statement drafts."],
          ["How this is funded", "This is a partial scholarship, not a fully-funded free place: you pay £40 a month, we subsidise the rest, the same subsidised rate used across the site, well below normal tutoring prices. Nothing is charged until you're actually accepted and choose to continue, and payment is arranged directly with Isham, not by card on this site."],
        ]} />
      </Reveal>

      <Reveal className="it-card" style={{ padding: "18px 20px", marginBottom: 22, border: "1.5px solid var(--mint)" }}>
        <strong className="it-display" style={{ fontSize: 15 }}>Requirements to apply</strong>
        <div style={{ background: "#FFF7E8", border: "1px solid #F6DDB2", borderRadius: 10, padding: "10px 12px", margin: "10px 0", fontSize: 13, color: "#7A5A2E" }}>
          <strong>Year 12 only.</strong> This scholarship is not open to any other year group.
        </div>
        <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 8, fontSize: 14, color: "var(--ink-soft)" }}>
          {[
            "In Year 12, applying (or planning to apply) to medicine or dentistry",
            "Currently studying A-level Biology and Chemistry, that's the tutoring on offer here",
            "A parent or guardian's details, we'll be in touch with them too",
            "Predicted A-level grades and GCSE results",
            "A required contextual statement, in your own words, about your circumstances",
            "As many of the widening-participation factors as apply to you (optional but weighed heavily, including whether a parent or guardian has ever worked as a doctor or dentist)",
          ].map((l) => (
            <li key={l} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><span style={{ color: "var(--mint)", flex: "none", marginTop: 3 }}><Icon name="check" size={14} /></span>{l}</li>
          ))}
        </ul>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "12px 0 0" }}>
          Aimed at low-income families: priority goes to applicants facing the circumstances above. We don't rank or weight applications by grade, a straight-A applicant and one still building confidence are considered equally.
        </p>
      </Reveal>

      {store.featuredScholars && store.featuredScholars.length > 0 && (
        <Reveal style={{ marginBottom: 22 }}>
          <strong className="it-display" style={{ fontSize: 15 }}>This year's scholars</strong>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10, marginTop: 10 }}>
            {store.featuredScholars.map((s) => (
              <div key={s.id} className="it-card" style={{ padding: 14 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <Avatar initials={(s.student_name[0] || "?").toUpperCase()} size={30} />
                  <strong style={{ fontSize: 13.5 }}>{(s.student_name[0] || "?").toUpperCase()}****</strong>
                </div>
                {s.headline && <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "4px 0" }}>{s.headline}</p>}
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{(s.subjects || []).map((sub) => <SubjectChip key={sub} subject={sub} />)}</div>
              </div>
            ))}
          </div>
        </Reveal>
      )}

      {closed ? (
        <div className="it-card" style={{ padding: 20, textAlign: "center" }}>
          <strong>Applications are currently closed</strong>
          <p style={{ color: "var(--ink-soft)", margin: "6px 0 0" }}>All {SCHOLARSHIP_SPOTS} spots are filled. Message us via the Contact page to be notified when the next round opens.</p>
        </div>
      ) : (
        <div className="it-card" style={{ padding: "22px 24px", textAlign: "center" }}>
          <strong className="it-display" style={{ fontSize: 17 }}>Ready to apply?</strong>
          <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "6px 0 16px" }}>Takes about 5 minutes. You'll need to sign in or create a free account first.</p>
          <button className="it-btn" onClick={() => go("scholarship-apply")} style={{ width: "100%" }}>Start application →</button>
        </div>
      )}
    </div>
  );
}

function ScholarshipApply({ store, addScholarshipApplication, go }) {
  const [session, setSession] = useState(undefined); // undefined = checking, null = signed out
  const [authMode, setAuthMode] = useState("signin"); // signin | signup
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authErr, setAuthErr] = useState("");

  useEffect(() => {
    supa.auth.getSession().then(({ data: { session } }) => setSession(session || null));
    const { data: sub } = supa.auth.onAuthStateChange((_evt, sess) => setSession(sess || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  // One application per person: check on load whether this account has
  // already applied, rather than only finding out when the submit fails.
  const [existingApp, setExistingApp] = useState(undefined); // undefined = checking, null = none found, object = found
  useEffect(() => {
    if (!session || !session.user || !session.user.email) { setExistingApp(session === null ? null : undefined); return; }
    (async () => {
      const { data } = await supa.from("scholarship_applications").select("*").eq("student_email", session.user.email.toLowerCase()).maybeSingle();
      setExistingApp(data || null);
    })();
  }, [session]);

  const doSignIn = async () => {
    if (!authEmail.includes("@") || !authPassword) return setAuthErr("Enter your email and password.");
    setAuthBusy(true); setAuthErr("");
    const { error } = await supa.auth.signInWithPassword({ email: authEmail.trim().toLowerCase(), password: authPassword });
    setAuthBusy(false);
    if (error) setAuthErr(/confirm/i.test(error.message) ? "Check your inbox and click the verification link before signing in." : "Wrong email or password.");
  };
  const doSignUp = async () => {
    if (!authEmail.includes("@") || authPassword.length < 8) return setAuthErr("Enter your email and a password of at least 8 characters.");
    setAuthBusy(true); setAuthErr("");
    const { error } = await supa.auth.signUp({ email: authEmail.trim().toLowerCase(), password: authPassword, options: { emailRedirectTo: "https://www.ishamtuition.com" } });
    setAuthBusy(false);
    if (error) return setAuthErr(error.message);
    alert("Check your inbox to verify your email, then sign in.");
    setAuthMode("signin");
  };
  const doForgot = async () => {
    if (!authEmail.includes("@")) return setAuthErr("Enter your email first.");
    setAuthErr("");
    const { error } = await supa.auth.resetPasswordForEmail(authEmail.trim().toLowerCase(), { redirectTo: "https://www.ishamtuition.com" });
    if (error) setAuthErr(error.message);
    else alert("Reset link sent");
  };
  const signOut = async () => { await supa.auth.signOut(); };

  const blank = {
    student_name: "", student_email: "", student_phone: "",
    parent_name: "", parent_phone: "", parent_email: "",
    school: "", personal_statement: "",
    widening_participation: {}, wp_note: "", consent_privacy: false, consent_public: false,
  };
  const SCHOLARSHIP_FIXED_SUBJECTS = ["Biology", "Chemistry"];
  const [f, setF] = useState(blank);
  useEffect(() => {
    if (session && session.user && session.user.email) setF((p) => ({ ...p, student_email: session.user.email }));
  }, [session]);
  const [alevelGrades, setAlevelGrades] = useState({ biology: { grade: "", board: "" }, chemistry: { grade: "", board: "" } });
  const [gcse, setGcse] = useState({ type: "double", science: ["", ""], english: "", maths: "" });
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const spotsLeft = Math.max(SCHOLARSHIP_SPOTS - (store.scholarshipSpotsTaken || 0), 0);
  const closed = spotsLeft <= 0;
  const toggleWP = (key) => setF((p) => ({ ...p, widening_participation: { ...p.widening_participation, [key]: !p.widening_participation[key] } }));
  const filledCount = [f.student_name, f.student_email, f.parent_name, f.parent_phone, f.parent_email, f.personal_statement, f.wp_note].filter((x) => x.trim()).length
    + (alevelGrades.biology.grade ? 1 : 0) + (alevelGrades.chemistry.grade ? 1 : 0) + (gcse.english && gcse.maths ? 1 : 0);
  const totalFields = 8;
  const progressPct = Math.min(Math.round((filledCount / totalFields) * 100), 100);

  const submit = async () => {
    if (!f.student_name.trim() || !f.student_email.includes("@")) return alert("Please add the student's name and email.");
    if (!f.parent_name.trim() || !f.parent_phone.trim() || !f.parent_email.includes("@")) return alert("Please add a parent/guardian name, phone and email, we'll need to reach them too.");
    if (!f.wp_note.trim()) return alert("Please fill out the contextual statement, it's required.");
    if (!f.consent_privacy) return alert("Please confirm you've read the Privacy Policy to continue.");
    setBusy(true);
    try {
      await addScholarshipApplication({
        student_name: f.student_name.trim(), student_email: f.student_email.trim().toLowerCase(), student_phone: f.student_phone.trim(),
        parent_name: f.parent_name.trim(), parent_phone: f.parent_phone.trim(), parent_email: f.parent_email.trim().toLowerCase(),
        school: f.school.trim(), year_group: "Year 12", subjects: SCHOLARSHIP_FIXED_SUBJECTS,
        predicted_grades: alevelToText(alevelGrades), gcse_summary: gcseToText(gcse), personal_statement: f.personal_statement.trim(),
        widening_participation: { ...f.widening_participation, note: f.wp_note.trim() || undefined },
        consent_public: f.consent_public, status: "pending",
      });
      notifyServer({ type: "message", name: f.parent_name, email: f.parent_email, text: `Scholarship application from ${f.student_name} (student: ${f.student_email}).` });
      setSent(true);
    } catch (e) {
      setBusy(false);
      console.error("Scholarship application submit failed:", e);
      alert(String(e).includes("duplicate") ? "It looks like this email has already applied." : `Couldn't submit: ${e.message || e}`);
    }
  };

  if (session === undefined) return <Spinner label="Loading…" />;

  if (!session) {
    return (
      <div className="it-fade" style={{ padding: "56px 24px", maxWidth: 420, margin: "0 auto" }}>
        <button className="it-navlink" style={{ padding: 0, fontSize: 12.5, marginBottom: 10 }} onClick={() => go("scholarship")}>← Back to Scholarship</button>
        <span className="it-tag" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="heart" size={13} /> Medicine &amp; Dentistry Access Scholarship</span>
        <div className="it-card" style={{ padding: 32, marginTop: 16 }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: "var(--pop)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <Icon name="shield" size={21} />
          </div>
          <h1 className="it-display" style={{ fontSize: 24, fontWeight: 800, margin: "0 0 6px" }}>{authMode === "signup" ? "Create an account to apply" : "Sign in to apply"}</h1>
          <p style={{ color: "var(--ink-soft)", fontSize: 13.5, margin: "0 0 20px" }}>
            An account keeps your application safe and lets you come back to check its status. If you already have an Isham Tuition login (from a plan), just sign in with that.
          </p>

          <div style={{ display: "flex", background: "var(--aqua)", borderRadius: 10, padding: 4, marginBottom: 20 }}>
            <button type="button" onClick={() => { setAuthMode("signin"); setAuthErr(""); }}
              style={{ flex: 1, border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer",
                background: authMode === "signin" ? "#fff" : "transparent", color: authMode === "signin" ? "var(--ink)" : "var(--ink-soft)",
                boxShadow: authMode === "signin" ? "0 1px 4px rgba(15,42,67,.12)" : "none" }}>Sign in</button>
            <button type="button" onClick={() => { setAuthMode("signup"); setAuthErr(""); }}
              style={{ flex: 1, border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer",
                background: authMode === "signup" ? "#fff" : "transparent", color: authMode === "signup" ? "var(--ink)" : "var(--ink-soft)",
                boxShadow: authMode === "signup" ? "0 1px 4px rgba(15,42,67,.12)" : "none" }}>Sign up</button>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <input className="it-input" placeholder="Student email" type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} />
            <PasswordField placeholder="Password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (authMode === "signup" ? doSignUp() : doSignIn())} />
            {authMode === "signin" && (
              <button type="button" className="it-navlink" style={{ padding: 0, justifySelf: "start", fontSize: 12.5 }} onClick={doForgot}>Forgot password?</button>
            )}
            <button className="it-btn" onClick={authMode === "signup" ? doSignUp : doSignIn} disabled={authBusy}>
              {authBusy ? "Please wait…" : authMode === "signup" ? "Create account" : "Sign in"}
            </button>
            {authErr && <p style={{ color: "var(--coral)", fontSize: 13, margin: 0 }}>{authErr}</p>}
          </div>
        </div>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="it-fade" style={{ padding: "72px 24px", maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
        <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--aqua)", color: "var(--mint-dark)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}><Icon name="check" size={26} /></div>
        <h1 className="it-display" style={{ fontSize: 26, fontWeight: 800, margin: "0 0 8px" }}>You're on the shortlist queue</h1>
        <p style={{ color: "var(--ink-soft)", lineHeight: 1.6 }}>
          Thanks, {f.student_name.split(" ")[0]}. Your application is being reviewed alongside everyone else who's applied.
          We'll email {f.parent_email || "your parent/guardian"} and {f.student_email} if you're selected. Admissions are rolling, applications close automatically once all spots are filled.
        </p>
        <div className="it-card" style={{ padding: 16, marginTop: 20, display: "inline-block" }}>
          <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Spots remaining right now</span>{" "}
          <strong className="it-display" style={{ color: "var(--mint-dark)" }}>{spotsLeft} of {SCHOLARSHIP_SPOTS}</strong>
        </div>
      </div>
    );
  }

  if (existingApp === undefined) return <Spinner label="Checking your application…" />;

  // One person, one application: if this account already has a row, show
  // its status instead of letting them fill the form out again. Accepted
  // gets its own fuller landing page (with a way into the dashboard) rather
  // than this generic status block.
  if (existingApp && existingApp.status === "accepted") {
    return <ScholarshipAccepted go={go} />;
  }
  if (existingApp) {
    const statusCopy = {
      pending: ["Your application is being reviewed", "We'll email you and your parent/guardian if you're selected."],
      featured: ["Your application has been featured", "Congratulations, check your email for next steps."],
      declined: ["This application wasn't successful this time", "Message us via the Contact page with any questions."],
    }[existingApp.status] || ["Application received", "We'll be in touch."];
    return (
      <div className="it-fade" style={{ padding: "72px 24px", maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
        <button className="it-navlink" style={{ padding: 0, fontSize: 12.5, marginBottom: 20 }} onClick={() => go("scholarship")}>← Back to Scholarship</button>
        <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--aqua)", color: "var(--mint-dark)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}><Icon name="check" size={26} /></div>
        <span className="it-chip" style={{ background: "var(--aqua)", color: "var(--mint-dark)", marginBottom: 10, display: "inline-block" }}>{existingApp.status}</span>
        <h1 className="it-display" style={{ fontSize: 24, fontWeight: 800, margin: "6px 0 8px" }}>{statusCopy[0]}</h1>
        <p style={{ color: "var(--ink-soft)", lineHeight: 1.6 }}>{statusCopy[1]} You applied as {existingApp.student_name}, one application per person.</p>
        <button className="it-btn ghost" style={{ marginTop: 16 }} onClick={signOut}>Sign out</button>
      </div>
    );
  }

  return (
    <div className="it-fade" style={{ padding: "56px 24px", maxWidth: 760, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <button className="it-navlink" style={{ padding: 0, fontSize: 12.5 }} onClick={() => go("scholarship")}>← Back to Scholarship</button>
        <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
          Signed in as {session.user.email} · <button className="it-navlink" style={{ padding: 0, display: "inline", fontSize: 12.5 }} onClick={signOut}>Sign out</button>
        </span>
      </div>
      <h1 className="it-display" style={{ fontSize: 26, fontWeight: 800, margin: "0 0 4px" }}>Complete your application</h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 20 }}>{spotsLeft} of {SCHOLARSHIP_SPOTS} spots left. Takes about 5 minutes.</p>

      {closed ? (
        <div className="it-card" style={{ padding: 20, textAlign: "center" }}>
          <strong>Applications are currently closed</strong>
          <p style={{ color: "var(--ink-soft)", margin: "6px 0 0" }}>Message us via the Contact page to be notified when the next round opens.</p>
        </div>
      ) : (
        <div className="it-card" style={{ padding: "26px 28px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
            <strong className="it-display" style={{ fontSize: 15 }}>Application progress</strong>
            <span style={{ fontSize: 12, fontWeight: 700, color: progressPct === 100 ? "var(--mint-dark)" : "var(--ink-soft)" }}>{progressPct}% complete</span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: "var(--aqua)", overflow: "hidden", marginBottom: 28 }}>
            <div style={{ height: "100%", width: progressPct + "%", background: "var(--mint)", borderRadius: 999, transition: "width .3s ease" }} />
          </div>

          <FieldGroup icon="users" title="Student" subtitle="A parent or guardian needs to be involved too, we'll be in touch with them separately.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10, marginBottom: 10 }}>
              <input className="it-input" placeholder="Student full name" value={f.student_name} onChange={(e) => setF({ ...f, student_name: e.target.value })} />
              <input className="it-input" title="Locked to the email on your account" disabled value={f.student_email} style={{ background: "var(--aqua)", color: "var(--ink-soft)" }} />
              <input className="it-input" placeholder="Student phone (optional)" value={f.student_phone} onChange={(e) => setF({ ...f, student_phone: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {["Selective school", "Non-selective school"].map((opt) => (
                <button key={opt} type="button" onClick={() => setF({ ...f, school: opt })}
                  style={{ flex: 1, padding: "9px 10px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer",
                    border: f.school === opt ? "1.5px solid var(--mint)" : "1.5px solid var(--line)",
                    background: f.school === opt ? "var(--aqua)" : "#fff", color: f.school === opt ? "var(--mint-dark)" : "var(--ink-soft)" }}>
                  {opt}
                </button>
              ))}
            </div>
          </FieldGroup>

          <FieldGroup icon="mail" title="Parent / guardian">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
              <input className="it-input" placeholder="Parent/guardian name" value={f.parent_name} onChange={(e) => setF({ ...f, parent_name: e.target.value })} />
              <input className="it-input" placeholder="Parent/guardian phone" value={f.parent_phone} onChange={(e) => setF({ ...f, parent_phone: e.target.value })} />
              <input className="it-input" placeholder="Parent/guardian email" type="email" value={f.parent_email} onChange={(e) => setF({ ...f, parent_email: e.target.value })} />
            </div>
          </FieldGroup>

          <FieldGroup icon="star" title="Grades">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 20 }}>
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: ".05em", margin: "0 0 8px" }}>Predicted A-level grades</div>
                <AlevelGradesForm value={alevelGrades} setValue={setAlevelGrades} />
              </div>
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: ".05em", margin: "0 0 8px" }}>GCSE results</div>
                <GcseScienceForm value={gcse} setValue={setGcse} />
              </div>
            </div>
          </FieldGroup>

          <FieldGroup icon="target" title="Why this place matters to you">
            <textarea className="it-input" rows={4} placeholder="A few sentences on why you want to study medicine/dentistry and why this scholarship would help." value={f.personal_statement} onChange={(e) => setF({ ...f, personal_statement: e.target.value })} />
          </FieldGroup>

          <FieldGroup icon="shield" title="Widening participation" subtitle="Tick anything that applies, this helps us prioritise fairly. Optional.">
            <div style={{ background: "var(--aqua)", borderRadius: 10, padding: 14 }}>
              <div style={{ display: "grid", gap: 8 }}>
                {WIDENING_CRITERIA.map(([key, label]) => (
                  <label key={key} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5, cursor: "pointer" }}>
                    <input type="checkbox" checked={!!f.widening_participation[key]} onChange={() => toggleWP(key)} style={{ marginTop: 3 }} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </FieldGroup>

          <FieldGroup icon="heart" title="Contextual statement (required)" subtitle={'Tell us about your circumstances, in your own words. This is how we understand what "low income" or "widening participation" actually means for your family, it\'s the most important part of the form.'}>
            <textarea className="it-input" rows={3} placeholder="Your circumstances, in your own words" value={f.wp_note} onChange={(e) => setF({ ...f, wp_note: e.target.value })} />
          </FieldGroup>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, marginBottom: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={f.consent_privacy} onChange={(e) => setF({ ...f, consent_privacy: e.target.checked })} style={{ marginTop: 3 }} />
              A parent/guardian and I have read the <button type="button" onClick={() => go("privacy")} style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "var(--mint-dark)", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>Privacy Policy</button> and consent to this information being used to assess this application.
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={f.consent_public} onChange={(e) => setF({ ...f, consent_public: e.target.checked })} style={{ marginTop: 3 }} />
              Optional: if selected, the student's first name, subjects and a short blurb may be shown on this page. Never contact details or the answers above.
            </label>
          </div>

          <button className="it-btn" onClick={submit} disabled={busy} style={{ width: "100%" }}>{busy ? "Submitting…" : "Submit application"}</button>
        </div>
      )}
    </div>
  );
}

// Shown to a scholarship applicant once accepted. Accepting also creates
// their students() row on the "scholarship" plan (see acceptScholarship),
// so by the time a real applicant sees this page, Book already knows who
// they are, hence the dashboard button below actually works. Admin also has
// a "View welcome page →" preview link on Accepted applicants.
function ScholarshipAccepted({ go }) {
  return (
    <div className="it-fade" style={{ padding: "72px 24px", maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
      <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--aqua)", color: "var(--mint-dark)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}><Icon name="heart" size={26} /></div>
      <h1 className="it-display" style={{ fontSize: 28, fontWeight: 800, margin: "0 0 8px" }}>Welcome to the scholarship</h1>
      <p style={{ color: "var(--ink-soft)", lineHeight: 1.6 }}>
        You've been accepted onto the Medicine &amp; Dentistry Access Scholarship. Your dashboard is ready, book your sessions there. We'll also be in touch by email with your parent/guardian about UCAT strategy and interview/personal statement workshops.
      </p>
      <button className="it-btn" style={{ marginTop: 8 }} onClick={() => go("book")}>Go to your dashboard →</button>
      <div className="it-card" style={{ padding: 20, marginTop: 20, textAlign: "left" }}>
        <strong className="it-display" style={{ fontSize: 15 }}>What happens next</strong>
        <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 8, fontSize: 14, color: "var(--ink-soft)" }}>
          {[
            "Book your sessions from your dashboard, same as any other plan. Biology and Chemistry rotate monthly, one subject at a time",
            "You're on the subsidised programme at £40 a month, same rate as the rest of the site",
            "Your lessons run on Google Meet, the link appears on your booking page before each one",
            "We'll email you separately to arrange UCAT strategy and interview/personal statement workshops",
          ].map((l) => (
            <li key={l} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><span style={{ color: "var(--mint)", flex: "none", marginTop: 3 }}><Icon name="check" size={14} /></span>{l}</li>
          ))}
        </ul>
      </div>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 20 }}>
        Questions in the meantime? <button className="it-navlink" style={{ padding: 0, display: "inline", fontSize: 13 }} onClick={() => go("contact")}>Get in touch</button>.
      </p>
    </div>
  );
}

const fieldLabel = { fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", margin: "0 0 5px", display: "block" };

// GCSE moved off self-serve Stripe checkout to the exact same
// apply-and-be-accepted format as the scholarship: a parent applies, Isham
// reviews and accepts, payment is arranged directly (bank transfer), not by
// card on the site.
function GCSELanding({ store, go }) {
  const spotsLeft = Math.max(GCSE_SPOTS - (store.gcseSpotsTaken || 0), 0);
  const closed = spotsLeft <= 0;
  return (
    <div className="it-fade" style={{ padding: "56px 24px", maxWidth: 760, margin: "0 auto" }}>
      <span className="it-tag" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="cap" size={13} /> GCSE Sciences &amp; Maths</span>
      <h1 className="it-display" style={{ fontSize: 32, fontWeight: 800, margin: "12px 0 8px" }}>Subsidised GCSE group tuition, £40 a month</h1>
      <p style={{ color: "var(--ink-soft)", lineHeight: 1.6, maxWidth: 640 }}>
        Weekly live group lessons in Maths, Biology, Chemistry and Physics, taught by a dental student who ranked top of his school. Friday or Saturday evenings, from 5:00pm.
      </p>

      <Reveal style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, margin: "22px 0" }}>
        <div className="it-card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11.5, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700 }}>Spots</div>
          <div className="it-display" style={{ fontSize: 24, fontWeight: 800, color: spotsLeft <= 3 ? "var(--coral)" : "var(--mint-dark)" }}>{spotsLeft} of {GCSE_SPOTS} left</div>
        </div>
        <div className="it-card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11.5, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700 }}>Group size</div>
          <div className="it-display" style={{ fontSize: 24, fontWeight: 800, color: "var(--mint-dark)" }}>Max 5</div>
        </div>
      </Reveal>
      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "-12px 0 22px" }}>Rolling admissions, no fixed deadline: applications close automatically the moment all {GCSE_SPOTS} spots are filled, so earlier is better.</p>

      <Reveal className="it-card" style={{ padding: "18px 20px", marginBottom: 22 }}>
        <strong className="it-display" style={{ fontSize: 15 }}>What's included</strong>
        <Accordion items={[
          ["Weekly group lessons", "90-minute live sessions, groups of up to 5 so everyone gets airtime, Friday or Saturday evening from 5:00pm."],
          ["All four subjects", "Maths, Biology, Chemistry and Physics rotate weekly, so every subject is covered on a regular cycle."],
          ["Exam-board specific", "Taught to your exact spec, AQA, Edexcel or OCR, not generic content."],
          ["How this is funded", "This is a subsidised place, not a fully-funded free one: you pay £40 a month, well below what tutoring normally costs. Nothing is charged until you're accepted, and payment is arranged directly with Isham, not by card on this site."],
        ]} />
      </Reveal>

      {closed ? (
        <div className="it-card" style={{ padding: 20, textAlign: "center" }}>
          <strong>Applications are currently closed</strong>
          <p style={{ color: "var(--ink-soft)", margin: "6px 0 0" }}>All {GCSE_SPOTS} spots are filled. Message us via the Contact page to be notified when a spot opens up.</p>
        </div>
      ) : (
        <div className="it-card" style={{ padding: "22px 24px", textAlign: "center" }}>
          <strong className="it-display" style={{ fontSize: 17 }}>Ready to apply?</strong>
          <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "6px 0 16px" }}>Takes about 2 minutes. You'll need to sign in or create a free account first.</p>
          <button className="it-btn" onClick={() => go("gcse-apply")} style={{ width: "100%" }}>Start application →</button>
        </div>
      )}
    </div>
  );
}

function GCSEApply({ store, addGCSEApplication, go }) {
  const [session, setSession] = useState(undefined);
  const [authMode, setAuthMode] = useState("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authErr, setAuthErr] = useState("");

  useEffect(() => {
    supa.auth.getSession().then(({ data: { session } }) => setSession(session || null));
    const { data: sub } = supa.auth.onAuthStateChange((_evt, sess) => setSession(sess || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const [existingApp, setExistingApp] = useState(undefined);
  useEffect(() => {
    if (!session || !session.user || !session.user.email) { setExistingApp(session === null ? null : undefined); return; }
    (async () => {
      const { data } = await supa.from("gcse_applications").select("*").eq("student_email", session.user.email.toLowerCase()).maybeSingle();
      setExistingApp(data || null);
    })();
  }, [session]);

  const doSignIn = async () => {
    if (!authEmail.includes("@") || !authPassword) return setAuthErr("Enter your email and password.");
    setAuthBusy(true); setAuthErr("");
    const { error } = await supa.auth.signInWithPassword({ email: authEmail.trim().toLowerCase(), password: authPassword });
    setAuthBusy(false);
    if (error) setAuthErr(/confirm/i.test(error.message) ? "Check your inbox and click the verification link before signing in." : "Wrong email or password.");
  };
  const doSignUp = async () => {
    if (!authEmail.includes("@") || authPassword.length < 8) return setAuthErr("Enter your email and a password of at least 8 characters.");
    setAuthBusy(true); setAuthErr("");
    const { error } = await supa.auth.signUp({ email: authEmail.trim().toLowerCase(), password: authPassword, options: { emailRedirectTo: "https://www.ishamtuition.com" } });
    setAuthBusy(false);
    if (error) return setAuthErr(error.message);
    alert("Check your inbox to verify your email, then sign in.");
    setAuthMode("signin");
  };
  const signOut = async () => { await supa.auth.signOut(); };

  const blank = { student_name: "", student_email: "", student_phone: "", parent_name: "", parent_phone: "", parent_email: "", school: "" };
  const [f, setF] = useState(blank);
  useEffect(() => {
    if (session && session.user && session.user.email) setF((p) => ({ ...p, student_email: session.user.email }));
  }, [session]);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const spotsLeft = Math.max(GCSE_SPOTS - (store.gcseSpotsTaken || 0), 0);

  const submit = async () => {
    if (!f.student_name.trim() || !f.student_email.includes("@")) return alert("Please add the student's name and email.");
    if (!f.parent_name.trim() || !f.parent_phone.trim() || !f.parent_email.includes("@")) return alert("Please add a parent/guardian name, phone and email, we'll need to reach them too.");
    setBusy(true);
    try {
      await addGCSEApplication({
        student_name: f.student_name.trim(), student_email: f.student_email.trim().toLowerCase(), student_phone: f.student_phone.trim(),
        parent_name: f.parent_name.trim(), parent_phone: f.parent_phone.trim(), parent_email: f.parent_email.trim().toLowerCase(),
        school: f.school.trim(), plan: "gcse", status: "pending",
      });
      notifyServer({ type: "message", name: f.parent_name, email: f.parent_email, text: `GCSE application from ${f.student_name} (student: ${f.student_email}).` });
      setSent(true);
    } catch (e) {
      setBusy(false);
      console.error("GCSE application submit failed:", e);
      alert(String(e).includes("duplicate") ? "It looks like this email has already applied." : `Couldn't submit: ${e.message || e}`);
    }
  };

  if (session === undefined) return <Spinner label="Loading…" />;

  if (!session) {
    return (
      <div className="it-fade" style={{ padding: "56px 24px", maxWidth: 420, margin: "0 auto" }}>
        <button className="it-navlink" style={{ padding: 0, fontSize: 12.5, marginBottom: 10 }} onClick={() => go("gcse")}>← Back to GCSE</button>
        <span className="it-tag" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="cap" size={13} /> GCSE Sciences &amp; Maths</span>
        <div className="it-card" style={{ padding: 32, marginTop: 16 }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: "var(--ink)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <Icon name="shield" size={21} />
          </div>
          <h1 className="it-display" style={{ fontSize: 24, fontWeight: 800, margin: "0 0 6px" }}>{authMode === "signup" ? "Create an account to apply" : "Login to apply"}</h1>
          <p style={{ color: "var(--ink-soft)", fontSize: 13.5, margin: "0 0 20px" }}>
            An account keeps your application safe and lets you come back to check its status.
          </p>
          <div style={{ display: "flex", background: "var(--aqua)", borderRadius: 10, padding: 4, marginBottom: 20 }}>
            <button type="button" onClick={() => { setAuthMode("signin"); setAuthErr(""); }}
              style={{ flex: 1, border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer",
                background: authMode === "signin" ? "#fff" : "transparent", color: authMode === "signin" ? "var(--ink)" : "var(--ink-soft)",
                boxShadow: authMode === "signin" ? "0 1px 4px rgba(15,42,67,.12)" : "none" }}>Login</button>
            <button type="button" onClick={() => { setAuthMode("signup"); setAuthErr(""); }}
              style={{ flex: 1, border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer",
                background: authMode === "signup" ? "#fff" : "transparent", color: authMode === "signup" ? "var(--ink)" : "var(--ink-soft)",
                boxShadow: authMode === "signup" ? "0 1px 4px rgba(15,42,67,.12)" : "none" }}>Sign up</button>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            <input className="it-input" placeholder="Email" type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} />
            <PasswordField placeholder="Password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (authMode === "signup" ? doSignUp() : doSignIn())} />
            <button className="it-btn" onClick={authMode === "signup" ? doSignUp : doSignIn} disabled={authBusy}>
              {authBusy ? "Please wait…" : authMode === "signup" ? "Create account" : "Login"}
            </button>
            {authErr && <p style={{ color: "var(--coral)", fontSize: 13, margin: 0 }}>{authErr}</p>}
          </div>
        </div>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="it-fade" style={{ padding: "72px 24px", maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
        <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--aqua)", color: "var(--mint-dark)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}><Icon name="check" size={26} /></div>
        <h1 className="it-display" style={{ fontSize: 26, fontWeight: 800, margin: "0 0 8px" }}>You're on the list</h1>
        <p style={{ color: "var(--ink-soft)", lineHeight: 1.6 }}>
          Thanks, {f.student_name.split(" ")[0]}. We'll email {f.parent_email || "your parent/guardian"} and {f.student_email} once it's reviewed.
        </p>
        <div className="it-card" style={{ padding: 16, marginTop: 20, display: "inline-block" }}>
          <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Spots remaining right now</span>{" "}
          <strong className="it-display" style={{ color: "var(--mint-dark)" }}>{spotsLeft} of {GCSE_SPOTS}</strong>
        </div>
      </div>
    );
  }

  if (existingApp === undefined) return <Spinner label="Checking your application…" />;

  if (existingApp && existingApp.status === "accepted") {
    return <GCSEAccepted go={go} />;
  }

  if (existingApp) {
    const statusCopy = {
      pending: ["Your application is being reviewed", "We'll email you and your parent/guardian once it's been looked at."],
      declined: ["This application wasn't successful this time", "Message us via the Contact page with any questions."],
    }[existingApp.status] || ["Application received", "We'll be in touch."];
    return (
      <div className="it-fade" style={{ padding: "72px 24px", maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
        <button className="it-navlink" style={{ padding: 0, fontSize: 12.5, marginBottom: 20 }} onClick={() => go("gcse")}>← Back to GCSE</button>
        <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--aqua)", color: "var(--mint-dark)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}><Icon name="check" size={26} /></div>
        <span className="it-chip" style={{ background: "var(--aqua)", color: "var(--mint-dark)", marginBottom: 10, display: "inline-block" }}>{existingApp.status}</span>
        <h1 className="it-display" style={{ fontSize: 24, fontWeight: 800, margin: "6px 0 8px" }}>{statusCopy[0]}</h1>
        <p style={{ color: "var(--ink-soft)", lineHeight: 1.6 }}>{statusCopy[1]} You applied as {existingApp.student_name}, one application per person.</p>
        <button className="it-btn ghost" style={{ marginTop: 16 }} onClick={signOut}>Sign out</button>
      </div>
    );
  }

  return (
    <div className="it-fade" style={{ padding: "56px 24px", maxWidth: 560, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <button className="it-navlink" style={{ padding: 0, fontSize: 12.5 }} onClick={() => go("gcse")}>← Back to GCSE</button>
        <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
          Signed in as {session.user.email} · <button className="it-navlink" style={{ padding: 0, display: "inline", fontSize: 12.5 }} onClick={signOut}>Sign out</button>
        </span>
      </div>
      <h1 className="it-display" style={{ fontSize: 24, fontWeight: 800, margin: "10px 0 4px" }}>Apply for GCSE tuition</h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 20 }}>{spotsLeft} of {GCSE_SPOTS} spots left. Takes about 2 minutes.</p>

      <div className="it-card" style={{ padding: 24, display: "grid", gap: 14 }}>
        <div>
          <label style={fieldLabel}>Student name</label>
          <input className="it-input" placeholder="Full name" value={f.student_name} onChange={(e) => setF({ ...f, student_name: e.target.value })} />
        </div>
        <div>
          <label style={fieldLabel}>Student phone (optional)</label>
          <input className="it-input" placeholder="07…" type="tel" value={f.student_phone} onChange={(e) => setF({ ...f, student_phone: e.target.value })} />
        </div>
        <div>
          <label style={fieldLabel}>School (optional)</label>
          <input className="it-input" placeholder="School name" value={f.school} onChange={(e) => setF({ ...f, school: e.target.value })} />
        </div>
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
          <label style={fieldLabel}>Parent/guardian name</label>
          <input className="it-input" placeholder="Full name" value={f.parent_name} onChange={(e) => setF({ ...f, parent_name: e.target.value })} />
        </div>
        <div>
          <label style={fieldLabel}>Parent/guardian phone</label>
          <input className="it-input" placeholder="07…" type="tel" value={f.parent_phone} onChange={(e) => setF({ ...f, parent_phone: e.target.value })} />
        </div>
        <div>
          <label style={fieldLabel}>Parent/guardian email</label>
          <input className="it-input" placeholder="you@example.com" type="email" value={f.parent_email} onChange={(e) => setF({ ...f, parent_email: e.target.value })} />
        </div>
        <button className="it-btn" onClick={submit} disabled={busy} style={{ width: "100%" }}>{busy ? "Submitting…" : "Submit application"}</button>
      </div>
    </div>
  );
}

function GCSEAccepted({ go }) {
  return (
    <div className="it-fade" style={{ padding: "72px 24px", maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
      <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--aqua)", color: "var(--mint-dark)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}><Icon name="cap" size={26} /></div>
      <h1 className="it-display" style={{ fontSize: 28, fontWeight: 800, margin: "0 0 8px" }}>Welcome to GCSE tuition</h1>
      <p style={{ color: "var(--ink-soft)", lineHeight: 1.6 }}>
        You've been accepted. Your dashboard is ready, book your weekly Friday or Saturday evening session there. Payment (£40 a month) is arranged directly with Isham, not by card on this site, we'll be in touch about that separately.
      </p>
      <button className="it-btn" style={{ marginTop: 8 }} onClick={() => go("book")}>Go to your dashboard →</button>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 20 }}>
        Questions in the meantime? <button className="it-navlink" style={{ padding: 0, display: "inline", fontSize: 13 }} onClick={() => go("contact")}>Get in touch</button>.
      </p>
    </div>
  );
}

function Checkout({ planId, onDone, onFinish, onCancel }) {
  const plan = PLANS[planId];
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
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
      await onDone({ name: name.trim(), email: cleanEmail, phone: phone.trim() || null, plan: planId, paid_until: null });
      notifyServer({ type: "signup", name: name.trim(), email: cleanEmail, plan: plan.name });
      if (payLink) window.open(payLink, "_blank");
      if (authData && authData.session) {
        // email confirmation isn't required on this project; already signed in, skip straight to the dashboard
        onFinish();
      } else {
        setDone(true);
      }
    } catch (e) {
      setPaying(false);
      console.error("Checkout failed:", e); // full detail for diagnosing; never rely on the alert text alone
      const raw = (e && e.message) || "";
      const msg = raw && raw !== "{}" ? raw : "";
      if (String(e).includes("duplicate") || e.status === 409) {
        alert("That email already has a plan, go to Book and sign in there.");
      } else if (msg) {
        alert(msg);
      } else {
        alert("Something went wrong saving your details. This usually means a temporary connection hiccup. Please wait a few seconds and try again, and message Isham if it keeps happening.");
      }
    }
  };

  if (done) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(15,42,67,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}>
        <div className="it-card it-fade" style={{ padding: 30, width: 440, maxWidth: "100%" }}>
          <h3 className="it-display" style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800 }}>Almost there ✓</h3>
          <p style={{ color: "var(--ink-soft)", margin: "0 0 20px" }}>
            Check your inbox to verify your email. Booking unlocks the moment payment is confirmed, usually within hours.
          </p>
          <button className="it-btn" onClick={onFinish}>Done</button>
        </div>
      </div>
    );
  }

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
            <label style={fieldLabel}>Phone number (optional)</label>
            <input className="it-input" placeholder="07…" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label style={fieldLabel}>Password</label>
            <PasswordField placeholder="Min 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {!payLink && (
            <div style={{ background: "var(--aqua)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "var(--ink-soft)" }}>
              Demo checkout: no card is charged yet. Payment details will be arranged by email until online payment goes live.
            </div>
          )}
          <button className="it-btn" onClick={submit} disabled={paying}>{paying ? "Saving…" : payLink ? `Continue to payment, ${gbp(plan.price)}` : `Join, ${gbp(plan.price)}`}</button>
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
function BookLessonsPicker({ plan, store, subject, sel, setSel, mine, me, email, joinWaitlist, removeWaitlistEntry }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const earliestBookable = new Date(Math.max(today, new Date(TERM_START + "T00:00:00")));
  const horizon = new Date(earliestBookable); horizon.setDate(horizon.getDate() + 56);
  const wanted = daysOfWeekFor(plan.days);
  const seats = plan.seats || 5;
  const period = periodFor(me);
  const mineMonth = mine.filter((b) => b.date >= period.start && b.date < period.end);
  const left = plan.lessons - mineMonth.length;
  const subjectFor = (d) => (plan.rotates ? weekSubject(d, plan.cycle) : subject);
  const countAt = (dk, blockId, subj) =>
    seats === 1 ? (store.seatCountsBySlot[`${dk}|${blockId}`] || 0) : (store.seatCounts[`${dk}|${blockId}|${subj}`] || 0);
  const visibleBlocks = plan.blocks; // single tutor, no per-block ownership filtering needed

  // Group the bookable days into "weeks": a run of consecutive wanted days (Sat+Sun for
  // weekend plans, Wed+Fri for evening plans) no more than 2 days apart.
  const weeks = [];
  for (let d = new Date(earliestBookable); d <= horizon; d.setDate(d.getDate() + 1)) {
    if (!wanted.includes(d.getDay())) continue;
    const last = weeks[weeks.length - 1];
    const dCopy = new Date(d);
    if (last && (dCopy - last.days[last.days.length - 1]) / 86400000 <= 2) last.days.push(dCopy);
    else weeks.push({ days: [dCopy] });
  }
  weeks.forEach((w, i) => { w.index = i; w.subject = subjectFor(w.days[0]); });

  const [weekIdx, setWeekIdx] = useState(0);
  const week = weeks[Math.min(weekIdx, weeks.length - 1)];
  const weekRefs = React.useRef([]);
  const moveWeekFocus = (fromIdx, dir) => {
    let i = fromIdx;
    for (let step = 0; step < weeks.length; step++) {
      i += dir;
      if (i < 0 || i >= weeks.length) return;
      if (!weekIsPast(weeks[i])) { setWeekIdx(i); setSel(null); weekRefs.current[i]?.focus(); return; }
    }
  };
  const jumpWeekFocus = (toEnd) => {
    const order = toEnd ? [...weeks].reverse() : weeks;
    const target = order.find((w) => !weekIsPast(w));
    if (target) { setWeekIdx(target.index); setSel(null); weekRefs.current[target.index]?.focus(); }
  };

  const WEEKLY_CAP = 2; // a parent can only place 2 lessons in any one week, keeps it spread out, not front-loaded
  const weekBookingCount = (w) => w.days.reduce((sum, d) => sum + mine.filter((b) => b.date === dateKey(d)).length, 0);
  const weekAtCap = (w) => plan.rotates && weekBookingCount(w) >= WEEKLY_CAP;
  const weekOpenSeats = (w) => w.days.reduce((sum, d) => {
    const subj = subjectFor(d);
    return sum + visibleBlocks.reduce((s, bl) => s + Math.max(seats - countAt(dateKey(d), bl.id, subj), 0), 0);
  }, 0);
  const weekBookedByMe = (w) => w.days.some((d) => mine.some((b) => b.date === dateKey(d)));
  const weekIsPast = (w) => w.days[w.days.length - 1] < today;
  const weekCount = weekBookingCount(week);

  const slotRefs = React.useRef({});
  const focusSlot = (dayIdx, blockIdx) => slotRefs.current[dayIdx + "-" + blockIdx]?.focus();

  const WAITLIST_CAP = 3; // a queue longer than this is a signal to open another group, not a queue to grow
  const waitlistFor = (dk, blockId) => [...store.waitlist].filter((w) => w.date === dk && w.block === blockId).sort((a, b) => (a.created || "").localeCompare(b.created || ""));
  const myWaitlistEntry = (dk, blockId) => waitlistFor(dk, blockId).find((w) => w.email === email);
  const handleWaitlist = async (subj, dk, bl) => {
    if (!confirm(`Join the waitlist for ${subj} · ${prettyDate(new Date(dk + "T00:00:00"))} · ${bl.label}? This doesn't use one of your lessons, you'll only be booked in, using one, if a seat actually opens up.`)) return;
    try {
      await joinWaitlist({ student_id: me.id, name: me.name, email, date: dk, block: bl.id, subject: subj });
    } catch (e) { alert("Couldn't join the waitlist. Please message Isham on WhatsApp instead."); }
  };
  const leaveWaitlist = async (entryId) => {
    if (!confirm("Leave the waitlist for this slot?")) return;
    try { await removeWaitlistEntry(entryId); } catch (e) { alert("Couldn't leave the waitlist. Please message Isham."); }
  };

  if (!week) return <EmptyState icon="calendar" text="Nothing bookable right now. Message Isham and he'll sort you out." />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-soft)" }}>
          Each week covers one subject. Pick a week, then a time.{plan.rotates ? " Max 2 lessons a week." : ""}
        </p>
        <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{Math.max(left, 0)} of {plan.lessons} left this period</span>
      </div>

      <div className="it-weekrail" role="tablist" aria-label="Choose a week">
        {weeks.map((w) => {
          const c = SUBJECT_COLORS[w.subject] || SUBJECT_COLORS.Maths;
          const disabled = weekIsPast(w);
          const selected = w.index === week.index;
          const openSeats = weekOpenSeats(w);
          const booked = plan.rotates ? weekAtCap(w) : weekBookedByMe(w);
          return (
            <button key={w.index} ref={(el) => { weekRefs.current[w.index] = el; }} type="button" role="tab" aria-selected={selected} disabled={disabled}
              tabIndex={selected ? 0 : -1}
              className={"it-weekcard" + (selected ? " selected" : "") + (disabled ? " disabled" : "")}
              style={selected ? { borderColor: c.border, background: c.bg } : undefined}
              onClick={() => { setWeekIdx(w.index); setSel(null); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") { e.preventDefault(); moveWeekFocus(w.index, 1); }
                else if (e.key === "ArrowLeft") { e.preventDefault(); moveWeekFocus(w.index, -1); }
                else if (e.key === "Home") { e.preventDefault(); jumpWeekFocus(false); }
                else if (e.key === "End") { e.preventDefault(); jumpWeekFocus(true); }
              }}
              aria-label={`Week of ${humanDate(dateKey(w.days[0]))}, ${w.subject}, ${booked ? "already booked" : openSeats === 0 ? "full" : openSeats + " slots left"}`}>
              <div style={{ fontSize: 11, color: selected ? c.text : "var(--ink-soft)" }}>Wk {w.index + 1}</div>
              <div className="it-display" style={{ fontSize: 13, fontWeight: selected ? 700 : 500, color: selected ? c.text : "var(--ink)", margin: "2px 0" }}>{w.subject}</div>
              <div style={{ fontSize: 11, color: selected ? c.text : "var(--ink-soft)" }}>
                {booked ? "Booked" : openSeats === 0 ? "Full" : `${openSeats} slot${openSeats === 1 ? "" : "s"}`}
              </div>
            </button>
          );
        })}
      </div>

      {week.days.map((d, dayIdx) => {
        const dk = dateKey(d);
        const subj = subjectFor(d);
        const subjLeftForDay = plan.perSubjectCap - mineMonth.filter((b) => b.subject === subj).length;
        return (
          <div key={dk} style={{ marginTop: 18 }}>
            <p style={{ fontSize: 13.5, fontWeight: 700, margin: "0 0 8px" }}>{prettyDate(d)}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 10 }}>
              {visibleBlocks.map((bl, blockIdx) => {
                const n = countAt(dk, bl.id, subj);
                const already = mine.some((b) => b.date === dk && b.block === bl.id);
                const isSel = sel && sel.date === dk && sel.block === bl.id;
                const full = n >= seats;
                const wl = full ? waitlistFor(dk, bl.id) : [];
                const myEntry = full ? myWaitlistEntry(dk, bl.id) : null;
                const waitlistFull = full && wl.length >= WAITLIST_CAP && !myEntry;
                const blocked = left <= 0 || subjLeftForDay <= 0;
                const weeklyLocked = plan.rotates && !already && weekCount >= WEEKLY_CAP;
                const lockedOut = weeklyLocked || (blocked && !full);
                return (
                  <div key={bl.id} className="it-card" style={{ padding: "11px 12px", opacity: (full || lockedOut) && !already ? .55 : 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{bl.label}</span>
                      {weeklyLocked ? <span style={{ fontSize: 16 }} aria-hidden="true">🔒</span> : <SeatPill taken={n} cap={seats} />}
                    </div>
                    <p style={{ margin: "5px 0 9px", fontSize: 12, color: "var(--ink-soft)" }}>{subj}</p>
                    <button ref={(el) => { slotRefs.current[dayIdx + "-" + blockIdx] = el; }}
                      className="it-btn" style={{ width: "100%", minHeight: 44, padding: "7px 0", fontSize: 13,
                        ...(full || weeklyLocked ? { background: "#fff", color: "var(--ink-soft)", border: "1.5px solid var(--line)" } : {}) }}
                      disabled={already || weeklyLocked || (blocked && !full) || (full && (myEntry || waitlistFull))}
                      onClick={() => weeklyLocked || (full && (myEntry || waitlistFull)) ? null : full ? handleWaitlist(subj, dk, bl) : setSel(isSel ? null : { date: dk, block: bl.id, label: bl.label, subject: subj })}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowRight") { e.preventDefault(); focusSlot(dayIdx, Math.min(blockIdx + 1, visibleBlocks.length - 1)); }
                        else if (e.key === "ArrowLeft") { e.preventDefault(); focusSlot(dayIdx, Math.max(blockIdx - 1, 0)); }
                        else if (e.key === "ArrowDown") { e.preventDefault(); focusSlot(Math.min(dayIdx + 1, week.days.length - 1), Math.min(blockIdx, visibleBlocks.length - 1)); }
                        else if (e.key === "ArrowUp") { e.preventDefault(); focusSlot(Math.max(dayIdx - 1, 0), Math.min(blockIdx, visibleBlocks.length - 1)); }
                      }}
                      aria-label={`${subj}, ${prettyDate(d)}, ${bl.label}, ${already ? "already booked" : weeklyLocked ? "locked, max 2 lessons a week reached" : myEntry ? "on waitlist" : waitlistFull ? "full, waitlist full" : full ? "full" : (seats - n) + " seats left"}`}>
                      {already ? "Booked ✓" : weeklyLocked ? "Max 2/week" : myEntry ? `On waitlist (${wl.findIndex((w) => w.id === myEntry.id) + 1} of ${wl.length})` : waitlistFull ? "Waitlist full" : full ? "Join waitlist" : isSel ? "Selected ✓" : "Select"}
                    </button>
                    {myEntry && (
                      <button className="it-navlink" style={{ padding: 0, fontSize: 11.5, marginTop: 6, color: "var(--coral)" }} onClick={() => leaveWaitlist(myEntry.id)}>Leave waitlist</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 16 }}>
        {left <= 0 ? "You've used all the lessons in your current paid month. More unlock when it renews."
          : `${left} lesson${left === 1 ? "" : "s"} left in your paid month (to ${period.end}) · max ${plan.perSubjectCap} per subject.`}
      </p>
    </div>
  );
}

/* ---------- admin bookings calendar ---------- */
function AdminCalendar({ bookings, active, onPick, onToday }) {
  const [view, setView] = useState(() => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), 1); });
  const counts = {};
  const subjectsByDate = {};
  for (const b of bookings) {
    counts[b.date] = (counts[b.date] || 0) + 1;
    const set = subjectsByDate[b.date] || (subjectsByDate[b.date] = new Set());
    set.add(b.subject);
  }
  const cells = monthMatrix(view);
  const todayKey = dateKey(new Date());
  return (
    <div className="it-card" style={{ padding: 18 }}>
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
          const subjects = subjectsByDate[dk] ? [...subjectsByDate[dk]].slice(0, 3) : [];
          return (
            <button key={i} disabled={!n} onClick={() => onPick(dk)}
              className={dk === todayKey ? "it-cal-day today" : ""}
              style={{
                aspectRatio: "1", minHeight: 34, borderRadius: 8, position: "relative", fontSize: 12, fontWeight: n ? 800 : 500,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                border: on ? "2px solid var(--mint-dark)" : n ? "1.5px solid var(--mint)" : "1px solid transparent",
                background: on ? "var(--mint)" : n ? "var(--aqua)" : "transparent",
                color: on ? "#fff" : n ? "var(--mint-dark)" : "#C6D4D1", cursor: n ? "pointer" : "default",
              }}>
              {d.getDate()}
              {subjects.length > 0 && (
                <span style={{ display: "flex", gap: 2 }}>
                  {subjects.map((s) => (
                    <span key={s} style={{ width: 5, height: 5, borderRadius: "50%", background: on ? "#fff" : (SUBJECT_COLORS[s] || SUBJECT_COLORS.Maths).border }} />
                  ))}
                </span>
              )}
              {n > 0 && <span style={{ position: "absolute", top: 1, right: 3, fontSize: 8.5, fontWeight: 800 }}>{n}</span>}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="it-btn ghost" style={{ padding: "6px 12px", fontSize: 12.5, flex: 1 }} onClick={onToday}>Today</button>
        {active && <button className="it-btn ghost" style={{ padding: "6px 12px", fontSize: 12.5, flex: 1 }} onClick={() => onPick(active)}>Show all dates</button>}
      </div>
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
        Group Q&A, visible to all students and tutors. Keep it to study questions.
      </p>
      <div style={{ maxHeight: 320, overflowY: "auto", display: "grid", gap: 8, marginBottom: 12 }}>
        {messages.length === 0 && <p style={{ color: "var(--ink-soft)", fontSize: 13.5, margin: 0 }}>No messages yet, ask the first question!</p>}
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

const BOOK_TABS = [
  ["home", "Home", "home"],
  ["book", "Book lessons", "calendar"],
  ["mylessons", "My lessons", "check"],
  ["progress", "Progress", "star"],
  ["billing", "Billing", "shield"],
  ["questions", "Questions", "mail"],
];
const BOOK_BOTTOM_TABS = [["home", "Home", "home"], ["book", "Book", "calendar"], ["questions", "Ask", "mail"], ["billing", "Account", "shield"]];

function BookSidebar({ tab, setTab }) {
  return (
    <nav className="it-sidebar" aria-label="Account navigation">
      {BOOK_TABS.map(([id, label, icon]) => (
        <button key={id} className={"it-sidebar-link" + (tab === id ? " active" : "")} onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined}>
          <Icon name={icon} size={16} /><span>{label}</span>
        </button>
      ))}
      <div className="it-sidebar-help">
        Need help?<br />
        <a href={"mailto:" + CONTACT.email}>Email Isham</a>
      </div>
    </nav>
  );
}

function BookBottomTabs({ tab, setTab }) {
  return (
    <nav className="it-bottomtabs" aria-label="Account navigation">
      {BOOK_BOTTOM_TABS.map(([id, label, icon]) => (
        <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined}>
          <Icon name={icon} size={18} />{label}
        </button>
      ))}
    </nav>
  );
}

function NextLessonCard({ nextLesson, meetLink, seatsTaken, seatsCap, goBook }) {
  if (!nextLesson) {
    return (
      <div className="it-card" style={{ padding: 24, textAlign: "center" }}>
        <p style={{ margin: "0 0 14px", fontSize: 14, color: "var(--ink-soft)" }}>No lessons booked yet.</p>
        <button className="it-btn" onClick={goBook}>Book your first lesson</button>
      </div>
    );
  }
  const blk = blockById(nextLesson.block);
  const startMs = new Date(nextLesson.date + "T00:00:00").getTime() + blk.s * 60000;
  const canJoin = Date.now() >= startMs - 10 * 60000;
  return (
    <div className="it-card" style={{ padding: "20px 24px", background: "var(--ink)", border: "none", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "rgba(255,255,255,.6)", marginBottom: 4 }}>
          Next lesson, {countdownWords(nextLesson.date, blk)}
        </div>
        <div className="it-display" style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{nextLesson.subject}, {humanDate(nextLesson.date)}</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,.75)", marginTop: 2 }}>
          {nextLesson.blockLabel}{seatsCap > 1 ? ` · ${seatsTaken} of ${seatsCap} seats taken` : ""}
        </div>
      </div>
      {meetLink && canJoin ? (
        <a href={meetLink} target="_blank" rel="noreferrer" className="it-btn" style={{ background: "var(--mint)", color: "var(--ink)", textDecoration: "none" }}>Join lesson</a>
      ) : (
        <button className="it-btn" disabled style={{ background: "rgba(255,255,255,.15)", color: "rgba(255,255,255,.6)" }}>
          {meetLink ? "Opens 10 minutes before" : "Link appears closer to the time"}
        </button>
      )}
    </div>
  );
}

function AllowanceCard({ lessonsLeft, total, periodEnd }) {
  const bookedCount = Math.max(total - lessonsLeft, 0);
  return (
    <div className="it-card" style={{ padding: "16px 18px" }}>
      <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--ink-soft)" }}>Lessons this period</p>
      <p className="it-display" style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
        {bookedCount} booked <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-soft)" }}>of {total}</span>
      </p>
      <div style={{ display: "flex", gap: 3, margin: "10px 0 4px" }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{ height: 6, flex: 1, borderRadius: 3, background: i < bookedCount ? "var(--mint)" : "var(--line)" }} />
        ))}
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--ink-soft)" }}>Renews {periodEnd}</p>
    </div>
  );
}

function PlanStatusCard({ plan, me, locked, onManage }) {
  return (
    <div className="it-card" style={{ padding: "16px 18px" }}>
      <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--ink-soft)" }}>Plan</p>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{plan.name}</p>
      <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-soft)" }}>
        {me.paid_until ? `Renews ${me.paid_until}` : locked ? "Pending confirmation" : "-"}
      </p>
      {/* TODO(api): card-on-file details aren't available; Stripe Payment Links don't give us a stored Customer/PaymentMethod to read from */}
      <button className="it-navlink" style={{ padding: 0, marginTop: 8, fontSize: 12.5 }} onClick={onManage}>Manage plan</button>
    </div>
  );
}

function ConfirmSheet({ sel, plan, lessonsLeft, repeatCount, repeatSubjects, repeatEnd, periodEnd, repeat, setRepeat, busy, onConfirm, onCancel }) {
  if (!sel) return null;
  const count = repeat ? Math.max(repeatCount, 1) : 1;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,27,51,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 55, padding: "0 12px" }}>
      <div className="it-card it-fade" style={{ padding: 24, width: "100%", maxWidth: 480, borderRadius: "16px 16px 0 0" }}>
        <h3 className="it-display" style={{ margin: "0 0 10px", fontSize: 18, fontWeight: 800 }}>Confirm booking</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <SubjectChip subject={sel.subject} />
          <span style={{ fontSize: 14, fontWeight: 700 }}>{prettyDate(new Date(sel.date + "T00:00:00"))}</span>
        </div>
        <p style={{ margin: "0 0 4px", fontSize: 14, color: "var(--ink-soft)" }}>{sel.label}{plan.seats === 1 ? " · private 1-to-1" : ` · groups of up to ${plan.seats}`}</p>
        <p style={{ margin: "0 0 4px", fontSize: 13, color: "var(--ink-soft)" }}>
          Uses {count} of your {lessonsLeft} remaining lesson{lessonsLeft === 1 ? "" : "s"} this period.
        </p>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--ink-soft)" }}>Free to cancel or change up to 1 hour before.</p>
        {repeatCount > 1 && (
          <div style={{ background: "var(--aqua)", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <input type="checkbox" id="repeat-weekly" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} style={{ marginTop: 2 }} />
              <label htmlFor="repeat-weekly" style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
                Repeat this time every week: books {sel.label.split(" ")[0]} for {repeatCount} week{repeatCount === 1 ? "" : "s"} to {humanDate(repeatEnd)}:{" "}
                {repeatSubjects.join(", ")}
              </label>
            </div>
            {repeat && (
              <p style={{ margin: "6px 0 0 26px", fontSize: 11.5, color: "var(--ink-soft)" }}>Stops there, this period's lessons expire on {periodEnd} and don't roll over.</p>
            )}
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button className="it-btn ghost" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
          <button className="it-btn" style={{ flex: 2 }} disabled={busy} onClick={onConfirm}>{busy ? "Booking…" : `Confirm ${count} lesson${count === 1 ? "" : "s"}`}</button>
        </div>
      </div>
    </div>
  );
}

function Book({ store, addBooking, addMessage, joinWaitlist, removeWaitlistEntry, promoteWaitlist, refresh, go }) {
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
  const [bookTab, setBookTab] = useState("home");
  const [repeat, setRepeat] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [topicInput, setTopicInput] = useState("");
  const [topicSent, setTopicSent] = useState(false);
  const [topicBusy, setTopicBusy] = useState(false);
  const bookingInFlight = React.useRef(false);

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
      if (s) {
        const pl = PLANS[s.plan] || {};
        setSubject(pl.monthlyRotates ? monthSubject(new Date(), pl.cycle) : (pl.subjects?.[0] || null));
      }
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
          <h1 className="it-display" style={{ fontSize: 25, fontWeight: 800, margin: "0 0 6px" }}>{mode === "signup" ? "Set up your login" : "Login to book"}</h1>
          <p style={{ color: "var(--ink-soft)", fontSize: 13.5, margin: "0 0 20px" }}>
            {mode === "signup"
              ? "Already joined a plan but never made a login? Use the same email, once verified, we'll find it."
              : "Use the email and password you signed up with."}
          </p>

          <div style={{ display: "flex", background: "var(--aqua)", borderRadius: 10, padding: 4, marginBottom: 20 }}>
            <button type="button" onClick={() => { setMode("signin"); setAuthErr(""); }}
              style={{ flex: 1, border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer",
                background: mode === "signin" ? "#fff" : "transparent", color: mode === "signin" ? "var(--ink)" : "var(--ink-soft)",
                boxShadow: mode === "signin" ? "0 1px 4px rgba(15,42,67,.12)" : "none" }}>Login</button>
            <button type="button" onClick={() => { setMode("signup"); setAuthErr(""); }}
              style={{ flex: 1, border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer",
                background: mode === "signup" ? "#fff" : "transparent", color: mode === "signup" ? "var(--ink)" : "var(--ink-soft)",
                boxShadow: mode === "signup" ? "0 1px 4px rgba(15,42,67,.12)" : "none" }}>Sign up</button>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <input className="it-input" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <PasswordField placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (mode === "signup" ? doSignUp() : doSignIn())} />
            {mode === "signin" && (
              <button type="button" className="it-navlink" style={{ padding: 0, justifySelf: "start", fontSize: 12.5 }} onClick={doForgot}>Forgot password?</button>
            )}
            <button className="it-btn" onClick={mode === "signup" ? doSignUp : doSignIn} disabled={authBusy}>
              {authBusy ? "Please wait…" : mode === "signup" ? "Create account" : "Login"}
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
        <p style={{ color: "var(--ink-soft)" }}>We couldn't find a plan for {session.user.email}. Join a plan first on the Plans page.</p>
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
        <EmptyState icon="calendar" text="This plan is no longer bookable online. Message Isham directly to arrange your lessons." />
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
  const completedThisPeriod = mineMonth.filter((b) => b.attended === true).length;
  const topicsThisPeriod = new Set(mineMonth.filter((b) => b.topic).map((b) => b.topic)).size;

  // "Repeat weekly": same day-of-week/time for as many future weeks as the remaining
  // allowance covers (capped at 8). For a rotating plan the subject follows the normal
  // weekly rotation, so this places "Saturday 9am, whatever that week's subject is",
  // not literally the same subject every time.
  // Clamped on both constraints: the allowance AND the period end. A repeat run must never
  // book past the date the current allowance lapses on, even if the raw lessons-remaining
  // count would allow more weeks (those lessons wouldn't exist yet, they're next period's).
  const repeatDates = (() => {
    if (!sel) return [];
    const dates = [];
    const cap = Math.min(lessonsLeft, 8);
    for (let i = 0; i < cap; i++) {
      const d = new Date(sel.date + "T00:00:00");
      d.setDate(d.getDate() + i * 7);
      const dk = dateKey(d);
      if (dk >= period.end) break; // this and every later week fall in the next period, stop here
      const subj = plan.rotates ? weekSubject(d, plan.cycle) : sel.subject;
      if (mine.some((b) => b.date === dk && b.block === sel.block)) continue;
      dates.push({ date: dk, block: sel.block, label: sel.label, subject: subj });
    }
    return dates;
  })();

  const confirmBooking = async (repeat) => {
    if (expired) return alert("Your plan has expired. Renew (or message Isham) to book new lessons.");
    if (!sel || bookingInFlight.current) return; // ref check is synchronous; closes the double-tap race the busy state alone can't
    bookingInFlight.current = true;
    setBusy(true);
    const targets = repeat ? repeatDates : [{ date: sel.date, block: sel.block, label: sel.label, subject: sel.subject || subject }];
    let placed = 0;
    const failedDates = [];
    for (const t of targets) {
      try {
        await addBooking({ student_id: me.id, student_name: me.name, plan: me.plan, subject: t.subject, date: t.date, block: t.block, block_label: t.label });
        placed++;
      } catch (e) { failedDates.push(t.date); }
    }
    if (targets[0]) notifyServer({ type: "booking", name: me.name, email: session.user.email, subject: targets[0].subject, date: targets[0].date, time: targets[0].label });
    setSel(null);
    setRepeat(false);
    if (repeat) {
      if (placed === 0) {
        alert(`That slot filled up while you were booking. ${humanDate(failedDates[0])} and the rest are gone. Pick another time.`);
      } else if (failedDates.length > 0) {
        alert(`Booked ${placed} of ${targets.length}. ${humanDate(failedDates[0])} filled up${failedDates.length > 1 ? ` (and ${failedDates.length - 1} more)` : ""} . Pick another time that week from My lessons.`);
      } else {
        const last = targets[targets.length - 1];
        alert(`Booked ${placed} lesson${placed === 1 ? "" : "s"} to ${humanDate(last.date)}. ${Math.max(lessonsLeft - placed, 0)} lesson${Math.max(lessonsLeft - placed, 0) === 1 ? "" : "s"} left, and they expire on ${period.end}.`);
      }
    } else if (placed === 0) {
      alert("That slot filled up while you were booking. Pick another time.");
      await refresh();
    }
    setBusy(false);
    bookingInFlight.current = false;
  };

  const changeLesson = async (b) => {
    const msg = plan.rotates
      ? "Change this lesson? It'll be freed up and the calendar will open so you can pick a new date yourself. Heads up, subjects rotate weekly, so a different week may mean a different subject."
      : "Change this lesson's time? It'll be freed up, and the calendar will open so you can pick a new slot, same subject.";
    if (!confirm(msg)) return;
    const { data, error } = await supa.rpc("cancel_booking", { p_booking: b.id });
    if (error || data === false) { alert("Couldn't change. Lessons can only be changed more than 1 hour in advance."); return; }
    await refresh();
    promoteWaitlist(b.date, b.block, b.blockLabel);
    setSubject(b.subject);
    setSel(null);
    setBookTab("book");
  };
  const cancelLesson = async (b) => {
    if (!confirm("Cancel this lesson? The lesson returns to your allowance and the seat is freed, you can rebook a different slot.")) return;
    const { data, error } = await supa.rpc("cancel_booking", { p_booking: b.id });
    if (error || data === false) { alert("Couldn't cancel. Lessons can only be cancelled more than 1 hour in advance."); return; }
    await refresh();
    promoteWaitlist(b.date, b.block, b.blockLabel);
  };
  const cancelPlan = async () => {
    if (!confirm("Cancel your plan? You'll keep access to lessons you've already paid for, but it won't renew after that.")) return;
    try {
      await fetch("/api/cancel-subscription", { method: "POST", headers: { Authorization: "Bearer " + session.access_token } });
    } catch (e) { /* local cancel below still goes ahead even if Stripe couldn't be reached */ }
    const { data, error } = await supa.rpc("cancel_my_plan");
    if (error || data === false) alert("Couldn't cancel. Please message Isham directly.");
    else { alert("Done. Your plan won't renew."); await refresh(); }
  };
  const requestDeletion = async () => {
    if (!confirm("Request that Isham delete your account and all your data? He'll action this and confirm by email. It can't be undone once done.")) return;
    try {
      await addMessage({ name: me.name, email: session.user.email, text: "DATA DELETION REQUEST: please delete my account and all associated data (right to erasure)." });
      alert("Request sent. Isham will confirm once it's done.");
    } catch (e) { alert("Couldn't send that. Please email Isham directly."); }
  };
  const openBillingPortal = async () => {
    setPortalBusy(true);
    try {
      const r = await fetch("/api/billing-portal", { method: "POST", headers: { Authorization: "Bearer " + session.access_token } });
      const data = await r.json();
      if (!r.ok || !data.url) {
        alert(data.error === "no_customer"
          ? "Stripe hasn't linked a payment method to your account yet. Message Isham for a receipt."
          : "Couldn't open the billing portal. Message Isham for a receipt.");
      } else {
        window.open(data.url, "_blank");
      }
    } catch (e) { alert("Couldn't open the billing portal. Message Isham for a receipt."); }
    setPortalBusy(false);
  };
  const suggestTopic = async () => {
    if (!topicInput.trim()) return;
    setTopicBusy(true);
    try {
      const text = `Topic request from ${me.name}: ${topicInput.trim()}`;
      await addMessage({ name: me.name, email: session.user.email, text });
      notifyServer({ type: "message", name: me.name, email: session.user.email, text });
      setTopicInput("");
      setTopicSent(true);
      setTimeout(() => setTopicSent(false), 3000);
    } catch (e) { alert("Couldn't send that, please try again."); }
    setTopicBusy(false);
  };

  const LessonCard = ({ b, actions }) => {
    const link = store.meetLinks[slotKey(b.date, b.block)];
    const c = SUBJECT_COLORS[b.subject] || SUBJECT_COLORS.Maths;
    const blk = blockById(b.block);
    const startMs = new Date(b.date + "T00:00:00").getTime() + blk.s * 60000;
    const cancellable = startMs - Date.now() > 1 * 3600 * 1000;
    return (
      <li style={{ background: c.bg, border: "1px solid " + c.border, borderRadius: 12, padding: "12px 14px", fontSize: 14, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span>
          <strong style={{ color: c.text }}>{b.subject}</strong>, {humanDate(b.date)} · {b.blockLabel}
          {b.attended === true && <span className="it-chip" style={{ marginLeft: 8, background: "var(--aqua)", color: "var(--mint-dark)" }}>Attended</span>}
          {b.attended === false && <span className="it-chip" style={{ marginLeft: 8, background: "#FFEDE9", color: "#C2402F" }}>Missed</span>}
          {b.topic && <div style={{ fontSize: 12.5, color: "var(--ink)", marginTop: 4 }}><strong>Covered:</strong> {b.topic}</div>}
          {b.homework && <div style={{ fontSize: 12.5, color: "var(--ink)", marginTop: 2 }}><strong>Homework:</strong> {b.homework}</div>}
          {b.note && <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 4, fontStyle: "italic" }}>"{b.note}"</div>}
        </span>
        {actions && (
          <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {link ? (
              <a href={link} target="_blank" rel="noreferrer" className="it-btn" style={{ padding: "8px 16px", fontSize: 13.5, textDecoration: "none" }}>Join Google Meet →</a>
            ) : (
              <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Meet link appears before the lesson</span>
            )}
            {cancellable && <button className="it-btn" style={{ padding: "7px 12px", minHeight: 44, fontSize: 12.5 }} onClick={() => changeLesson(b)}>Reschedule</button>}
            {cancellable && <button className="it-btn ghost" style={{ padding: "7px 12px", minHeight: 44, fontSize: 12.5 }} onClick={() => cancelLesson(b)}>Cancel lesson</button>}
            {!cancellable && <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>Inside the 1-hour window, message Isham if something's come up</span>}
          </span>
        )}
      </li>
    );
  };

  const upcoming = [...mine].filter((b) => b.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = [...mine].filter((b) => b.date < today).sort((a, b) => b.date.localeCompare(a.date));
  const pageTitle = { fontSize: 22, fontWeight: 500, margin: "0 0 4px" };

  return (
    <div className="it-fade">
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "26px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h1 className="it-display" style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>Hi {me.name.split(" ")[0]} 👋</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* One student per login today, so this is a static label, not a dropdown.
              TODO(api): once a parent account can link multiple children, swap this for a real
              switcher that changes which student's `me`/`mine` the whole page is showing. */}
          <span style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--line)", borderRadius: 10, padding: "6px 12px", fontSize: 13, fontWeight: 600 }}>
            <span style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--aqua)", color: "var(--mint-dark)", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {me.name.charAt(0).toUpperCase()}
            </span>
            {me.name.split(" ")[0]}
          </span>
          <button className="it-btn ghost" style={{ padding: "8px 14px", fontSize: 13.5 }} onClick={signOut}>Sign out</button>
        </div>
      </div>

      <div className="it-shell">
        <BookSidebar tab={bookTab} setTab={setBookTab} />
        <div className="it-shell-main">

          {bookTab === "home" && (
            <div>
              {locked && (
                <div style={{ background: "#FFF7E8", border: "1px solid #F6DDB2", borderRadius: 12, padding: "10px 14px", fontSize: 13.5, color: "#7A5A2E", marginBottom: 14 }}>
                  Payment received? You'll be able to book the moment Isham confirms it, usually within a few hours.
                </div>
              )}
              {expired && (
                <div style={{ background: "#FFF1EF", border: "1px solid #F6C4BC", borderRadius: 12, padding: "10px 14px", fontSize: 13.5, color: "#8A3126", marginBottom: 14 }}>
                  Your plan ended on {me.paid_until}. Message Isham or renew to keep booking, your existing bookings are safe.
                </div>
              )}

              {!locked && (
                <div style={{ marginBottom: 14 }}>
                  <NextLessonCard
                    nextLesson={nextLesson}
                    meetLink={nextLesson ? store.meetLinks[slotKey(nextLesson.date, nextLesson.block)] : null}
                    seatsTaken={nextLesson ? (plan.seats === 1 ? (store.seatCountsBySlot[`${nextLesson.date}|${nextLesson.block}`] || 0) : (store.seatCounts[`${nextLesson.date}|${nextLesson.block}|${nextLesson.subject}`] || 0)) : 0}
                    seatsCap={plan.seats}
                    goBook={() => setBookTab("book")}
                  />
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginBottom: 14 }}>
                <AllowanceCard lessonsLeft={lessonsLeft} total={plan.lessons} periodEnd={period.end} />
                <PlanStatusCard plan={plan} me={me} locked={locked} onManage={() => setBookTab("billing")} />
              </div>

              {!locked && lessonsLeft > 0 && daysLeft(period.end) <= 14 && (
                <div style={{ background: "#FFF1EF", border: "1px solid #F6C4BC", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#8A3126", marginBottom: 14 }}>
                  {lessonsLeft} unused lesson{lessonsLeft === 1 ? "" : "s"} {daysLeft(period.end) <= 0 ? "expire today" : `expire${daysLeft(period.end) === 1 ? "s" : ""} in ${daysLeft(period.end)} day${daysLeft(period.end) === 1 ? "" : "s"}`} ({period.end}).
                </div>
              )}

              {!locked && lessonsLeft > 0 && (
                <div className="it-card" style={{ padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Book the rest of this period</p>
                    <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--ink-soft)" }}>{lessonsLeft} lesson{lessonsLeft === 1 ? "" : "s"} left to place</p>
                  </div>
                  <button className="it-btn" onClick={() => setBookTab("book")}>Book now</button>
                </div>
              )}

              {!locked && upcoming.length > 0 && (
                <div>
                  <h3 className="it-display" style={{ fontSize: 15, fontWeight: 700, margin: "0 0 10px" }}>Upcoming lessons</h3>
                  <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
                    {upcoming.slice(0, 4).map((b) => (
                      <li key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13.5, padding: "10px 14px", border: "1px solid var(--line)", borderRadius: 10 }}>
                        <span>{b.subject} · {humanDate(b.date)} · {b.blockLabel}</span>
                        <button className="it-navlink" style={{ padding: 0, fontSize: 12.5 }} onClick={() => setBookTab("mylessons")}>Change</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="it-card" style={{ padding: "14px 18px", marginTop: 20 }}>
                <p style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700 }}>Need help on something specific?</p>
                <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--ink-soft)" }}>Suggest a topic and Isham will try to cover it in an upcoming lesson.</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input className="it-input" style={{ flex: 1, minWidth: 180 }} placeholder="e.g. quadratic equations, organic chemistry naming…"
                    value={topicInput} onChange={(e) => setTopicInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && suggestTopic()} />
                  <button className="it-btn" style={{ padding: "10px 18px" }} onClick={suggestTopic} disabled={topicBusy || !topicInput.trim()}>{topicBusy ? "Sending…" : "Suggest"}</button>
                </div>
                {topicSent && <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--mint-dark)", fontWeight: 700 }}>Sent, thanks!</p>}
              </div>
            </div>
          )}

          {bookTab === "book" && (
            <div>
              <h1 className="it-display" style={pageTitle}>Book lessons</h1>
              {locked ? (
                <EmptyState icon="calendar" text="Payment received? You'll be able to book the moment Isham confirms it, usually within a few hours." />
              ) : expired ? (
                <EmptyState icon="calendar" text="Your plan has expired. Renew or message Isham to keep booking." />
              ) : (
                <>
                  {dateKey(new Date()) < TERM_START && (
                    <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "4px 0 16px" }}>Lessons start 1 October, you're locking in your place now, and the calendar below opens straight on the first bookable week.</p>
                  )}
                  {plan.monthlyRotates && (
                    <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "4px 0 16px" }}>
                      This month is <strong style={{ color: SUBJECT_COLORS[subject]?.text }}>{subject} month</strong>, every session covers {subject} until the rotation switches next month.
                    </p>
                  )}
                  {!plan.rotates && !plan.monthlyRotates && plan.subjects.length > 1 && (
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
                  <BookLessonsPicker plan={plan} store={store} subject={subject} sel={sel} setSel={setSel} mine={mine} me={me} email={session.user.email} joinWaitlist={joinWaitlist} removeWaitlistEntry={removeWaitlistEntry} />
                </>
              )}
            </div>
          )}

          {bookTab === "mylessons" && (
            <div>
              <h1 className="it-display" style={pageTitle}>My lessons</h1>
              <div style={{ maxWidth: 320, margin: "16px 0 22px" }}>
                <MyLessonsCalendar mine={mine} />
              </div>
              <h3 className="it-display" style={{ fontSize: 15, fontWeight: 700, margin: "0 0 8px" }}>Upcoming</h3>
              {upcoming.length === 0 ? (
                <div style={{ marginBottom: 24 }}><EmptyState icon="calendar" text="Your calendar is empty, you've got lessons ready to book." /></div>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8, marginBottom: 26 }}>
                  {upcoming.map((b) => <LessonCard key={b.id} b={b} actions />)}
                </ul>
              )}
              <h3 className="it-display" style={{ fontSize: 15, fontWeight: 700, margin: "0 0 8px" }}>Past</h3>
              {past.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>No past lessons yet.</p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
                  {past.map((b) => <LessonCard key={b.id} b={b} actions={false} />)}
                </ul>
              )}
            </div>
          )}

          {bookTab === "progress" && (
            <div>
              <h1 className="it-display" style={pageTitle}>Progress</h1>
              {totalMarked === 0 ? (
                <EmptyState icon="star" text="No lessons attended yet, what's covered and any homework will show up here after each lesson." />
              ) : (
                <>
                  <div className="it-card" style={{ padding: "16px 18px", margin: "16px 0 18px", maxWidth: 260 }}>
                    <p style={{ margin: "0 0 6px", fontSize: 12.5, color: "var(--ink-soft)" }}>Attendance</p>
                    <p className="it-display" style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{totalAttended} of {totalMarked}</p>
                  </div>
                  <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
                    {past.map((b) => <LessonCard key={b.id} b={b} actions={false} />)}
                  </ul>
                </>
              )}
            </div>
          )}

          {bookTab === "billing" && (
            <div>
              <h1 className="it-display" style={pageTitle}>Billing</h1>
              <div className="it-card" style={{ padding: 20, marginTop: 14, maxWidth: 460 }}>
                <p style={{ margin: "0 0 2px", fontSize: 15, fontWeight: 700 }}>{plan.name}</p>
                <p style={{ margin: 0, fontSize: 13, color: "var(--ink-soft)" }}>{gbp(plan.price)}{plan.per}</p>
                <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--ink-soft)" }}>{session.user.email}</p>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-soft)" }}>
                  {me.paid_until ? `Covered until ${me.paid_until}` : locked ? "Pending confirmation" : "-"}
                </p>
                <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--ink-soft)" }}>Unused lessons don't roll over, your allowance resets to {plan.lessons} on renewal.</p>
                <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--ink-soft)" }}>Payments are handled by Stripe. Receipts are emailed after each payment.</p>
                <button className="it-btn ghost" style={{ fontSize: 13.5, padding: "9px 16px", marginTop: 12 }} disabled={portalBusy} onClick={openBillingPortal}>
                  {portalBusy ? "Opening…" : "Manage payment details"}
                </button>
                {me.cancelled ? (
                  <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 16 }}>
                    Your plan is set to not renew.{me.paid_until ? ` You can keep booking until ${me.paid_until}.` : " Message Isham if you'd like to rejoin."}
                  </p>
                ) : (
                  <button className="it-btn ghost" style={{ fontSize: 13.5, padding: "9px 16px", marginTop: 16, marginLeft: 10 }} onClick={cancelPlan}>Cancel my plan</button>
                )}
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
                  <button className="it-navlink" style={{ padding: 0, fontSize: 12.5, color: "var(--coral)" }} onClick={requestDeletion}>Request my data be deleted</button>
                </div>
              </div>
            </div>
          )}

          {bookTab === "questions" && (
            <div>
              <h1 className="it-display" style={pageTitle}>Questions</h1>
              <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "4px 0 16px" }}>Visible to every student and to Isham, a good place for anything another family might also wonder about.</p>
              <ChatPanel sender={me.name} isTutor={false} />
            </div>
          )}
        </div>
      </div>

      <BookBottomTabs tab={bookTab} setTab={setBookTab} />

      <ConfirmSheet sel={sel} plan={plan} lessonsLeft={lessonsLeft}
        repeatCount={repeatDates.length} repeatSubjects={repeatDates.map((t) => t.subject)}
        repeatEnd={repeatDates.length ? repeatDates[repeatDates.length - 1].date : null} periodEnd={period.end}
        repeat={repeat} setRepeat={setRepeat} busy={busy}
        onConfirm={() => confirmBooking(repeat)} onCancel={() => { setSel(null); setRepeat(false); }} />
    </div>
  );
}

function Contact({ addMessage }) {
  const [f, setF] = useState({ name: "", email: "", text: "" });
  const [sent, setSent] = useState(false);
  const submit = async () => {
    if (!f.name.trim() || !f.text.trim()) return alert("Please add your name and a message.");
    try { await addMessage(f); notifyServer({ type: "message", name: f.name, email: f.email, text: f.text }); setSent(true); }
    catch (e) { alert("Couldn't send. Please try again."); }
  };
  return (
    <div className="it-fade" style={{ padding: "56px 24px", maxWidth: 620, margin: "0 auto" }}>
      <span className="it-tag">Get in touch</span>
      <h1 className="it-display" style={{ fontSize: 30, fontWeight: 800, margin: "12px 0 6px" }}>Questions?</h1>
      <p style={{ color: "var(--ink-soft)" }}>Money worries, subjects, exam boards, availability, ask anything. I usually reply within a day.</p>
      <div style={{ margin: "16px 0 6px" }}>
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
            <p style={{ color: "var(--ink-soft)", margin: "4px 0 0" }}>Thanks {f.name.split(" ")[0]}, I'll get back to you at {f.email || "your email"}.</p>
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
          ["Is this a scholarship?", "It's run like one: every GCSE place is funded down to £10 a lesson, well below what tutoring normally costs. You still pay the £40/month listed price (it's not free or means-tested), but that price is subsidised on purpose so any family can access it. Think scholarship-style funding, not a discount."],
          ["How do I join GCSE or the scholarship?", "Both are apply-and-be-accepted, not a card checkout: fill in a short form, Isham reviews it, and you're emailed once there's a decision. Payment for GCSE places is then arranged directly, not by card on the site."],
          ["How do GCSE subjects work?", "One subject per week on rotation: Maths week → Biology → Chemistry → Physics → repeat. You get every subject once a month."],
          ["When are GCSE lessons?", "Friday or Saturday evenings, one 90-minute group session a week from 5:00pm."],
          ["When are A-level sessions?", "Wednesday and Friday evenings, private 1-hour slots."],
          ["Where are lessons held?", "Live on Google Meet, your join link appears on your booking page before each lesson."],
          ["How big are the groups?", "GCSE and the scholarship both run in groups of 5 max, so everyone gets airtime. A-level is private one-to-one."],
          ["Can I cancel?", "Yes, there's a \"Cancel my plan\" button on your Book page under Account. You keep booking access through whatever you've already paid for, it just won't renew after that. No contract either way."],
          ["What's the Grade A Guarantee?", "Be enrolled 6+ months, attend your lessons, follow the guidance and hand in all homework on time to a genuine standard. If your assessment average still isn't a grade 7 (A) or above, your most recent 3 months of fees are refunded."],
          ["Can I get a refund for another reason?", "Plans have no contract, so you never pay for a month you don't want, just don't renew. For anything else, message, call or email and we'll talk like humans."],
        ]} />
      </div>
    </div>
  );
}

function Privacy() {
  const Section = ({ title, children }) => (
    <div style={{ marginTop: 26 }}>
      <h2 className="it-display" style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>{title}</h2>
      <div style={{ fontSize: 14.5, color: "var(--ink-soft)", lineHeight: 1.7 }}>{children}</div>
    </div>
  );
  return (
    <div className="it-fade" style={{ padding: "48px 24px 90px", maxWidth: 760, margin: "0 auto" }}>
      <h1 className="it-display" style={{ fontSize: 28, fontWeight: 800, marginBottom: 6 }}>Privacy policy</h1>
      <p style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>Last updated {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}. This describes exactly what Isham Tuition collects and why, nothing more.</p>

      <Section title="Who this covers">
        <p>Isham Tuition is run by Isham Bari ({CONTACT.email}). He's the only person with access to student records, there's no separate company, no data processor beyond the tools listed below, and no data is sold or shared with anyone else.</p>
      </Section>

      <Section title="What's collected, and why">
        <p>When you join a plan: your (or your child's) name, email address, and phone number if you choose to give one, used to create your login, confirm your place, and get in touch if there's a change to a lesson.</p>
        <p style={{ marginTop: 8 }}>When you book: the lessons you book, which subject, and which dates, used to run the timetable and know who's expected in each session.</p>
        <p style={{ marginTop: 8 }}>During term: attendance (present/absent) and short tutor notes on what was covered or set as homework, used so you can see your own progress, and as a basic safeguarding record of who attended what.</p>
        <p style={{ marginTop: 8 }}>If you message or ask a question: the text of that message, tied to your name and email, so it can be answered.</p>
        <p style={{ marginTop: 8 }}>For plans paid by card, payment is handled entirely by Stripe, card details never reach Isham Tuition's own systems, only a confirmation that payment succeeded, and (if Stripe creates one) a customer reference used to show you your own billing portal. GCSE places are paid for directly (bank transfer), Isham never asks for or stores card details for those.</p>
      </Section>

      <Section title="If you apply for GCSE or the scholarship">
        <p>Applying collects more than a normal sign-up: the student's name, email and (optional) phone; a parent or guardian's name, phone and email; and school. The scholarship application also asks for year group, predicted grades and GCSE results as you choose to describe them, a short personal statement, and, optionally, self-declared widening-participation circumstances (for example free school meals eligibility, care experience, or similar), used only to help prioritise limited places fairly. Nobody but Isham can read these, and they're never used for anything except reviewing that application. For the scholarship, only students actually selected can be shown publicly, and only if that box was ticked on the form, and even then only a first name, chosen subjects and a short blurb, never contact details or the widening-participation answers.</p>
      </Section>

      <Section title="Where it's stored">
        <p>Records are stored in Supabase, a hosted database provider, protected so that only a signed-in tutor account can read other students' or applicants' data; a student can only ever see their own. There are no analytics or advertising trackers on this site, nothing is collected beyond what's listed above.</p>
      </Section>

      <Section title="How long it's kept">
        <p>For as long as you're an active or recently-active student, so the timetable and progress history make sense. You can ask for it to be deleted at any time, see below.</p>
      </Section>

      <Section title="Your rights">
        <p>You can see your own plan, bookings and notes any time by signing in on the Book page. You can cancel your plan yourself from the Billing tab. You can request full deletion of your account and every record tied to it from the Billing tab ("Request my data be deleted"), or by emailing {CONTACT.email}, this is actioned personally and confirmed by email. You can also ask to see a copy of everything held about you, or to correct anything that's wrong, the same way.</p>
      </Section>

      <Section title="Questions">
        <p>Email {CONTACT.email} for anything not covered here.</p>
      </Section>
    </div>
  );
}

function StudentAttendanceRow({ b, c, onMove, saveNote }) {
  const [note, setNote] = useState(b.note || "");
  const [open, setOpen] = useState(false);
  const mark = (attended) => {
    saveNote(b.id, { attended: b.attended === attended ? null : attended });
    setOpen(true); // ticking present/absent opens the note straight away, so it's a one-stop action
  };
  return (
    <div style={{ background: "#fff", border: "1px solid " + c.border, borderRadius: 10, padding: "5px 8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 13, flex: 1, minWidth: 70 }}>{b.name}</strong>
        <button onClick={() => onMove(b)} title="Move this student to a different session"
          style={{ border: "none", background: c.bg, color: c.text, borderRadius: 999, fontSize: 11, fontWeight: 800, padding: "3px 8px", cursor: "pointer" }}>Move</button>
        <button onClick={() => mark(true)} title="Mark present"
          style={{ border: "none", borderRadius: 999, fontSize: 12, fontWeight: 800, padding: "3px 8px", cursor: "pointer",
            background: b.attended === true ? "var(--mint)" : "#EEF3F1", color: b.attended === true ? "#fff" : "var(--ink-soft)" }}>✓</button>
        <button onClick={() => mark(false)} title="Mark absent"
          style={{ border: "none", borderRadius: 999, fontSize: 12, fontWeight: 800, padding: "3px 8px", cursor: "pointer",
            background: b.attended === false ? "var(--coral)" : "#EEF3F1", color: b.attended === false ? "#fff" : "var(--ink-soft)" }}>✗</button>
        <button onClick={() => setOpen(!open)} title="Note for this student, visible to them"
          style={{ border: "none", background: "none", fontSize: 13, cursor: "pointer", padding: "3px 4px", color: b.note ? "var(--mint-dark)" : "var(--ink-soft)" }}>
          📝{b.note && !open ? " •" : ""}
        </button>
      </div>
      {open && (
        <textarea rows={1} placeholder="Note for this student, visible to them" autoFocus
          value={note} onChange={(e) => setNote(e.target.value)}
          onBlur={() => { if (note !== (b.note || "")) saveNote(b.id, { note: note.trim() || null }); }}
          style={{ width: "100%", marginTop: 5, fontSize: 12, padding: "5px 8px", border: "1px solid var(--line)", borderRadius: 8, fontFamily: "inherit", resize: "vertical" }} />
      )}
    </div>
  );
}

function SessionCard({ dk, block, list, subj, link, saveLink, onMove, saveNote, emails, waitlist, removeWaitlistEntry }) {
  const cap = (PLANS[(list[0] || {}).plan] || {}).seats || 5;
  const [draft, setDraft] = useState(link || "");
  const [topic, setTopic] = useState((list[0] || {}).topic || "");
  const [homework, setHomework] = useState((list[0] || {}).homework || "");
  const [savingSession, setSavingSession] = useState(false);
  const saveSession = async () => {
    setSavingSession(true);
    await Promise.all(list.map((b) => saveNote(b.id, { topic: topic.trim() || null, homework: homework.trim() || null })));
    setSavingSession(false);
  };
  const c = SUBJECT_COLORS[subj] || SUBJECT_COLORS.Maths;
  const inviteMsg = () => `Hi! Your ${subj} lesson is on ${dk}, ${block.label}. Join here: ${draft || "(link coming soon)"}. Isham`;
  const copyInvite = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(inviteMsg()).then(() => alert("Invite message copied. Paste it into email or WhatsApp."));
    else alert(inviteMsg());
  };
  const emailInvite = () => {
    const to = (emails || []).filter(Boolean).join(",");
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(`Your ${subj} lesson, ${dk}`)}&body=${encodeURIComponent(inviteMsg())}`;
  };
  return (
    <div style={{ border: "1.5px solid " + c.border, background: c.bg, borderRadius: 12, padding: 14, marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <div>
          <strong style={{ color: c.text }}>{block.label}</strong>{" "}
          <SubjectChip subject={subj} />{" "}
          <span style={{ fontSize: 13, fontWeight: 700, color: list.length >= cap ? "var(--coral)" : list.length >= cap - 1 ? "#B87A14" : "#2FA45B" }}>
            {cap === 1 ? "1-to-1" : `${list.length}/${cap} booked`}
          </span>
        </div>
      </div>
      <div style={{ display: "grid", gap: 8, margin: "8px 0" }}>
        {list.length ? list.map((b) => (
          <StudentAttendanceRow key={b.id} b={b} c={c} onMove={onMove} saveNote={saveNote} />
        )) : "No students yet"}
      </div>
      {waitlist && waitlist.length > 0 && (
        <div style={{ background: "#fff", border: "1px dashed " + c.border, borderRadius: 10, padding: "8px 10px", marginBottom: 8 }}>
          <strong style={{ fontSize: 12, color: c.text }}>Waitlist ({waitlist.length})</strong>
          <div style={{ display: "grid", gap: 4, marginTop: 4 }}>
            {waitlist.map((w) => (
              <div key={w.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5 }}>
                <span>{w.name} · <a href={"mailto:" + w.email} style={{ color: "var(--mint-dark)" }}>{w.email}</a></span>
                <button style={{ border: "none", background: "none", color: "var(--ink-soft)", fontSize: 11.5, cursor: "pointer" }}
                  onClick={() => removeWaitlistEntry(w.id)}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {list.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <input className="it-input" style={{ flex: 1, minWidth: 180, padding: "8px 12px", fontSize: 13.5 }} placeholder="What was covered (e.g. Atomic structure)"
            value={topic} onChange={(e) => setTopic(e.target.value)} />
          <input className="it-input" style={{ flex: 1, minWidth: 180, padding: "8px 12px", fontSize: 13.5 }} placeholder="Homework set (optional)"
            value={homework} onChange={(e) => setHomework(e.target.value)} />
          <button className="it-btn ghost" style={{ padding: "8px 14px", fontSize: 13 }} disabled={savingSession} onClick={saveSession}>
            {savingSession ? "Saving…" : "Save for whole session"}
          </button>
        </div>
      )}
      {list.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input className="it-input" style={{ flex: 1, minWidth: 220, padding: "8px 12px", fontSize: 13.5 }} placeholder="Paste Google Meet link (meet.google.com/…)"
            value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button className="it-btn ghost" style={{ padding: "8px 14px", fontSize: 13 }} onClick={async () => { await saveLink(draft.trim()); alert("Saved. Students now see this link on their booking page."); }}>Save link</button>
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
      <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "4px 0 6px" }}>
        Each class needs its own Google Classroom link, pasted here once, students then see it on their Book dashboard automatically, no re-sending it by hand.
      </p>
      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "0 0 12px" }}>
        Where to find it: open <strong>classroom.google.com</strong> → the class → click <strong>Settings</strong> (gear icon, top right) → copy the <strong>Class link</strong> shown there. Paste that whole link below.
      </p>
      <div style={{ display: "grid", gap: 10 }}>
        {groups.map((g) => {
          const isSet = !!meetLinks[g.key];
          return (
            <div key={g.key} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 12, flex: "none", width: 16, textAlign: "center" }} title={isSet ? "Link set" : "Not set yet"}>
                {isSet ? "🟢" : "⚪"}
              </span>
              <span style={{ fontSize: 13, minWidth: 220, color: "var(--ink-soft)" }}>{g.label}</span>
              <input className="it-input" style={{ flex: 1, minWidth: 200 }} placeholder="https://classroom.google.com/c/…"
                value={drafts[g.key] ?? meetLinks[g.key] ?? ""} onChange={(e) => setDrafts({ ...drafts, [g.key]: e.target.value })} />
              <button className="it-btn ghost" style={{ padding: "9px 14px", fontSize: 13 }} disabled={saving === g.key}
                onClick={async () => {
                  setSaving(g.key);
                  await saveMeet(g.key, (drafts[g.key] ?? meetLinks[g.key] ?? "").trim());
                  setSaving(null);
                }}>{saving === g.key ? "Saving…" : "Save"}</button>
            </div>
          );
        })}
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

function Admin({ store, saveMeet, saveLessonNote, removeSubscriber, refresh, moveBooking, addStudentManual, updatePaidUntil, addTestimonial, removeTestimonial, removeWaitlistEntry, updateScholarshipStatus, acceptScholarship, updateGCSEStatus, acceptGCSE, go }) {
  const [step, setStep] = useState("checking"); // checking | login | challenge | in
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState(null); // {factorId, challengeId}
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState(null);
  const [nf, setNf] = useState({ name: "", email: "", phone: "", plan: "gcse3", paid_until: addMonths(3) });
  const [tf, setTf] = useState({ name: "", quote: "", detail: "" });
  const [calFilter, setCalFilter] = useState(null);
  const [showAllDates, setShowAllDates] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [scholarFilter, setScholarFilter] = useState("all");
  const [gcseFilter, setGcseFilter] = useState("all");
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
    if (error) return setErr("Wrong code, check your authenticator app.");
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
    if (error) return setErr("Code didn't match, try the newest code in your app.");
    setEnroll(null); setEnrollCode(""); setHasMfa(true);
    alert("2FA is on ✓. From now on, logging in needs your password AND a code from your app.");
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
          <PasswordField placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
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
  // Scoped to this tutor's own students, not every student; a non-master tutor
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
  const todayKey = dateKey(new Date());
  const todaysSessions = Object.entries(byDate[todayKey] || {}).sort(([a], [b]) => blockDef(a).s - blockDef(b).s);

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
        {[["overview", "Overview"], ["timetable", "Timetable"], ["students", "Students"], ["gcse", "GCSE"], ["scholarship", "Scholarship"], ["testimonials", "Testimonials"], ["messages", "Messages"]].map(([id, label]) => (
          <button key={id} onClick={() => document.getElementById("admin-" + id)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{label}</button>
        ))}
      </div>

      <div className="it-card" style={{ padding: "16px 20px", marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-soft)", marginBottom: 8 }}>Today</div>
        {todaysSessions.length === 0 ? (
          <div style={{ fontSize: 14, color: "var(--ink-soft)" }}>No lessons today.</div>
        ) : (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {todaysSessions.map(([blockId, list]) => {
              const c = SUBJECT_COLORS[list[0].subject] || SUBJECT_COLORS.Maths;
              return (
                <div key={blockId} style={{ background: c.bg, border: "1px solid " + c.border, borderRadius: 10, padding: "8px 14px", fontSize: 13.5 }}>
                  <strong style={{ color: c.text }}>{blockDef(blockId).label}</strong> · {list[0].subject} · {list.length} student{list.length === 1 ? "" : "s"}
                </div>
              );
            })}
          </div>
        )}
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
                Step 1: scan this QR code with your authenticator app, or type the secret in manually. Step 2: enter the 6-digit code it shows.
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
          ["Active places", `${store.takenCount || 0} / ${CAP}`, "🎓"],
          ["GCSE spots", `${store.gcseSpotsTaken || 0} / ${GCSE_SPOTS}`, "📘"],
          ["Scholarship spots", `${store.scholarshipSpotsTaken || 0} / ${SCHOLARSHIP_SPOTS}`, "❤️"],
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

      <h2 id="admin-timetable" className="it-display" style={{ fontSize: 20, fontWeight: 800, scrollMarginTop: 90 }}>Timetable: who booked what & when</h2>
      <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 4 }}>Click a date to see who's scheduled, like a normal calendar. The dots are which subjects, the number is how many bookings. Paste a Google Meet link into any session, students instantly see it on their booking page.</p>
      {dates.length === 0 ? <EmptyState icon="calendar" text="No bookings yet." /> : (() => {
        const todayKey = dateKey(new Date());
        const agendaDates = showAllDates ? dates : calFilter ? [calFilter] : (byDate[todayKey] ? [todayKey] : (dates.find((d) => d >= todayKey) ? [dates.find((d) => d >= todayKey)] : [dates[0]]));
        return (
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap", marginTop: 12 }}>
            <div style={{ flex: "none", width: 340, maxWidth: "100%" }}>
              <AdminCalendar bookings={store.bookings} active={calFilter}
                onPick={(dk) => { setShowAllDates(false); setCalFilter(calFilter === dk ? null : dk); }}
                onToday={() => { setShowAllDates(false); setCalFilter(null); }} />
            </div>
            <div style={{ flex: 1, minWidth: 280 }}>
              {showAllDates && (
                <button className="it-navlink" style={{ padding: 0, fontSize: 12.5, marginBottom: 10 }} onClick={() => setShowAllDates(false)}>← Back to calendar view</button>
              )}
              {!showAllDates && (
                <button className="it-navlink" style={{ padding: 0, fontSize: 12.5, marginBottom: 10 }} onClick={() => setShowAllDates(true)}>View every date instead →</button>
              )}
              {agendaDates.map((dk) => {
                const d = new Date(dk + "T00:00:00");
                const total = Object.values(byDate[dk]).reduce((t, l) => t + l.length, 0);
                return (
                  <div key={dk} className="it-card" style={{ padding: 18, marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                      <strong className="it-display" style={{ fontSize: 16 }}>{dk === todayKey ? "Today, " : ""}{prettyDate(d)}</strong>
                      <span style={{ fontSize: 13, color: "var(--ink-soft)", fontWeight: 700 }}>{total} booking{total === 1 ? "" : "s"}</span>
                    </div>
                    {Object.entries(byDate[dk]).sort().map(([blockId, list]) => (
                      <SessionCard key={blockId} dk={dk} block={blockDef(blockId)} list={list} subj={list[0].subject}
                        link={store.meetLinks[slotKey(dk, blockId)]}
                        saveLink={(l) => saveMeet(slotKey(dk, blockId), l)} onMove={setMoving}
                        saveNote={saveLessonNote}
                        emails={list.map((b) => (subs.find((s) => s.id === b.subscriberId) || {}).email)}
                        waitlist={store.waitlist.filter((w) => w.date === dk && w.block === blockId)}
                        removeWaitlistEntry={removeWaitlistEntry} />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      <h2 id="admin-students" className="it-display" style={{ fontSize: 20, fontWeight: 800, marginTop: 34, scrollMarginTop: 90 }}>Students</h2>
      <div className="it-card" style={{ padding: 18, marginTop: 12 }}>
        <strong style={{ fontSize: 14.5 }}>Add a student manually</strong>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "4px 0 10px" }}>For anyone who paid or arranged differently (bank transfer, cash, DM), adds them so they can book like everyone else.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input className="it-input" style={{ flex: 2, minWidth: 140 }} placeholder="Name" value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} />
          <input className="it-input" style={{ flex: 2, minWidth: 160 }} placeholder="Email" value={nf.email} onChange={(e) => setNf({ ...nf, email: e.target.value })} />
          <input className="it-input" style={{ flex: 1, minWidth: 130 }} placeholder="Phone (optional)" value={nf.phone || ""} onChange={(e) => setNf({ ...nf, phone: e.target.value })} />
          <select className="it-input" style={{ flex: 1, minWidth: 130 }} value={nf.plan}
            onChange={(e) => { const pl = e.target.value; setNf({ ...nf, plan: pl, paid_until: PLANS[pl].months ? addMonths(PLANS[pl].months) : "" }); }}>
            {Object.values(PLANS).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input className="it-input" type="date" style={{ flex: 1, minWidth: 140 }} value={nf.paid_until || ""} onChange={(e) => setNf({ ...nf, paid_until: e.target.value })} />
          <button className="it-btn" style={{ padding: "10px 18px" }} onClick={async () => {
            if (!nf.name.trim() || !nf.email.includes("@")) return alert("Name and a valid email needed.");
            try {
              await addStudentManual({ name: nf.name.trim(), email: nf.email.trim().toLowerCase(), phone: nf.phone?.trim() || null, plan: nf.plan, paid_until: nf.paid_until || null, tutor: "isham" });
              setNf({ name: "", email: "", phone: "", plan: "gcse3", paid_until: addMonths(3) });
            }
            catch (e) { alert(String(e).includes("duplicate") ? "That email is already registered." : "Couldn't add, try again."); }
          }}>Add</button>
        </div>
      </div>
      <div className="it-card" style={{ padding: 18, marginTop: 12, overflowX: "auto" }}>
        {subs.length === 0 ? <EmptyState icon="users" text="No sign-ups yet." /> : (() => {
          const q = studentSearch.trim().toLowerCase();
          const filteredSubs = q ? subs.filter((s) => (s.name || "").toLowerCase().includes(q) || (s.email || "").toLowerCase().includes(q)) : subs;
          return (
          <>
          <input className="it-input" style={{ marginBottom: 12, maxWidth: 320 }} placeholder="Search by name or email…" value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
          {filteredSubs.length === 0 ? <EmptyState icon="users" text="No students match that search." /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr style={{ textAlign: "left", color: "var(--ink-soft)" }}><th style={{ padding: 6 }}>Name</th><th style={{ padding: 6 }}>Email</th><th style={{ padding: 6 }}>Plan</th><th style={{ padding: 6 }}>Joined</th><th style={{ padding: 6 }}>Renewal</th><th /></tr></thead>
            <tbody>
              {filteredSubs.map((s) => (
                <tr key={s.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: 6, fontWeight: 600 }}>
                    {s.name}
                    {s.cancelled && <span className="it-chip" style={{ marginLeft: 6, background: "#FFEDE9", color: "#C2402F" }}>Not renewing</span>}
                  </td>
                  <td style={{ padding: 6 }}>{s.email}{s.phone && <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{s.phone}</div>}</td>
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
          </>
          );
        })()}
      </div>

      <h2 id="admin-scholarship" className="it-display" style={{ fontSize: 20, fontWeight: 800, marginTop: 34, scrollMarginTop: 90 }}>Scholarship applications</h2>
      <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 4, marginBottom: 12 }}>
        {SCHOLARSHIP_SPOTS - (store.scholarshipApps || []).filter((a) => a.status === "featured" || a.status === "accepted").length} of {SCHOLARSHIP_SPOTS} spots still open.
        Feature an applicant to show them (first name only) on the public Scholarship page, or accept them directly.
      </p>
      {(() => {
        const apps = store.scholarshipApps || [];
        const counts = { all: apps.length, pending: 0, featured: 0, accepted: 0, declined: 0 };
        for (const a of apps) counts[a.status] = (counts[a.status] || 0) + 1;
        const shown = scholarFilter === "all" ? apps : apps.filter((a) => a.status === scholarFilter);
        return (
          <>
            <div className="it-admin-jumpnav" style={{ position: "static", borderBottom: "none", marginBottom: 14, padding: 0 }}>
              {[["all", "All"], ["pending", "Pending"], ["featured", "Featured"], ["accepted", "Accepted"], ["declined", "Declined"]].map(([id, label]) => (
                <button key={id} onClick={() => setScholarFilter(id)}
                  style={{ background: scholarFilter === id ? "var(--mint)" : "var(--aqua)", color: scholarFilter === id ? "#fff" : "var(--mint-dark)" }}>
                  {label} ({counts[id] || 0})
                </button>
              ))}
            </div>
            <div className="it-card" style={{ padding: 18, overflowX: "auto" }}>
              {shown.length === 0 ? (
                <EmptyState icon="heart" text={apps.length === 0 ? "No scholarship applications yet." : "Nothing in this filter."} />
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {shown.map((a) => (
                    <div key={a.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                        <div>
                          <strong style={{ fontSize: 14.5 }}>{a.student_name}</strong>{" "}
                          <span className="it-chip" style={{
                            background: a.status === "featured" ? "var(--aqua)" : a.status === "accepted" ? "#E8F8EC" : a.status === "declined" ? "#FFF1EF" : "#F4F4F4",
                            color: a.status === "featured" ? "var(--mint-dark)" : a.status === "accepted" ? "#1F7A41" : a.status === "declined" ? "#8A3126" : "var(--ink-soft)",
                          }}>{a.status}</span>
                        </div>
                        <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{(a.created || "").slice(0, 10)}</span>
                      </div>
                      <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 8, display: "grid", gap: 3 }}>
                        <div>Student: {a.student_email} {a.student_phone && `· ${a.student_phone}`}</div>
                        <div>Parent/guardian: {a.parent_name} · {a.parent_phone} · {a.parent_email}</div>
                        {a.school && <div>School: {a.school} ({a.year_group})</div>}
                        {a.predicted_grades && <div>Predicted: {a.predicted_grades}</div>}
                        {a.gcse_summary && <div>GCSEs: {a.gcse_summary}</div>}
                        {a.widening_participation && Object.keys(a.widening_participation).filter((k) => k !== "note" && a.widening_participation[k]).length > 0 && (
                          <div>Widening participation: {Object.keys(a.widening_participation).filter((k) => k !== "note" && a.widening_participation[k]).map((k) => (WIDENING_CRITERIA.find((c) => c[0] === k) || [k, k])[1]).join("; ")}</div>
                        )}
                        {a.widening_participation && a.widening_participation.note && <div>Note: {a.widening_participation.note}</div>}
                      </div>
                      {a.personal_statement && (
                        <p style={{ fontSize: 13, background: "var(--aqua)", borderRadius: 8, padding: 10, margin: "0 0 8px" }}>{a.personal_statement}</p>
                      )}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>{(a.subjects || []).map((s) => <SubjectChip key={s} subject={s} />)}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {a.status !== "featured" && <button className="it-btn ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={() => updateScholarshipStatus(a.id, "featured")}>Feature publicly</button>}
                        {a.status !== "accepted" && <button className="it-btn ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={() => acceptScholarship(a)}>Accept</button>}
                        {a.status !== "declined" && <button className="it-btn ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={() => updateScholarshipStatus(a.id, "declined")}>Decline</button>}
                        {a.status !== "pending" && <button className="it-btn ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={() => updateScholarshipStatus(a.id, "pending")}>Reset</button>}
                        {a.status === "accepted" && <button className="it-btn ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={() => go("scholarship-accepted")}>View welcome page →</button>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        );
      })()}

      <h2 id="admin-gcse" className="it-display" style={{ fontSize: 20, fontWeight: 800, marginTop: 34, scrollMarginTop: 90 }}>GCSE applications</h2>
      <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 4, marginBottom: 12 }}>
        {GCSE_SPOTS - (store.gcseApps || []).filter((a) => a.status === "accepted").length} of {GCSE_SPOTS} spots still open.
        Accepting sets them up with real dashboard access on the plan applied for; payment is then arranged directly with you, not by card on the site.
      </p>
      {(() => {
        const apps = store.gcseApps || [];
        const counts = { all: apps.length, pending: 0, accepted: 0, declined: 0 };
        for (const a of apps) counts[a.status] = (counts[a.status] || 0) + 1;
        const shown = gcseFilter === "all" ? apps : apps.filter((a) => a.status === gcseFilter);
        return (
          <>
            <div className="it-admin-jumpnav" style={{ position: "static", borderBottom: "none", marginBottom: 14, padding: 0 }}>
              {[["all", "All"], ["pending", "Pending"], ["accepted", "Accepted"], ["declined", "Declined"]].map(([id, label]) => (
                <button key={id} onClick={() => setGcseFilter(id)}
                  style={{ background: gcseFilter === id ? "var(--mint)" : "var(--aqua)", color: gcseFilter === id ? "#fff" : "var(--mint-dark)" }}>
                  {label} ({counts[id] || 0})
                </button>
              ))}
            </div>
            <div className="it-card" style={{ padding: 18, overflowX: "auto" }}>
              {shown.length === 0 ? (
                <EmptyState icon="cap" text={apps.length === 0 ? "No GCSE applications yet." : "Nothing in this filter."} />
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {shown.map((a) => (
                    <div key={a.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                        <div>
                          <strong style={{ fontSize: 14.5 }}>{a.student_name}</strong>{" "}
                          <span className="it-chip" style={{
                            background: a.status === "accepted" ? "#E8F8EC" : a.status === "declined" ? "#FFF1EF" : "#F4F4F4",
                            color: a.status === "accepted" ? "#1F7A41" : a.status === "declined" ? "#8A3126" : "var(--ink-soft)",
                          }}>{a.status}</span>
                        </div>
                        <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{(a.created || "").slice(0, 10)}</span>
                      </div>
                      <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 8, display: "grid", gap: 3 }}>
                        <div>Student: {a.student_email} {a.student_phone && `· ${a.student_phone}`}</div>
                        <div>Parent/guardian: {a.parent_name} · {a.parent_phone} · {a.parent_email}</div>
                        {a.school && <div>School: {a.school}</div>}
                        <div>Plan: {(PLANS[a.plan] || {}).name || a.plan}</div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {a.status !== "accepted" && <button className="it-btn ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={() => acceptGCSE(a)}>Accept</button>}
                        {a.status !== "declined" && <button className="it-btn ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={() => updateGCSEStatus(a.id, "declined")}>Decline</button>}
                        {a.status !== "pending" && <button className="it-btn ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={() => updateGCSEStatus(a.id, "pending")}>Reset</button>}
                        {a.status === "accepted" && <button className="it-btn ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={() => go("gcse-accepted")}>View welcome page →</button>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        );
      })()}

      {isMaster && (<>
      <h2 id="admin-testimonials" className="it-display" style={{ fontSize: 20, fontWeight: 800, marginTop: 34, scrollMarginTop: 90 }}>Testimonials</h2>
      <div className="it-card" style={{ padding: 18, marginTop: 12 }}>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "0 0 10px" }}>
          Only add real quotes with the student's (or parent's) permission, these show publicly on the home page. Ask past students today; three honest lines beat any design tweak.
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          <input className="it-input" placeholder="Student / parent name (e.g. Amira K.)" value={tf.name} onChange={(e) => setTf({ ...tf, name: e.target.value })} />
          <input className="it-input" placeholder="Detail (e.g. GCSE Maths: grade 5 → 8)" value={tf.detail} onChange={(e) => setTf({ ...tf, detail: e.target.value })} />
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
                <span>"{t.quote}" · <strong>{t.name}</strong>{t.detail ? ` (${t.detail})` : ""}</span>
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
            <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>{(m.created || "").slice(0, 16).replace("T", " · ")} · <strong style={{ color: "var(--ink)" }}>{m.name}</strong> {m.email && `(${m.email})`}</div>
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
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [checking, setChecking] = useState(true);

  // A recovery link only signs someone in at AAL1. If the account also has
  // 2FA turned on, Supabase requires AAL2 before it'll let updateUser change
  // the password, so that has to be cleared here first, same as normal login.
  useEffect(() => {
    (async () => {
      const { data: aal } = await supa.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
        const { data: f } = await supa.auth.mfa.listFactors();
        const factor = f?.totp?.[0];
        if (factor) {
          const { data: ch, error: chErr } = await supa.auth.mfa.challenge({ factorId: factor.id });
          if (chErr) { setErr(chErr.message); setChecking(false); return; }
          setChallenge({ factorId: factor.id, challengeId: ch.id });
        }
      }
      setChecking(false);
    })();
  }, []);

  const verifyCode = async () => {
    setBusy(true); setErr("");
    const { error } = await supa.auth.mfa.verify({ factorId: challenge.factorId, challengeId: challenge.challengeId, code: code.trim() });
    setBusy(false);
    if (error) return setErr("Wrong code, check your authenticator app.");
    setChallenge(null);
  };

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
        {checking ? (
          <p style={{ color: "var(--ink-soft)", margin: 0 }}>Checking your account…</p>
        ) : done ? (
          <>
            <h3 className="it-display" style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800 }}>Password updated ✓</h3>
            <p style={{ color: "var(--ink-soft)", margin: "0 0 16px" }}>You can now sign in with your new password.</p>
            <button className="it-btn" onClick={onDone}>Done</button>
          </>
        ) : challenge ? (
          <>
            <h3 className="it-display" style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800 }}>Enter your 2FA code</h3>
            <p style={{ color: "var(--ink-soft)", margin: "0 0 16px", fontSize: 13.5 }}>This account has 2FA on, so confirm it's you before setting a new password.</p>
            <div style={{ display: "grid", gap: 12 }}>
              <input className="it-input" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} />
              <button className="it-btn" onClick={verifyCode} disabled={busy}>{busy ? "Checking…" : "Verify"}</button>
              {err && <p style={{ color: "var(--coral)", fontSize: 13, margin: 0 }}>{err}</p>}
            </div>
          </>
        ) : (
          <>
            <h3 className="it-display" style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800 }}>Set a new password</h3>
            <div style={{ display: "grid", gap: 12 }}>
              <PasswordField placeholder="New password (min 8 characters)" value={pw} onChange={(e) => setPw(e.target.value)} />
              <PasswordField placeholder="Repeat password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
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
  const [store, setStore] = useState({ subscribers: [], bookings: [], seatCounts: {}, seatCountsBySlot: {}, messages: [], meetLinks: {}, testimonials: [], waitlist: [], takenCount: 0, scholarshipApps: [], featuredScholars: [], scholarshipSpotsTaken: 0, scholarshipRecentCount: 0, gcseApps: [], gcseSpotsTaken: 0 });
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState(null);
  const [toast, setToast] = useState(null);
  // Read this synchronously off the URL, not from the "PASSWORD_RECOVERY" auth
  // event: that event fires as soon as Supabase's client is created (module load,
  // before React even mounts), so a listener added later in a useEffect can miss
  // it, and the reset bubble silently never appears.
  const [recovery, setRecovery] = useState(() => window.location.hash.includes("type=recovery"));

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
  useEffect(() => {
    // Live sync: the moment anyone books, cancels, gets confirmed as paid, or a
    // Meet/Classroom link is set, every open tab (parent or tutor) refreshes on
    // its own within a second, no manual "Refresh" click needed.
    let timer = null;
    const debouncedRefresh = () => { clearTimeout(timer); timer = setTimeout(refresh, 400); };
    const channel = supa
      .channel("db-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, debouncedRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "students" }, debouncedRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "meet_links" }, debouncedRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "lesson_notes" }, debouncedRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "waitlist" }, debouncedRefresh)
      .subscribe();
    return () => { clearTimeout(timer); supa.removeChannel(channel); };
  }, []);
  const notify = (t) => { setToast(t); setTimeout(() => setToast(null), 3200); };
  useEffect(() => {
    // Stripe redirects here with ?paid=1 after a successful payment (set that as the Payment Link's
    // "after payment" redirect URL in Stripe), land straight on the booking dashboard instead of the homepage.
    if (new URLSearchParams(window.location.search).get("paid")) {
      notify("Payment received ✓. Here's your booking dashboard.");
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
    // Optimistic UI: show the booking as placed immediately (the slot/list update
    // right away), then reconcile with the real row or roll back if the write fails.
    const tempId = "optimistic-" + Math.random().toString(36).slice(2);
    const optimistic = {
      id: tempId, subscriberId: b.student_id, name: b.student_name, plan: b.plan,
      subject: b.subject, date: b.date, block: b.block, blockLabel: b.block_label,
      created: new Date().toISOString(), attended: null, note: null, topic: null, homework: null, pending: true,
    };
    setStore((st) => ({ ...st, bookings: [...st.bookings, optimistic] }));
    const rollback = () => setStore((st) => ({ ...st, bookings: st.bookings.filter((x) => x.id !== tempId) }));
    try {
      let q = supa.from("bookings").select("id", { count: "exact", head: true }).eq("date", b.date).eq("block", b.block);
      if ((pl.seats || 5) > 1) q = q.eq("subject", b.subject);
      const { count } = await q;
      if ((count || 0) >= (pl.seats || 5)) { rollback(); await refresh(); throw new Error("slot full"); }
      const { data, error } = await supa.from("bookings").insert(b).select();
      if (error) { rollback(); throw new Error(error.message); }
      setStore((st) => ({ ...st, bookings: st.bookings.map((x) => x.id === tempId ? mapBooking(data[0]) : x) }));
      notify("Lesson booked ✓. Your Meet link will appear here");
    } catch (e) {
      rollback();
      throw e;
    }
  };
  const joinWaitlist = async (w) => {
    const { error } = await supa.from("waitlist").insert(w);
    if (error) throw new Error(error.message);
    setStore((st) => ({ ...st, waitlist: [...st.waitlist, { ...w, id: "local-" + Date.now(), created: new Date().toISOString() }] }));
  };
  const removeWaitlistEntry = async (id) => {
    const { error } = await supa.from("waitlist").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setStore((st) => ({ ...st, waitlist: st.waitlist.filter((w) => w.id !== id) }));
  };
  // Cancellation is the trigger, not admin attention: whenever a booking frees up, offer the
  // seat to the earliest-joined waitlister who still has lessons left this period (checked now,
  // not at the time they joined, their allowance may have changed since). If nobody on the
  // list can take it, tell Isham rather than leaving the seat silently empty.
  const promoteWaitlist = async (date, block, blockLabel) => {
    const candidates = [...store.waitlist]
      .filter((w) => w.date === date && w.block === block)
      .sort((a, b) => (a.created || "").localeCompare(b.created || ""));
    for (const cand of candidates) {
      const student = store.subscribers.find((s) => s.id === cand.student_id);
      if (!student || lessonsLeftFor(student, store.bookings) <= 0) continue;
      try {
        await addBooking({ student_id: student.id, student_name: student.name, plan: student.plan, subject: cand.subject, date, block, block_label: blockLabel });
        await removeWaitlistEntry(cand.id);
        notifyServer({ type: "booking", name: student.name, email: cand.email, subject: cand.subject, date, time: blockLabel });
        return true;
      } catch (e) { /* that candidate's slot vanished too, try the next one */ }
    }
    if (candidates.length > 0) {
      const text = `A seat opened up (${blockLabel}, ${date}) but nobody on the waitlist had lessons left this period to take it. Check the Timetable.`;
      notifyServer({ type: "message", name: "Waitlist", email: "", text });
      try { await addMessage({ name: "Waitlist", email: "", text }); } catch (e) {}
    }
    return false;
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
    promoteWaitlist(b.date, b.block, b.blockLabel); // moving them out frees their old slot too
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
    notify("Testimonial added ✓. Now live on the home page");
  };
  const removeTestimonial = async (id) => {
    await supa.from("testimonials").delete().eq("id", id);
    setStore((st) => ({ ...st, testimonials: (st.testimonials || []).filter((t) => t.id !== id) }));
  };
  const addScholarshipApplication = async (a) => {
    const { error } = await supa.from("scholarship_applications").insert(a);
    if (error) throw new Error(error.message);
  };
  const updateScholarshipStatus = async (id, status) => {
    const { error } = await supa.from("scholarship_applications").update({ status }).eq("id", id);
    if (error) throw new Error(error.message);
    setStore((st) => ({ ...st, scholarshipApps: st.scholarshipApps.map((a) => a.id === id ? { ...a, status } : a) }));
    notify(status === "featured" ? "Applicant featured ✓" : status === "accepted" ? "Applicant accepted ✓" : status === "declined" ? "Applicant declined" : "Status updated");
  };
  // Accepting an applicant used to only flip a status label, with nowhere for
  // the student to actually land: no students() row meant Book always said
  // "we couldn't find a plan for you". This gives them the same real
  // dashboard access a paid GCSE/A-level student gets, on the "scholarship"
  // plan, so they can book their Biology/Chemistry sessions straight away.
  const acceptScholarship = async (app) => {
    await updateScholarshipStatus(app.id, "accepted");
    const existing = store.subscribers.find((s) => s.email.toLowerCase() === app.student_email.toLowerCase());
    try {
      if (existing) {
        const { error } = await supa.from("students").update({ plan: "scholarship", paid_until: addMonths(3), cancelled: false }).eq("id", existing.id);
        if (error) throw new Error(error.message);
        setStore((st) => ({ ...st, subscribers: st.subscribers.map((s) => s.id === existing.id ? { ...s, plan: "scholarship", paid_until: addMonths(3), cancelled: false } : s) }));
      } else {
        await addStudentManual({ name: app.student_name, email: app.student_email.toLowerCase(), phone: app.student_phone || null, plan: "scholarship", paid_until: addMonths(3), tutor: "isham" });
      }
    } catch (e) {
      notify("Accepted, but couldn't set up their dashboard access, add them manually from the Students tab");
    }
  };
  const addGCSEApplication = async (a) => {
    const { error } = await supa.from("gcse_applications").insert(a);
    if (error) throw new Error(error.message);
  };
  const updateGCSEStatus = async (id, status) => {
    const { error } = await supa.from("gcse_applications").update({ status }).eq("id", id);
    if (error) throw new Error(error.message);
    setStore((st) => ({ ...st, gcseApps: st.gcseApps.map((a) => a.id === id ? { ...a, status } : a) }));
    notify(status === "accepted" ? "Applicant accepted ✓" : status === "declined" ? "Applicant declined" : "Status updated");
  };
  // Same pattern as acceptScholarship: accepting provisions real dashboard
  // access on the plan the application was for (gcse or gcse3), rather than
  // just flipping a status label. Payment itself is arranged directly with
  // Isham (bank transfer), not through the site, so there's no Stripe step.
  const acceptGCSE = async (app) => {
    await updateGCSEStatus(app.id, "accepted");
    const plan = PLANS[app.plan] || PLANS.gcse;
    const paidUntil = addMonths(plan.months);
    const existing = store.subscribers.find((s) => s.email.toLowerCase() === app.student_email.toLowerCase());
    try {
      if (existing) {
        const { error } = await supa.from("students").update({ plan: plan.id, paid_until: paidUntil, cancelled: false }).eq("id", existing.id);
        if (error) throw new Error(error.message);
        setStore((st) => ({ ...st, subscribers: st.subscribers.map((s) => s.id === existing.id ? { ...s, plan: plan.id, paid_until: paidUntil, cancelled: false } : s) }));
      } else {
        await addStudentManual({ name: app.student_name, email: app.student_email.toLowerCase(), phone: app.student_phone || null, plan: plan.id, paid_until: paidUntil, tutor: "isham" });
      }
    } catch (e) {
      notify("Accepted, but couldn't set up their dashboard access, add them manually from the Students tab");
    }
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

  const nav = [["home", "Home", "home"], ["gcse", "GCSE", "cap"], ["scholarship", "Scholarship", "heart"], ["pricing", "A-level", "star"], ["book", "Book", "calendar"], ["contact", "FAQ & Contact", "mail"]];

  return (
    <div className="it-app">
      <style>{css}</style>
      {recovery && <PasswordRecoveryOverlay onDone={() => setRecovery(false)} />}
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(251,253,253,.92)", backdropFilter: "blur(8px)", borderBottom: "1px solid var(--line)" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => setPage("home")} style={{ display: "flex", alignItems: "center", gap: 9, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <span style={{ width: 30, height: 30, borderRadius: 8, background: "var(--mint)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Icon name="cap" size={17} /></span>
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
          Couldn't reach the booking database. Check your connection and refresh.
        </div>
      )}

      {!loaded ? (
        <Spinner label="Loading…" />
      ) : page === "home" ? (
        <Home go={setPage} taken={store.gcseSpotsTaken || 0} testimonials={store.testimonials || []} />
      ) : page === "pricing" ? (
        <Pricing startCheckout={(id) => setCheckoutPlan(id)} />
      ) : page === "book" ? (
        <Book store={store} go={setPage} addBooking={addBooking} addMessage={addMessage} joinWaitlist={joinWaitlist} removeWaitlistEntry={removeWaitlistEntry} promoteWaitlist={promoteWaitlist} refresh={refresh} />
      ) : page === "contact" ? (
        <Contact addMessage={addMessage} />
      ) : page === "scholarship" ? (
        <ScholarshipLanding store={store} go={setPage} />
      ) : page === "scholarship-apply" ? (
        <ScholarshipApply store={store} addScholarshipApplication={addScholarshipApplication} go={setPage} />
      ) : page === "scholarship-accepted" ? (
        <ScholarshipAccepted go={setPage} />
      ) : page === "gcse" ? (
        <GCSELanding store={store} go={setPage} />
      ) : page === "gcse-apply" ? (
        <GCSEApply store={store} addGCSEApplication={addGCSEApplication} go={setPage} />
      ) : page === "gcse-accepted" ? (
        <GCSEAccepted go={setPage} />
      ) : page === "privacy" ? (
        <Privacy />
      ) : (
        <Admin store={store} saveMeet={saveMeet} saveLessonNote={saveLessonNote} removeSubscriber={removeSubscriber} refresh={refresh} moveBooking={moveBooking} addStudentManual={addStudentManual} updatePaidUntil={updatePaidUntil} addTestimonial={addTestimonial} removeTestimonial={removeTestimonial} removeWaitlistEntry={removeWaitlistEntry} updateScholarshipStatus={updateScholarshipStatus} acceptScholarship={acceptScholarship} updateGCSEStatus={updateGCSEStatus} acceptGCSE={acceptGCSE} go={setPage} />
      )}

      {checkoutPlan && (
        <Checkout planId={checkoutPlan} onCancel={() => setCheckoutPlan(null)}
          onDone={async (s) => { await addStudent(s); }}
          onFinish={() => { setCheckoutPlan(null); setPage("book"); }} />
      )}

      {toast && (
        <div className="it-fade" style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "var(--ink)", color: "#fff", padding: "12px 20px", borderRadius: 12, fontSize: 14.5, zIndex: 60, boxShadow: "0 2px 10px rgba(0,0,0,.15)" }}>
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
            Privacy: we collect names, emails and bookings for every student, plus parent/guardian contact details and the information you choose to share if you apply for GCSE or the scholarship. Never sold or shared. Cancel your plan or request your data be deleted any time from your Book page account settings, or email me. Full details in the{" "}
            <button className="it-navlink" style={{ padding: 0, display: "inline", fontSize: 12, fontWeight: 700 }} onClick={() => setPage("privacy")}>privacy policy</button>.
          </span>
          <button className="it-navlink" style={{ fontSize: 13.5 }} onClick={() => setPage("admin")}>Tutor login</button>
        </div>
      </footer>
    </div>
  );
}
