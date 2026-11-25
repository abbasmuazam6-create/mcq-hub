// js/views/quiz.js
import { $, $$, esc, toast, fmtTime, shuffle } from "../core/dom.js";
import { getQuestionsByNode, getRandomQuestions, getNode, kidsOf } from "../core/store.js";
import { recordAttempt } from "../core/stats.js";
import { db, doc, collection, setDoc, deleteDoc, writeBatch } from "../core/firebase.js";

let session = null;
let timer = null;
const marks = { bm: new Map(), wrong: new Map() };
const letters = "ABCDE";

export default async function ({ arg } = {}) {
  // Parse query from hash: #/quiz?topic=ID&name=NAME or #/quiz?quick=1
  const params = Object.fromEntries(new URLSearchParams(location.hash.split("?")[1] || ""));
  const key = location.hash;
  if (window.__customSession) { session = window.__customSession; window.__customSession = null; session.key = key; }
  else if (!session || session.key !== key) { session = null; await startSession(params); if (session) session.key = key; }
  if (!session) return { html: "", mount() {} };
  const html = renderQuiz();
  return { html, mount: mountQuiz };
}

async function startSession(params) {
  if (params.quick) {
    // Pick any 5 active topics and pull 5 random questions total
    const board = kidsOf(null)[0];
    const classes = board ? kidsOf(board.id) : [];
    const subs = classes.flatMap((c) => kidsOf(c.id));
    const topics = subs.flatMap((s) => kidsOf(s.id));
    const ids = topics.map((t) => t.id);
    const qs = await getRandomQuestions(shuffle(ids), 5);
    if (!qs.length) { toast("No questions found.", "warn"); location.hash = "#/home"; return; }
    session = { mode: "practice", title: "Quick drill", qs: shuffle(qs), answers: {}, idx: 0, startedAt: Date.now(), limitSec: 0 };
    return;
  }

  const topicId = params.topic;
  const name = params.name || getNode(topicId)?.name || "Practice";
  if (!topicId) { location.hash = "#/home"; return; }

  // Cache-first fetch (uses Firestore persistent cache → instant repeat)
  const nd = getNode(topicId);
  const qs = nd && nd.level !== "topic" ? await getRandomQuestions([topicId], 20) : await getQuestionsByNode(topicId, { n: 20 });
  if (!qs.length) { toast("No questions available there yet.", "warn"); location.hash = "#/home"; return; }

  session = { mode: "practice", title: name, qs, answers: {}, idx: 0, startedAt: Date.now(), limitSec: 0 };
}

function renderQuiz() {
  const s = session;
  const q = s.qs[s.idx];
  const ch = s.answers[q.id];
  const shown = ch !== undefined;
  const last = s.idx === s.qs.length - 1;

  const opts = q.options.map((o, i) => {
    let c = "opt";
    if (shown) { if (i === q.correct) c += " correct"; else if (i === ch) c += " wrong"; }
    else if (ch === i) c += " sel";
    return `<button class="${c}" data-opt="${i}" ${shown ? "disabled" : ""}><b>${letters[i]}</b><span>${esc(o)}</span></button>`;
  }).join("");

  return `
    <div class="card">
      <div class="qhead">
        <span class="muted">${esc(s.title)} · Question ${s.idx + 1} of ${s.qs.length}</span>
        <button class="icon ${marks.bm.has(q.id) ? "on" : ""}" data-act="bm" title="Bookmark" aria-label="Bookmark">★</button>
      </div>
      <div class="progress"><i style="width:${((s.idx + (shown ? 1 : 0)) / s.qs.length) * 100}%"></i></div>
      <h3 class="qtext">${esc(q.text)}</h3>
      <div class="opts ${shown ? "shown" : ""}">${opts}</div>
      ${shown ? `<div class="expl ${ch === q.correct ? "ok" : "bad"}">
        <b>${ch === q.correct ? "Correct!" : "Not quite."}</b> Answer: ${letters[q.correct]}.${q.explanation ? " " + esc(q.explanation) : ""}
      </div>` : ""}
      <div class="row between">
        <button class="btn ghost" data-act="finish">End session</button>
        ${last
          ? `<button class="btn" data-act="finish">Finish</button>`
          : `<button class="btn" data-act="next">${!shown ? "Skip" : "Next question"}</button>`}
      </div>
    </div>`;
}

function mountQuiz(root) {
  // Answer clicks — instant feedback, no spinner, no network.
  root.querySelectorAll("[data-opt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = +btn.dataset.opt;
      const q = session.qs[session.idx];
      if (session.answers[q.id] !== undefined) return;
      session.answers[q.id] = i;
      trackAnswer(q, i === q.correct);
      rerender(root);
    });
  });
  root.querySelector("[data-act=next]")?.addEventListener("click", () => {
    if (session.idx < session.qs.length - 1) { session.idx++; rerender(root); }
  });
  root.querySelector("[data-act=finish]")?.addEventListener("click", finish);
  root.querySelector("[data-act=bm]")?.addEventListener("click", () => {
    const q = session.qs[session.idx];
    const ref = doc(db, "users", window.__ctx.user.uid, "bookmarks", q.id);
    if (marks.bm.has(q.id)) { marks.bm.delete(q.id); deleteDoc(ref).catch(() => {}); }
    else { marks.bm.set(q.id, { at: Date.now() }); setDoc(ref, { at: Date.now() }).catch(() => {}); }
    rerender(root);
  });
}

function rerender(root) {
  root.innerHTML = renderQuiz();
  mountQuiz(root);
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