// js/core/store.js
// Unified data store: memory cache + Firestore persistent cache + network fallback.
// Views should NEVER call getDocs() directly for nodes/questions/materials/videos.
// Mutations still go direct to Firestore from admin views (they're rare).

import {
  db, doc, getDoc, getDocs, getDocsFromCache,
  collection, query, where, orderBy, limit,
} from "./firebase.js";
import { keys, getCacheVersion, bumpCacheVersion } from "./cache.js";

/* ================== in-memory state ================== */
const mem = {
  syllabus:   null,   // { nodes, idx, version, loadedAt }
  questions:  new Map(), // key -> { rows, at }
  materials:  new Map(),
  videos:     new Map(),
  meta:       new Map(), // collectionName -> lastFetchedAt (for TTL checks)
};

const TTL = {
  questions: 5 * 60_000,  // 5 min
  materials: 10 * 60_000,
  videos:    10 * 60_000,
};

/* ================== index builders ================== */
const byOrder = (a, b) =>
  (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(String(b.name));

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

/* ================== syllabus ================== */
// Students: active only. Admin: { all: true }.
// On cold boot, one read of settings/app to check version, else cached copy wins.
export async function getSyllabus({ all = false, force = false } = {}) {
  if (!force && mem.syllabus && !all) return mem.syllabus;

  const ver = getCacheVersion();
  const cachedRaw = localStorage.getItem(keys.syllabus(ver));
  if (!force && cachedRaw) {
    try {
      const parsed = JSON.parse(cachedRaw);
      const idx = buildIndex(parsed.nodes);
      mem.syllabus = { ...parsed, idx };
      if (!all) return mem.syllabus;
    } catch { /* corrupt, fall through */ }
  }

  const q = all
    ? collection(db, "nodes")
    : query(collection(db, "nodes"), where("active", "==", true));
  const snap = await getDocs(q);
  const nodes = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byOrder);
  const idx = buildIndex(nodes);
  mem.syllabus = { nodes, idx, version: ver, loadedAt: Date.now() };

  if (!all) {
    try { localStorage.setItem(keys.syllabus(ver), JSON.stringify({ nodes, version: ver })); }
    catch { /* quota — ignore */ }
  }
  return mem.syllabus;
}

// Invalidate memory + localStorage copy after an admin write.
export function invalidateSyllabus() {
  mem.syllabus = null;
  bumpCacheVersion();
}

/* ================== node helpers ================== */
export function getNode(id)   { return mem.syllabus?.idx.byId.get(id) || null; }
export function kidsOf(id)    { return mem.syllabus?.idx.kids.get(id ?? null) || []; }
export function pathOf(id) {
  const out = [];
  let n = getNode(id);
  while (n) { out.unshift(n.id); n = getNode(n.parentId); }
  return out;
}

/* ================== questions ================== */
// Cache-first fetch by node. Falls back to Firestore persistent cache,
// then network. Returns a shuffled array ready for a quiz.
export async function getQuestionsByNode(nodeId, { n = 100, force = false } = {}) {
  const key = `node:${nodeId}`;
  const hit = mem.questions.get(key);
  if (!force && hit && Date.now() - hit.at < TTL.questions) {
    return shufflePick(hit.rows, n);
  }

  const qref = query(
    collection(db, "questions"),
    where("nodeId", "==", nodeId),
    where("status", "==", "active"),
    limit(500)
  );

  let rows;
  try {
    // Prefer the local persistent cache — this is the "instant" path.
    const snap = await getDocsFromCache(qref);
    if (snap.empty) throw new Error("cold cache");
    rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Kick off a background refresh, don't await.
    getDocs(qref).then((s) => {
      mem.questions.set(key, { rows: s.docs.map((d) => ({ id: d.id, ...d.data() })), at: Date.now() });
    }).catch(() => {});
  } catch {
    const snap = await getDocs(qref);
    rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  mem.questions.set(key, { rows, at: Date.now() });
  return shufflePick(rows, n);
}

// Random sample across several node ids — used by custom test / random drill.
// Uses the `rand` field already present on questions.
async function randomByPath(nodeIds, n = 20) {
  const ids = nodeIds.slice(0, 30);
  const base = [
    where("path", "array-contains-any", ids),
    where("status", "==", "active"),
  ];
  const col = collection(db, "questions");
  const r = Math.random();
  let docs = (await getDocs(query(col, ...base, where("rand", ">=", r), orderBy("rand"), limit(n)))).docs;
  if (docs.length < n) {
    const more = await getDocs(query(col, ...base, where("rand", "<", r), orderBy("rand"), limit(n - docs.length)));
    docs = docs.concat(more.docs);
  }
  return docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---- robust fallback: works even if imported questions lack `path` / `rand` ----
function descendants(id) {
  const out = [id];
  (function walk(x) { for (const k of kidsOf(x)) { out.push(k.id); walk(k.id); } })(id);
  return out;
}
export async function getQuestionsUnder(nodeId, { n = 20 } = {}) {
  const ids = shufflePick(descendants(nodeId), 20);
  const lists = await Promise.all(ids.map((i) => getQuestionsByNode(i, { n: 200 }).catch(() => [])));
  return shufflePick([...new Map(lists.flat().map((q) => [q.id, q])).values()], n);
}
export async function getRandomQuestions(nodeIds, n = 20) {
  let rows = [];
  try { rows = await randomByPath(nodeIds, n); }
  catch (e) { console.warn("[questions] path query failed, using fallback:", e.message); }
  if (rows.length) return rows;
  const lists = await Promise.all(nodeIds.slice(0, 30).map((i) => getQuestionsUnder(i, { n })));
  return shufflePick([...new Map(lists.flat().map((q) => [q.id, q])).values()], n);
}

function shufflePick(rows, n) {
  const a = [...rows];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.min(n, a.length));
}

export function invalidateQuestions(nodeId) {
  if (nodeId) mem.questions.delete(`node:${nodeId}`);
  else mem.questions.clear();
}

/* ================== materials ================== */
export async function getMaterialsByNode(nodeId, { force = false } = {}) {
  const key = `node:${nodeId}`;
  const hit = mem.materials.get(key);
  if (!force && hit && Date.now() - hit.at < TTL.materials) return hit.rows;

  const qref = query(
    collection(db, "materials"),
    where("nodeId", "==", nodeId),
    where("status", "==", "active"),
    limit(200)
  );
  let rows;
  try {
    const snap = await getDocsFromCache(qref);
    if (snap.empty) throw new Error("cold cache");
    rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    const snap = await getDocs(qref);
    rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  mem.materials.set(key, { rows, at: Date.now() });
  return rows;
}

/* ================== videos ================== */
export async function getVideosByNode(nodeId, { force = false } = {}) {
  const key = `node:${nodeId}`;
  const hit = mem.videos.get(key);
  if (!force && hit && Date.now() - hit.at < TTL.videos) return hit.rows;

  const qref = query(
    collection(db, "videos"),
    where("nodeId", "==", nodeId),
    where("status", "==", "active"),
    limit(200)
  );
  let rows;
  try {
    const snap = await getDocsFromCache(qref);
    if (snap.empty) throw new Error("cold cache");
    rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    const snap = await getDocs(qref);
    rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  mem.videos.set(key, { rows, at: Date.now() });
  return rows;
}

/* ================== single docs ================== */
export async function getDocCached(collName, id) {
  const cacheKey = `${collName}:${id}`;
  if (mem.meta.has(cacheKey)) {
    const c = mem.meta.get(cacheKey);
    if (Date.now() - c.at < TTL.questions) return c.row;
  }
  const snap = await getDoc(doc(db, collName, id));
  if (!snap.exists()) return null;
  const row = { id: snap.id, ...snap.data() };
  mem.meta.set(cacheKey, { row, at: Date.now() });
  return row;
}

/* ================== global clear ================== */
export function clearAll() {
  mem.syllabus = null;
  mem.questions.clear();
  mem.materials.clear();
  mem.videos.clear();
  mem.meta.clear();
}