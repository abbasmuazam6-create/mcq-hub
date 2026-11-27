// js/admin/configs/nodes.js
// Factory: one config for every syllabus level (board|class|subject|chapter|topic).
// All five share a DataTable + identical CRUD; they differ only in parentLevel + labels.

import {
  db, collection, doc, updateDoc, deleteDoc, writeBatch,
  query, where, getDocs,
} from "../../core/firebase.js";
import { esc, toast } from "../../core/dom.js";
import { kidsOf, getNode, invalidateSyllabus, getSyllabus } from "../../core/store.js";
import { bumpCacheVersion } from "../../core/cache.js";
import { countHTML, peekCount } from "../../core/counts.js";
import { openNodeDialog } from "../nodes/NodeEditDialog.js";

const LEVELS = ["board", "class", "subject", "chapter", "topic"];
const LABEL = { board: "Board", class: "Class", subject: "Subject", chapter: "Chapter", topic: "Topic" };

export function makeNodesConfig(level, { parentId = null } = {}) {
  const parentLevel = level === "board" ? null : LEVELS[LEVELS.indexOf(level) - 1];

  return {
    idKey: "id",
    pageSize: 100,
    searchKeys: ["name"],
    filters: [{
      key: "status",
      default: "all",
      options: [
        { value: "all", label: "All" },
        { value: "visible", label: "Visible" },
        { value: "hidden", label: "Hidden" },
      ],
      predicate: (row, val) =>
        val === "all" ? true : val === "visible" ? row.active !== false : row.active === false,
    }],
    headerActions: [
      { id: "add", label: `+ Add ${LABEL[level]}`, kind: "", onClick: (dt) => openAddForm(level, parentId, dt) },
    ],
    columns: [
      { type: "checkbox" },
      { key: "name", label: "Name", sortable: true, searchable: true,
        render: (r) => `<b>${esc(r.name)}</b>` },
      ...(level !== "topic" ? [{
        key: "childCount", label: "Children",
        render: (r) => kidsOf(r.id).length,
      }] : []),
      // Real question count (filled in asynchronously by the Syllabus view; cached values render instantly)
      { key: "qc", label: "Questions", sortable: false,
        render: (r) => `<span data-qc="${esc(r.id)}">${countHTML(peekCount(r.id))}</span>` },
      { key: "order", label: "Order", sortable: true, render: (r) => r.order ?? 0 },
      { key: "active", label: "Status",
        render: (r) => `<span class="badge ${r.active === false ? "warn" : "ok"}">${r.active === false ? "hidden" : "visible"}</span>` },
      // Per-row actions: edit, add child, delete
      {
        key: "_actions", label: "", sortable: false, searchable: false,
        render: (r) => {
          const canAddChild = LEVELS.indexOf(r.level) < LEVELS.length - 1;
          return `
            <span class="row-actions" style="display:inline-flex;gap:.25rem">
              <button class="btn sm ghost" data-node-edit="${esc(r.id)}" title="Edit">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              ${canAddChild ? `
              <button class="btn sm ghost" data-node-add="${esc(r.id)}" title="Add child">
                <i class="fa-solid fa-plus"></i>
              </button>` : ""}
              <button class="btn sm ghost" data-node-del="${esc(r.id)}" title="Delete">
                <i class="fa-solid fa-trash"></i>
              </button>
            </span>
          `;
        }
      },
    ],
    bulkActions: [
      { id: "show", label: "Show", run: (ids) => setActive(ids, true) },
      { id: "hide", label: "Hide", run: (ids) => setActive(ids, false) },
      { id: "reorder", label: "Re-order", run: async (ids) => {
        const b = writeBatch(db);
        ids.forEach((id, i) => b.update(doc(db, "nodes", id), { order: i + 1 }));
        await b.commit();
        await afterWrite();
        toast("Reordered", "ok");
      }},
      { id: "delete", label: "Delete", destructive: true, run: (ids) => deleteMany(ids) },
    ],
  };

  async function openAddForm(level, parentId, dt) {
    const dlg = document.getElementById("dlg");
    dlg.innerHTML = `<div class="card">
      <h2 style="margin:0 0 .75rem">Add ${LABEL[level]}</h2>
      <form id="nodeAddForm" class="form-stack">
        <label>Names (one per line)<textarea name="names" required placeholder="${LABEL[level]} name…"></textarea></label>
        <label>Order start<input type="number" name="order" value="0"></label>
        <div class="row"><button class="btn" type="submit">Add</button>
        <button class="btn ghost" type="button" onclick="document.getElementById('dlg').close()">Cancel</button></div>
      </form></div>`;
    dlg.showModal();
    dlg.querySelector("#nodeAddForm").onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const names = String(f.get("names")).split("\n").map((s) => s.trim()).filter(Boolean);
      if (!names.length) return toast("Type at least one name.", "warn");
      const parent = parentId ? getNode(parentId) : null;
      let order = Math.max(0, ...kidsOf(parentId).map((n) => n.order || 0));
      const b = writeBatch(db);
      names.forEach((name) => b.set(doc(collection(db, "nodes")), {
        level, name, parentId: parentId ?? null,
        path: parent ? [...parent.path, parent.id] : [],
        order: ++order, active: true, qCount: 0, createdAt: Date.now(),
      }));
      await b.commit();
      await afterWrite();
      dlg.close();
      toast(`${names.length} added`, "ok");
      dt.onRefresh?.();
    };
  }
}

async function setActive(ids, active) {
  const b = writeBatch(db);
  ids.forEach((id) => b.update(doc(db, "nodes", id), { active }));
  await b.commit();
  await afterWrite();
}

async function deleteMany(ids) {
  for (const id of ids) {
    const n = getNode(id);
    if (!n) continue;
    if (kidsOf(id).length) { toast(`"${n.name}" still has children — skip.`, "warn"); continue; }
    const cnt = (await getDocs(query(collection(db, "questions"), where("nodeId", "==", id)))).size;
    if (cnt) { toast(`"${n.name}" still has ${cnt} question(s) — skip.`, "warn"); continue; }
    await deleteDoc(doc(db, "nodes", id));
  }
  await afterWrite();
  toast("Deleted", "ok");
}

async function afterWrite() {
  await getSyllabus({ all: true, force: true });
  invalidateSyllabus();
  bumpCacheVersion();
}

// Wire per-row edit / add-child / delete buttons on the syllabus DataTable host.
// Safe to call multiple times — the listener attaches once per host element.
export function wireNodeRowActions(hostSelector = "#sylTable", onDone) {
  const host = document.querySelector(hostSelector);
  if (!host) return;
  if (host._rowActionsWired) {
    // Update the onDone callback to the latest one (reloads reference fresh state)
    host._rowActionsOnDone = onDone;
    return;
  }
  host._rowActionsWired = true;
  host._rowActionsOnDone = onDone;
  host.addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-node-edit]");
    const addBtn = e.target.closest("[data-node-add]");
    const delBtn = e.target.closest("[data-node-del]");
    const id = editBtn?.dataset.nodeEdit || addBtn?.dataset.nodeAdd || delBtn?.dataset.nodeDel;
    if (!id) return;
    const node = getNode(id);
    if (!node) return;
    const done = host._rowActionsOnDone;
    if (editBtn) openNodeDialog({ mode: "edit", node, onDone: done });
    else if (addBtn) openNodeDialog({ mode: "addChild", node, onDone: done });
    else if (delBtn) openNodeDialog({ mode: "delete", node, onDone: done });
  });
}