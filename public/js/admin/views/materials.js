// js/admin/views/materials.js
import { db, collection, query, where, getDocs } from "../../core/firebase.js";
import { $ } from "../../core/dom.js";
import { getSyllabus } from "../../core/store.js";
import { pickerHTML, mountPicker } from "../picker.js";
import { makeMaterialsConfig, openMaterialDialog } from "../configs/materials.js";
import { DataTable } from "../DataTable.js";

let dt = null;
let currentScope = null;

export default async function () {
  await getSyllabus({ all: true });
  return { html: render(), mount: wire };
}

function render() {
  return `
    <div class="card"><h2>Study materials</h2>
      <div class="grid4" id="matPk">${pickerHTML("chapter")}</div>
    </div>
    <div id="matHost"><div class="card center muted">Pick a chapter or topic to manage its materials.</div></div>`;
}

function wire(root) {
  mountPicker($("#matPk", root), {
    stopAt: "chapter",
    persistKey: "matPick",
    onSelect: async ({ nodeId, level }) => {
      if (!nodeId) return;
      currentScope = { scopeId: nodeId, scopeLevel: level };
      await loadTable(currentScope);
    },
  });
  wireEdit();
}

async function loadTable(scope) {
  const snap = await getDocs(query(collection(db, "materials"), where("nodeId", "==", scope.scopeId)));
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const cfg = makeMaterialsConfig(scope);
  if (!dt) {
    dt = new DataTable({ mount: "#matHost", config: cfg, rows, onRefresh: () => loadTable(scope) });
  } else {
    dt.config = cfg;
    dt.setRows(rows);
  }
  dt.render();
}

function wireEdit() {
  const host = $("#matHost");
  if (!host || host._editWired) return;
  host._editWired = true;
  host.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mat-edit]");
    if (!btn) return;
    const row = dt?.rows.find((r) => r.id === btn.dataset.matEdit);
    if (!row || !currentScope) return;
    openMaterialDialog(row, currentScope, dt);
  });
}