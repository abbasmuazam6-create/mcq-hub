import {
  auth, db, onAuthStateChanged, signOut,
  doc, getDoc, getDocs, collection, query, where, updateDoc,
} from "./firebase.js";

export const LEVELS = ["board", "class", "subject", "chapter", "topic"];
export const LEVEL_LABEL = {
  board: "Board", class: "Class", subject: "Subject", chapter: "Chapter", topic: "Topic",
};

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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

export function shuffle(a) {
  a = [...a];
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

// normalise question text so duplicates are detected even with different spacing/case
export function normText(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim();
}

// small, fast string hash (cyrb53)
export function hashText(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

export async function logout() {
  await signOut(auth);
  location.replace("index.html");
}

// Resolves with { user, profile } or redirects to the login page.
export function requireUser(opts = {}) {
  return new Promise((resolve) => {
    let off = () => {};
    off = onAuthStateChanged(auth, async (u) => {
      off();
      if (!u) { location.replace("index.html"); return; }
      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        if (!snap.exists() || snap.data().active === false) {
          await signOut(auth);
          location.replace("index.html?err=noaccess");
          return;
        }
        const profile = { id: u.uid, ...snap.data() };
        if (opts.staff && !["admin", "teacher"].includes(profile.role)) {
          location.replace("app.html");
          return;
        }
        resolve({ user: u, profile });
      } catch (e) {
        console.error(e);
        document.body.insertAdjacentHTML("afterbegin",
          `<div class="card" style="margin:20px">Could not load your profile: ${esc(e.message)}</div>`);
      }
    });
  });
}

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(String(b.name));

// Syllabus tree. Students get a cached copy that is refreshed only when an
// admin changes the tree (settings/app.syllabusVersion) -> 1 read on most visits.
export async function getSyllabus({ all = false } = {}) {
  const key = "syllabus_v1";
  let ver = 0;
  if (!all) {
    try {
      const s = await getDoc(doc(db, "settings", "app"));
      ver = s.exists() ? s.data().syllabusVersion || 0 : 0;
    } catch (e) { /* offline: fall through to cache */ ver = -1; }
    try {
      const c = JSON.parse(localStorage.getItem(key) || "null");
      if (c && (ver === -1 || c.v === ver)) return c.nodes;
    } catch (e) { /* ignore */ }
  }
  const q = all ? collection(db, "nodes") : query(collection(db, "nodes"), where("active", "==", true));
  const snap = await getDocs(q);
  const nodes = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byOrder);
  if (!all) {
    try { localStorage.setItem(key, JSON.stringify({ v: ver, nodes })); } catch (e) { /* quota */ }
  }
  return nodes;
}

export function buildIndex(nodes) {
  const byId = new Map(), kids = new Map();
  for (const n of nodes) {
    byId.set(n.id, n);
    const k = n.parentId ?? null;
    if (!kids.has(k)) kids.set(k, []);
    kids.get(k).push(n);
  }
  return { byId, kids };
}

export async function bumpSyllabusVersion() {
  await updateDoc(doc(db, "settings", "app"), { syllabusVersion: Date.now() });
  try { localStorage.removeItem("syllabus_v1"); } catch (e) { /* ignore */ }
}
