// js/views/custom.js — custom test builder (cards + chips, no dropdowns)
import { getSyllabus, kidsOf, getRandomQuestions } from "../core/store.js";
import { esc, toast, shuffle } from "../core/dom.js";

const PAL = ["#6366f1", "#0891b2", "#a855f7", "#f97316", "#0f9d58", "#e11d48"];
const SIZES = [10, 20, 30, 50];

export default async function () {
  await getSyllabus();
  return { html: `<div id="cb"></div>`, mount: wire };
}

function wire(root) {
  const el = root.querySelector("#cb");
  const subs = [];
  for (const b of kidsOf(null)) for (const c of kidsOf(b.id)) for (const s of kidsOf(c.id)) subs.push({ s, label: `${b.name} · ${c.name}` });
  const S = new Set(), C = new Set();
  let n = 20;

  const draw = () => {
    const picked = subs.filter(({ s }) => S.has(s.id));
    el.innerHTML = `
      <section class="bhead" style="--fg:#6366f1"><div class="bhead-ic">🧩</div>
        <div class="bhead-t"><small>Builder</small><h1>Custom test</h1><div class="bhead-pills"><span>Mix subjects and chapters into one test</span></div></div></section>
      <h2 class="section-title">1 · Choose subjects</h2>
      ${subs.length ? `<div class="bgrid">${subs.map(({ s, label }, i) => `
        <button class="bcard ${S.has(s.id) ? "on" : ""}" data-s="${s.id}" style="--fg:${PAL[i % 6]}">
          <span class="bcard-ic">${S.has(s.id) ? "✓" : "📚"}</span><span class="bcard-n">${esc(s.name)}</span><span class="bcard-m">${esc(label)}</span></button>`).join("")}</div>`
        : `<div class="st-empty"><div class="big">📭</div>No subjects yet.</div>`}
      ${picked.length ? `<h2 class="section-title">2 · Narrow by chapter <small>(optional)</small></h2>
        ${picked.map(({ s }) => `<div class="cgroup"><b>${esc(s.name)}</b><div class="chip-row">
          ${kidsOf(s.id).map((c) => `<button class="chip ${C.has(c.id) ? "on" : ""}" data-c="${c.id}">${esc(c.name)}</button>`).join("") || `<small class="muted">All chapters</small>`}</div></div>`).join("")}` : ""}
      <h2 class="section-title">${picked.length ? "3" : "2"} · How many questions?</h2>
      <div class="chip-row">${SIZES.map((x) => `<button class="chip ${x === n ? "on" : ""}" data-n="${x}">${x}</button>`).join("")}</div>
      <div class="dock"><div><b>${n}</b> questions<small class="muted"> · ${S.size} subject${S.size === 1 ? "" : "s"}</small></div>
        <button class="btn" id="go" ${S.size ? "" : "disabled"}>Start test →</button></div>`;
  };

  el.addEventListener("click", async (e) => {
    const s = e.target.closest("[data-s]"), c = e.target.closest("[data-c]"), z = e.target.closest("[data-n]");
    if (s) { const id = s.dataset.s; S.has(id) ? (S.delete(id), kidsOf(id).forEach((k) => C.delete(k.id))) : S.add(id); return draw(); }
    if (c) { const id = c.dataset.c; C.has(id) ? C.delete(id) : C.add(id); return draw(); }
    if (z) { n = +z.dataset.n; return draw(); }
    if (e.target.closest("#go")) {
      const ids = [...S].flatMap((sid) => { const ch = kidsOf(sid).filter((k) => C.has(k.id)); return ch.length ? ch.map((k) => k.id) : [sid]; }).slice(0, 30);
      const btn = e.target.closest("#go"); btn.disabled = true; btn.textContent = "Building…";
      try {
        const qs = await getRandomQuestions(ids, n);
        if (!qs.length) { toast("No questions found for that selection.", "warn"); return draw(); }
        window.__customSession = { mode: "practice", title: "Custom test", qs: shuffle(qs), answers: {}, idx: 0, startedAt: Date.now(), limitSec: 0 };
        location.hash = "#/quiz";
      } catch (err) { toast(err.message, "bad"); draw(); }
    }
  });
  draw();
}