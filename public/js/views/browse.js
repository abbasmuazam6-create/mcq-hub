// js/views/browse.js — card-only navigation (no dropdowns):
// board → class → subject → chapter → topic → quiz
import { esc } from "../core/dom.js";
import { getSyllabus, kidsOf, getNode } from "../core/store.js";

const LEVELS = ["board", "class", "subject", "chapter", "topic"];
const PAL = [["#6366f1", "#eef2ff", "🔬"], ["#0891b2", "#e0f2fe", "📖"], ["#a855f7", "#f3e8ff", "🧪"],
             ["#f97316", "#fff4e5", "🧮"], ["#0f9d58", "#e3f6ec", "🌍"], ["#e11d48", "#ffe4e6", "🎨"]];

const qTotal = (n) => { const k = kidsOf(n.id); return k.length ? k.reduce((s, c) => s + qTotal(c), 0) : (n.qCount || 0); };
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

export default async function ({ arg } = {}) {
  await getSyllabus();
  return { html: render(arg), mount: wire };
}

function render(id) {
  if (!id) return empty("📚", "Pick a board from Home to start.");
  const node = getNode(id);
  if (!node) return empty("🔍", "That page doesn't exist anymore.");
  if (node.level === "topic") { location.hash = `#/quiz?topic=${node.id}`; return ""; }

  const sibs = kidsOf(node.parentId || null);
  const [fg, bg, emoji] = PAL[Math.max(0, sibs.findIndex((s) => s.id === node.id)) % PAL.length];
  const kids = kidsOf(node.id);
  const next = LEVELS[LEVELS.indexOf(node.level) + 1] || "topic";
  const total = qTotal(node);
  const isChapter = node.level === "chapter";
  const parent = getNode(node.parentId);

  return `
    <button class="back" data-go="${parent ? parent.id : ""}">← ${parent ? esc(parent.name) : "Home"}</button>
    ${stepper(node)}
    <section class="bhead" style="--fg:${fg}">
      <div class="bhead-ic" style="background:${bg}">${emoji}</div>
      <div class="bhead-t">
        <small>${esc(node.level || "")}</small>
        <h1>${esc(node.name)}</h1>
        <div class="bhead-pills"><span>${plural(kids.length, next)}</span><span>${plural(total, "question")}</span></div>
      </div>
    </section>
    ${isChapter ? modes(node, total) : ""}
    ${kids.length > 6 ? `<input class="bsearch" id="bq" type="search" placeholder="Search ${next}s…" aria-label="Search">` : ""}
    <h2 class="section-title">${isChapter ? "Practice by topic" : `Choose a ${next}`}</h2>
    <div class="bgrid" id="blist">${cards(kids, next)}</div>`;
}

function stepper(node) {
  const chain = [];
  for (let n = node; n; n = getNode(n.parentId)) chain.unshift(n);
  const cur = chain.length;
  return `<ol class="steps">${LEVELS.map((l, i) => {
    const c = chain[i], state = c ? "done" : i === cur ? "now" : "todo";
    return `<li class="${state}">${c ? `<button data-go="${c.id}">` : "<span>"}<i>${c ? "✓" : i + 1}</i><b>${c ? esc(c.name) : l[0].toUpperCase() + l.slice(1)}</b>${c ? "</button>" : "</span>"}</li>`;
  }).join("")}</ol>`;
}

const empty = (e, t) => `<div class="st-empty"><div class="big">${e}</div><p>${t}</p><a class="btn" href="#/home">Back to Home</a></div>`;

function modes(ch, total) {
  const m = [
    ["quiz", "🎯", "#0f9d58", "#e3f6ec", "PRACTICE", total ? `All ${total} questions` : "Mixed questions"],
    ["study", "📖", "#4338ca", "#eceafd", "STUDY", "Notes & materials"],
    ["videos", "🎬", "#d92d20", "#fdeceb", "WATCH", "Video lessons"],
  ].filter(Boolean);
  return `<div class="mode-row">${m.map(([k, ic, fg, bg, l, t], i) => `
    <div class="action-card" style="--i:${i}" role="button" tabindex="0" data-mode="${k}" data-id="${ch.id}">
      <div class="ic" style="background:${bg};color:${fg}">${ic}</div>
      <div class="body"><div class="label">${l}</div><h3>${t}</h3></div><div class="go">→</div></div>`).join("")}</div>`;
}

function cards(kids, next) {
  if (!kids.length) return `<div class="st-empty" style="grid-column:1/-1"><div class="big">📭</div>Nothing here yet. Check back soon.</div>`;
  const isTopic = next === "topic";
  return kids.map((k, i) => {
    const [fg, bg, emoji] = PAL[i % PAL.length];
    const q = qTotal(k), n = kidsOf(k.id).length;
    const ic = next === "chapter" ? `<span class="bcard-ic num">${i + 1}</span>` : isTopic ? `<span class="bcard-ic" style="--bg:${bg}">▶</span>` : `<span class="bcard-ic">${emoji}</span>`;
    const meta = isTopic ? (q ? `${q} questions` : "Practice") : `${plural(n, LEVELS[LEVELS.indexOf(next) + 1] || "topic")} · ${q} Q`;
    const tag = isTopic ? "button" : "a";
    return `<${tag} class="bcard" ${isTopic ? `data-quiz="${k.id}"` : `href="#/browse/${k.id}"`}
      data-name="${esc(k.name.toLowerCase())}" style="--i:${Math.min(i, 12)};--fg:${fg};--bg:${bg}">
      ${ic}<span class="bcard-n">${esc(k.name)}</span><span class="bcard-m">${meta}</span>
      <span class="bcard-arrow">${isTopic ? "Start" : "→"}</span></${tag}>`;
  }).join("");
}

function remember(id) {
  try { const s = JSON.parse(localStorage.getItem("sel") || "{}"); s.lastTopic = id; localStorage.setItem("sel", JSON.stringify(s)); } catch {}
}

function wire(root) {
  const act = (e) => {
    const mode = e.target.closest("[data-mode]");
    if (mode) {
      const { mode: m, id } = mode.dataset;
      remember(id);
      location.hash = m === "quiz" ? `#/quiz?topic=${id}` : `#/chapter/${id}`;
      return;
    }
    const quiz = e.target.closest("[data-quiz]");
    if (quiz && !quiz.disabled) { remember(quiz.dataset.quiz); location.hash = `#/quiz?topic=${quiz.dataset.quiz}`; return; }
    const go = e.target.closest("[data-go]");
    if (go) location.hash = go.dataset.go ? `#/browse/${go.dataset.go}` : "#/home";
  };
  root.addEventListener("click", act);
  root.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("[data-mode]")) act(e); });
  root.querySelector("#bq")?.addEventListener("input", (e) => {
    const v = e.target.value.trim().toLowerCase();
    root.querySelectorAll("#blist [data-name]").forEach((el) => { el.hidden = !!v && !el.dataset.name.includes(v); });
  });
}