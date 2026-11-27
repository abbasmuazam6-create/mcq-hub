// js/core/pick.js
// Random question selection that avoids repeats.
//
//  * Seen history: users/{uid}/seen/main  (+ localStorage mirror, works even if rules block the cloud copy)
//  * pickQuestions(): scans a random starting point in the `rand` order, skips questions the
//    student has already seen, and samples n at random from the unseen ones.
//    If there are not enough unseen questions, it tops up with the OLDEST-seen ones, so a
//    selection is always fully used before anything repeats.
import {
  db, doc, getDoc, setDoc, collection, query, where, orderBy, limit, getDocs,
} from "./firebase.js";
import { shuffle } from "./dom.js";
import { getQuestionsUnder } from "./store.js";

const SEEN_CAP = 6000;                 // remember the last 6000 questions per student
const SCAN_CAP = 1500;                 // never read more than this many docs for one test
const lsKey = (uid) => `seenQ:${uid}`;
let mem = { uid: null, map: new Map(), loaded: false };

/* ---------------- seen history ---------------- */
const parse = (str) => {
  const m = new Map();
  for (const part of String(str || "").split(",")) {
    if (!part) continue;
    const [id, t] = part.split(".");
    if (id) m.set(id, parseInt(t || "0", 36) || 0);
  }
  return m;
};
const pack = (map) => [...map].map(([id, t]) => `${id}.${t.toString(36)}`).join(",");

export async function loadSeen(uid) {
  if (mem.uid === uid && mem.loaded) return mem.map;
  const map = new Map();
  try { for (const [k, v] of parse(localStorage.getItem(lsKey(uid)))) map.set(k, v); } catch { /* ignore */ }
  try {
    const snap = await getDoc(doc(db, "users", uid, "seen", "main"));
    if (snap.exists()) for (const [k, v] of parse(snap.data().data)) map.set(k, Math.max(v, map.get(k) || 0));
  } catch (e) { console.warn("[seen] cloud copy unavailable:", e.code || e.message); }
  mem = { uid, map, loaded: true };
  return map;
}

export async function markSeen(uid, ids) {
  if (!uid || !ids?.length) return;
  const map = await loadSeen(uid);
  const now = Date.now();
  ids.forEach((id) => map.set(id, now));
  if (map.size > SEEN_CAP) {
    const keep = [...map].sort((a, b) => b[1] - a[1]).slice(0, SEEN_CAP);
    map.clear();
    keep.forEach(([k, v]) => map.set(k, v));
  }
  const data = pack(map);
  try { localStorage.setItem(lsKey(uid), data); } catch { /* quota */ }
  try { await setDoc(doc(db, "users", uid, "seen", "main"), { data, updatedAt: now }); }
  catch (e) { console.warn("[seen] cloud save skipped:", e.code || e.message); }
}

/* ---------------- picking ---------------- */
const shape = (d) => {
  const x = typeof d.data === "function" ? d.data() : d;
  return {
    id: d.id ?? x.id, text: x.text, options: x.options, correct: x.correct,
    explanation: x.explanation || "", topicId: x.topicId || "", nodeId: x.nodeId || "",
    isDouble: !!x.isDouble,
  };
};

function choose(pool, n, seen) {
  const unseen = shuffle(pool.filter((q) => !seen.has(q.id)));
  const take = unseen.slice(0, n);
  let repeated = 0;
  if (take.length < n) {
    const older = shuffle(pool.filter((q) => seen.has(q.id))).sort((a, b) => seen.get(a.id) - seen.get(b.id));
    const fill = older.slice(0, n - take.length);
    repeated = fill.length;
    take.push(...fill);
  }
  return { qs: shuffle(take), fresh: take.length - repeated, repeated, poolSize: pool.length };
}

/**
 * @param nodeIds  syllabus node ids (any level) - questions under all of them are eligible
 * @param n        how many questions
 * @param uid      student id (enables no-repeat); omit to disable
 * @returns { qs, fresh, repeated, poolSize }
 */
export async function pickQuestions(nodeIds, n, { uid } = {}) {
  const ids = [...new Set(nodeIds)].slice(0, 30);
  const seen = uid ? await loadSeen(uid) : new Map();
  const W = Math.min(200, Math.max(60, n * 3));
  const cand = new Map();
  const unseenCount = () => { let c = 0; for (const k of cand.keys()) if (!seen.has(k)) c++; return c; };
  const enough = () => unseenCount() >= n * 2 || cand.size >= SCAN_CAP;

  try {
    const col = collection(db, "questions");
    const base = [where("path", "array-contains-any", ids), where("status", "==", "active")];
    const r = Math.random();

    // Part 1: from a random point to the end of the rand order
    let cursor = r, op = ">=", stop = false;
    for (;;) {
      const s = await getDocs(query(col, ...base, where("rand", op, cursor), orderBy("rand"), limit(W)));
      s.docs.forEach((d) => cand.set(d.id, shape(d)));
      if (s.size < W) break;
      cursor = s.docs[s.docs.length - 1].data().rand; op = ">";
      if (enough()) { stop = true; break; }
    }
    // Part 2: wrap around (0 .. r) only if still needed
    if (!stop && !enough()) {
      cursor = -1;
      for (;;) {
        const s = await getDocs(query(col, ...base, where("rand", ">", cursor), where("rand", "<", r), orderBy("rand"), limit(W)));
        s.docs.forEach((d) => cand.set(d.id, shape(d)));
        if (s.size < W) break;
        cursor = s.docs[s.docs.length - 1].data().rand;
        if (enough()) break;
      }
    }
  } catch (e) {
    console.warn("[pick] primary query failed, using fallback:", e.code || e.message);
  }

  let pool = [...cand.values()];
  if (!pool.length) {
    // legacy questions without path/rand
    const lists = await Promise.all(ids.slice(0, 10).map((i) => getQuestionsUnder(i, { n: 300 }).catch(() => [])));
    const m = new Map();
    lists.flat().forEach((q) => m.set(q.id, shape(q)));
    pool = [...m.values()];
  }
  return choose(pool, n, seen);
}