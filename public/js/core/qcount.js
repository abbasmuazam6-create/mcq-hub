// js/core/qcount.js
// Accurate question counts for student cards.
//  - counts ONLY active questions (what a student can actually practise)
//  - topic -> questions where nodeId == topic
//  - every other level -> questions where path array-contains node (everything below it)
//  - Firestore aggregate count(): no documents downloaded, ~1 read per 1000 matches
//  - cached in memory + localStorage (5 min), painted instantly then refreshed
import { db, collection, query, where, getCountFromServer } from "./firebase.js";

const KEY = "qcnt:v2";
const TTL = 5 * 60_000;
const FMT = {
  n: (n) => String(n),
  qs: (n) => `${n} Qs`,
  q: (n) => `${n} Q`,
  question: (n) => `${n} question${n === 1 ? "" : "s"}`,
};

let store = {};
try { store = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { store = {}; }
let saveT;
const persist = () => {
  clearTimeout(saveT);
  saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* quota */ } }, 300);
};

export const cachedCount = (id) => (store[id] ? store[id].n : null);
const fresh = (id) => store[id] && Date.now() - store[id].at < TTL;

const inflight = new Map();
function fetchOne(node) {
  if (inflight.has(node.id)) return inflight.get(node.id);
  const scope = node.level === "topic"
    ? where("nodeId", "==", node.id)
    : where("path", "array-contains", node.id);
  const p = getCountFromServer(query(collection(db, "questions"), scope, where("status", "==", "active")))
    .then((s) => s.data().count)
    .finally(() => inflight.delete(node.id));
  inflight.set(node.id, p);
  return p;
}

// onEach(id, count|null) is called immediately for cached values, then again when fresh ones arrive.
export async function refreshCounts(nodes, onEach, { force = false, concurrency = 6 } = {}) {
  const uniq = [...new Map(nodes.filter(Boolean).map((n) => [n.id, n])).values()];
  uniq.forEach((n) => { const c = cachedCount(n.id); if (c != null) onEach?.(n.id, c); });
  const todo = uniq.filter((n) => force || !fresh(n.id));
  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const n = todo[i++];
      try {
        const c = await fetchOne(n);
        store[n.id] = { n: c, at: Date.now() };
        onEach?.(n.id, c);
      } catch (e) {
        console.warn("[qcount]", n.name, e.code || e.message);
        if (cachedCount(n.id) == null) onEach?.(n.id, null);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
  persist();
}

/* ---- rendering ---- */
// <span data-qn="NODE_ID" data-fmt="qs|q|question|n">…</span>
export function qnHTML(id, fmt = "n") {
  const c = cachedCount(id);
  return `<span data-qn="${id}" data-fmt="${fmt}">${c == null ? "…" : FMT[fmt](c)}</span>`;
}

// Any element with data-qn-gate="NODE_ID" is disabled / greyed out when that node has 0 questions.
export function paintOne(root, id, n) {
  root.querySelectorAll(`[data-qn="${id}"]`).forEach((el) => {
    el.textContent = n == null ? "—" : (FMT[el.dataset.fmt] || FMT.n)(n);
  });
  root.querySelectorAll(`[data-qn-gate="${id}"]`).forEach((el) => {
    const empty = n === 0;
    el.classList.toggle("is-empty", empty);
    if (el.tagName === "BUTTON") el.disabled = empty;
    el.setAttribute("aria-disabled", empty ? "true" : "false");
  });
}

export function hydrate(root, nodes, onEach) {
  return refreshCounts(nodes, (id, n) => { paintOne(root, id, n); onEach?.(id, n); });
}