// js/views/quiz.js — Modernized Quiz View with Multi-Level Question Aggregation & Appreciation Bubble
import { $, $$, esc, toast, fmtTime, shuffle } from "../core/dom.js";
import { getQuestionsUnder, getRandomQuestions, getNode, kidsOf } from "../core/store.js";
import { recordAttempt } from "../core/stats.js";
import { db, doc, collection, setDoc, deleteDoc, writeBatch } from "../core/firebase.js";

let session = null;
let timer = null;
const marks = { bm: new Map(), wrong: new Map() };
const letters = "ABCDE";

export default async function ({ arg } = {}) {
  const params = Object.fromEntries(new URLSearchParams(location.hash.split("?")[1] || ""));
  const key = location.hash;
  if (window.__customSession) { 
    session = window.__customSession; 
    window.__customSession = null; 
    session.key = key; 
  } else if (!session || session.key !== key) { 
    session = null; 
    await startSession(params); 
    if (session) session.key = key; 
  }
  if (!session) return { html: "", mount() {} };
  return { html: renderQuiz(), mount: mountQuiz };
}

async function startSession(params) {
  if (params.quick) {
    const board = kidsOf(null)[0];
    const classes = board ? kidsOf(board.id) : [];
    const subs = classes.flatMap((c) => kidsOf(c.id));
    const topics = subs.flatMap((s) => kidsOf(s.id));
    const ids = topics.map((t) => t.id);
    const qs = await getRandomQuestions(shuffle(ids), 20);
    if (!qs.length) { toast("No questions found.", "warn"); location.hash = "#/home"; return; }
    session = { mode: "practice", title: "Quick Drill", qs: shuffle(qs), answers: {}, idx: 0, startedAt: Date.now(), limitSec: 0 };
    return;
  }

  const topicId = params.topic;
  const name = params.name || getNode(topicId)?.name || "Practice";
  if (!topicId) { location.hash = "#/home"; return; }

  // Fetch questions from this node AND all its child levels (chapter + topic levels combined)
  const qs = await getQuestionsUnder(topicId, { n: 25 });
  if (!qs.length) { toast("No questions available there yet.", "warn"); location.hash = "#/home"; return; }

  session = { mode: "practice", title: name, qs: shuffle(qs), answers: {}, idx: 0, startedAt: Date.now(), limitSec: 0 };
}

function renderQuiz() {
  const s = session;
  const q = s.qs[s.idx];
  const ch = s.answers[q.id];
  const shown = ch !== undefined;
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

  return `
    <div class="card quiz-card animate-fade-in">
      <div class="qhead">
        <span class="muted">${esc(s.title)} · Question ${s.idx + 1} of ${s.qs.length}</span>
        <button class="icon ${marks.bm.has(q.id) ? "on" : ""}" data-act="bm" title="Bookmark" aria-label="Bookmark">★</button>
      </div>
      <div class="progress"><i style="width:${((s.idx + (shown ? 1 : 0)) / s.qs.length) * 100}%"></i></div>
      <h3 class="qtext">${esc(q.text)}</h3>
      <div class="opts ${shown ? "shown" : ""}">${opts}</div>
      ${shown ? `<div class="expl ${ch === q.correct ? "ok" : "bad"} animate-slide-up">
        <b>${ch === q.correct ? "Correct! 🎉" : "Not quite. 💡"}</b> Answer: ${letters[q.correct]}.${q.explanation ? " " + esc(q.explanation) : ""}
      </div>` : ""}
      <div class="row between" style="margin-top: 20px;">
        <button class="btn ghost" data-act="finish">End Session</button>
        ${last
          ? `<button class="btn animate-pulse-subtle" data-act="finish">Finish Test</button>`
          : `<button class="btn" data-act="next">${!shown ? "Skip" : "Next Question →"}</button>`}
      </div>
    </div>`;
}

function mountQuiz(root) {
  ensureBubbleStyles();

  root.querySelectorAll("[data-opt]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const i = +btn.dataset.opt;
      const q = session.qs[session.idx];
      if (session.answers[q.id] !== undefined) return;
      
      btn.classList.add("clicked");
      session.answers[q.id] = i;
      trackAnswer(q, i === q.correct);
      
      if (i === q.correct) {
        spawnFlyingBubble(btn);
      }
      
      setTimeout(() => rerender(root), 1100); 
    });
  });

  root.querySelector("[data-act=next]")?.addEventListener("click", () => {
    if (session.idx < session.qs.length - 1) { 
      session.idx++; 
      rerender(root); 
    }
  });
  
  root.querySelectorAll("[data-act=finish]").forEach((btn) => {
    btn.addEventListener("click", finish);
  });

  root.querySelector("[data-act=bm]")?.addEventListener("click", () => {
    const q = session.qs[session.idx];
    const ref = doc(db, "users", window.__ctx.user.uid, "bookmarks", q.id);
    if (marks.bm.has(q.id)) { marks.bm.delete(q.id); deleteDoc(ref).catch(() => {}); }
    else { marks.bm.set(q.id, { at: Date.now() }); setDoc(ref, { at: Date.now() }).catch(() => {}); }
    rerender(root);
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
      position: fixed;
      z-index: 99999;
      pointer-events: none;
      background: linear-gradient(135deg, #10b981, #06b6d4, #6366f1);
      background-size: 200% 200%;
      animation: gradientShift 2s ease infinite, flyAwayBubble 1.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
      color: white;
      padding: 9px 18px;
      border-radius: 30px;
      font-weight: 800;
      font-size: 0.92rem;
      box-shadow: 0 10px 30px rgba(16, 185, 129, 0.45);
      white-space: nowrap;
      letter-spacing: 0.02em;
    }
  `;
  document.head.appendChild(style);
}

function spawnFlyingBubble(btn) {
  const praises = [
    "Brilliant! 🌟",
    "Spot on! 🎯",
    "Genius! ⚡",
    "Nailed it! 🔥",
    "Awesome! ✨",
    "Perfection! 💎"
  ];
  const randomPraise = praises[Math.floor(Math.random() * praises.length)];

  const rect = btn.getBoundingClientRect();
  const bubble = document.createElement("div");
  bubble.className = "flying-correct-bubble";
  bubble.textContent = randomPraise;
  bubble.style.left = `${rect.left + rect.width / 2 - 50}px`;
  bubble.style.top = `${rect.top}px`;
  document.body.appendChild(bubble);
  
  setTimeout(() => bubble.remove(), 1400);
}

function rerender(root) {
  const card = root.querySelector(".quiz-card");
  if (card) {
    card.classList.add("animate-slide-out");
    setTimeout(() => {
      root.innerHTML = renderQuiz();
      mountQuiz(root);
    }, 180);
  } else {
    root.innerHTML = renderQuiz();
    mountQuiz(root);
  }
}

function trackAnswer(q, ok) {
  const ref = doc(db, "users", window.__ctx.user.uid, "wrong", q.id);
  if (!ok) { marks.wrong.set(q.id, { at: Date.now() }); setDoc(ref, { at: Date.now() }).catch(() => {}); }
  else if (marks.wrong.has(q.id)) { marks.wrong.delete(q.id); deleteDoc(ref).catch(() => {}); }
}

async function finish() {
  const s = session;
  if (!s) return;
  let c = 0, w = 0, sk = 0;
  const qs = s.qs.map((q) => {
    const ch = s.answers[q.id];
    if (ch === undefined) sk++; else if (ch === q.correct) c++; else w++;
    return { ...q, chosen: ch === undefined ? -1 : ch };
  });
  const total = qs.length;
  const sum = {
    uid: window.__ctx.user.uid, mode: s.mode, title: s.title, total, correct: c, wrong: w, skipped: sk,
    pct: total ? Math.round((c / total) * 100) : 0,
    durationSec: Math.round((Date.now() - s.startedAt) / 1000), createdAt: Date.now(),
  };
  const ref = doc(collection(db, "attempts"));
  const b = writeBatch(db);
  b.set(ref, sum);
  b.set(doc(db, "attemptDetails", ref.id), { uid: sum.uid, qs });
  try { await b.commit(); } catch (e) { console.warn(e); }
  window.__lastResult = { id: ref.id, ...sum, qs };
  recordAttempt(sum, qs).catch(() => {});
  session = null;
  location.hash = "#/result/" + ref.id;
}