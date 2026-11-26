// js/admin/views/bank.js — Scan + per-level double counts (DOM-safe, no picker API needed)
import { db, collection, query, where, getDocs } from "../../core/firebase.js";
import { $, esc, toast } from "../../core/dom.js";
import { getSyllabus, pathOf } from "../../core/store.js";
import { pickerHTML, mountPicker } from "../picker.js";
import {
  makeQuestionsConfig, openQuestionDialog, detectDoubleMCQ,
  scanAllQuestionsForDouble,
} from "../configs/questions.js";
import { DataTable } from "../DataTable.js";

let dt = null;
let currentScope = null;
let showDoubleOnly = false;
let pickerApi = null;
let allCounts = null;
let scanning = false;
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

      #bankView table tr.double-mcq-row td,
      #bankView .dt-table tr.double-mcq-row td,
      #bankView tbody tr.double-mcq-row td {
        background: rgba(245, 158, 11, 0.10) !important;
        border-color: rgba(245, 158, 11, 0.20) !important;
      }
      .dark #bankView table tr.double-mcq-row td,
      .dark #bankView .dt-table tr.double-mcq-row td,
      .dark #bankView tbody tr.double-mcq-row td {
        background: rgba(245, 158, 11, 0.15) !important;
        border-color: rgba(245, 158, 11, 0.25) !important;
      }

      #bankView tbody tr:has(span.badge.warn) td {
        background: rgba(245, 158, 11, 0.10) !important;
      }
      .dark #bankView tbody tr:has(span.badge.warn) td {
        background: rgba(245, 158, 11, 0.15) !important;
      }

      #bankView .scan-btn[disabled] { opacity: 0.6; cursor: not-allowed; }

      #bankView .scan-report {
        margin-top: .75rem;
        padding: .75rem;
        border-radius: .65rem;
        background: rgba(15,23,42,0.04);
        font-family: ui-monospace, monospace;
        font-size: .72rem;
        max-height: 220px;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .dark #bankView .scan-report { background: rgba(255,255,255,0.05); }
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
          <button type="button" id="scanDoubleBtn" class="scan-btn inline-flex items-center gap-2 rounded-md gradient-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 shadow-sm">
            <i class="fa-solid fa-magnifying-glass-chart"></i>
            Scan for Double MCQs
          </button>
        </div>
        <div class="grid4 pt-2" id="pk">${pickerHTML("topic", { showCounts: true })}</div>
        <div id="scanReport" class="scan-report hidden"></div>
      </div>

      <div id="bankTable"></div>
    </div>`;
}

// Build Map<nodeId, { total, double }> for every node in the tree, by rolling
// each question up to every ancestor (board → class → subject → chapter → topic).
async function fetchCounts() {
  try {
    const snap = await getDocs(collection(db, "questions"));
    const leafTotal = new Map();
    const leafDouble = new Map();
    snap.forEach((d) => {
      const data = d.data();
      const nid = data?.nodeId;
      if (!nid) return;
      leafTotal.set(nid, (leafTotal.get(nid) || 0) + 1);
      if (detectDoubleMCQ(data)) {
        leafDouble.set(nid, (leafDouble.get(nid) || 0) + 1);
      }
    });
    const agg = new Map();
    const ids = new Set([...leafTotal.keys(), ...leafDouble.keys()]);
    for (const id of ids) {
      const t = leafTotal.get(id) || 0;
      const dbl = leafDouble.get(id) || 0;
      if (!t && !dbl) continue;
      let path = [];
      try { path = pathOf ? pathOf(id) : [id]; } catch { path = [id]; }
      if (!Array.isArray(path) || !path.length) path = [id];
      for (const anc of path) {
        const cur = agg.get(anc) || { total: 0, double: 0 };
        cur.total += t;
        cur.double += dbl;
        agg.set(anc, cur);
      }
    }
    return agg;
  } catch (e) {
    console.warn("[bank] could not fetch counts:", e.message);
    return null;
  }
}

// Rewrite every option in the picker dropdowns to display the double count.
// Format: "Name (N double)" — or no count if zero. Works regardless of
// whether picker.js supports countsById/updateCounts.
function applyCountsToPicker(agg) {
  if (!agg) return;
  const pk = document.getElementById("pk");
  if (!pk) return;
  const selects = pk.querySelectorAll("select[data-pk]");
  selects.forEach((sel) => {
    Array.from(sel.options).forEach((opt) => {
      if (!opt.value) return;
      const baseName = opt.dataset.baseName || opt.textContent.split(" (")[0];
      opt.dataset.baseName = baseName;
      const c = agg.get(opt.value);
      const total = c ? c.total : 0;
      const hiddenSuffix = opt.textContent.includes("(hidden)") ? " (hidden)" : "";
      if (total > 0) {
        opt.textContent = `${baseName} (${total})${hiddenSuffix}`;
      } else {
        opt.textContent = `${baseName}${hiddenSuffix}`;
      }
    });
  });
}
function showReport(text) {
  const el = document.getElementById("scanReport");
  if (!el) return;
  el.textContent = text;
  el.classList.remove("hidden");
}

async function runScan(btn) {
  if (scanning) return;
  scanning = true;
  const originalLabel = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Scanning…`;
  try {
    const result = await scanAllQuestionsForDouble({
      onProgress: ({ scanned, tagged }) => {
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Scanned ${scanned}${tagged ? `, tagged ${tagged}` : ""}…`;
      },
    });

    const lines = [];
    lines.push(`Scan finished`);
    lines.push(`  scanned:  ${result.scanned}`);
    lines.push(`  tagged:   ${result.tagged}`);
    lines.push(`  skipped:  ${result.skipped} (already marked double)`);
    if (result.tagged > 0) {
      lines.push(`  → counts + table refreshed below.`);
      allCounts = await fetchCounts();
      applyCountsToPicker(allCounts);
      if (currentScope) await loadTable(currentScope, { silent: true });
    } else if (result.samples && result.samples.length) {
      lines.push(`\nNo questions matched. First ${result.samples.length} untagged questions:`);
      result.samples.forEach((s, i) => {
        lines.push(`\n#${i + 1}  id=${s.id}`);
        lines.push(`   text: ${s.text}`);
        s.opts.forEach((o, j) => lines.push(`   opt${j + 1}: ${o}`));
      });
      lines.push(`\nIf any of these SHOULD be double, tell me which — I'll extend the regex.`);
    } else {
      lines.push(`\nNo questions were scanned (collection empty or permission error).`);
    }
    showReport(lines.join("\n"));
    toast(
      result.tagged > 0
        ? `Scan complete — tagged ${result.tagged} question${result.tagged === 1 ? "" : "s"}`
        : `Scan complete — no matches. See report.`,
      result.tagged > 0 ? "ok" : "warn",
    );
  } catch (e) {
    showReport("Scan failed:\n" + e.message);
    toast("Scan failed: " + e.message, "bad");
  } finally {
    scanning = false;
    btn.disabled = false;
    btn.innerHTML = originalLabel;
  }
}

async function wire(root) {
  pickerApi = mountPicker($("#pk", root), {
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

  const scanBtn = root.querySelector("#scanDoubleBtn");
  if (scanBtn) scanBtn.addEventListener("click", () => runScan(scanBtn));

  // Load counts, then paint them onto whatever picker currently rendered.
  allCounts = await fetchCounts();
  applyCountsToPicker(allCounts);

  // Picker re-renders its dropdowns on every level change — repaint counts
  // whenever the user picks a parent. Listen via a MutationObserver on #pk.
  const pkHost = document.getElementById("pk");
  if (pkHost && !pkHost._countObserver) {
    pkHost._countObserver = new MutationObserver(() => {
      if (allCounts) applyCountsToPicker(allCounts);
    });
    pkHost._countObserver.observe(pkHost, { childList: true, subtree: true });
  }

  wireEditDelegation();
  wireAutoRefresh();
}

function buildConfig(scope) {
  const cfg = makeQuestionsConfig(scope);
  cfg.compact = true;
  cfg.pageSizes = PAGE_SIZES;
  if (!cfg.pageSize || cfg.pageSize === 25) {
    cfg.pageSize = (dt?.pageSize && dt.pageSize !== 25) ? dt.pageSize : 50;
  }

  if (!cfg.columns.some((col) => col.key === "nodeLevel")) {
    const insertIdx = Math.min(3, cfg.columns.length);
    cfg.columns.splice(insertIdx, 0, {
      key: "nodeLevel",
      label: "Level",
      render: (r) => `<span class="badge">${esc(r.nodeLevel || (r.topicId ? "topic" : "chapter"))}</span>`,
    });
  }

  if (!cfg.columns.some((col) => col.key === "doubleFlag")) {
    cfg.columns.unshift({
      key: "doubleFlag",
      label: "Type",
      render: (r) => {
        const double = detectDoubleMCQ(r);
        return double
          ? `<span class="badge warn" title="Detected as Double/Complex Statement MCQ"><i class="fa-solid fa-clone mr-1"></i> Double</span>`
          : `<span class="badge ok">Standard</span>`;
      }
    });
  }

  cfg.rowClass = (r) => (detectDoubleMCQ(r) ? "double-mcq-row" : "");

  const seenKeys = new Set();
  cfg.filters = (cfg.filters || []).filter((f) => {
    if (!f?.key || seenKeys.has(f.key)) return false;
    seenKeys.add(f.key);
    return true;
  });

  cfg.headerActions = cfg.headerActions || [];
  if (!cfg.headerActions.some(a => a.id === "toggleDouble")) {
    cfg.headerActions.unshift({
      id: "toggleDouble",
      label: showDoubleOnly ? "Showing Doubles Only" : "🔍 Filter Double MCQs",
      kind: showDoubleOnly ? "primary" : "ghost",
      onClick: () => {
        showDoubleOnly = !showDoubleOnly;
        loadTable(currentScope, { silent: true });
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

  if (showDoubleOnly) {
    rows = rows.filter(r => detectDoubleMCQ(r));
  }

  const cfg = buildConfig(scope);

  if (!dt || !$("#bankTable .dt")) {
    dt = new DataTable({
      mount: "#bankTable",
      config: cfg,
      rows,
      onRefresh: () => loadTable(currentScope, { silent: true }),
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
    const modal = e.target.closest("[role='dialog'], dialog, .modal");
    if (!modal) return;
    const saveBtn = e.target.closest("button[type='submit'], [data-save], [data-q-save], .btn.primary, .btn:not(.ghost)");
    if (!saveBtn) return;

    setTimeout(async () => {
      if (currentScope && dt) dt.triggerRefresh();
      allCounts = await fetchCounts();
      applyCountsToPicker(allCounts);
    }, 450);
  });
}