// js/views/result.js — animated modern score pod, pills, filterable review
import { db, doc, getDoc } from "../core/firebase.js";
import { esc, fmtTime } from "../core/dom.js";

const letters = "ABCDE";

// Crisp vector icons replacing emojis with standardized scaling
const ICONS = {
  trophy: `<svg class="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
  sparkle: `<svg class="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
  target: `<svg class="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  book: `<svg class="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10M6 10h10"/></svg>`,
  search: `<svg class="inline-icon lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`
};

export default async function ({ arg } = {}) {
  let r = window.__lastResult;
  if (!r || r.id !== arg) {
    const [a, d] = await Promise.all([getDoc(doc(db, "attempts", arg)), getDoc(doc(db, "attemptDetails", arg))]);
    if (!a.exists() || !d.exists()) {
      return {
        html: `<div class="st-empty animate-fade-in"><div class="big">${ICONS.search}</div><h2>Result not found</h2><p class="muted">We couldn't locate this test record.</p></div>`,
        mount: () => {}
      };
    }
    r = { id: arg, ...a.data(), qs: d.data().qs };
  }
  window.__currentResult = r;
  return { html: render(r), mount: wire };
}

function verdict(p) {
  return p >= 90 ? `Outstanding! ${ICONS.trophy}` : p >= 70 ? `Great work! ${ICONS.sparkle}` : p >= 30 ? `Good effort, keep going ${ICONS.target}` : `Every miss is a lesson ${ICONS.book}`;
}

function render(r) {
  const statusTheme = r.pct >= 60 ? "success" : r.pct >= 30 ? "warning" : "danger";

  return `
    <div class="card result-card center animate-fade-in" style="max-width: 680px; margin: 0 auto 1.5rem auto; padding: 2.5rem 2rem;">
      <h2 style="margin: 0 0 1.75rem; font-size: 1.5rem; font-weight: 700;">${esc(r.title)}</h2>
      
      <!-- Modern Glowing Score Pod Alternative -->
      <div class="modern-score-pod ${statusTheme}">
        <div class="pod-glow-fx"></div>
        <div class="pod-content">
          <span data-count="${r.pct}" class="pod-number">0</span>
          <span class="pod-label">Accuracy Score</span>
        </div>
      </div>

      <p style="font-weight: 700; margin: 1.5rem 0 1rem; font-size: 1.15rem; display: flex; align-items: center; justify-content: center; gap: 6px;">${verdict(r.pct)}</p>
      
      <div class="result-pills" style="display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; margin-bottom: 24px;">
        <span class="pill ok">${r.correct} correct</span>
        <span class="pill bad">${r.wrong} wrong</span>
        <span class="pill sk">${r.skipped} skipped</span>
        <span class="pill sk">⏱ ${fmtTime(r.durationSec)}</span>
      </div>

      <div class="row" style="justify-content: center; gap: 12px; display: flex; flex-wrap: wrap;">
        <a class="btn" href="#/home">Practice More</a>
        ${r.wrong > 0 ? `<a class="btn ghost" href="#/wrong">Review Mistakes</a>` : ""}
      </div>
    </div>
    
    <div style="max-width: 680px; margin: 0 auto;">
      <div class="tabs" id="rTabs" style="margin-bottom: 1rem;">
        <button data-f="all" class="on">All Questions (${r.total})</button>
        <button data-f="wrong">Wrong (${r.wrong})</button>
        <button data-f="skipped">Skipped (${r.skipped})</button>
      </div>
      <div class="card animate-slide-up" id="rlist" style="padding: 1.5rem;"></div>
    </div>`;
}

function wire(root) {
  const r = window.__currentResult;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const num = root.querySelector("[data-count]");
  
  if (reduce) {
    if (num) num.textContent = r.pct + "%";
  } else {
    const t0 = performance.now();
    const tick = (t) => { 
      const p = Math.min(1, (t - t0) / 1200); 
      if (num) num.textContent = Math.round(r.pct * (1 - Math.pow(1 - p, 3))) + "%"; 
      if (p < 1) requestAnimationFrame(tick); 
    };
    requestAnimationFrame(tick);
    if (r.pct >= 70) confetti();
  }

  const draw = (f) => {
    const list = r.qs.map((q, i) => ({ q, i })).filter(({ q }) =>
      f === "all" || (f === "wrong" && q.chosen >= 0 && q.chosen !== q.correct) || (f === "skipped" && q.chosen < 0));
    
    const rlistEl = root.querySelector("#rlist");
    if (!rlistEl) return;

    rlistEl.innerHTML = list.map(({ q, i }) => `
      <div class="rq animate-fade-in" style="margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid var(--border-color);">
        <div style="font-weight: 600; font-size: 1.02rem; line-height: 1.4;"><b>Q${i + 1}.</b> ${esc(q.text)}</div>
        <div class="opts shown" style="margin-top: 1rem; display: flex; flex-direction: column; gap: 8px;">
          ${q.options.map((o, k) => `
            <div class="opt ${k === q.correct ? "correct" : k === q.chosen ? "wrong" : ""}" style="display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 10px; transition: all 0.2s ease;">
              <b style="width: 20px; display: inline-block;">${letters[k]}</b><span>${esc(o)}</span>
            </div>`).join("")}
        </div>
        ${q.explanation ? `<div class="expl ${q.chosen === q.correct ? "ok" : "bad"}" style="margin-top: 12px; padding: 12px 14px; border-radius: 10px; font-size: 0.92rem; line-height: 1.4;"><b>Explanation:</b> ${esc(q.explanation)}</div>` : ""}
      </div>`).join("") || `<p class="muted" style="text-align: center; padding: 30px;">Nothing here for this filter.</p>`;
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