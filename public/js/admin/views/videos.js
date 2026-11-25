// js/admin/views/videos.js
import { db, collection, query, where, getDocs } from "../../core/firebase.js";
import { $ } from "../../core/dom.js";
import { getSyllabus } from "../../core/store.js";
import { pickerHTML, mountPicker } from "../picker.js";
import { makeVideosConfig, openVideoDialog } from "../configs/videos.js";
import { DataTable } from "../DataTable.js";

let dt = null;
let currentScope = null;

export default async function () {
  await getSyllabus({ all: true });
  return { html: render(), mount: wire };
}

function render() {
  return `
    <div class="card"><h2>Video lectures</h2>
      <p class="muted" style="margin:0 0 .75rem">
        Pick a chapter or topic, then use <b>+ Add video</b>.
      </p>
      <div class="grid4" id="vidPk">${pickerHTML("chapter")}</div>
    </div>
    <div id="vidHost"></div>`;
}

async function wire(root) {
  // Render the empty table immediately so the toolbar is always visible.
  const emptyCfg = makeVideosConfig({ scopeId: null, scopeLevel: null });
  // Replace the add action with one that warns when no chapter is picked.
  emptyCfg.headerActions = [{
    id: "add",
    label: "+ Add video",
    onClick: () => {
      if (!currentScope) return import("../../core/dom.js").then(({ toast }) =>
        toast("Pick a chapter or topic first.", "warn"));
      openVideoDialog(null, currentScope, dt);
    },
  }];
  emptyCfg.columns = emptyCfg.columns.filter((c) => c.type === "checkbox" || c.key !== "actions")
    .map((c) => c); // keep all columns, no row edit button needed for empty state

  dt = new DataTable({
    mount: "#vidHost",
    config: emptyCfg,
    rows: [],
    onRefresh: () => currentScope ? loadTable(currentScope) : null,
  });
  dt.render();
  wireEdit();

  mountPicker($("#vidPk", root), {
    stopAt: "chapter",
    persistKey: "vidPick",
    onSelect: async ({ nodeId, level }) => {
      if (!nodeId) { currentScope = null; return; }
      currentScope = { scopeId: nodeId, scopeLevel: level };
      await loadTable(currentScope);
    },
  });
}

async function loadTable(scope) {
  const snap = await getDocs(query(collection(db, "videos"), where("nodeId", "==", scope.scopeId)));
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const cfg = makeVideosConfig(scope);
  // Keep the same "+ Add video" handler that knows the current scope.
  cfg.headerActions = [{
    id: "add",
    label: "+ Add video",
    onClick: () => openVideoDialog(null, scope, dt),
  }];

  dt.config = cfg;
  dt.setRows(rows);
  dt.render();
}

function wireEdit() {
  const host = $("#vidHost");
  if (!host || host._editWired) return;
  host._editWired = true;
  host.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-vid-edit]");
    if (!btn) return;
    const row = dt?.rows.find((r) => r.id === btn.dataset.vidEdit);
    if (!row || !currentScope) return;
    openVideoDialog(row, currentScope, dt);
  });
}