// js/admin/views/syllabus.js
import { DataTable } from "../DataTable.js";
import { makeNodesConfig } from "../configs/nodes.js";
import { getSyllabus, kidsOf, getNode } from "../../core/store.js";
import { loadCounts, paintCounts } from "../../core/counts.js";
import { $, esc } from "../../core/dom.js";
import { wireNodeRowActions } from "../configs/nodes.js";

const LEVELS = ["board", "class", "subject", "chapter", "topic"];
const LABEL = { board: "Boards", class: "Classes", subject: "Subjects", chapter: "Chapters", topic: "Topics" };

let dt = null;
let currentLevel = "board";
let currentParentId = null;

export default async function () {
  await getSyllabus({ all: true });
  return { html: render(), mount: wire };
}

function render() {
  return `
    <style>
      #sylView .qc-num { font-weight: 800; font-size: .9rem; }
      #sylView .qc-sub, #sylView .qc-load { font-size: .72rem; color: var(--muted, #64748b); }
      #sylView .tabs button .tabn { margin-left: .35rem; font-size: .68rem; opacity: .7; }
      #sylView .crumb { display: flex; flex-wrap: wrap; align-items: center; gap: .3rem; font-size: .8rem; color: var(--muted, #64748b); }
      #sylView .crumb a { color: #6366f1; cursor: pointer; font-weight: 600; }
      #sylView .pathcell { font-size: .72rem; color: var(--muted, #64748b); }
    </style>
    <div id="sylView">
      <div class="card">
        <h2 style="margin:0 0 .75rem">Syllabus</h2>
        <div class="tabs" id="sylTabs">
          ${LEVELS.map((l, i) => `<button data-level="${l}" class="${i === 0 ? "on" : ""}">${LABEL[l]}<span class="tabn" data-tabn="${l}"></span></button>`).join("")}
        </div>
        <div class="crumb" id="sylPath" style="margin-top:.6rem"></div>
      </div>
      <div id="sylTable"></div>
    </div>`;
}

function wire(root) {
  root.querySelectorAll("#sylTabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentLevel = btn.dataset.level;
      currentParentId = null;                 // tab = "show everything at this level"
      setActiveTab(currentLevel);
      loadTable();
    });
  });
  loadTable();
}

function setActiveTab(level) {
  document.querySelectorAll("#sylTabs button").forEach((b) => b.classList.toggle("on", b.dataset.level === level));
}

function allAtLevel(level) {
  const out = [];
  (function walk(pid) {
    for (const n of kidsOf(pid)) {
      if (n.level === level) out.push(n); else walk(n.id);
    }
  })(null);
  return out;
}

function pathLabel(n) {
  const parts = [];
  for (let p = getNode(n.parentId); p; p = getNode(p.parentId)) parts.unshift(p.name);
  return parts.join(" › ");
}

function updateTabCounts() {
  for (const l of LEVELS) {
    const el = document.querySelector(`[data-tabn="${l}"]`);
    if (el) el.textContent = `(${allAtLevel(l).length})`;
  }
}

async function loadTable() {
  // afterWrite() in nodes.js drops the in-memory syllabus; make sure it is back
  if (!kidsOf(null).length) await getSyllabus({ all: true });

  const idx = LEVELS.indexOf(currentLevel);
  let rows = currentParentId
    ? kidsOf(currentParentId).filter((n) => n.level === currentLevel)
    : allAtLevel(currentLevel);
  if (!currentParentId && currentLevel !== "board") {
    rows = rows.slice().sort((a, b) =>
      pathLabel(a).localeCompare(pathLabel(b)) || (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(String(b.name)));
  }

  const cfg = makeNodesConfig(currentLevel, { parentId: currentParentId });

  // Name links drill into the next level
  if (idx < LEVELS.length - 1) {
    const nextLevel = LEVELS[idx + 1];
    cfg.columns[1] = {
      key: "name", label: "Name", sortable: true, searchable: true,
      render: (r) => `<a href="javascript:void 0" data-drill="${esc(r.id)}" data-next="${nextLevel}"><b>${esc(r.name)}</b> ›</a>`,
    };
  }

  // Showing a whole level: add a Path column, and block "+ Add" (no parent = orphan node)
  if (!currentParentId && currentLevel !== "board") {
    cfg.columns.splice(2, 0, {
      key: "_path", label: "Path", sortable: false,
      render: (r) => `<span class="pathcell">${esc(pathLabel(r) || "—")}</span>`,
    });
    cfg.headerActions = cfg.headerActions.filter((a) => a.id !== "add");
  }

  if (!dt) {
    dt = new DataTable({ mount: "#sylTable", config: cfg, rows, onRefresh: loadTable });
  } else {
    dt.onRefresh = loadTable;
    dt.config = cfg;
    dt.setRows(rows);
  }
  dt.render();
  wireDrill();
  wireNodeRowActions("#sylTable", loadTable);
  updatePath();
  updateTabCounts();

  const host = $("#sylTable");
  loadCounts(rows, (id, c) => paintCounts(host, id, c));
}

function wireDrill() {
  const host = $("#sylTable");
  if (!host || host._drillWired) return;
  host._drillWired = true;
  host.addEventListener("click", (e) => {
    const a = e.target.closest("[data-drill]");
    if (!a) return;
    currentParentId = a.dataset.drill;
    currentLevel = a.dataset.next;
    setActiveTab(currentLevel);
    loadTable();
  });
}

function updatePath() {
  const el = $("#sylPath");
  if (!el) return;
  if (!currentParentId) { el.innerHTML = ""; return; }
  const parts = [];
  for (let n = getNode(currentParentId); n; n = getNode(n.parentId)) parts.unshift(n);
  el.innerHTML =
    `<a data-crumb="">All ${esc(LABEL[currentLevel].toLowerCase())}</a>` +
    parts.map((n) => `<span>›</span><a data-crumb="${esc(n.id)}" data-lvl="${esc(n.level)}">${esc(n.name)}</a>`).join("");
  el.querySelectorAll("[data-crumb]").forEach((a) => {
    a.onclick = () => {
      const id = a.dataset.crumb;
      if (!id) { currentParentId = null; }
      else {
        // clicking an ancestor shows ITS children (one level below it)
        const n = getNode(id);
        currentParentId = id;
        currentLevel = LEVELS[LEVELS.indexOf(n.level) + 1] || n.level;
      }
      setActiveTab(currentLevel);
      loadTable();
    };
  });
}