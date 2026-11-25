// js/views/result.js — animated score ring, pills, filterable review
import { db, doc, getDoc } from "../core/firebase.js";
import { esc, fmtTime } from "../core/dom.js";

const letters = "ABCDE";

export default async function ({ arg } = {}) {
  let r = window.__lastResult;
  if (!r || r.id !== arg) {
    const [a, d] = await Promise.all([getDoc(doc(db, "attempts", arg)), getDoc(doc(db, "attemptDetails", arg))]);
    if (!a.exists() || !d.exists()) return `<div class="st-empty"><div class="big">🔍</div>Result not found.</div>`;
    r = { id: arg, ...a.data(), qs: d.data().qs };
  }
  window.__currentResult = r;
  return { html: render(r), mount: wire };
}

function verdict(p) {
  return p >= 90 ? "Outstanding! 🏆" : p >= 70 ? "Great work! 🎉" : p >= 50 ? "Good effort, keep going 💪" : "Every miss is a lesson 📘";
}

function render(r) {
  return `
    <div class="card result-card">
      <h2 style="margin:0 0 1rem">${esc(r.title)}</h2>
      <div class="score-ring">
        <svg viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="50" fill="none" stroke-width="10"/>
          <circle class="fg ${r.pct >= 50 ? "" : "bad"}" cx="60" cy="60" r="50" fill="none" stroke-width="10" data-pct="${r.pct}"/></svg>
        <div class="center"><span data-count="${r.pct}">0</span>%</div>
      </div>
      <p style="font-weight:700;margin:0">${verdict(r.pct)}</p>
      <div class="result-pills">
        <span class="pill ok">${r.correct} correct</span><span class="pill bad">${r.wrong} wrong</span>
        <span class="pill sk">${r.skipped} skipped</span><span class="pill sk">⏱ ${fmtTime(r.durationSec)}</span>
      </div>
      <div class="row" style="justify-content:center;gap:.6rem;display:flex;flex-wrap:wrap">
        <a class="btn" href="#/home">Practice more</a>
        ${r.wrong > 0 ? `<a class="btn ghost" href="#/wrong">Review mistakes</a>` : ""}
      </div>
    </div>
    <div class="tabs" id="rTabs">
      <button data-f="all" class="on">All (${r.total})</button>
      <button data-f="wrong">Wrong (${r.wrong})</button>
      <button data-f="skipped">Skipped (${r.skipped})</button>
    </div>
    <div class="card" id="rlist"></div>`;
}

function wire(root) {
  const r = window.__currentResult;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fg = root.querySelector(".fg"), num = root.querySelector("[data-count]");
  requestAnimationFrame(() => requestAnimationFrame(() => { fg.style.strokeDashoffset = 314 - (314 * r.pct) / 100; }));
  if (reduce) num.textContent = r.pct;
  else {
    const t0 = performance.now();
    const tick = (t) => { const p = Math.min(1, (t - t0) / 1200); num.textContent = Math.round(r.pct * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    if (r.pct >= 70) confetti();
  }

  const draw = (f) => {
    const list = r.qs.map((q, i) => ({ q, i })).filter(({ q }) =>
      f === "all" || (f === "wrong" && q.chosen >= 0 && q.chosen !== q.correct) || (f === "skipped" && q.chosen < 0));
    root.querySelector("#rlist").innerHTML = list.map(({ q, i }) => `
      <div class="rq"><div><b>${i + 1}.</b> ${esc(q.text)}</div>
        <div class="opts shown" style="margin-top:.6rem">
          ${q.options.map((o, k) => `<div class="opt ${k === q.correct ? "correct" : k === q.chosen ? "wrong" : ""}"><b>${letters[k]}</b><span>${esc(o)}</span></div>`).join("")}
        </div>
        ${q.explanation ? `<div class="expl ${q.chosen === q.correct ? "ok" : "bad"}">${esc(q.explanation)}</div>` : ""}
      </div>`).join("") || `<p class="muted" style="text-align:center">Nothing here.</p>`;
  };
  draw("all");
  root.querySelectorAll("#rTabs button").forEach((btn) => btn.addEventListener("click", () => {
    root.querySelectorAll("#rTabs button").forEach((b) => b.classList.toggle("on", b === btn));
    draw(btn.dataset.f);
  }));
}

function confetti() {
  const box = document.createElement("div");
  box.className = "confetti";
  const cols = ["#6366f1", "#06b6d4", "#f59e0b", "#ef4444", "#22c55e", "#a855f7"];
  for (let i = 0; i < 60; i++) {
    const p = document.createElement("i");
    p.style.cssText = `left:${Math.random() * 100}%;background:${cols[i % 6]};animation-duration:${2 + Math.random() * 2}s;animation-delay:${Math.random() * .6}s`;
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 5000);
}