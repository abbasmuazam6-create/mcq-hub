// js/views/app.js — student SPA bootstrap. To add a module: add one line to NAV (and create its view file).
import { $, $$, esc } from "../core/dom.js";
import { start, register } from "../core/router.js";
import { getSyllabus } from "../core/store.js";
import { requireUser, logout } from "../common.js";

// Clean vector icons for navigation and board cards
const ICONS = {
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  custom: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
  leaderboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
  weak: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 7-8.5 8.5-5-5L2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
  historySvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  bookmarks: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  wrong: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  admin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  more: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  // Board / Syllabus Category Icons
  boardDefault: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10M6 10h10"/></svg>`
};

const NAV = [
  { r: "home",        l: "Dashboard",   i: ICONS.home,        c: "#6366f1", f: "./home.js",        tab: 1, short: "Home" },
  { r: "custom",      l: "Custom Test", i: ICONS.custom,      c: "#ec4899", f: "./custom.js",      tab: 1, short: "Custom" },
  { r: "leaderboard", l: "Leaderboard", i: ICONS.leaderboard, c: "#f59e0b", f: "./leaderboard.js", tab: 1, short: "Ranks" },
  { r: "weak",        l: "Weak Topics", i: ICONS.weak,        c: "#10b981", f: "./weak.js",        tab: 1, short: "Weak" },
  { r: "history",     l: "History",     i: ICONS.historySvg,  c: "#3b82f6", f: "./history.js" },
  { r: "bookmarks",   l: "Bookmarks",   i: ICONS.bookmarks,   c: "#8b5cf6", f: "./marks.js" },
  { r: "wrong",       l: "Mistakes Bank",i: ICONS.wrong,      c: "#ef4444", f: "./marks.js" },
];

const HIDDEN = [
  ["browse", "./browse.js"], ["chapter", "./chapter.js"], ["quiz", "./quiz.js"],
  ["result", "./result.js"], ["study", "./study.js"], ["videos", "./videos.js"]
];

const ALIAS = { browse: "home", chapter: "home", study: "home", videos: "home", result: "history" };

const SKELETON = `
  <div class="sk-wrap">
    <div class="sk sk-hero wide-banner"></div>
    <div class="sk-kpi-row">
      <div class="sk sk-kpi"></div><div class="sk sk-kpi"></div><div class="sk sk-kpi"></div><div class="sk sk-kpi"></div>
    </div>
    <div class="sk sk-line"></div>
  </div>`;

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

function buildNav() {
  $("#nav").innerHTML = NAV.map((n, idx) => `
    <a href="#/${n.r}" data-r="${n.r}" title="${n.l}" class="nav-item" style="--accent:${n.c}; --i:${idx}">
      <span class="nav-icon">${n.i}</span>
      <span class="lbl">${n.l}</span>
      <span class="nav-glow"></span>
    </a>`).join("")
    + `<a href="admin.html" data-admin hidden title="Admin" class="nav-item" style="--accent:#14b8a6; --i:${NAV.length}">
        <span class="nav-icon">${ICONS.admin}</span>
        <span class="lbl">Admin</span>
      </a>`;

  $("#tabbar").innerHTML = NAV.filter((n) => n.tab).map((n) => `
    <a href="#/${n.r}" data-r="${n.r}" class="tab-item" style="--accent:${n.c}">
      <span class="tab-icon">${n.i}</span>
      <span class="tab-lbl">${n.short || n.l}</span>
    </a>`).join("")
    + `<button type="button" data-more class="tab-item" style="--accent:#64748b">
        <span class="tab-icon">${ICONS.more}</span>
        <span class="tab-lbl">More</span>
      </button>`;

  $("#moreList").innerHTML = `
    <div class="more-handle"></div>
    <h3>Explore Modules</h3>
    <div class="more-grid">
      ${NAV.filter((n) => !n.tab).map((n, idx) => `
        <a href="#/${n.r}" data-r="${n.r}" class="more-card" style="--accent:${n.c}; --i:${idx}">
          <span class="more-icon">${n.i}</span>
          <span>${n.l}</span>
        </a>`).join("")}
      <a href="admin.html" data-admin hidden class="more-card" style="--accent:#14b8a6; --i:4">
        <span class="more-icon">${ICONS.admin}</span>
        <span>Admin</span>
      </a>
    </div>`;

  const moreModal = $("#more");
  const toggleMore = (show) => {
    if (show) {
      moreModal.hidden = false;
      requestAnimationFrame(() => moreModal.classList.add("open"));
    } else {
      moreModal.classList.remove("open");
      setTimeout(() => (moreModal.hidden = true), 250);
    }
  };

  moreModal.addEventListener("click", (e) => {
    if (e.target.id === "more" || e.target.closest("a")) toggleMore(false);
  });
  $("[data-more]").onclick = () => toggleMore(true);

  const shell = $("#shell");
  if (localStorage.getItem("sidePin")) shell.classList.add("pinned");
  $("#pin").onclick = () => {
    const isPinned = shell.classList.toggle("pinned");
    localStorage.setItem("sidePin", isPinned ? "1" : "");
  };

  initThemeToggle();
}

function triggerViewAnimation() {
  const view = $("#view");
  if (!view) return;
  view.classList.remove("view-enter");
  void view.offsetWidth;
  view.classList.add("view-enter");
}

async function boot() {
  buildNav();
  const ctx = await requireUser();
  window.__ctx = ctx;

  const name = ctx.profile.name || ctx.user.email || "Student";
  $("#who").textContent = name;
  $$("[data-av]").forEach((a) => {
    a.textContent = name.trim()[0]?.toUpperCase() || "S";
  });

  if (["admin", "teacher"].includes(ctx.profile.role)) {
    $$("[data-admin]").forEach((a) => (a.hidden = false));
  }
  $$("[data-logout]").forEach((b) => (b.onclick = logout));

  try {
    await getSyllabus();
  } catch (e) {
    $("#view").innerHTML = `<div class="card error-shake">Could not load syllabus: ${esc(e.message)}</div>`;
    return;
  }

  [...NAV.map((n) => [n.r, n.f]), ...HIDDEN].forEach(([r, f]) => register(r, () => import(f)));

  start({
    mount: "#view",
    loading: SKELETON,
    onBefore({ name }) {
      const key = ALIAS[name] || name;
      const activeNav = NAV.find((n) => n.r === key);

      if (activeNav?.c) {
        document.documentElement.style.setProperty("--active-accent", activeNav.c);
      }

      $$("[data-r]").forEach((a) => {
        const on = a.dataset.r === key;
        a.classList.toggle("on", on);
        on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current");
      });

      $("[data-more]")?.classList.toggle("on", NAV.some((n) => !n.tab && n.r === key));
      document.body.classList.toggle("in-quiz", name === "quiz");
      
      $("#more").classList.remove("open");
      $("#more").hidden = true;
      triggerViewAnimation();
    },
  });
}

boot().catch((e) => {
  console.error("[app boot]", e);
  const v = document.getElementById("view");
  if (v) v.innerHTML = `<div class="card error-shake">App failed to start: ${esc(e.message)}</div>`;
});