// js/core/common.js
// Thin re-export of shared helpers, plus auth-only helpers.
// Everything else now lives in core/dom.js, core/store.js, core/cache.js.

export { $, $$, esc, toast, openDialog, closeDialog, readForm, shuffle, fmtTime, fmtDate, debounce } from "./dom.js";
export { getSyllabus, buildIndex, getNode, kidsOf, pathOf } from "./store.js";
export { invalidateAll, bumpCacheVersion } from "./cache.js";

import { auth, db, onAuthStateChanged, signOut, doc, getDoc, updateDoc } from "./firebase.js";
import { esc } from "./dom.js";

export const LEVELS = ["board", "class", "subject", "chapter", "topic"];
export const LEVEL_LABEL = { board: "Board", class: "Class", subject: "Subject", chapter: "Chapter", topic: "Topic" };

export async function logout() {
  await signOut(auth);
  location.replace("index.html");
}

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

export async function bumpSyllabusVersion() {
  await updateDoc(doc(db, "settings", "app"), { syllabusVersion: Date.now() });
  try { localStorage.removeItem("syllabus_v1"); } catch {}
}

// Legacy helpers still used by some views
export function normText(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim();
}

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