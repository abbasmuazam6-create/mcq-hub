// js/admin/views/bank.js — With automatic double MCQ table row highlighting
import { db, collection, query, where, getDocs } from "../../core/firebase.js";
import { $, esc } from "../../core/dom.js";
import { getSyllabus } from "../../core/store.js";
import { pickerHTML, mountPicker } from "../picker.js";
import { makeQuestionsConfig, openQuestionDialog } from "../configs/questions.js";
import { DataTable } from "../DataTable.js";

let dt = null;
let currentScope = null;
let showDoubleOnly = false;
const PAGE_SIZES = [15, 50, 100, 250, 500];

export default async function () {
  await getSyllabus({ all: true });
  return { html: render(), mount: wire };
}

function render() {
  return `
    <style id="bankViewCompactStyle">
      #bankView { display: flex; flex-direction: column; gap: 1rem; }
      #bankView .card { padding: 1.25rem; border-radius: 1rem; background: var(--card, #fff); border: 1px solid var(--line, rgba(226,232,240,0.8)); }
      #bankView h2 { font-size: 1.15rem; font-weight: 700; margin: 0 0 0.35rem; }
      #bankView .muted { font-size: 0.82rem; color: var(--muted, #64748b); }
      #bankView #pk { min-width: 0; }
      #bankView #pk label { font-size: 0.78rem; font-weight: 600; }
      #bankView #pk select { font-size: 0.85rem; padding: 0.45rem 0.65rem; border-radius: 0.65rem; border: 1px solid var(--line); background: var(--bg); color: var(--ink); }
      
      /* Automatic Highlighting for Double/Complex Statement MCQs */
      .double-mcq-row td { background: rgba(245, 158, 11, 0.1) !important; border-color: rgba(245, 158, 11, 0.2) !important; }
      .dark .double-mcq-row td { background: rgba(245, 158, 11, 0.15) !important; border-color: rgba(245, 158, 11, 0.25) !important; }
    </style>
    
    <div id="bankView">
      <div class="card shadow-xs">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
          <div>
            <h2>Question Bank</h2>
            <p class="muted" style="margin:0">
              Select a scope level below to filter, audit, or clean up double/complex MCQs.
            </p>
          </div>
        </div>
        <div class="grid4 pt-2" id="pk">${pickerHTML("topic")}</div>
      </div>
      
      <div id="bankTable"></div>
    </div>`;
}

function wire(root) {
  mountPicker($("#pk", root), {
    stopAt: "topic",
    persistKey: "bankPick",
    onSelect: async ({ nodeId, level }) => {
      if (!nodeId) {
        $("#bankTable").innerHTML = `<div class="card center muted py-12">Pick at least a Board or Category to explore questions.</div>`;
        currentScope = null;
        dt = null;
        return;
      }
      const scopeChanged = !currentScope || currentScope.scopeId !== nodeId || currentScope.scopeLevel !== level;
      currentScope = { scopeId: nodeId, scopeLevel: level };
      await loadTable(currentScope, { silent: !scopeChanged });
    },
  });
  wireEditDelegation();
  wireAutoRefresh();
}

// Helper to evaluate double status consistently in table
function isDoubleQuestion(r) {
  if (r.isDouble || r.doubleQuestion) return true;
  const text = String(r.text || "").toLowerCase();
  const hasSubStatements = 
    (text.includes("statement") && (text.includes("i") || text.includes("1"))) ||
    text.includes("assertion") || 
    text.includes("reason") ||
    text.includes("both statements") ||
    (text.match(/\([1-2iv]+\)/g) || []).length >= 2;
  return hasSubStatements || text.length > 320;
}

function buildConfig(scope) {
  const cfg = makeQuestionsConfig(scope);
  cfg.compact = true;
  cfg.pageSizes = PAGE_SIZES;
  if (!cfg.pageSize || cfg.pageSize === 25) {
    cfg.pageSize = (dt?.pageSize && dt.pageSize !== 25) ? dt.pageSize : 50;
  }

  // Insert Level badge column if missing
  if (!cfg.columns.some((col) => col.key === "nodeLevel")) {
    const insertIdx = Math.min(3, cfg.columns.length);
    cfg.columns.splice(insertIdx, 0, {
      key: "nodeLevel",
      label: "Level",
      render: (r) => `<span class="badge">${esc(r.nodeLevel || (r.topicId ? "topic" : "chapter"))}</span>`,
    });
  }

  // Add Double MCQ Audit column badge
  if (!cfg.columns.some((col) => col.key === "doubleFlag")) {
    cfg.columns.unshift({
      key: "doubleFlag",
      label: "Type",
      render: (r) => {
        const double = isDoubleQuestion(r);
        return double 
          ? `<span class="badge warn" title="Detected as Double/Complex Statement MCQ"><i class="fa-solid fa-clone mr-1"></i> Double</span>`
          : `<span class="badge ok">Standard</span>`;
      }
    });
  }

  const seenKeys = new Set();
  cfg.filters = (cfg.filters || []).filter((f) => {
    if (!f?.key || seenKeys.has(f.key)) return false;
    seenKeys.add(f.key);
    return true;
  });

  // Add Toolbar Header Action to toggle Double MCQs filter
  cfg.headerActions = cfg.headerActions || [];
  if (!cfg.headerActions.some(a => a.id === "toggleDouble")) {
    cfg.headerActions.unshift({
      id: "toggleDouble",
      label: showDoubleOnly ? "Showing Doubles Only" : "🔍 Filter Double MCQs",
      class: showDoubleOnly ? "btn primary text-xs" : "btn ghost text-xs",
      onClick: (table) => {
        showDoubleOnly = !showDoubleOnly;
        table.setConfig(buildConfig(scope));
        table.render();
      }
    });
  }

  cfg.headerActions = cfg.headerActions.map((a) => {
    if (a.id === "refresh" || /refresh/i.test(a.label || "")) {
      return { ...a, onClick: (table) => table.triggerRefresh() };
    }
    return a;
  });

  return cfg;
}

async function loadTable(scope, { silent = false } = {}) {
  if (!scope) return;
  if (!silent || !dt) {
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
  if (!currentScope || currentScope.scopeId !== scope.scopeId || currentScope.scopeLevel !== scope.scopeLevel) {
    return;
  }

  let rows = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  // Filter rows if Double MCQ mode is active
  if (showDoubleOnly) {
    rows = rows.filter(r => isDoubleQuestion(r));
  }

  const cfg = buildConfig(scope);

  if (!dt || !$("#bankTable .dt")) {
    dt = new DataTable({
      mount: "#bankTable",
      config: cfg,
      rows,
      onRefresh: () => loadTable(currentScope, { silent: true }),
      rowClass: (r) => {
        return isDoubleQuestion(r) ? "double-mcq-row" : "";
      }
    });
    dt.render();
  } else {
    dt.onRefresh = () => loadTable(currentScope, { silent: true });
    dt.setConfig(cfg);
    dt.setRows(rows, { preserveState: true });
  }
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
    const modal = e.target.closest("dialog, .modal, [role='dialog']");
    if (!modal) return;
    const saveBtn = e.target.closest("button[type='submit'], [data-save], [data-q-save], .btn.primary, .btn:not(.ghost)");
    if (!saveBtn) return;

    setTimeout(() => {
      if (currentScope && dt) dt.triggerRefresh();
    }, 450);
  });
}