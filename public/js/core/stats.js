// js/core/stats.js — per-topic stats (weak topics) and leaderboard.
// Writes: users/{uid}/stats/summary  and  leaderboard/{uid}   Reads: leaderboard (all signed-in users)
import { db, doc, getDoc, setDoc, collection, getDocs, query, orderBy, limit } from "./firebase.js";

export const weekKey = (d = new Date()) => {
  const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7));   // Monday
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
const cache = new Map();

// Called once per finished test. Never throws.
export async function recordAttempt(sum, qs) {
  const ctx = window.__ctx, uid = ctx.user.uid;
  try {
    const ref = doc(db, "users", uid, "stats", "summary");
    const snap = await getDoc(ref);
    const topics = (snap.exists() && snap.data().topics) || {};
    for (const q of qs) {
      if (q.chosen < 0 || !q.nodeId) continue;
      const t = topics[q.nodeId] || (topics[q.nodeId] = { c: 0, t: 0 });
      t.t++; if (q.chosen === q.correct) t.c++;
    }
    await setDoc(ref, { topics, updatedAt: Date.now() });
  } catch (e) { console.warn("[stats] topics", e.message); }
  try {
    const ref = doc(db, "leaderboard", uid);
    const snap = await getDoc(ref), d = snap.exists() ? snap.data() : {};
    const wk = weekKey(), pts = sum.correct * 10;
    await setDoc(ref, {
      name: ctx.profile.name || "Student", points: (d.points || 0) + pts,
      correct: (d.correct || 0) + sum.correct, answered: (d.answered || 0) + sum.correct + sum.wrong,
      tests: (d.tests || 0) + 1, weekKey: wk, weekPoints: (d.weekKey === wk ? d.weekPoints || 0 : 0) + pts, updatedAt: Date.now(),
    });
    cache.clear();
  } catch (e) { console.warn("[stats] leaderboard", e.message); }
}

export async function getLeaderboard(period = "week") {
  const hit = cache.get(period);
  if (hit && Date.now() - hit.at < 60_000) return hit.rows;
  const f = period === "week" ? "weekPoints" : "points";
  const snap = await getDocs(query(collection(db, "leaderboard"), orderBy(f, "desc"), limit(100)));
  const wk = weekKey();
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => period !== "week" || r.weekKey === wk)
    .map((r) => ({ ...r, score: period === "week" ? r.weekPoints || 0 : r.points || 0 }))
    .filter((r) => r.score > 0).slice(0, 50);
  cache.set(period, { rows, at: Date.now() });
  return rows;
}

// Topics with at least `min` answered questions, weakest first.
export async function getWeakTopics(uid, { min = 3 } = {}) {
  const snap = await getDoc(doc(db, "users", uid, "stats", "summary"));
  const topics = (snap.exists() && snap.data().topics) || {};
  return Object.entries(topics).filter(([, v]) => v.t >= min)
    .map(([id, v]) => ({ id, c: v.c, t: v.t, pct: Math.round((v.c / v.t) * 100) }))
    .sort((a, b) => a.pct - b.pct || b.t - a.t);
}