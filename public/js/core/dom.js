// js/core/dom.js
// Shared DOM helpers. No side effects, no Firebase imports.
// Every other module depends on this file, so keep it tiny and stable.

/* ---------- selectors ---------- */
export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------- HTML escape ---------- */
const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC_MAP[c]);

/* ---------- toast ---------- */
// Persistent #toasts container, auto-removing toasts after 4s.
export function toast(msg, type = "") {
  let box = $("#toasts");
  if (!box) {
    box = document.createElement("div");
    box.id = "toasts";
    document.body.appendChild(box);
  }
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

/* ---------- native <dialog> helpers ---------- */
// Expects a <dialog id="dlg"> in the page.
export function openDialog(html) {
  const dlg = $("#dlg");
  if (!dlg) { console.warn("openDialog: #dlg not found"); return null; }
  dlg.innerHTML = html;
  if (!dlg.open) dlg.showModal();
  return dlg;
}

export function closeDialog() {
  const dlg = $("#dlg");
  if (dlg && dlg.open) dlg.close();
}

/* ---------- form helpers ---------- */
export function readForm(form) {
  // Returns a plain object of string values from a <form>.
  const out = {};
  for (const [k, v] of new FormData(form).entries()) out[k] = String(v).trim();
  return out;
}

/* ---------- misc ---------- */
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

export function fmtDate(ms) {
  return ms ? new Date(ms).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}