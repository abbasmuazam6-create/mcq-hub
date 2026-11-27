// js/views/quiz.js — Practice mode (instant feedback) + Timed Test mode (countdown, palette, auto-submit)
import { $, $$, esc, toast, fmtTime } from "../core/dom.js";
import { getNode, kidsOf } from "../core/store.js";
import { recordAttempt } from "../core/stats.js";
import { pickQuestions, markSeen } from "../core/pick.js";
import { db, doc, collection, setDoc, deleteDoc, writeBatch } from "../core/firebase.js";

let session = null;
let timer = null;
let finishing = false;
const marks = { bm: new Map(), wrong: new Map() };
const letters = "ABCDE";

export default async function ({ arg } = {}) {
  const params = Object.fromEntries(new URLSearchParams(location.hash.split("?")[1] || ""));
  const key = location.hash;
  if (window.__customSession) {
    session = window.__customSession;
    window.__customSession = null;
    session.key = key;
    session.startedAt = Date.now();            // the clock starts when the test screen opens
  } else if (!session || session.key !== key) {
    stopTimer();
    session = null;
    await startSession(params);
    if (session) session.key = key;
  }
  if (!session) return { html: "", mount() {} };
  return { html: renderQuiz(), mount: (root) => { mountQuiz(root); startTimer(); } };
}

/* ---------------- starting ---------------- */
function announce(info) {
  if (!info) return;
  if (info.repeated && !info.fresh) toast("You've seen every question here - starting a fresh round (oldest first).", "warn");
  else if (info.repeated) toast(`${info.repeated} question(s) repeated - you've covered almost everything in this selection.`, "warn");
}

async function startSession(params) {
  const uid = window.__ctx.user.uid;

  if (params.quick) {
    const boards = kidsOf(null).map((b) => b.id);
    const info = await pickQuestions(boards, 20, { uid });
    if (!info.qs.length) { toast("No questions found.", "warn"); location.hash = "#/home"; return; }
    announce(info);
    session = newSession("practice", "Quick Drill", info.qs, 0);
    return;
  }

  const topicId = params.topic;
  const name = params.name || getNode(topicId)?.name || "Practice";
  if (!topicId) { location.hash = "#/home"; return; }

  // path contains the node itself, so this covers the node AND everything below it
  const info = await pickQuestions([topicId], 25, { uid });
  if (!info.qs.length) { toast("No questions available there yet.", "warn"); location.hash = "#/home"; return; }
  announce(info);
  session = newSession("practice", name, info.qs, 0);
}

function newSession(mode, title, qs, limitSec) {
  return { mode, title, qs, answers: {}, idx: 0, maxIdx: 0, startedAt: Date.now(), limitSec };
}

/* ---------------- timer ---------------- */
const leftSec = () => session.limitSec - Math.floor((Date.now() - session.startedAt) / 1000);

function stopTimer() { clearInterval(timer); timer = null; }

function startTimer() {
  stopTimer();
  window.removeEventListener("hashchange", onLeave);
  window.addEventListener("hashchange", onLeave);
  if (!session?.limitSec) return;
  timer = setInterval(tick, 1000);
  tick();
}

function onLeave() {
  if (!location.hash.startsWith("#/quiz")) { stopTimer(); window.removeEventListener("hashchange", onLeave); }
}

function tick() {
  if (!session || !session.limitSec) { stopTimer(); return; }
  const left = leftSec();
  const el = document.getElementById("qtimer");
  if (el) {
    el.querySelector("b").textContent = fmtTime(left);
    el.classList.toggle("warn", left <= 60 && left > 15);
    el.classList.toggle("crit", left <= 15);
  }
  if (left <= 0) {
    stopTimer();
    toast("Time is up - submitting your test.", "warn");
    finish();
  }
}

/* ---------------- render ---------------- */
function ensureQuizStyles() {
  if (document.getElementById("quiz-extra-style")) return;
  const s = document.createElement("style");
  s.id = "quiz-extra-style";
  s.textContent = `
    .quiz-timer { display:inline-flex; align-items:center; gap:.35rem; padding:.2rem .7rem; border-radius:999px; font-size:.85rem; font-weight:700;
      background:rgba(99,102,241,.12); border:1px solid rgba(99,102,241,.3); font-variant-numeric:tabular-nums; }
    .quiz-timer.warn { background:rgba(245,158,11,.16); border-color:rgba(245,158,11,.5); color:#b45309; }
    .quiz-timer.crit { background:rgba(239,68,68,.16); border-color:rgba(239,68,68,.55); color:#dc2626; animation:qpulse 1s ease-in-out infinite; }
    @keyframes qpulse { 50% { transform:scale(1.06); } }
    .qpalette { display:flex; flex-wrap:wrap; gap:.4rem; margin-top:1rem; }
    .qpalette button { width:2.1rem; height:2.1rem; border-radius:.6rem; font-weight:700; font-size:.78rem; cursor:pointer;
      border:1px solid rgba(148,163,184,.4); background:transparent; color:inherit; }
    .qpalette button.done { background:rgba(16,185,129,.16); border-color:rgba(16,185,129,.55); }
    .qpalette button.cur { outline:2px solid #6366f1; outline-offset:1px; }
  `;
  document.head.appendChild(s);
}

function renderQuiz() {
  ensureQuizStyles();
  const s = session;
  const q = s.qs[s.idx];
  const test = s.mode === "test";
  s.maxIdx = Math.max(s.maxIdx || 0, s.idx);
  const ch = s.answers[q.id];
  const shown = !test && ch !== undefined;
  const last = s.idx === s.qs.length - 1;

  const opts = q.options.map((o, i) => {
    let c = "opt";
    let animClass = "";
    if (shown) {
      if (i === q.correct) { c += " correct"; animClass = "animate-correct-pop"; }
      else if (i === ch) { c += " wrong"; animClass = "animate-wrong-shake"; }
    } else if (ch === i) {
      c += " sel";
    }
    return `<button class="${c} ${animClass}" data-opt="${i}" ${shown ? "disabled" : ""}><b>${letters[i]}</b><span>${esc(o)}</span></button>`;
  }).join("");

  const answered = Object.keys(s.answers).length;
  const palette = test ? `
    <div class="card" style="margin-top:1rem">
      <div class="muted" style="font-size:.78rem;margin-bottom:.25rem">${answered} of ${s.qs.length} answered</div>
      <div class="qpalette">${s.qs.map((x, i) =>
        `<button data-goto="${i}" class="${s.answers[x.id] !== undefined ? "done" : ""} ${i === s.idx ? "cur" : ""}">${i + 1}</button>`).join("")}</div>
    </div>` : "";

  const footer = test
    ? `<button class="btn ghost" data-act="prev" ${s.idx === 0 ? "disabled" : ""}>← Previous</button>
       ${last
         ? `<button class="btn" data-act="submit">Submit Test</button>`
         : `<button class="btn" data-act="next">Next →</button>`}`
    : `<button class="btn ghost" data-act="finish">End Session</button>
       ${last
         ? `<button class="btn animate-pulse-subtle" data-act="finish">Finish Test</button>`
         : `<button class="btn" data-act="next">${!shown ? "Skip" : "Next Question →"}</button>`}`;

  return `
    <div class="card quiz-card animate-fade-in">
      <div class="qhead" style="gap:.6rem;flex-wrap:wrap">
        <span class="muted">${esc(s.title)} · Question ${s.idx + 1} of ${s.qs.length}</span>
        ${s.limitSec ? `<span class="quiz-timer" id="qtimer">⏱ <b>${fmtTime(Math.max(0, leftSec()))}</b></span>` : ""}
        <button class="icon ${marks.bm.has(q.id) ? "on" : ""}" data-act="bm" title="Bookmark" aria-label="Bookmark">★</button>
      </div>
      <div class="progress"><i style="width:${((s.idx + (shown || (test && ch !== undefined) ? 1 : 0)) / s.qs.length) * 100}%"></i></div>
      <h3 class="qtext" style="white-space:pre-line">${esc(q.text)}</h3>
      <div class="opts ${shown ? "shown" : ""}">${opts}</div>
      ${shown ? `<div class="expl ${ch === q.correct ? "ok" : "bad"} animate-slide-up">
        <b>${ch === q.correct ? "Correct! 🎉" : "Not quite. 💡"}</b> Answer: ${letters[q.correct]}.${q.explanation ? " " + esc(q.explanation) : ""}
      </div>` : ""}
      <div class="row between" style="margin-top: 20px;">${footer}</div>
    </div>${palette}`;
}

function mountQuiz(root) {
  ensureBubbleStyles();
  const test = session.mode === "test";

  root.querySelectorAll("[data-opt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = +btn.dataset.opt;
      const q = session.qs[session.idx];

      if (test) {
        // timed test: no feedback, tap again to clear, change freely until you submit
        if (session.answers[q.id] === i) delete session.answers[q.id];
        else session.answers[q.id] = i;
        rerender(root, true);
        return;
      }

      if (session.answers[q.id] !== undefined) return;
      btn.classList.add("clicked");
      session.answers[q.id] = i;
      trackAnswer(q, i === q.correct);
      if (i === q.correct) spawnFlyingBubble(btn);
      setTimeout(() => rerender(root), 1100);
    });
  });

  root.querySelector("[data-act=next]")?.addEventListener("click", () => {
    if (session.idx < session.qs.length - 1) { session.idx++; rerender(root, test); }
  });
  root.querySelector("[data-act=prev]")?.addEventListener("click", () => {
    if (session.idx > 0) { session.idx--; rerender(root, true); }
  });
  root.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => {
    session.idx = +b.dataset.goto; rerender(root, true);
  }));
  root.querySelectorAll("[data-act=finish]").forEach((btn) => btn.addEventListener("click", finish));
  root.querySelector("[data-act=submit]")?.addEventListener("click", () => {
    const open = session.qs.filter((q) => session.answers[q.id] === undefined).length;
    if (open && !confirm(`${open} question(s) are unanswered. Submit anyway?`)) return;
    finish();
  });

  root.querySelector("[data-act=bm]")?.addEventListener("click", () => {
    const q = session.qs[session.idx];
    const ref = doc(db, "users", window.__ctx.user.uid, "bookmarks", q.id);
    if (marks.bm.has(q.id)) { marks.bm.delete(q.id); deleteDoc(ref).catch(() => {}); }
    else { marks.bm.set(q.id, { at: Date.now() }); setDoc(ref, { at: Date.now() }).catch(() => {}); }
    rerender(root, true);
  });
}

function ensureBubbleStyles() {
  if (document.getElementById("flying-bubble-style")) return;
  const style = document.createElement("style");
  style.id = "flying-bubble-style";
  style.textContent = `
    @keyframes flyAwayBubble {
      0% { transform: translateY(0) scale(0.5) rotate(-6deg); opacity: 0; }
      15% { transform: translateY(-25px) scale(1.12) rotate(4deg); opacity: 1; }
      60% { transform: translateY(-90px) scale(1) rotate(0deg); opacity: 1; }
      100% { transform: translateY(-150px) scale(0.95) rotate(6deg); opacity: 0; }
    }
    @keyframes gradientShift {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    .flying-correct-bubble {
      position: fixed; z-index: 99999; pointer-events: none;
      background: linear-gradient(135deg, #10b981, #06b6d4, #6366f1); background-size: 200% 200%;
      animation: gradientShift 2s ease infinite, flyAwayBubble 1.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
      color: white; padding: 9px 18px; border-radius: 30px; font-weight: 800; font-size: 0.92rem;
      box-shadow: 0 10px 30px rgba(16, 185, 129, 0.45); white-space: nowrap; letter-spacing: 0.02em;
    }
  `;
  document.head.appendChild(style);
}

function spawnFlyingBubble(btn) {
  const praises = ["Brilliant! 🌟", "Spot on! 🎯", "Genius! ⚡", "Nailed it! 🔥", "Awesome! ✨", "Perfection! 💎"];
  const rect = btn.getBoundingClientRect();
  const bubble = document.createElement("div");
  bubble.className = "flying-correct-bubble";
  bubble.textContent = praises[Math.floor(Math.random() * praises.length)];
  bubble.style.left = `${rect.left + rect.width / 2 - 50}px`;
  bubble.style.top = `${rect.top}px`;
  document.body.appendChild(bubble);
  setTimeout(() => bubble.remove(), 1400);
}

function rerender(root, instant = false) {
  if (!session) return;
  const paint = () => { root.innerHTML = renderQuiz(); mountQuiz(root); tick(); };
  const card = root.querySelector(".quiz-card");
  if (card && !instant) {
    card.classList.add("animate-slide-out");
    setTimeout(() => { if (session) paint(); }, 180);
  } else paint();
}

function snapOf(q) {
  return { text: q.text, options: q.options, correct: q.correct, explanation: q.explanation || "", topicId: q.topicId || "", at: Date.now() };
}

function trackAnswer(q, ok) {
  const ref = doc(db, "users", window.__ctx.user.uid, "wrong", q.id);
  if (!ok) { marks.wrong.set(q.id, { at: Date.now() }); setDoc(ref, snapOf(q)).catch(() => {}); }
  else if (marks.wrong.has(q.id)) { marks.wrong.delete(q.id); deleteDoc(ref).catch(() => {}); }
}

/* ---------------- finish ---------------- */
async function finish() {
  const s = session;
  if (!s || finishing) return;
  finishing = true;
  stopTimer();
  try {
    let c = 0, w = 0, sk = 0;
    const qs = s.qs.map((q) => {
      const ch = s.answers[q.id];
      if (ch === undefined) sk++; else if (ch === q.correct) c++; else w++;
      return { ...q, chosen: ch === undefined ? -1 : ch };
    });
    const total = qs.length;
    const uid = window.__ctx.user.uid;
    const sum = {
      uid, mode: s.mode, title: s.title, total, correct: c, wrong: w, skipped: sk,
      pct: total ? Math.round((c / total) * 100) : 0,
      durationSec: Math.round((Date.now() - s.startedAt) / 1000),
      limitSec: s.limitSec || 0,
      createdAt: Date.now(),
    };
    const ref = doc(collection(db, "attempts"));
    const b = writeBatch(db);
    b.set(ref, sum);
    b.set(doc(db, "attemptDetails", ref.id), { uid, qs });
    try { await b.commit(); } catch (e) { console.warn(e); toast("Result could not be saved: " + e.message, "bad"); }

    // timed tests reveal answers only now, so feed the Mistakes Bank at the end
    if (s.mode === "test") qs.forEach((q) => { if (q.chosen >= 0) trackAnswer(q, q.chosen === q.correct); });

    // remember what the student has been shown, so the next test uses different questions
    const shownQs = s.mode === "test" ? s.qs : s.qs.slice(0, (s.maxIdx || 0) + 1);
    markSeen(uid, shownQs.map((q) => q.id)).catch(() => {});

    window.__lastResult = { id: ref.id, ...sum, qs };
    recordAttempt(sum, qs).catch(() => {});
    session = null;
    location.hash = "#/result/" + ref.id;
  } finally {
    finishing = false;
  }
}