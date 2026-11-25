// js/views/home.js — dashboard: goal ring, stats, week chart, weak topics, recent, leaderboard, boards
import { db, collection, getDocs, query, where } from "../core/firebase.js";
import { esc, fmtDate } from "../core/dom.js";
import { getSyllabus, kidsOf, getNode } from "../core/store.js";
import { getWeakTopics, getLeaderboard } from "../core/stats.js";

const GOAL = 20;
const MEDAL = ["🥇", "🥈", "🥉"], DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const dn = (ms) => Math.floor((ms - new Date(ms).getTimezoneOffset() * 60000) / 864e5);

export default async function () { return { html: await render(), mount: wire }; }

async function render() {
  await getSyllabus();
  if (!kidsOf(null).length) return `<div class="st-empty"><div class="big">📚</div><h2>No content yet</h2><p>Check back soon. New practice sets are on the way.</p></div>`;

  const uid = window.__ctx.user.uid;
  const name = (window.__ctx.profile.name || "").split(" ")[0] || "there";
  const lastTopic = (() => { try { return getNode(JSON.parse(localStorage.getItem("sel") || "{}").lastTopic); } catch { return null; } })();
  const size = (c) => getDocs(collection(db, "users", uid, c)).then((s) => s.size).catch(() => 0);
  const [att, wrong, bm, weakAll, lb] = await Promise.all([
    getDocs(query(collection(db, "attempts"), where("uid", "==", uid))).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => []),
    size("wrong"), size("bookmarks"),
    getWeakTopics(uid).catch(() => []), getLeaderboard("week").catch(() => []),
  ]);

  const today = dn(Date.now()), per = Array(7).fill(0), days = new Set();
  let answered = 0, correct = 0;
  for (const a of att) {
    const n = (a.correct || 0) + (a.wrong || 0); answered += n; correct += a.correct || 0;
    if (a.createdAt) { const d = dn(a.createdAt); days.add(d); if (today - d >= 0 && today - d < 7) per[6 - (today - d)] += n; }
  }
  let streak = 0, d = days.has(today) ? today : today - 1;
  while (days.has(d)) { streak++; d--; }
  const todayN = per[6], acc = answered ? Math.round((correct / answered) * 100) : 0;
  const hour = new Date().getHours(), greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const recent = [...att].sort((a, b) => b.createdAt - a.createdAt).slice(0, 3);
  const weak = weakAll.filter((w) => w.pct < 70).map((w) => ({ ...w, n: getNode(w.id) })).filter((w) => w.n).slice(0, 3);
  const myRank = lb.findIndex((r) => r.id === uid);
  const max = Math.max(1, ...per), boards = kidsOf(null);

  const acts = [];
  if (lastTopic) acts.push(action("CONTINUE", `Resume ${lastTopic.name}`, "👉", "#4338ca", "resume"));
  if (wrong) acts.push(action("MISTAKES", `${wrong} to review`, "🎯", "#d92d20", "mistakes"));
  if (bm) acts.push(action("BOOKMARKS", `${bm} saved question${bm === 1 ? "" : "s"}`, "★", "#b54708", "bookmarks"));

  return `
    <section class="hero-card">
      <div class="hero-l">
        <h1>${greet}, ${esc(name)} 👋</h1>
        <p>${todayN >= GOAL ? "Daily goal complete. Great work!" : `${GOAL - todayN} more question${GOAL - todayN === 1 ? "" : "s"} to hit today's goal.`}</p>
        <div class="hero-act">${streak ? `<span class="streak"><span class="fire">🔥</span> ${streak}-day streak</span>` : ""}
          <button class="hero-cta" data-act="quick">⚡ Quick drill</button></div>
      </div>
      <div class="goal"><svg viewBox="0 0 120 120"><circle class="gbg" cx="60" cy="60" r="50" fill="none" stroke-width="10"/><circle class="gfg" cx="60" cy="60" r="50" fill="none" stroke-width="10" data-p="${Math.min(100, Math.round((todayN / GOAL) * 100))}"/></svg>
        <div class="goal-c"><b>${todayN}</b><small>of ${GOAL} today</small></div></div>
    </section>

    <div class="stat-row four stagger">
      ${stat(acc, "Accuracy", "#16a34a", 0, "%")}${stat(answered, "Questions answered", "#6366f1", 1)}${stat(att.length, "Tests taken", "#0891b2", 2)}${stat(streak, "Day streak", "#f97316", 3)}
    </div>

    ${acts.length ? `<div class="action-list stagger">${acts.map((c, i) => c.replace("<div", `<div style="--i:${i}"`)).join("")}</div>` : ""}

    <div class="cols2">
      <div class="panel"><div class="ph"><h3>This week</h3><small>${per.reduce((a, b) => a + b, 0)} questions</small></div>
        <div class="bars" id="bars">${per.map((v, i) => `<div class="bar ${i === 6 ? "today" : ""}" style="--i:${i};--h:${Math.max(4, (v / max) * 100)}%" title="${v} questions"><i></i><small>${DAYS[new Date(Date.now() - (6 - i) * 864e5).getDay()]}</small></div>`).join("")}</div></div>
      <div class="panel"><div class="ph"><h3>Weak topics</h3><a href="#/weak">See all →</a></div>
        ${weak.length ? weak.map((w) => `<a class="wk" href="#/quiz?topic=${w.id}"><span class="wk-n">${esc(w.n.name)}<small>${esc(getNode(w.n.parentId)?.name || "")}</small></span>
          <span class="wk-bar"><i style="--w:${w.pct}%;--c:${w.pct < 50 ? "#e11d48" : "#f97316"}"></i></span><b>${w.pct}%</b></a>`).join("")
          : `<p class="muted" style="margin:.5rem 0 0">${weakAll.length ? "No weak topics. Nice work!" : "Finish a few tests and your weakest topics will appear here."}</p>`}</div>
    </div>

    <div class="cols2">
      <div class="panel"><div class="ph"><h3>Recent results</h3><a href="#/history">View all →</a></div>
        ${recent.length ? recent.map((r) => `<a class="wk r3" href="#/result/${r.id}"><div class="h-ring" style="--p:${r.pct};--c:${r.pct >= 50 ? "#16a34a" : "#ea580c"}"><span>${r.pct}%</span></div>
          <span class="wk-n">${esc(r.title)}<small>${fmtDate(r.createdAt)}</small></span><b>${r.correct}/${r.total}</b></a>`).join("") : `<p class="muted" style="margin:.5rem 0 0">No tests yet. Your results will show up here.</p>`}</div>
      <div class="panel"><div class="ph"><h3>Leaderboard</h3><a href="#/leaderboard">Full board →</a></div>
        ${lb.length ? lb.slice(0, 3).map((r, i) => `<div class="lb-row sm ${r.id === uid ? "me-row" : ""}"><span class="rk">${MEDAL[i]}</span><div class="av">${esc((r.name || "S").trim()[0].toUpperCase())}</div><b class="nm">${esc(r.name)}</b><span class="pts">${r.score}</span></div>`).join("")
          + `<small class="muted">${myRank >= 0 ? `You're #${myRank + 1} this week.` : "Finish a test to join the board."}</small>`
          : `<p class="muted" style="margin:.5rem 0 0">Be the first on this week's board.</p>`}</div>
    </div>

    <h2 class="section-title">Choose your board</h2>
    <div class="card-grid stagger">${boards.map(boardCard).join("")}</div>

    <h2 class="section-title">Coming soon</h2>
    <div class="soon"><div>🗓️ Study planner</div><div>🎖️ Badges &amp; achievements</div><div>⚔️ Daily challenges</div></div>`;
}

const stat = (n, label, c, i, suf = "") => `<div class="stat" style="--c:${c};--i:${i}"><b data-count="${n}" data-suf="${suf}">0${suf}</b><span>${label}</span></div>`;
const action = (label, title, icon, fg, act) => `<div class="action-card" data-act="${act}" role="button" tabindex="0"><div class="ic" style="color:${fg}">${icon}</div><div class="body"><div class="label">${label}</div><h3>${esc(title)}</h3></div><div class="go">Open →</div></div>`;

function boardCard(board, i) {
  const pal = [["#6366f1", "🔬"], ["#0891b2", "📖"], ["#a855f7", "🧪"], ["#f97316", "🧮"], ["#0f9d58", "🌍"], ["#d92d20", "🎨"]];
  const [fg, emoji] = pal[i % pal.length];
  const classes = kidsOf(board.id);
  const chapters = classes.flatMap((c) => kidsOf(c.id)).flatMap((s) => kidsOf(s.id));
  const q = chapters.reduce((s, ch) => s + kidsOf(ch.id).reduce((x, t) => x + (t.qCount || 0), 0), 0);
  return `<a class="board-card" style="--i:${i}" href="#/browse/${board.id}"><div class="icon" style="color:${fg}">${emoji}</div><div class="name">${esc(board.name)}</div><div class="meta">${classes.length} classes · ${chapters.length} chapters · ${q} Q</div></a>`;
}

function wire(root) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.querySelectorAll("[data-count]").forEach((el) => {
    const end = +el.dataset.count || 0, suf = el.dataset.suf || "", t0 = performance.now();
    if (!end || reduce) { el.textContent = end + suf; return; }
    const tick = (t) => { const p = Math.min(1, (t - t0) / 900); el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))) + suf; if (p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const g = root.querySelector(".gfg"); if (g) g.style.strokeDashoffset = 314 - (314 * +g.dataset.p) / 100;
    root.querySelector("#bars")?.classList.add("on");
  }));
  const go = (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "quick") location.hash = "#/quiz?quick=1";
    else if (act === "mistakes") location.hash = "#/wrong";
    else if (act === "bookmarks") location.hash = "#/bookmarks";
    else if (act === "resume") { try { const s = JSON.parse(localStorage.getItem("sel") || "{}"); if (s.lastTopic) location.hash = `#/chapter/${s.lastTopic}`; } catch {} }
  };
  root.addEventListener("click", go);
  root.addEventListener("keydown", (e) => { if (e.key === "Enter") go(e); });
}