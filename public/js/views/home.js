// js/views/home.js — Modernized dashboard with flat moving-animation welcome banner, 3D buttons/cards, and refined dark mode
import { db, collection, getDocs, query, where } from "../core/firebase.js";
import { esc, fmtDate } from "../core/dom.js";
import { getSyllabus, kidsOf, getNode } from "../core/store.js";
import { getWeakTopics, getLeaderboard } from "../core/stats.js";

const GOAL = 20;
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const dn = (ms) => Math.floor((ms - new Date(ms).getTimezoneOffset() * 60000) / 864e5);

// Crisp vector icons replacing raw emojis
const ICONS = {
  streak: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.5 4 6.5 a4.5 4.5 0 1 1-6.5 7.5z"/></svg>`,
  accuracy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  solved: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  tests: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  board: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10M6 10h10"/></svg>`,
  medal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>`
};

export default async function () { return { html: await render(), mount: wire }; }

async function render() {
  await getSyllabus();
  if (!kidsOf(null).length) {
    return `
      <div class="card-3d rounded-3xl p-12 text-center max-w-lg mx-auto my-12 bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 animate-fade-in">
        <div class="w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center mx-auto mb-4 text-2xl">📚</div>
        <h2 class="font-display font-bold text-xl mb-2 text-slate-900 dark:text-white">No content yet</h2>
        <p class="text-sm text-slate-600 dark:text-slate-400">Check back soon. New interactive practice sets are on the way.</p>
      </div>`;
  }

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
  if (lastTopic) acts.push(action("CONTINUE", `Resume ${lastTopic.name}`, "👉", "#6366f1", "resume"));
  if (wrong) acts.push(action("MISTAKES", `${wrong} question${wrong === 1 ? "" : "s"} to review`, "🎯", "#ef4444", "mistakes"));
  if (bm) acts.push(action("BOOKMARKS", `${bm} saved question${bm === 1 ? "" : "s"}`, "★", "#8b5cf6", "bookmarks"));

  return `
    <!-- Modern Moving Animated Welcome Banner (Flat, No 3D) -->
    <section class="welcome-banner-animated rounded-3xl p-6 sm:p-8 mb-8 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6 text-white shadow-xl">
      <div class="space-y-3 text-left z-10 max-w-xl">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-white/20 backdrop-blur-md text-white border border-white/30">
          <span class="w-2 h-2 rounded-full bg-cyan-300 animate-ping"></span>
          <span>Student Dashboard</span>
        </div>
        <h1 class="font-display font-extrabold text-2xl sm:text-3xl lg:text-4xl tracking-tight">${greet}, ${esc(name)} 👋</h1>
        <p class="text-sm sm:text-base text-white/90">${todayN >= GOAL ? "Daily goal complete. Outstanding work!" : `${GOAL - todayN} more question${GOAL - todayN === 1 ? "" : "s"} to hit today's goal.`}</p>
        <div class="flex flex-wrap items-center gap-3 pt-2">
          ${streak ? `<span class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500/90 text-white shadow-md">🔥 ${streak}-day streak</span>` : ""}
          <button class="btn-flat px-5 py-2.5 rounded-xl font-display font-bold text-xs text-indigo-900 bg-white hover:bg-slate-100 shadow-md transition-all hover:-translate-y-0.5" data-act="quick">⚡ Quick Drill</button>
        </div>
      </div>
      
      <!-- Goal Ring Progress -->
      <div class="relative w-32 h-32 flex items-center justify-center shrink-0 z-10">
        <svg viewBox="0 0 120 120" class="w-full h-full transform -rotate-90">
          <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="10" class="text-white/25" />
          <circle class="gfg text-white transition-all duration-1000 ease-out" cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round" stroke-dasharray="314" stroke-dashoffset="314" data-p="${Math.min(100, Math.round((todayN / GOAL) * 100))}"/>
        </svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center text-center">
          <b class="font-display font-extrabold text-xl leading-none text-white">${todayN}</b>
          <small class="text-[10px] font-semibold text-white/80 uppercase mt-1">of ${GOAL} today</small>
        </div>
      </div>
    </section>

    <!-- 3D KPI Stat Grid -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      ${stat(acc, "Accuracy", "#10b981", 0, "%")}
      ${stat(answered, "Questions Answered", "#6366f1", 1)}
      ${stat(att.length, "Tests Taken", "#3b82f6", 2)}
      ${stat(streak, "Day Streak", "#f59e0b", 3)}
    </div>

    ${acts.length ? `<div class="grid sm:grid-cols-3 gap-4 mb-8">${acts.map((c, i) => c.replace("<div", `<div style="--i:${i}"`)).join("")}</div>` : ""}

    <div class="grid lg:grid-cols-2 gap-6 mb-8">
      <div class="card-3d rounded-3xl p-6 bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-indigo-500/30">
        <div class="flex items-center justify-between mb-6">
          <h3 class="font-display font-bold text-lg text-slate-900 dark:text-slate-100">Weekly Activity</h3>
          <span class="text-xs font-semibold px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shadow-sm">${per.reduce((a, b) => a + b, 0)} questions</span>
        </div>
        <div class="flex items-end justify-between h-44 pt-4 px-2" id="bars">
          ${per.map((v, i) => `
            <div class="flex flex-col items-center gap-2 flex-1 group" style="--i:${i}">
              <div class="w-full max-w-[32px] bg-slate-200 dark:bg-slate-800/80 rounded-xl overflow-hidden h-32 flex items-end shadow-inner">
                <div class="w-full rounded-xl bg-gradient-to-t from-indigo-600 to-cyan-400 transition-all duration-700 ${i === 6 ? "ring-2 ring-indigo-400/50" : ""}" style="height:${Math.max(8, (v / max) * 100)}%" title="${v} questions"></div>
              </div>
              <span class="text-xs font-semibold text-slate-600 dark:text-slate-400">${DAYS[new Date(Date.now() - (6 - i) * 864e5).getDay()]}</span>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="card-3d rounded-3xl p-6 flex flex-col justify-between bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-indigo-500/30">
        <div>
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-display font-bold text-lg text-slate-900 dark:text-slate-100">Weak Topics</h3>
            <a href="#/weak" class="text-xs font-semibold text-indigo-600 dark:text-cyan-400 hover:underline">See all →</a>
          </div>
          <div class="space-y-3">
            ${weak.length ? weak.map((w) => `
              <a class="flex items-center justify-between p-3 rounded-2xl bg-slate-100/90 dark:bg-slate-800/90 hover:border-indigo-500/40 border border-slate-200/60 dark:border-slate-700/60 transition-all text-slate-900 dark:text-slate-100 shadow-sm" href="#/quiz?topic=${w.id}">
                <div class="space-y-0.5">
                  <div class="font-semibold text-xs sm:text-sm">${esc(w.n.name)}</div>
                  <div class="text-[10px] text-slate-500 dark:text-slate-400">${esc(getNode(w.n.parentId)?.name || "")}</div>
                </div>
                <div class="flex items-center gap-3">
                  <div class="w-16 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden shadow-inner">
                    <div class="h-full rounded-full" style="width:${w.pct}%; background-color:${w.pct < 50 ? "#ef4444" : "#f59e0b"}"></div>
                  </div>
                  <b class="text-xs font-bold">${w.pct}%</b>
                </div>
              </a>
            `).join("") : `<p class="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">${weakAll.length ? "No weak topics. Great job!" : "Finish a few tests to identify your focus areas."}</p>`}
          </div>
        </div>
      </div>
    </div>

    <div class="grid lg:grid-cols-2 gap-6 mb-10">
      <div class="card-3d rounded-3xl p-6 bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-indigo-500/30">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-display font-bold text-lg text-slate-900 dark:text-slate-100">Recent Results</h3>
          <a href="#/history" class="text-xs font-semibold text-indigo-600 dark:text-cyan-400 hover:underline">View all →</a>
        </div>
        <div class="space-y-3">
          ${recent.length ? recent.map((r) => `
            <a class="flex items-center justify-between p-3.5 rounded-2xl bg-slate-100/90 dark:bg-slate-800/90 hover:border-indigo-500/40 border border-slate-200/60 dark:border-slate-700/60 transition-all text-slate-900 dark:text-slate-100 shadow-sm" href="#/result/${r.id}">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center font-display font-bold text-xs text-white shadow-md" style="background:${r.pct >= 50 ? "#10b981" : "#f97316"}">
                  ${r.pct}%
                </div>
                <div>
                  <div class="font-semibold text-xs sm:text-sm">${esc(r.title)}</div>
                  <div class="text-[10px] text-slate-500 dark:text-slate-400">${fmtDate(r.createdAt)}</div>
                </div>
              </div>
              <b class="text-xs font-bold text-slate-700 dark:text-slate-200">${r.correct}/${r.total}</b>
            </a>
          `).join("") : `<p class="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">No tests taken yet.</p>`}
        </div>
      </div>

      <div class="card-3d rounded-3xl p-6 flex flex-col justify-between bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-indigo-500/30">
        <div>
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-display font-bold text-lg text-slate-900 dark:text-slate-100">Leaderboard</h3>
            <a href="#/leaderboard" class="text-xs font-semibold text-indigo-600 dark:text-cyan-400 hover:underline">Full board →</a>
          </div>
          <div class="space-y-2.5">
            ${renderLeaderboardMarkup(lb, uid, myRank)}
          </div>
        </div>
      </div>
    </div>

    <h2 class="font-display font-extrabold text-2xl mb-6 text-slate-900 dark:text-slate-100">Explore Boards</h2>
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">${boards.map(boardCard).join("")}</div>

    <h2 class="font-display font-extrabold text-2xl mb-4 text-slate-900 dark:text-slate-100">Upcoming Features</h2>
    <div class="grid sm:grid-cols-3 gap-4">
      <div class="card-3d rounded-2xl p-4 text-center font-semibold text-sm bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-indigo-500/30 text-slate-800 dark:text-slate-200">🗓️ Study Planner</div>
      <div class="card-3d rounded-2xl p-4 text-center font-semibold text-sm bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-indigo-500/30 text-slate-800 dark:text-slate-200">🎖️ Badges &amp; Achievements</div>
      <div class="card-3d rounded-2xl p-4 text-center font-semibold text-sm bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-indigo-500/30 text-slate-800 dark:text-slate-200">⚔️ Daily Challenges</div>
    </div>`;
}

function renderLeaderboardMarkup(lb, uid, myRank) {
  if (!lb.length) {
    return `<p class="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">Be the first on this week's board.</p>`;
  }
  const rows = lb.slice(0, 3).map((r, i) => `
    <div class="flex items-center justify-between p-3 rounded-2xl ${r.id === uid ? "bg-indigo-500/20 border border-indigo-500/40" : "bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200/60 dark:border-slate-700/60"} text-slate-900 dark:text-slate-100 shadow-sm">
      <div class="flex items-center gap-3">
        <span class="font-display font-bold text-xs text-indigo-500">#${i + 1}</span>
        <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-cyan-500 text-white font-bold text-xs flex items-center justify-center shadow-md">
          ${esc((r.name || "S").trim()[0].toUpperCase())}
        </div>
        <b class="font-semibold text-xs sm:text-sm">${esc(r.name)}</b>
      </div>
      <span class="text-xs font-bold text-indigo-600 dark:text-cyan-400">${r.score} pts</span>
    </div>
  `).join("");

  const rankText = myRank >= 0 ? `You're #${myRank + 1} this week.` : "Complete a test to join the board.";
  const note = `<small class="text-xs text-slate-500 dark:text-slate-400 block mt-3">${rankText}</small>`;

  return rows + note;
}

const stat = (n, label, c, i, suf = "") => `
  <div class="card-3d rounded-2xl p-5 flex flex-col justify-between border-l-4 bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-indigo-500/30" style="border-left-color: ${c}">
    <div class="font-display font-extrabold text-2xl sm:text-3xl text-slate-900 dark:text-slate-100" data-count="${n}" data-suf="${suf}">0${suf}</div>
    <div class="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide mt-1">${label}</div>
  </div>`;

const action = (label, title, icon, fg, act) => `
  <div class="btn-3d card-3d rounded-2xl p-5 flex items-center justify-between cursor-pointer hover:border-indigo-500/50 transition-all group bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-indigo-500/30 text-slate-900 dark:text-slate-100" data-act="${act}" role="button" tabindex="0">
    <div class="flex items-center gap-4">
      <div class="w-12 h-12 rounded-2xl flex items-center justify-center text-xl bg-indigo-500/10 shadow-sm" style="color:${fg}">${icon}</div>
      <div>
        <div class="text-[10px] font-bold uppercase tracking-wider text-indigo-500">${label}</div>
        <h3 class="font-display font-bold text-sm sm:text-base mt-0.5">${esc(title)}</h3>
      </div>
    </div>
    <div class="text-xs font-bold text-indigo-600 dark:text-cyan-400 group-hover:translate-x-1 transition-transform">Open →</div>
  </div>`;

function boardCard(board, i) {
  const classes = kidsOf(board.id);
  const chapters = classes.flatMap((c) => kidsOf(c.id)).flatMap((s) => kidsOf(s.id));
  const q = chapters.reduce((s, ch) => s + kidsOf(ch.id).reduce((x, t) => x + (t.qCount || 0), 0), 0);
  
  const iconMarkup = board.logoUrl
    ? `<img src="${esc(board.logoUrl)}" alt="${esc(board.name)} logo" class="w-12 h-12 object-contain rounded-xl bg-slate-100 dark:bg-slate-800 p-1.5 border border-indigo-500/25 shadow-sm" />`
    : `<div class="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center text-xl shadow-sm">${ICONS.board}</div>`;

  return `
    <a class="card-3d rounded-3xl p-6 flex flex-col justify-between hover:-translate-y-1 transition-transform duration-300 bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-indigo-500/30 text-slate-900 dark:text-slate-100" href="#/browse/${board.id}">
      <div class="flex items-center justify-between mb-4">
        ${iconMarkup}
        <span class="text-xs font-semibold px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 shadow-sm">${q} Qs</span>
      </div>
      <div>
        <div class="font-display font-bold text-xl mb-1">${esc(board.name)}</div>
        <div class="text-xs text-slate-600 dark:text-slate-400">${classes.length} classes · ${chapters.length} chapters</div>
      </div>
    </a>`;
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
  }));
  const go = (e) => {
    const attr = e.target.closest("[data-act]");
    const act = attr ? attr.dataset.act : null;
    if (act === "quick") location.hash = "#/quiz?quick=1";
    else if (act === "mistakes") location.hash = "#/wrong";
    else if (act === "bookmarks") location.hash = "#/bookmarks";
    else if (act === "resume") { try { const s = JSON.parse(localStorage.getItem("sel") || "{}"); if (s.lastTopic) location.hash = `#/chapter/${s.lastTopic}`; } catch {} }
  };
  root.addEventListener("click", go);
  root.addEventListener("keydown", (e) => { if (e.key === "Enter") go(e); });
}