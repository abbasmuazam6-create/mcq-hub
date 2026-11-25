// js/admin/views/syllabus.js
import { DataTable } from "../DataTable.js";
import { makeNodesConfig } from "../configs/nodes.js";
import { getSyllabus, kidsOf, getNode } from "../../core/store.js";
import { $, esc } from "../../core/dom.js";

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
    <div class="card">
      <h2 style="margin:0 0 .75rem">Syllabus</h2>
      <div class="tabs" id="sylTabs">
        ${LEVELS.map((l, i) => `<button data-level="${l}" class="${i === 0 ? "on" : ""}">${LABEL[l]}</button>`).join("")}
      </div>
      <div class="row" style="margin-top:.5rem">
        <span class="muted" id="sylPath" style="font-size:.8rem"></span>
      </div>
    </div>
    <div id="sylTable"></div>`;
}

function wire(root) {
  root.querySelectorAll("#sylTabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentLevel = btn.dataset.level;
      currentParentId = null;
      root.querySelectorAll("#sylTabs button").forEach((b) => b.classList.toggle("on", b === btn));
      loadTable();
    });
  });
  loadTable();
}

function loadTable() {
  const allKids = kidsOf(currentParentId);
  const rows = allKids.filter((n) => n.level === currentLevel);

  // Build config with real scope so "+ Add" knows where to insert.
  const cfg = makeNodesConfig(currentLevel, { parentId: currentParentId });

  // Row click drills to children if a next level exists.
  const idx = LEVELS.indexOf(currentLevel);
  if (idx < LEVELS.length - 1) {
    const nextLevel = LEVELS[idx + 1];
    cfg.columns[1] = {
      key: "name", label: "Name", sortable: true, searchable: true,
      render: (r) => `<a href="javascript:void 0" data-drill="${esc(r.id)}" data-next="${nextLevel}"><b>${esc(r.name)}</b> ›</a>`,
    };
  }

  if (!dt) {
    dt = new DataTable({ mount: "#sylTable", config: cfg, rows, onRefresh: loadTable });
  } else {
    dt.config = cfg;
    dt.setRows(rows);
  }
  dt.render();
  wireDrill();
  updatePath();
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
    const tabBtn = document.querySelector(`#sylTabs [data-level="${currentLevel}"]`);
    if (tabBtn) document.querySelectorAll("#sylTabs button").forEach((b) => b.classList.toggle("on", b === tabBtn));
    loadTable();
  });
}

function updatePath() {
  const el = $("#sylPath");
  if (!el) return;
  if (!currentParentId) { el.textContent = ""; return; }
  const parts = [];
  for (let n = getNode(currentParentId); n; n = getNode(n.parentId)) parts.unshift(n.name);
  el.textContent = "Path: " + parts.join(" › ");
}