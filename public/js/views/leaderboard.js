// js/views/leaderboard.js — ranked students (weekly / all-time)
import { esc } from "../core/dom.js";
import { getLeaderboard } from "../core/stats.js";

let period = "week";
const MEDAL = ["#f59e0b", "#94a3b8", "#c2763b"];

export default async function () {
  const html = `
    <section class="bhead" style="--fg:#f59e0b"><div class="bhead-ic">🏆</div>
      <div class="bhead-t"><small>Compete</small><h1>Leaderboard</h1><div class="bhead-pills"><span>10 points per correct answer</span></div></div></section>
    <div class="tabs" id="ptabs"><button data-p="week" class="${period === "week" ? "on" : ""}">This week</button><button data-p="all" class="${period === "all" ? "on" : ""}">All time</button></div>
    <div id="lb"><div class="sk sk-line"></div><div class="sk sk-line"></div></div>`;
  return { html, mount };
}

function mount(root) {
  const box = root.querySelector("#lb"), uid = window.__ctx.user.uid;
  const av = (n) => (n || "S").trim()[0].toUpperCase();

  async function draw() {
    let rows;
    try { rows = await getLeaderboard(period); }
    catch (e) { box.innerHTML = `<div class="st-empty"><div class="big">⚠️</div><p>${esc(e.message)}</p></div>`; return; }
    if (!rows.length) { box.innerHTML = `<div class="st-empty"><div class="big">🏁</div><p>Nobody has scored ${period === "week" ? "this week" : "yet"}. Finish a test to take the first spot!</p><a class="btn" href="#/home">Start practicing</a></div>`; return; }

    const top = rows.slice(0, 3), order = [1, 0, 2].filter((i) => top[i]);
    const hs = ["8rem", "6rem", "4.5rem"];
    const podium = `<div class="podium">${order.map((i, k) => { const r = top[i]; return `
      <div class="pod" style="--i:${k};--c:${MEDAL[i]};--h:${hs[i]}">${i === 0 ? `<span class="crown">👑</span>` : ""}
        <div class="av">${esc(av(r.name))}</div><b>${esc(r.name)}${r.id === uid ? " (you)" : ""}</b><small>${r.score} pts</small><div class="pod-b">${i + 1}</div></div>`; }).join("")}</div>`;

    const rest = rows.slice(3);
    const list = rest.length ? `<div class="stagger">${rest.map((r, i) => `
      <div class="lb-row ${r.id === uid ? "me-row" : ""}" style="--i:${Math.min(i, 12)}">
        <span class="rk">${i + 4}</span><div class="av">${esc(av(r.name))}</div>
        <div class="nm"><b>${esc(r.name)}${r.id === uid ? " (you)" : ""}</b><small>${r.tests || 0} tests · ${r.answered ? Math.round((r.correct / r.answered) * 100) : 0}% accuracy</small></div>
        <span class="pts">${r.score}</span></div>`).join("")}</div>` : "";

    const mine = rows.findIndex((r) => r.id === uid);
    const note = mine < 0 ? `<p class="muted" style="text-align:center;margin-top:1rem">You're not on the board yet. Finish a test to appear here.</p>`
      : `<p class="muted" style="text-align:center;margin-top:1rem">You're ranked <b>#${mine + 1}</b> of ${rows.length}.</p>`;
    box.innerHTML = podium + list + note;
  }

  root.querySelector("#ptabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-p]"); if (!b) return;
    period = b.dataset.p;
    root.querySelectorAll("#ptabs button").forEach((x) => x.classList.toggle("on", x === b));
    box.innerHTML = `<div class="sk sk-line"></div><div class="sk sk-line"></div>`;
    draw();
  });
  draw();
}