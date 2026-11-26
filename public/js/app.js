import {
  db, collection, doc, getDoc, getDocs, setDoc, deleteDoc, writeBatch,
  query, where, orderBy, limit,
} from "./firebase.js";
import {
  $, $$, esc, toast, shuffle, fmtTime, fmtDate,
  requireUser, getSyllabus, buildIndex, logout,
} from "./common.js";

const view = $("#view");
const letters = "ABCDE";
let ctx, IDX;
let session = null;
let timer = null;
let lastResult = null;
let currentResult = null;
const marks = { bm: new Map(), wrong: new Map() };
let marksReady = Promise.resolve();

// Crisp vector icons for UI boards, navigation, and feedback states
const ICONS = {
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  custom: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
  leaderboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
  weak: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 7-8.5 8.5-5-5L2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
  history: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  bookmarks: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  wrong: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  board: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10M6 10h10"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`
};

const NAV_DEF = [
  { r: "home", l: "Dashboard", i: ICONS.home, c: "#6366f1" },
  { r: "custom", l: "Custom Test", i: ICONS.custom, c: "#ec4899" },
  { r: "history", l: "History", i: ICONS.history, c: "#3b82f6" },
  { r: "bookmarks", l: "Bookmarks", i: ICONS.bookmarks, c: "#8b5cf6" },
  { r: "wrong", l: "Mistakes Bank", i: ICONS.wrong, c: "#ef4444" },
];

init();

async function init() {
  ctx = await requireUser();
  $("#who").textContent = ctx.profile.name || ctx.user.email;
  if (["admin", "teacher"].includes(ctx.profile.role)) {
    const adminLink = $("#adminLink") || document.querySelector("[data-admin]");
    if (adminLink) adminLink.hidden = false;
  }
  
  const logoutBtn = $("#logout") || document.querySelector("[data-logout]");
  if (logoutBtn) logoutBtn.onclick = logout;

  initThemeToggle();
  
  try {
    IDX = buildIndex(await getSyllabus());
  } catch (e) {
    view.innerHTML = `<div class="card error-shake">Could not load syllabus: ${esc(e.message)}</div>`;
    return;
  }
  marksReady = loadMarks();
  window.addEventListener("hashchange", route);
  view.addEventListener("click", onClick);
  route();
}

function initThemeToggle() {
  const isDark = localStorage.getItem("theme") === "dark" || (!localStorage.getItem("theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (isDark) document.documentElement.classList.add("dark");

  $$(".theme-toggle-btn").forEach((btn) => {
    btn.innerHTML = document.documentElement.classList.contains("dark") ? ICONS.sun : ICONS.moon;
    btn.onclick = () => {
      const darkActive = document.documentElement.classList.toggle("dark");
      localStorage.setItem("theme", darkActive ? "dark" : "light");
      $$(".theme-toggle-btn").forEach((b) => (b.innerHTML = darkActive ? ICONS.sun : ICONS.moon));
    };
  });
}

async function loadMarks() {
  try {
    const uid = ctx.user.uid;
    const [b, w] = await Promise.all([
      getDocs(query(collection(db, "users", uid, "bookmarks"), limit(300))),
      getDocs(query(collection(db, "users", uid, "wrong"), limit(300))),
    ]);
    b.forEach((d) => marks.bm.set(d.id, d.data()));
    w.forEach((d) => marks.wrong.set(d.id, d.data()));
  } catch (e) { console.warn("marks", e); }
}

/* ---------------- router ---------------- */
function route() {
  clearInterval(timer);
  const [, name = "home", arg] = location.hash.replace(/^#/, "").split("/");
  $$("#nav a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#/" + name));
  
  const pages = {
    home: viewHome, custom: viewCustom, history: viewHistory,
    bookmarks: viewBookmarks, wrong: viewWrong, quiz: viewQuiz, result: viewResult,
  };
  
  triggerViewAnimation();
  (pages[name] || viewHome)(arg);
}

function triggerViewAnimation() {
  view.classList.remove("view-enter");
  void view.offsetWidth;
  view.classList.add("view-enter");
}

function onClick(e) {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (fn) fn(el, e);
}

const kidsOf = (id) => IDX.kids.get(id ?? null) || [];

/* ---------------- browse ---------------- */
function viewHome() {
  const st = JSON.parse(localStorage.getItem("sel") || "{}");
  if (!kidsOf(null).length) {
    view.innerHTML = `<div class="card center"><h2>No content yet</h2><p class="muted">The syllabus has not been added. Please check back soon.</p></div>`;
    return;
  }
  
  view.innerHTML = `
    <!-- Wide Welcome Banner -->
    <div class="welcome-banner">
      <h1>Welcome back, ${esc(ctx.profile.name || "Student")}! 👋</h1>
      <p>Select your board, class, and subject below to start an interactive practice session or challenge yourself.</p>
    </div>

    <div class="card interactive-board-card">
      <div class="board-header">
        <div class="board-icon-wrap">${ICONS.board}</div>
        <h2>Browse &amp; Practice Board Syllabus</h2>
      </div>
      <div class="grid4">
        <label>Board<select id="sBoard"></select></label>
        <label>Class<select id="sClass"></select></label>
        <label>Subject<select id="sSub"></select></label>
        <label>Questions / Session
          <select id="sCount">${[10, 20, 30, 50].map((n) => `<option ${n === (st.n || 20) ? "selected" : ""}>${n}</option>`).join("")}</select>
        </label>
      </div>
    </div>
    <div id="chapters"></div>`;
    
  const sBoard = $("#sBoard"), sClass = $("#sClass"), sSub = $("#sSub");
  const fill = (sel, nodes, want) => {
    sel.innerHTML = nodes.map((n) => `<option value="${n.id}">${esc(n.name)}</option>`).join("");
    sel.value = nodes.some((n) => n.id === want) ? want : (nodes[0]?.id ?? "");
  };
  const chain = (from, want = {}) => {
    if (from <= 0) fill(sBoard, kidsOf(null), want.board);
    if (from <= 1) fill(sClass, kidsOf(sBoard.value), want.class);
    if (from <= 2) fill(sSub, kidsOf(sClass.value), want.subject);
    drawChapters(sSub.value);
    localStorage.setItem("sel", JSON.stringify({
      board: sBoard.value, class: sClass.value, subject: sSub.value, n: +$("#sCount").value,
    }));
  };
  sBoard.onchange = () => chain(1);
  sClass.onchange = () => chain(2);
  sSub.onchange = () => chain(3);
  $("#sCount").onchange = () => chain(3);
  chain(0, st);
}

function drawChapters(subjectId) {
  const chapters = kidsOf(subjectId);
  const box = $("#chapters");
  if (!chapters.length) {
    box.innerHTML = `<div class="card center muted">No chapters available for this subject yet.</div>`;
    return;
  }
  box.innerHTML = chapters.map((c) => {
    const topics = kidsOf(c.id);
    const total = topics.reduce((s, t) => s + (t.qCount || 0), 0);
    return `<details class="chapter-details">
      <summary><span class="chapter-title">${esc(c.name)}</span> <small class="chapter-meta">${topics.length} topics · ${total} Qs</small></summary>
      <div class="chapter-content">
        ${topics.map((t) => `<div class="trow">
            <span>${esc(t.name)}</span><small class="q-badge">${t.qCount || 0} Qs</small>
            <button class="btn sm" data-act="practice" data-id="${t.id}" data-name="${esc(t.name)}" ${t.qCount ? "" : "disabled"}>Practice</button>
          </div>`).join("") || `<div class="muted" style="padding:8px">No topics listed yet.</div>`}
        ${total ? `<div class="trow chapter-practice-row"><span><b>Practice Whole Chapter</b></span><small>${total} Qs</small>
          <button class="btn sm ghost" data-act="practice" data-id="${c.id}" data-name="${esc(c.name)}">Start Chapter</button></div>` : ""}
      </div>
    </details>`;
  }).join("");
}

/* ---------------- fetching questions ---------------- */
async function fetchRandom(nodeIds, n) {
  const ids = nodeIds.slice(0, 30);
  const base = [where("path", "array-contains-any", ids), where("status", "==", "active")];
  const r = Math.random();
  const col = collection(db, "questions");
  let docs = (await getDocs(query(col, ...base, where("rand", ">=", r), orderBy("rand"), limit(n)))).docs;
  if (docs.length < n) {
    const more = await getDocs(query(col, ...base, where("rand", "<", r), orderBy("rand"), limit(n - docs.length)));
    docs = docs.concat(more.docs);
  }
  return shuffle(docs.map((d) => {
    const x = d.data();
    return {
      id: d.id, text: x.text, options: x.options, correct: x.correct,
      explanation: x.explanation || "", topicId: x.topicId || "",
    };
  }));
}

async function startSession({ mode, title, ids, n, minutes = 0 }) {
  view.innerHTML = `<div class="card center">Preparing your interactive questions…</div>`;
  try {
    const qs = await fetchRandom(ids, n);
    if (!qs.length) {
      toast("No questions available for this selection yet.", "warn");
      route();
      return;
    }
    begin(mode, title, qs, minutes);
  } catch (e) {
    console.error(e);
    toast(e.message.includes("index") ? "Firestore index missing – please configure indexes." : e.message, "bad");
    route();
  }
}

function begin(mode, title, qs, minutes = 0) {
  session = { mode, title, qs, answers: {}, idx: 0, startedAt: Date.now(), limitSec: minutes * 60 };
  if (location.hash === "#/quiz") route(); else location.hash = "#/quiz";
}

/* ---------------- quiz ---------------- */
function viewQuiz() {
  if (!session) { location.hash = "#/home"; return; }
  renderQuiz();
  if (session.limitSec) { timer = setInterval(tick, 1000); tick(); }
}

function leftSec() {
  return session.limitSec - Math.floor((Date.now() - session.startedAt) / 1000);
}
function paintTimer() {
  const t = $("#timer");
  if (t && session) t.textContent = fmtTime(leftSec());
}
function tick() {
  if (!session) return;
  paintTimer();
  if (leftSec() <= 0) {
    clearInterval(timer);
    toast("Time is up – auto-submitting your test.", "warn");
    finish();
  }
}

function renderQuiz() {
  const s = session, q = s.qs[s.idx], ch = s.answers[q.id];
  const practice = s.mode === "practice";
  const shown = practice && ch !== undefined;
  const last = s.idx === s.qs.length - 1;
  const opts = q.options.map((o, i) => {
    let c = "opt";
    if (shown) { if (i === q.correct) c += " correct"; else if (i === ch) c += " wrong"; }
    else if (ch === i) c += " sel";
    return `<button class="${c}" data-act="opt" data-i="${i}" ${shown ? "disabled" : ""}><b>${letters[i]}</b><span>${esc(o)}</span></button>`;
  }).join("");
  const palette = practice ? "" : `<div class="card"><div class="palette">${s.qs.map((x, i) =>
    `<button data-act="goto" data-i="${i}" class="${s.answers[x.id] !== undefined ? "done" : ""} ${i === s.idx ? "cur" : ""}">${i + 1}</button>`).join("")}</div></div>`;
  view.innerHTML = `
    <div class="card quiz-card">
      <div class="qhead">
        <span class="muted">${esc(s.title)} · Question ${s.idx + 1} of ${s.qs.length}</span>
        <span>${s.limitSec ? `⏱ <b id="timer"></b>` : ""}</span>
        <button class="icon ${marks.bm.has(q.id) ? "on" : ""}" data-act="bm" title="Bookmark Question">★</button>
      </div>
      <div class="progress"><i style="width:${((s.idx + 1) / s.qs.length) * 100}%"></i></div>
      <h3 class="qtext">${esc(q.text)}</h3>
      <div class="opts">${opts}</div>
      ${shown ? `<div class="expl ${ch === q.correct ? "ok" : "bad"}"><b>${ch === q.correct ? "Correct!" : "Incorrect."}</b> Correct Answer: ${letters[q.correct]}.${q.explanation ? " " + esc(q.explanation) : ""}</div>` : ""}
      <div class="row between" style="margin-top:20px;">
        ${practice
          ? `<button class="btn ghost" data-act="finish">End session</button>`
          : `<button class="btn ghost" data-act="prev" ${s.idx === 0 ? "disabled" : ""}>Previous</button>`}
        ${last
          ? (practice ? `<button class="btn" data-act="finish">Finish Practice</button>` : `<button class="btn" data-act="submit">Submit Test</button>`)
          : `<button class="btn" data-act="next">${practice && !shown ? "Skip" : "Next Question"}</button>`}
      </div>
    </div>${palette}`;
  paintTimer();
}

const snap = (q) => ({
  text: q.text, options: q.options, correct: q.correct,
  explanation: q.explanation || "", topicId: q.topicId || "", at: Date.now(),
});

function trackAnswer(q, ok) {
  const ref = doc(db, "users", ctx.user.uid, "wrong", q.id);
  if (!ok) {
    marks.wrong.set(q.id, snap(q));
    setDoc(ref, snap(q)).catch(console.warn);
  } else if (marks.wrong.has(q.id)) {
    marks.wrong.delete(q.id);
    deleteDoc(ref).catch(console.warn);
  }
}

async function finish() {
  clearInterval(timer);
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
    uid: ctx.user.uid, mode: s.mode, title: s.title, total, correct: c, wrong: w, skipped: sk,
    pct: total ? Math.round((c / total) * 100) : 0,
    durationSec: Math.round((Date.now() - s.startedAt) / 1000), createdAt: Date.now(),
  };
  const ref = doc(collection(db, "attempts"));
  lastResult = { id: ref.id, ...sum, qs };
  session = null;
  location.hash = "#/result/" + ref.id;
  try {
    const b = writeBatch(db);
    b.set(ref, sum);
    b.set(doc(db, "attemptDetails", ref.id), { uid: ctx.user.uid, qs });
    await b.commit();
  } catch (e) {
    toast("Result could not be saved: " + e.message, "bad");
  }
}

const actions = {
  practice(el) {
    startSession({ mode: "practice", title: el.dataset.name, ids: [el.dataset.id], n: +($("#sCount")?.value || 20) });
  },
  opt(el) {
    const s = session, q = s.qs[s.idx], i = +el.dataset.i;
    if (s.mode === "practice") {
      if (s.answers[q.id] !== undefined) return;
      s.answers[q.id] = i;
      trackAnswer(q, i === q.correct);
    } else if (s.answers[q.id] === i) {
      delete s.answers[q.id];
    } else {
      s.answers[q.id] = i;
    }
    renderQuiz();
  },
  next() { if (session.idx < session.qs.length - 1) { session.idx++; renderQuiz(); } },
  prev() { if (session.idx > 0) { session.idx--; renderQuiz(); } },
  goto(el) { session.idx = +el.dataset.i; renderQuiz(); },
  finish() { finish(); },
  submit() {
    const open = session.qs.filter((q) => session.answers[q.id] === undefined).length;
    if (open && !confirm(`${open} question(s) are unanswered. Submit anyway?`)) return;
    finish();
  },
  bm() {
    const q = session.qs[session.idx];
    const ref = doc(db, "users", ctx.user.uid, "bookmarks", q.id);
    if (marks.bm.has(q.id)) { marks.bm.delete(q.id); deleteDoc(ref).catch(console.warn); }
    else { marks.bm.set(q.id, snap(q)); setDoc(ref, snap(q)).catch(console.warn); }
    renderQuiz();
  },
  startCustom() {
    const ids = $$(".pick:checked").map((x) => x.value);
    if (!ids.length) return toast("Select at least one subject, chapter or topic.", "warn");
    if (ids.length > 30) return toast("Please select at most 30 items.", "warn");
    const mode = $("input[name=mode]:checked").value;
    const n = Math.min(100, Math.max(5, +$("#cn").value || 20));
    const minutes = mode === "test" ? Math.max(1, +$("#cm").value || n) : 0;
    startSession({ mode, title: mode === "test" ? "Custom test" : "Custom practice", ids, n, minutes });
  },
  rfilter(el) {
    $$("[data-act=rfilter]").forEach((b) => b.classList.toggle("on", b === el));
    drawReview(el.dataset.f);
  },
  openAttempt(el) { location.hash = "#/result/" + el.dataset.id; },
  practiceMarks(el) {
    const src = el.dataset.src === "bm" ? marks.bm : marks.wrong;
    const list = [...src].map(([id, x]) => ({ id, ...x }));
    if (!list.length) return;
    begin("practice", el.dataset.src === "bm" ? "Bookmarked Questions" : "Mistakes Review", shuffle(list).slice(0, 30));
  },
  removeMark(el) {
    const src = el.dataset.src === "bm" ? marks.bm : marks.wrong;
    const coll = el.dataset.src === "bm" ? "bookmarks" : "wrong";
    src.delete(el.dataset.id);
    deleteDoc(doc(db, "users", ctx.user.uid, coll, el.dataset.id)).catch(console.warn);
    route();
  },
};

/* ---------------- results / review ---------------- */
async function viewResult(id) {
  if (lastResult && lastResult.id === id) { renderResult(lastResult); return; }
  view.innerHTML = `<div class="card center">Loading result summary…</div>`;
  try {
    const [a, d] = await Promise.all([getDoc(doc(db, "attempts", id)), getDoc(doc(db, "attemptDetails", id))]);
    if (!a.exists() || !d.exists()) { view.innerHTML = `<div class="card">Result record not found.</div>`; return; }
    renderResult({ id, ...a.data(), qs: d.data().qs });
  } catch (e) {
    view.innerHTML = `<div class="card">Could not load result: ${esc(e.message)}</div>`;
  }
}

function renderResult(r) {
  currentResult = r;
  view.innerHTML = `
    <div class="card center result-summary-card">
      <h2>${esc(r.title)}</h2>
      <div class="score ${r.pct >= 50 ? "ok" : "bad"}">${r.pct}%</div>
      <p class="muted">${r.correct} correct · ${r.wrong} wrong · ${r.skipped} skipped · Time taken: ${fmtTime(r.durationSec)}</p>
      <div class="row" style="justify-content:center; margin-top: 16px;">
        <a class="btn" href="#/home">Practice More</a>
        <a class="btn ghost" href="#/custom">New Custom Test</a>
      </div>
    </div>
    <div class="tabs">
      <button data-act="rfilter" data-f="all" class="on">All (${r.total})</button>
      <button data-act="rfilter" data-f="wrong">Wrong (${r.wrong})</button>
      <button data-act="rfilter" data-f="skipped">Skipped (${r.skipped})</button>
    </div>
    <div class="card" id="rlist"></div>`;
  drawReview("all");
}

function drawReview(f) {
  const list = currentResult.qs.map((q, i) => ({ q, i })).filter(({ q }) =>
    f === "all" || (f === "wrong" && q.chosen >= 0 && q.chosen !== q.correct) || (f === "skipped" && q.chosen < 0));
  $("#rlist").innerHTML = list.map(({ q, i }) => `
    <div class="rq">
      <div><b>Q${i + 1}.</b> ${esc(q.text)}</div>
      <div class="opts" style="margin-top:8px">
        ${q.options.map((o, k) => `<div class="opt ${k === q.correct ? "correct" : k === q.chosen ? "wrong" : ""}"><b>${letters[k]}</b><span>${esc(o)}</span></div>`).join("")}
      </div>
      ${q.explanation ? `<div class="expl ${q.chosen === q.correct ? "ok" : "bad"}">${esc(q.explanation)}</div>` : ""}
    </div>`).join("") || `<p class="muted center">No questions match this filter.</p>`;
}

/* ---------------- history ---------------- */
async function viewHistory() {
  view.innerHTML = `<div class="card center">Loading history…</div>`;
  try {
    const snapq = await getDocs(query(collection(db, "attempts"),
      where("uid", "==", ctx.user.uid), orderBy("createdAt", "desc"), limit(30)));
    const rows = snapq.docs.map((d) => ({ id: d.id, ...d.data() }));
    view.innerHTML = `<div class="card"><h2>Your Practice History</h2>
      ${rows.length ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Test Title</th><th>Score</th><th>Action</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td>${fmtDate(r.createdAt)}</td><td>${esc(r.title)} <span class="badge">${r.mode}</span></td>
          <td><b>${r.pct}%</b> <small>(${r.correct}/${r.total})</small></td>
          <td><button class="btn sm ghost" data-act="openAttempt" data-id="${r.id}">Review</button></td></tr>`).join("")}
      </tbody></table></div>` : `<p class="muted center">No previous attempts recorded yet. Start practicing!</p>`}</div>`;
  } catch (e) {
    view.innerHTML = `<div class="card">${esc(e.message.includes("index") ? "Firestore index building or missing – deploy indexes." : e.message)}</div>`;
  }
}

/* ---------------- bookmarks & mistakes ---------------- */
async function viewBookmarks() { await marksReady; marksPage("bm", "Bookmarked Questions", marks.bm); }
async function viewWrong() { await marksReady; marksPage("wrong", "Mistakes Revision Bank", marks.wrong); }

function marksPage(src, title, map) {
  const list = [...map].map(([id, x]) => ({ id, ...x })).sort((a, b) => (b.at || 0) - (a.at || 0));
  view.innerHTML = `<div class="card"><div class="row between" style="margin-top:0"><h2 style="margin:0">${title} (${list.length})</h2>
    ${list.length ? `<button class="btn" data-act="practiceMarks" data-src="${src}">Practice These</button>` : ""}</div>
    ${list.map((q) => `<div class="rq">
      <div>${esc(q.text)}</div>
      <div class="muted" style="margin-top:4px">Correct Answer: <b>${letters[q.correct]}. ${esc(q.options[q.correct])}</b></div>
      ${q.explanation ? `<div class="muted" style="margin-top:4px">${esc(q.explanation)}</div>` : ""}
      <button class="btn sm ghost" style="margin-top:8px" data-act="removeMark" data-src="${src}" data-id="${q.id}">Remove</button>
    </div>`).join("") || `<p class="muted center" style="margin-top:20px;">Nothing saved here yet.</p>`}</div>`;
}

/* ---------------- custom test builder ---------------- */
function viewCustom() {
  const walk = (n) => {
    const ch = kidsOf(n.id);
    const pick = ["subject", "chapter", "topic"].includes(n.level);
    const label = `${pick ? `<input type="checkbox" class="pick" value="${n.id}">` : ""}${esc(n.name)}${n.level === "topic" ? ` <small class="q-badge">${n.qCount || 0} Qs</small>` : ""}`;
    return ch.length
      ? `<details class="chapter-details"><summary>${label}</summary><div class="chapter-content">${ch.map(walk).join("")}</div></details>`
      : `<div class="leaf trow">${label}</div>`;
  };
  view.innerHTML = `
    <div class="card"><h2>Build a Custom Test</h2>
      <p class="muted">Check any subjects, chapters or specific topics below. Questions will be picked randomly from your selections.</p>
      <div class="custom-tree-container" style="margin-top:16px;">${kidsOf(null).map(walk).join("") || `<p class="muted">No content available.</p>`}</div>
    </div>
    <div class="card">
      <div class="grid4">
        <label>Number of Questions<input type="number" id="cn" min="5" max="100" value="20"></label>
        <label>Time Limit (minutes, timed test)<input type="number" id="cm" min="1" max="300" value="20"></label>
      </div>
      <div class="row" style="margin:16px 0">
        <label style="display:flex;align-items:center;gap:8px;"><input type="radio" name="mode" value="practice" checked> Practice Mode (instant answers)</label>
        <label style="display:flex;align-items:center;gap:8px;"><input type="radio" name="mode" value="test"> Timed Test Mode (reveals answers at end)</label>
      </div>
      <button class="btn" data-act="startCustom">Start Custom Session</button>
    </div>`;
}