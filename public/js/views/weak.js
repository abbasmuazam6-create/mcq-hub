// js/views/weak.js — topics ranked by accuracy, weakest first
import { esc, toast, shuffle } from "../core/dom.js";
import { getSyllabus, getNode, getRandomQuestions } from "../core/store.js";
import { getWeakTopics } from "../core/stats.js";

export default async function () {
  await getSyllabus();
  const uid = window.__ctx.user.uid;
  let rows = [];
  try { rows = (await getWeakTopics(uid)).map((w) => ({ ...w, n: getNode(w.id) })).filter((w) => w.n); }
  catch (e) { return `<div class="st-empty"><div class="big">⚠️</div><p>${esc(e.message)}</p></div>`; }

  const weak = rows.filter((r) => r.pct < 70);
  const head = `<section class="bhead" style="--fg:#e11d48"><div class="bhead-ic">📉</div>
    <div class="bhead-t"><small>Insights</small><h1>Weak topics</h1><div class="bhead-pills"><span>${rows.length} topics tracked</span><span>${weak.length} need work</span></div></div>
    ${weak.length ? `<button class="btn" data-mix>Practice weak spots</button>` : ""}</section>`;
  if (!rows.length) return head + `<div class="st-empty"><div class="big">📊</div><p>Answer at least 3 questions in a topic and it will show up here with your accuracy.</p><a class="btn" href="#/home">Start practicing</a></div>`;

  const col = (p) => (p < 50 ? "#e11d48" : p < 70 ? "#f97316" : "#16a34a");
  const html = head + `<div class="bgrid">${rows.map((r, i) => `
    <a class="bcard" href="#/quiz?topic=${r.id}" style="--i:${Math.min(i, 12)};--fg:${col(r.pct)}">
      <div class="h-ring" style="--p:${r.pct};--c:${col(r.pct)}"><span>${r.pct}%</span></div>
      <span class="bcard-n">${esc(r.n.name)}</span>
      <span class="bcard-m">${esc(getNode(r.n.parentId)?.name || "")} · ${r.c}/${r.t} correct</span>
      <span class="bcard-arrow">Practice</span></a>`).join("")}</div>`;

  return {
    html,
    mount(root) {
      root.querySelector("[data-mix]")?.addEventListener("click", async (e) => {
        const b = e.currentTarget; b.disabled = true; b.textContent = "Building…";
        try {
          const qs = await getRandomQuestions(weak.slice(0, 10).map((w) => w.id), 20);
          if (!qs.length) { toast("No questions found for those topics.", "warn"); b.disabled = false; b.textContent = "Practice weak spots"; return; }
          window.__customSession = { mode: "practice", title: "Weak spots", qs: shuffle(qs), answers: {}, idx: 0, startedAt: Date.now(), limitSec: 0 };
          location.hash = "#/quiz";
        } catch (err) { toast(err.message, "bad"); b.disabled = false; b.textContent = "Practice weak spots"; }
      });
    },
  };
}