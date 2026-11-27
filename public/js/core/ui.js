// js/core/ui.js
// Small shared UI helpers for the student side: board logos everywhere a board is shown.
import { esc } from "./dom.js";
import { getNode } from "./store.js";

let styled = false;
function ensureStyle() {
  if (styled) return;
  styled = true;
  const s = document.createElement("style");
  s.id = "blogoStyle";
  s.textContent = `
    .blogo { position: relative; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
      width: var(--s, 40px); height: var(--s, 40px); border-radius: calc(var(--s, 40px) * .28);
      background: rgba(99,102,241,.12); color: #6366f1; font-weight: 800; font-size: calc(var(--s, 40px) * .42);
      overflow: hidden; border: 1px solid rgba(99,102,241,.28); line-height: 1; vertical-align: middle; }
    .blogo img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; padding: 12%; background: #fff; }
    .bchip { display: inline-flex; align-items: center; gap: .4rem; padding: .18rem .6rem .18rem .2rem; border-radius: 999px;
      font-size: .72rem; font-weight: 700; background: rgba(99,102,241,.1); border: 1px solid rgba(99,102,241,.25); color: inherit; }
    .is-empty { opacity: .55; }
  `;
  document.head.appendChild(s);
}

// Only http(s) URLs are ever used as an image source.
export function safeUrl(u) {
  try {
    const x = new URL(String(u || "").trim());
    return x.protocol === "https:" || x.protocol === "http:" ? x.href : "";
  } catch { return ""; }
}

// Climb the tree to the board a node belongs to.
export function boardOf(node) {
  for (let n = node; n; n = getNode(n.parentId)) if (n.level === "board") return n;
  return null;
}

// Logo (or a letter badge if the board has no logo / the image fails to load).
export function logoHTML(board, { size = 40 } = {}) {
  if (!board) return "";
  ensureStyle();
  const url = safeUrl(board.logoUrl);
  const ini = esc((board.name || "?").trim().slice(0, 1).toUpperCase());
  return `<span class="blogo" style="--s:${size}px" title="${esc(board.name)}">${ini}` +
    (url ? `<img src="${esc(url)}" alt="${esc(board.name)} logo" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : "") +
    `</span>`;
}

// Pill: [logo] Board name  - shown on class / subject / chapter pages.
export function boardChip(node) {
  const b = boardOf(node);
  if (!b) return "";
  ensureStyle();
  return `<span class="bchip">${logoHTML(b, { size: 22 })}<span>${esc(b.name)}</span></span>`;
}