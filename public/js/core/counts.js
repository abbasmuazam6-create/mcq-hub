// js/core/counts.js
// Real question counts per node (board/class/subject/chapter/topic).
// Uses Firestore aggregate count() queries: no documents are downloaded, and each
// query is billed as ~1 read per 1000 index entries. Results are cached for 45s.
//
//  - topic nodes:       questions where nodeId == topic
//  - every other level: questions where path array-contains node  (includes everything below it)

import { db, collection, query, where, getCountFromServer } from "./firebase.js";

const TTL = 45_000;
const cache = new Map();   // nodeId -> { total, active, at }

export function peekCount(id) {
  const c = cache.get(id);
  return c && Date.now() - c.at < TTL ? c : null;
}

export function clearCounts(id) {
  if (id) cache.delete(id); else cache.clear();
}

async function countNode(node) {
  const col = collection(db, "questions");
  const scope = node.level === "topic"
    ? where("nodeId", "==", node.id)
    : where("path", "array-contains", node.id);
  const run = async (...extra) => (await getCountFromServer(query(col, scope, ...extra))).data().count;

  const [t, a] = await Promise.allSettled([run(), run(where("status", "==", "active"))]);
  if (t.status !== "fulfilled") throw t.reason;
  return { total: t.value, active: a.status === "fulfilled" ? a.value : null };
}

// Calls onEach(id, {total, active} | {error:true}) as each count arrives.
export async function loadCounts(nodes, onEach, concurrency = 6) {
  const todo = [];
  for (const n of nodes) {
    const c = peekCount(n.id);
    if (c) onEach?.(n.id, c); else todo.push(n);
  }
  let i = 0;
  async function worker() {
    while (i < todo.length) {
      const n = todo[i++];
      try {
        const c = { ...(await countNode(n)), at: Date.now() };
        cache.set(n.id, c);
        onEach?.(n.id, c);
      } catch (e) {
        console.warn("[counts]", n.name, e.message);
        onEach?.(n.id, { error: true });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
}

/* ---- tiny rendering helpers ---- */
export function countHTML(c) {
  if (!c) return `<span class="qc-load">…</span>`;
  if (c.error) return `<span class="qc-load">—</span>`;
  const sub = c.active != null && c.active !== c.total
    ? `<span class="qc-sub"> · ${c.active} active</span>` : "";
  return `<b class="qc-num">${c.total}</b>${sub}`;
}

export function paintCounts(root, id, c) {
  root.querySelectorAll(`[data-qc="${id}"]`).forEach((el) => { el.innerHTML = countHTML(c); });
}