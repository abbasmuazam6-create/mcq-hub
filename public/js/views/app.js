// js/views/app.js — student SPA bootstrap. To add a module: add one line to NAV (and create its view file).
import { $, $$, esc } from "../core/dom.js";
import { start, register } from "../core/router.js";
import { getSyllabus } from "../core/store.js";
import { requireUser, logout } from "../common.js";

const NAV = [
  { r: "home", l: "Home", i: "🏠", f: "./home.js", tab: 1 },
  { r: "custom", l: "Custom test", short: "Custom", i: "🧩", f: "./custom.js", tab: 1 },
  { r: "leaderboard", l: "Leaderboard", short: "Ranks", i: "🏆", f: "./leaderboard.js", tab: 1 },
  { r: "weak", l: "Weak topics", short: "Weak", i: "📉", f: "./weak.js", tab: 1 },
  { r: "history", l: "History", i: "🕘", f: "./history.js" },
  { r: "bookmarks", l: "Bookmarks", i: "★", f: "./marks.js" },
  { r: "wrong", l: "Mistakes", i: "🎯", f: "./marks.js" },
];
const HIDDEN = [["browse", "./browse.js"], ["chapter", "./chapter.js"], ["quiz", "./quiz.js"], ["result", "./result.js"], ["study", "./study.js"], ["videos", "./videos.js"]];
const ALIAS = { browse: "home", chapter: "home", study: "home", videos: "home", result: "history" };
const SKELETON = `<div class="sk sk-hero"></div><div class="sk-row"><div class="sk"></div><div class="sk"></div><div class="sk"></div></div><div class="sk sk-line"></div><div class="sk sk-line"></div>`;

function buildNav() {
  $("#nav").innerHTML = NAV.map((n) => `<a href="#/${n.r}" data-r="${n.r}" title="${n.l}"><i>${n.i}</i><span class="lbl">${n.l}</span></a>`).join("")
    + `<a href="admin.html" data-admin hidden title="Admin"><i>⚙️</i><span class="lbl">Admin</span></a>`;
  $("#tabbar").innerHTML = NAV.filter((n) => n.tab).map((n) => `<a href="#/${n.r}" data-r="${n.r}"><i>${n.i}</i>${n.short || n.l}</a>`).join("")
    + `<button type="button" data-more><i>⋯</i>More</button>`;
  $("#moreList").innerHTML = `<h3>More</h3><div class="more-grid">${NAV.filter((n) => !n.tab).map((n) => `<a href="#/${n.r}" data-r="${n.r}"><i>${n.i}</i>${n.l}</a>`).join("")}<a href="admin.html" data-admin hidden><i>⚙️</i>Admin</a></div>`;
  $("#more").addEventListener("click", (e) => { if (e.target.id === "more" || e.target.closest("a")) $("#more").hidden = true; });
  $("[data-more]").onclick = () => ($("#more").hidden = false);
  const shell = $("#shell");
  if (localStorage.getItem("sidePin")) shell.classList.add("pinned");
  $("#pin").onclick = () => localStorage.setItem("sidePin", shell.classList.toggle("pinned") ? "1" : "");
}

async function boot() {
  buildNav();
  const ctx = await requireUser();
  window.__ctx = ctx;
  const name = ctx.profile.name || ctx.user.email || "Student";
  $("#who").textContent = name;
  $$("[data-av]").forEach((a) => (a.textContent = name.trim()[0]?.toUpperCase() || "S"));
  if (["admin", "teacher"].includes(ctx.profile.role)) $$("[data-admin]").forEach((a) => (a.hidden = false));
  $$("[data-logout]").forEach((b) => (b.onclick = logout));

  try { await getSyllabus(); }
  catch (e) { $("#view").innerHTML = `<div class="card">Could not load syllabus: ${esc(e.message)}</div>`; return; }

  [...NAV.map((n) => [n.r, n.f]), ...HIDDEN].forEach(([r, f]) => register(r, () => import(f)));

  start({
    mount: "#view", loading: SKELETON,
    onBefore({ name }) {
      const key = ALIAS[name] || name;
      $$("[data-r]").forEach((a) => { const on = a.dataset.r === key; a.classList.toggle("on", on); on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"); });
      $("[data-more]")?.classList.toggle("on", NAV.some((n) => !n.tab && n.r === key));
      document.body.classList.toggle("in-quiz", name === "quiz");
      $("#more").hidden = true;
    },
  });
}

boot().catch((e) => {
  console.error("[app boot]", e);
  const v = document.getElementById("view");
  if (v) v.innerHTML = `<div class="card">App failed to start: ${esc(e.message)}</div>`;
});