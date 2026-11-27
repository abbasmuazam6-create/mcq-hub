// js/admin/views/bank.js
// Question bank: stats, per-chapter / per-topic breakdown, accurate Double-MCQ filter.
import { db, collection, query, where, getDocs, writeBatch, doc } from "../../core/firebase.js";
import { $, esc, toast } from "../../core/dom.js";
import { getSyllabus, getNode } from "../../core/store.js";
import { clearCounts } from "../../core/counts.js";
import { isDoubleQuestion, detectDoubleMCQ } from "../../core/mcq.js";
import { pickerHTML, mountPicker } from "../picker.js";
import { makeQuestionsConfig, openQuestionDialog } from "../configs/questions.js";
import { DataTable } from "../DataTable.js";

let dt = null;
let currentScope = null;
let lastRows = [];
const PAGE_SIZES = [15, 50, 100, 250, 500];

export default async function () {
  await getSyllabus({ all: true });
  return { html: render(), mount: wire };
}

/* ---------------- layout ---------------- */
function render() {
  return `
    <style id="bankViewStyle">
      #bankView { display: flex; flex-direction: column; gap: 1rem; }
      #bankView .card { padding: 1.25rem; border-radius: 1rem; background: var(--card, #fff); border: 1px solid var(--line, rgba(148,163,184,.3)); }
      #bankView h2 { font-size: 1.15rem; font-weight: 700; margin: 0 0 .35rem; }
      #bankView .muted { font-size: .82rem; color: var(--muted, #64748b); }

      /* double MCQ highlight */
      .double-mcq-row td { background: rgba(245,158,11,.10) !important; border-color: rgba(245,158,11,.2) !important; }
      .dark .double-mcq-row td { background: rgba(245,158,11,.15) !important; border-color: rgba(245,158,11,.25) !important; }

      /* stat cards */
      .bk-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap: .6rem; }
      .bk-stat { display: flex; flex-direction: column; gap: .1rem; padding: .7rem .85rem; text-align: left; font: inherit; color: inherit;
        border-radius: .9rem; border: 1px solid var(--line, rgba(148,163,184,.3)); background: var(--card, #fff); }
      button.bk-stat { cursor: pointer; transition: transform .12s, border-color .12s, box-shadow .12s; }
      button.bk-stat:hover { transform: translateY(-1px); border-color: #6366f1; }
      .bk-stat.on { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99,102,241,.22); }
      .bk-num { font-size: 1.4rem; font-weight: 800; line-height: 1.1; }
      .bk-lbl { font-size: .68rem; text-transform: uppercase; letter-spacing: .05em; font-weight: 600; color: var(--muted, #64748b); }
      .bk-stat.ok .bk-num { color: #059669; } .bk-stat.warn .bk-num { color: #d97706; } .bk-stat.bad .bk-num { color: #e11d48; }

      /* breakdown */
      details.bk-break > summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: .5rem; font-weight: 700; font-size: .9rem; }
      details.bk-break > summary::-webkit-details-marker { display: none; }
      details.bk-break > summary::before { content: "▸"; transition: transform .15s; color: #6366f1; }
      details.bk-break[open] > summary::before { transform: rotate(90deg); }
      .bk-list { margin-top: .75rem; display: grid; gap: .3rem; max-height: 46vh; overflow: auto; padding-right: .25rem; }
      .bk-item { position: relative; display: flex; align-items: center; justify-content: space-between; gap: .75rem; width: 100%;
        padding: .42rem .7rem; text-align: left; font: inherit; color: inherit; cursor: pointer; overflow: hidden;
        border-radius: .65rem; border: 1px solid transparent; background: rgba(148,163,184,.08); }
      .bk-item::before { content: ""; position: absolute; inset: 0 auto 0 0; width: var(--w, 0%); background: rgba(99,102,241,.14); pointer-events: none; }
      .bk-item > * { position: relative; }
      .bk-item:hover { border-color: rgba(99,102,241,.45); }
      .bk-item.on { border-color: #6366f1; }
      .bk-ch { font-weight: 600; font-size: .84rem; }
      .bk-tp { margin-left: 1.25rem; width: calc(100% - 1.25rem); font-size: .78rem; }
      .bk-meta { display: flex; gap: .4rem; align-items: center; flex-shrink: 0; font-size: .7rem; color: var(--muted, #64748b); }
      .bk-count { font-weight: 800; font-size: .86rem; color: inherit; }
    </style>

    <div id="bankView">
      <div class="card">
        <h2>Question Bank</h2>
        <p class="muted" style="margin:0 0 .75rem">Pick a scope to browse, audit and clean up your MCQs.</p>
        <div class="grid4" id="pk">${pickerHTML("topic")}</div>
      </div>
      <div id="bankStats"></div>
      <div id="bankTable"></div>
    </div>`;
}

function wire(root) {
  mountPicker($("#pk", root), {
    stopAt: "topic",
    persistKey: "bankPick",
    onSelect: async ({ nodeId, level }) => {
      if (!nodeId) {
        $("#bankStats").innerHTML = "";
        $("#bankTable").innerHTML = `<div class="card center muted py-12">Pick at least a Board or Category to explore questions.</div>`;
        currentScope = null; dt = null; lastRows = [];
        return;
      }
      const changed = !currentScope || currentScope.scopeId !== nodeId || currentScope.scopeLevel !== level;
      currentScope = { scopeId: nodeId, scopeLevel: level };
      await loadTable(currentScope, { silent: !changed });
    },
  });

  wireStatsClicks();
  wireEditDelegation();
  wireAutoRefresh();
}

/* ---------------- where does a question live? ---------------- */
function locate(r) {
  const n = getNode(r.nodeId);
  if (!n) return { chapterId: null, topicId: null };
  if (n.level === "topic") return { chapterId: n.parentId || null, topicId: n.id };
  if (n.level === "chapter") return { chapterId: n.id, topicId: null };
  return { chapterId: null, topicId: null };
}

const byNodeOrder = (a, b) =>
  (getNode(a.id)?.order ?? 1e9) - (getNode(b.id)?.order ?? 1e9) || String(a.name).localeCompare(String(b.name));

function buildGroups(rows) {
  const groups = new Map();
  for (const r of rows) {
    const { chapterId, topicId } = locate(r);
    const key = chapterId || "_none";
    let g = groups.get(key);
    if (!g) {
      g = { id: chapterId, name: chapterId ? (getNode(chapterId)?.name || "Unknown chapter") : "Directly under a higher level",
        total: 0, active: 0, dbl: 0, direct: 0, topics: new Map() };
      groups.set(key, g);
    }
    const active = r.status === "active";
    const dbl = isDoubleQuestion(r);
    g.total++; if (active) g.active++; if (dbl) g.dbl++;
    if (topicId) {
      let t = g.topics.get(topicId);
      if (!t) { t = { id: topicId, name: getNode(topicId)?.name || "Unknown topic", total: 0, active: 0, dbl: 0 }; g.topics.set(topicId, t); }
      t.total++; if (active) t.active++; if (dbl) t.dbl++;
    } else g.direct++;
  }
  const list = [...groups.values()].sort(byNodeOrder);
  list.forEach((g) => { g.topicList = [...g.topics.values()].sort(byNodeOrder); });
  return list;
}

/* ---------------- stats + breakdown panel ---------------- */
function renderStats(rows) {
  const host = $("#bankStats");
  if (!host) return;
  if (!rows.length) { host.innerHTML = ""; return; }

  const st = { active: 0, draft: 0, archived: 0 };
  let dbl = 0;
  for (const r of rows) {
    st[r.status in st ? r.status : "draft"]++;
    if (isDoubleQuestion(r)) dbl++;
  }
  const groups = buildGroups(rows);
  const max = Math.max(...groups.flatMap((g) => [g.total, ...g.topicList.map((t) => t.total)]), 1);
  const topicCount = groups.reduce((n, g) => n + g.topicList.length, 0);
  const curGrp = dt?.filters?._grp || "all";
  const dblOn = dt?.filters?._dbl === "double";

  const item = (cls, val, name, x) => `
    <button type="button" class="bk-item ${cls} ${curGrp === val ? "on" : ""}" data-grp="${esc(val)}" style="--w:${Math.round((x.total / max) * 100)}%">
      <span>${esc(name)}</span>
      <span class="bk-meta">
        ${x.dbl ? `<span title="Double MCQs" style="color:#d97706">${x.dbl} double</span>` : ""}
        <span>${x.active}/${x.total} active</span>
        <span class="bk-count">${x.total}</span>
      </span>
    </button>`;

  host.innerHTML = `
    <div class="bk-stats">
      <button type="button" class="bk-stat" data-bk="reset" title="Clear all filters"><span class="bk-num">${rows.length}</span><span class="bk-lbl">Questions</span></button>
      <div class="bk-stat ok"><span class="bk-num">${st.active}</span><span class="bk-lbl">Active</span></div>
      <div class="bk-stat warn"><span class="bk-num">${st.draft}</span><span class="bk-lbl">Draft</span></div>
      <div class="bk-stat bad"><span class="bk-num">${st.archived}</span><span class="bk-lbl">Archived</span></div>
      <button type="button" class="bk-stat warn ${dblOn ? "on" : ""}" data-bk="dbl" title="Show only Double / Statement MCQs"><span class="bk-num">${dbl}</span><span class="bk-lbl">Double MCQs</span></button>
    </div>
    <details class="card bk-break" style="margin-top:.75rem" ${groups.length <= 10 ? "open" : ""}>
      <summary>Questions per chapter &amp; topic
        <span class="muted">· ${groups.filter((g) => g.id).length} chapter(s) · ${topicCount} topic(s)</span>
      </summary>
      <div class="bk-list">
        ${groups.map((g) => `
          ${g.id ? item("bk-ch", "c:" + g.id, g.name, g) : `<div class="bk-item bk-ch" style="cursor:default"><span>${esc(g.name)}</span><span class="bk-meta"><span class="bk-count">${g.total}</span></span></div>`}
          ${g.id && g.direct ? `<div class="bk-item bk-tp" style="cursor:default;opacity:.8"><span>Directly in chapter (no topic)</span><span class="bk-meta"><span class="bk-count">${g.direct}</span></span></div>` : ""}
          ${g.topicList.map((t) => item("bk-tp", "t:" + t.id, t.name, t)).join("")}
        `).join("")}
      </div>
    </details>`;
}

function wireStatsClicks() {
  const host = $("#bankStats");
  if (!host || host._wired) return;
  host._wired = true;
  host.addEventListener("click", (e) => {
    if (!dt) return;
    const grp = e.target.closest("[data-grp]");
    const bk = e.target.closest("[data-bk]");
    if (grp) {
      const v = grp.dataset.grp;
      dt.filters._grp = dt.filters._grp === v ? "all" : v;
    } else if (bk?.dataset.bk === "dbl") {
      dt.filters._dbl = dt.filters._dbl === "double" ? "all" : "double";
    } else if (bk?.dataset.bk === "reset") {
      Object.keys(dt.filters).forEach((k) => { dt.filters[k] = "all"; });
      dt.search = "";
    } else return;
    dt.page = 1;
    dt.render();
    renderStats(lastRows);
  });
  // keep the highlight in sync when the user changes the table's own dropdowns
  $("#bankTable")?.addEventListener("change", () => setTimeout(() => renderStats(lastRows), 0));
}

/* ---------------- table config ---------------- */
function buildConfig(scope) {
  const cfg = makeQuestionsConfig(scope);
  cfg.compact = true;
  cfg.pageSizes = PAGE_SIZES;
  cfg.pageSize = dt?.pageSize && dt.pageSize !== 25 ? dt.pageSize : 50;
  cfg.rowClass = (r) => (isDoubleQuestion(r) ? "double-mcq-row" : "");   // <- must live on the config

  // "Location" column when browsing above topic level
  if (scope.scopeLevel !== "topic") {
    const at = cfg.columns.findIndex((c) => c.key === "correct");
    cfg.columns.splice(at < 0 ? cfg.columns.length : at, 0, {
      key: "loc", label: "Chapter › Topic", sortable: false,
      render: (r) => {
        const { chapterId, topicId } = locate(r);
        const txt = [chapterId && getNode(chapterId)?.name, topicId && getNode(topicId)?.name].filter(Boolean).join(" › ");
        return `<span style="font-size:.72rem;color:var(--muted,#64748b)">${esc(txt || "—")}</span>`;
      },
    });
  }

  // Double-MCQ filter lives in the table, so it re-filters instantly
  cfg.filters.push({
    key: "_dbl", default: "all",
    options: [
      { value: "all", label: "All types" },
      { value: "double", label: "Double / Statement" },
      { value: "standard", label: "Standard only" },
    ],
    predicate: (r, v) => v === "all" || (v === "double") === isDoubleQuestion(r),
  });

  // Chapter / topic filter, built from the rows we actually have
  const groups = buildGroups(lastRows);
  if (groups.some((g) => g.id)) {
    const opts = [{ value: "all", label: "All chapters & topics" }];
    for (const g of groups) {
      if (!g.id) continue;
      opts.push({ value: "c:" + g.id, label: `${g.name} (${g.total})` });
      g.topicList.forEach((t) => opts.push({ value: "t:" + t.id, label: `\u00A0\u00A0↳ ${t.name} (${t.total})` }));
    }
    cfg.filters.push({
      key: "_grp", default: "all", options: opts,
      predicate: (r, v) => {
        if (v === "all") return true;
        const { chapterId, topicId } = locate(r);
        return v.startsWith("c:") ? chapterId === v.slice(2) : topicId === v.slice(2);
      },
    });
  }

  const seen = new Set();
  cfg.filters = cfg.filters.filter((f) => f?.key && !seen.has(f.key) && seen.add(f.key));

  cfg.headerActions.push({ id: "rescan", label: "↻ Re-scan Double", kind: "ghost", onClick: rescanDouble });
  return cfg;
}

// Re-evaluates the stored isDouble flag with the improved detector (skips manual overrides).
async function rescanDouble(table) {
  const changes = lastRows.filter((r) => r.doubleManual !== true && !!r.isDouble !== detectDoubleMCQ(r));
  if (!changes.length) return toast("Double flags are already up to date.", "ok");
  if (!confirm(`Update the Double flag on ${changes.length} question(s) using the improved detector?`)) return;
  try {
    for (let i = 0; i < changes.length; i += 400) {
      const b = writeBatch(db);
      changes.slice(i, i + 400).forEach((r) => b.update(doc(db, "questions", r.id), { isDouble: detectDoubleMCQ(r) }));
      await b.commit();
    }
    toast(`Updated ${changes.length} question(s)`, "ok");
    clearCounts();
    await table.triggerRefresh();
  } catch (e) { toast(e.message, "bad"); }
}

/* ---------------- load ---------------- */
async function loadTable(scope, { silent = false } = {}) {
  if (!scope) return;
  if (!silent || !dt) {
    $("#bankStats").innerHTML = "";
    $("#bankTable").innerHTML = `
      <div class="card center py-16 flex flex-col items-center justify-center gap-3">
        <div class="modern-loader"></div>
        <span class="text-xs font-medium text-slate-500">Loading questions into bank…</span>
      </div>`;
  }

  const col = collection(db, "questions");
  const q = scope.scopeLevel === "topic"
    ? query(col, where("nodeId", "==", scope.scopeId))
    : query(col, where("path", "array-contains", scope.scopeId));

  const snap = await getDocs(q);
  if (!currentScope || currentScope.scopeId !== scope.scopeId || currentScope.scopeLevel !== scope.scopeLevel) return;

  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  lastRows = rows;

  const cfg = buildConfig(scope);
  if (!dt || !$("#bankTable .dt")) {
    dt = new DataTable({
      mount: "#bankTable", config: cfg, rows,
      onRefresh: () => loadTable(currentScope, { silent: true }),
    });
    dt.render();
  } else {
    dt.onRefresh = () => loadTable(currentScope, { silent: true });
    dt.setConfig(cfg);
    dt.setRows(rows, { preserveState: true });
  }
  renderStats(rows);
}

function wireEditDelegation() {
  const host = $("#bankTable");
  if (!host || host._editWired) return;
  host._editWired = true;
  host.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-q-edit]");
    if (!btn) return;
    const row = dt?.rows.find((r) => r.id === btn.dataset.qEdit);
    if (!row || !currentScope) return;
    openQuestionDialog(row, currentScope, dt);
  });
}

function wireAutoRefresh() {
  if (window._bankAutoRefreshWired) return;
  window._bankAutoRefreshWired = true;
  document.addEventListener("click", (e) => {
    if (!currentScope || !dt) return;
    if (!e.target.closest("dialog, .modal, [role='dialog']")) return;
    if (!e.target.closest("button[type='submit'], [data-save], [data-q-save]")) return;
    setTimeout(() => { if (currentScope && dt) dt.triggerRefresh(); }, 450);
  });
}