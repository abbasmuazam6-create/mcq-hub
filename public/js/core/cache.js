// js/core/cache.js
// Cache key builders + version helpers.
// This is the file admin.html imports — keep it dependency-free.

const VERSION_KEY = "app.cacheVersion";

export function getCacheVersion() {
  return Number(localStorage.getItem(VERSION_KEY) || 0);
}

// Bump the version so every consumer knows cached data is stale.
export function bumpCacheVersion() {
  const v = Date.now();
  localStorage.setItem(VERSION_KEY, String(v));
  return v;
}

/* ---------- localStorage key builders ---------- */
export const keys = {
  syllabus:     (ver) => `syllabus_v1:${ver ?? getCacheVersion()}`,
  syllabusMeta: ()    => `syllabus_meta_v1`,
  sel:          ()    => `sel`,
  swVersion:    ()    => `sw-version`,
};

/* ---------- invalidation ---------- */
// Remove every app-owned localStorage key, then bump version.
// Firestore's persistent IndexedDB cache is untouched — it manages itself.
export function invalidateAll() {
  const prefixes = ["syllabus_", "bank_", "users_", "app."];
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (prefixes.some((p) => k.startsWith(p))) localStorage.removeItem(k);
  }
  bumpCacheVersion();
}

// Backward-compat with the (broken) admin.html import.
// Maps "syllabus_" / "bank_" / "users_" to a single invalidateAll call.
export function invalidateCacheByPrefix(_prefix) {
  invalidateAll();
}