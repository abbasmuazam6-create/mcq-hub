// js/views/history.js — attempt history as cards with mini score rings
import { db, collection, query, where, orderBy, limit, getDocs } from "../core/firebase.js";
import { esc, fmtDate } from "../core/dom.js";

export default async function () {
  const uid = window.__ctx.user.uid;
  let rows = [];
  try {
    const snap = await getDocs(query(collection(db, "attempts"), where("uid", "==", uid), orderBy("createdAt", "desc"), limit(30)));
    rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    return `<div class="card">${esc(e.message)}</div>`;
  }
  if (!rows.length) return `<div class="st-empty"><div class="big">📝</div><h2>No attempts yet</h2><p>Finish a quiz and it will show up here.</p><a class="btn" href="#/home">Start practicing</a></div>`;
  return `<h2 class="section-title" style="margin-top:0">Your history</h2>
    <div class="stagger">${rows.map((r, i) => `
      <a class="h-item" style="--i:${Math.min(i, 10)}" href="#/result/${r.id}">
        <div class="h-ring" style="--p:${r.pct};--c:${r.pct >= 50 ? "#16a34a" : "#ea580c"}"><span>${r.pct}%</span></div>
        <div class="h-body"><b>${esc(r.title)}</b><small>${fmtDate(r.createdAt)} · ${r.correct}/${r.total} correct · ${esc(r.mode)}</small></div>
        <span class="go" style="color:var(--brand);font-weight:700">Review</span>
      </a>`).join("")}</div>`;
}