// js/views/chapter.js — chapter hub: Practice / Study / Videos (cards, no dropdowns)
import { esc, openDialog, closeDialog, toast } from "../core/dom.js";
import { getSyllabus, getNode, kidsOf, getMaterialsByNode, getVideosByNode } from "../core/store.js";

let tab = "practice", lastId = null;
const qTotal = (n) => { const k = kidsOf(n.id); return k.length ? k.reduce((s, c) => s + qTotal(c), 0) : (n.qCount || 0); };
const ytId = (u = "") => (u.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/) || [])[1];

export default async function ({ arg } = {}) {
  await getSyllabus();
  const node = getNode(arg);
  if (!node) return `<div class="st-empty"><div class="big">🔍</div><p>Chapter not found.</p><a class="btn" href="#/home">Back to Home</a></div>`;
  if (lastId !== arg) { tab = "practice"; lastId = arg; }
  const qp = new URLSearchParams(location.hash.split("?")[1] || "").get("tab");
  if (["practice", "study", "videos"].includes(qp)) tab = qp;
  const parent = getNode(node.parentId), total = qTotal(node), n = kidsOf(node.id).length;
  const html = `
    <button class="back" data-go="${parent ? parent.id : ""}">← ${parent ? esc(parent.name) : "Home"}</button>
    <section class="bhead" style="--fg:#6366f1">
      <div class="bhead-ic">📘</div>
      <div class="bhead-t"><small>${esc(node.level || "chapter")}</small><h1>${esc(node.name)}</h1>
        <div class="bhead-pills"><span>${n} topic${n === 1 ? "" : "s"}</span><span>${total} questions</span></div></div>
    </section>
    <div class="tabs" id="tabs">
      ${[["practice", "🎯 Practice"], ["study", "📖 Study"], ["videos", "🎬 Videos"]].map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? "on" : ""}">${l}</button>`).join("")}
    </div>
    <div id="body"></div>`;
  return { html, mount: (root) => wire(root, node, total) };
}

function remember(id) {
  try { const s = JSON.parse(localStorage.getItem("sel") || "{}"); s.lastTopic = id; localStorage.setItem("sel", JSON.stringify(s)); } catch {}
}

function wire(root, node, total) {
  const body = root.querySelector("#body");
  const skel = `<div class="sk sk-line"></div><div class="sk sk-line"></div>`;
  const empty = (e, t) => `<div class="st-empty"><div class="big">${e}</div>${t}</div>`;
  let mats = [], vids = [];

  async function draw() {
    if (tab === "practice") {
      const kids = kidsOf(node.id);
      body.innerHTML = `<div class="stagger">${true ? `<div class="action-card" role="button" tabindex="0" data-quiz="${node.id}" style="margin-bottom:1.1rem">
        <div class="ic" style="background:#e3f6ec;color:#0f9d58">🎯</div><div class="body"><div class="label">WHOLE ${esc((node.level || "chapter").toUpperCase())}</div><h3>${total ? `Practice all ${total} questions` : "Practice mixed questions"}</h3></div><div class="go">Start →</div></div>` : ""}</div>
        ${kids.length ? `<h2 class="section-title">Practice by topic</h2><div class="bgrid">${kids.map((t, i) => `
          <button class="bcard" style="--i:${Math.min(i, 12)};--fg:#6366f1" data-quiz="${t.id}" >
            <span class="bcard-ic">▶</span><span class="bcard-n">${esc(t.name)}</span><span class="bcard-m">${t.qCount ? `${t.qCount} questions` : "Practice"}</span><span class="bcard-arrow">Start</span></button>`).join("")}</div>` : total ? "" : empty("📭", "No questions yet.")}`;
      return;
    }
    body.innerHTML = skel;
    try {
      if (tab === "study") {
        mats = await getMaterialsByNode(node.id);
        body.innerHTML = mats.length ? `<div class="bgrid">${mats.map((m, i) => {
          const ext = m.kind === "pdf" || m.kind === "link";
          const inner = `<span class="bcard-ic">${m.kind === "pdf" ? "📄" : m.kind === "link" ? "🔗" : "📝"}</span><span class="bcard-n">${esc(m.title || "Untitled")}</span><span class="bcard-m">${esc((m.kind || "notes").toUpperCase())}</span><span class="bcard-arrow">${ext ? "Open" : "Read"}</span>`;
          const a = `class="bcard" style="--i:${Math.min(i, 12)};--fg:#0891b2"`;
          return ext ? `<a ${a} href="${esc(m.url || "#")}" target="_blank" rel="noopener">${inner}</a>` : `<button ${a} data-note="${i}">${inner}</button>`;
        }).join("")}</div>` : empty("📭", "No study materials yet.");
      } else {
        vids = await getVideosByNode(node.id);
        body.innerHTML = vids.length ? `<div class="bgrid">${vids.map((v, i) => {
          const id = ytId(v.url || v.youtubeId || "") || (v.youtubeId && v.youtubeId.length === 11 ? v.youtubeId : "");
          return `<button class="bcard vcard" style="--i:${Math.min(i, 12)};--fg:#e11d48" data-vid="${i}">
            ${id ? `<img class="vthumb" loading="lazy" alt="" src="https://img.youtube.com/vi/${id}/mqdefault.jpg">` : `<span class="bcard-ic">🎬</span>`}
            <span class="bcard-n">${esc(v.title || "Video")}</span><span class="bcard-arrow">Play</span></button>`;
        }).join("")}</div>` : empty("📭", "No videos yet.");
      }
    } catch (e) { body.innerHTML = empty("⚠️", esc(e.message)); }
  }

  function modal(title, inner) {
    const d = openDialog(`<div class="dl-h"><h3>${esc(title)}</h3><button class="icon" data-close aria-label="Close">✕</button></div><div class="dl-b">${inner}</div>`);
    if (!d) return;
    d.onclick = (e) => { if (e.target === d || e.target.closest("[data-close]")) closeDialog(); };
    d.addEventListener("close", () => (d.innerHTML = ""), { once: true });
  }

  const act = (e) => {
    const t = e.target.closest("[data-tab]");
    if (t) { tab = t.dataset.tab; root.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b === t)); draw(); return; }
    const q = e.target.closest("[data-quiz]");
    if (q && !q.disabled) { remember(q.dataset.quiz); location.hash = `#/quiz?topic=${q.dataset.quiz}`; return; }
    const g = e.target.closest("[data-go]");
    if (g) { location.hash = g.dataset.go ? `#/browse/${g.dataset.go}` : "#/home"; return; }
    const n = e.target.closest("[data-note]");
    if (n) { const m = mats[+n.dataset.note]; modal(m.title || "Notes", `<div style="white-space:pre-wrap;line-height:1.75">${esc(m.body ?? m.content ?? m.text ?? "")}</div>`); return; }
    const v = e.target.closest("[data-vid]");
    if (v) {
      const x = vids[+v.dataset.vid], id = ytId(x.url || "") || x.youtubeId;
      if (id) modal(x.title || "Video", `<div class="vframe"><iframe src="https://www.youtube.com/embed/${esc(id)}?rel=0" allowfullscreen loading="lazy"></iframe></div>`);
      else if (x.url) window.open(x.url, "_blank", "noopener"); else toast("No video link.", "warn");
    }
  };
  root.addEventListener("click", act);
  root.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("[data-quiz]")) act(e); });
  draw();
}