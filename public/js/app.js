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
let session = null;          // the quiz currently in progress
let timer = null;
let lastResult = null;       // result of the attempt just finished (avoids a re-read)
let currentResult = null;
const marks = { bm: new Map(), wrong: new Map() };
let marksReady = Promise.resolve();

init();

async function init() {
  ctx = await requireUser();
  $("#who").textContent = ctx.profile.name || ctx.user.email;
  if (["admin", "teacher"].includes(ctx.profile.role)) $("#adminLink").hidden = false;
  $("#logout").onclick = logout;
  try {
    IDX = buildIndex(await getSyllabus());
  } catch (e) {
    view.innerHTML = `<div class="card">Could not load syllabus: ${esc(e.message)}</div>`;
    return;
  }
  marksReady = loadMarks();
  window.addEventListener("hashchange", route);
  view.addEventListener("click", onClick);
  route();
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
  (pages[name] || viewHome)(arg);
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
    <div class="card">
      <h2>Browse &amp; practice</h2>
      <div class="grid4">
        <label>Board<select id="sBoard"></select></label>
        <label>Class<select id="sClass"></select></label>
        <label>Subject<select id="sSub"></select></label>
        <label>Questions per session
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
    box.innerHTML = `<div class="card center muted">No chapters here yet.</div>`;
    return;
  }
  box.innerHTML = chapters.map((c) => {
    const topics = kidsOf(c.id);
    const total = topics.reduce((s, t) => s + (t.qCount || 0), 0);
    return `<details>
      <summary>${esc(c.name)} <small>· ${topics.length} topics · ${total} Q</small></summary>
      <div>
        ${topics.map((t) => `<div class="trow">
            <span>${esc(t.name)}</span><small>${t.qCount || 0} Q</small>
            <button class="btn sm" data-act="practice" data-id="${t.id}" data-name="${esc(t.name)}" ${t.qCount ? "" : "disabled"}>Practice</button>
          </div>`).join("") || `<div class="muted" style="padding:8px">No topics yet.</div>`}
        ${total ? `<div class="trow"><span><b>Whole chapter</b></span><small>${total} Q</small>
          <button class="btn sm ghost" data-act="practice" data-id="${c.id}" data-name="${esc(c.name)}">Practice chapter</button></div>` : ""}
      </div>
    </details>`;
  }).join("");
}

/* ---------------- fetching questions ---------------- */
// Random questions under any set of syllabus nodes using the `rand` field:
// at most two cheap indexed queries, never a full collection scan.
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
  view.innerHTML = `<div class="card center">Preparing your questions…</div>`;
  try {
    const qs = await fetchRandom(ids, n);
    if (!qs.length) {
      toast("No questions available there yet.", "warn");
      route();
      return;
    }
    begin(mode, title, qs, minutes);
  } catch (e) {
    console.error(e);
    toast(e.message.includes("index") ? "Firestore index missing – run: firebase deploy --only firestore:indexes" : e.message, "bad");
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
    toast("Time is up – submitting your test.", "warn");
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
    <div class="card">
      <div class="qhead">
        <span class="muted">${esc(s.title)} · ${s.idx + 1}/${s.qs.length}</span>
        <span>${s.limitSec ? `⏱ <b id="timer"></b>` : ""}</span>
        <button class="icon ${marks.bm.has(q.id) ? "on" : ""}" data-act="bm" title="Bookmark">★</button>
      </div>
      <div class="progress"><i style="width:${((s.idx + 1) / s.qs.length) * 100}%"></i></div>
      <h3 class="qtext">${esc(q.text)}</h3>
      <div class="opts">${opts}</div>
      ${shown ? `<div class="expl ${ch === q.correct ? "ok" : "bad"}"><b>${ch === q.correct ? "Correct!" : "Incorrect."}</b> Answer: ${letters[q.correct]}.${q.explanation ? " " + esc(q.explanation) : ""}</div>` : ""}
      <div class="row between">
        ${practice
          ? `<button class="btn ghost" data-act="finish">End session</button>`
          : `<button class="btn ghost" data-act="prev" ${s.idx === 0 ? "disabled" : ""}>Previous</button>`}
        ${last
          ? (practice ? `<button class="btn" data-act="finish">Finish</button>` : `<button class="btn" data-act="submit">Submit test</button>`)
          : `<button class="btn" data-act="next">${practice && !shown ? "Skip" : "Next"}</button>`}
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
    begin("practice", el.dataset.src === "bm" ? "Bookmarked questions" : "Mistakes review", shuffle(list).slice(0, 30));
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
  view.innerHTML = `<div class="card center">Loading result…</div>`;
  try {
    const [a, d] = await Promise.all([getDoc(doc(db, "attempts", id)), getDoc(doc(db, "attemptDetails", id))]);
    if (!a.exists() || !d.exists()) { view.innerHTML = `<div class="card">Result not found.</div>`; return; }
    renderResult({ id, ...a.data(), qs: d.data().qs });
  } catch (e) {
    view.innerHTML = `<div class="card">Could not load result: ${esc(e.message)}</div>`;
  }
}

function renderResult(r) {
  currentResult = r;
  view.innerHTML = `
    <div class="card center">
      <h2>${esc(r.title)}</h2>
      <div class="score ${r.pct >= 50 ? "ok" : "bad"}">${r.pct}%</div>
      <p>${r.correct} correct · ${r.wrong} wrong · ${r.skipped} skipped · ${fmtTime(r.durationSec)}</p>
      <div class="row" style="justify-content:center">
        <a class="btn" href="#/home">Practice more</a>
        <a class="btn ghost" href="#/custom">New custom test</a>
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
      <div><b>${i + 1}.</b> ${esc(q.text)}</div>
      <div class="opts" style="margin-top:8px">
        ${q.options.map((o, k) => `<div class="opt ${k === q.correct ? "correct" : k === q.chosen ? "wrong" : ""}"><b>${letters[k]}</b><span>${esc(o)}</span></div>`).join("")}
      </div>
      ${q.explanation ? `<div class="expl ${q.chosen === q.correct ? "ok" : "bad"}">${esc(q.explanation)}</div>` : ""}
    </div>`).join("") || `<p class="muted center">Nothing here.</p>`;
}

/* ---------------- history ---------------- */
async function viewHistory() {
  view.innerHTML = `<div class="card center">Loading…</div>`;
  try {
    const snapq = await getDocs(query(collection(db, "attempts"),
      where("uid", "==", ctx.user.uid), orderBy("createdAt", "desc"), limit(30)));
    const rows = snapq.docs.map((d) => ({ id: d.id, ...d.data() }));
    view.innerHTML = `<div class="card"><h2>Your history</h2>
      ${rows.length ? `<div class="tablewrap"><table><thead><tr><th>When</th><th>What</th><th>Score</th><th></th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td>${fmtDate(r.createdAt)}</td><td>${esc(r.title)} <span class="badge">${r.mode}</span></td>
          <td><b>${r.pct}%</b> <small>${r.correct}/${r.total}</small></td>
          <td><button class="btn sm ghost" data-act="openAttempt" data-id="${r.id}">Review</button></td></tr>`).join("")}
      </tbody></table></div>` : `<p class="muted">No attempts yet. Go practice!</p>`}</div>`;
  } catch (e) {
    view.innerHTML = `<div class="card">${esc(e.message.includes("index") ? "Index is building or missing – run: firebase deploy --only firestore:indexes" : e.message)}</div>`;
  }
}

/* ---------------- bookmarks & mistakes ---------------- */
async function viewBookmarks() { await marksReady; marksPage("bm", "Bookmarked questions", marks.bm); }
async function viewWrong() { await marksReady; marksPage("wrong", "Mistakes to revise", marks.wrong); }

function marksPage(src, title, map) {
  const list = [...map].map(([id, x]) => ({ id, ...x })).sort((a, b) => (b.at || 0) - (a.at || 0));
  view.innerHTML = `<div class="card"><div class="row between" style="margin-top:0"><h2 style="margin:0">${title} (${list.length})</h2>
    ${list.length ? `<button class="btn" data-act="practiceMarks" data-src="${src}">Practice these</button>` : ""}</div>
    ${list.map((q) => `<div class="rq">
      <div>${esc(q.text)}</div>
      <div class="muted" style="margin-top:4px">Answer: <b>${letters[q.correct]}. ${esc(q.options[q.correct])}</b></div>
      ${q.explanation ? `<div class="muted">${esc(q.explanation)}</div>` : ""}
      <button class="btn sm ghost" style="margin-top:6px" data-act="removeMark" data-src="${src}" data-id="${q.id}">Remove</button>
    </div>`).join("") || `<p class="muted">Nothing here yet.</p>`}</div>`;
}

/* ---------------- custom test builder ---------------- */
function viewCustom() {
  const walk = (n) => {
    const ch = kidsOf(n.id);
    const pick = ["subject", "chapter", "topic"].includes(n.level);
    const label = `${pick ? `<input type="checkbox" class="pick" value="${n.id}">` : ""}${esc(n.name)}${n.level === "topic" ? ` <small>${n.qCount || 0} Q</small>` : ""}`;
    return ch.length
      ? `<details><summary>${label}</summary><div>${ch.map(walk).join("")}</div></details>`
      : `<div class="leaf">${label}</div>`;
  };
  view.innerHTML = `
    <div class="card"><h2>Build a custom test</h2>
      <p class="muted">Tick any subjects, chapters or topics. Questions are picked at random from everything you select.</p>
      <div>${kidsOf(null).map(walk).join("") || `<p class="muted">No content yet.</p>`}</div>
    </div>
    <div class="card">
      <div class="grid4">
        <label>Number of questions<input type="number" id="cn" min="5" max="100" value="20"></label>
        <label>Time limit (minutes, timed test)<input type="number" id="cm" min="1" max="300" value="20"></label>
      </div>
      <div class="row" style="margin:14px 0">
        <label style="display:flex;align-items:center"><input type="radio" name="mode" value="practice" checked> Practice (instant answers)</label>
        <label style="display:flex;align-items:center"><input type="radio" name="mode" value="test"> Timed test (answers at the end)</label>
      </div>
      <button class="btn" data-act="startCustom">Start</button>
    </div>`;
}
