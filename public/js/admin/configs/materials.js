// js/admin/configs/materials.js
import { db, doc, collection, writeBatch, updateDoc } from "../../core/firebase.js";
import { esc, toast } from "../../core/dom.js";
import { getNode } from "../../core/store.js";

const KINDS = [
  { value: "notes",   label: "Notes (text)" },
  { value: "summary", label: "Summary (text)" },
  { value: "pdf",     label: "PDF (URL)" },
  { value: "link",    label: "External link" },
];

export function makeMaterialsConfig({ scopeId, scopeLevel }) {
  return {
    idKey: "id",
    pageSize: 50,
    searchKeys: ["title", "body"],
    filters: [{
      key: "status", default: "all",
      options: [
        { value: "all", label: "All" },
        { value: "active", label: "Active" },
        { value: "draft", label: "Draft" },
        { value: "archived", label: "Archived" },
      ],
      predicate: (r, v) => v === "all" || r.status === v,
    }],
    headerActions: [
      { id: "add", label: "+ Add material", onClick: (dt) => openMaterialDialog(null, { scopeId, scopeLevel }, dt) },
    ],
    columns: [
      { type: "checkbox" },
      { key: "title", label: "Title", sortable: true, render: (r) => `<b>${esc(r.title || "(no title)")}</b>` },
      { key: "kind", label: "Kind", render: (r) => `<span class="badge">${esc(r.kind || "notes")}</span>` },
      { key: "order", label: "Order", sortable: true, render: (r) => r.order ?? 0 },
      { key: "status", label: "Status",
        render: (r) => `<span class="badge ${r.status === "active" ? "ok" : r.status === "archived" ? "warn" : ""}">${esc(r.status || "draft")}</span>` },
      { key: "updatedAt", label: "Updated",
        render: (r) => r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : "–" },
      { key: "actions", label: "",
        render: (r) => `<button class="btn sm ghost" data-mat-edit="${esc(r.id)}">Edit</button>` },
    ],
    bulkActions: [
      { id: "activate", label: "Activate", run: (ids) => setStatus(ids, "active") },
      { id: "archive",  label: "Archive",  run: (ids) => setStatus(ids, "archived") },
      { id: "delete",   label: "Delete",   destructive: true, run: (ids) => deleteMany(ids) },
    ],
  };
}

export async function openMaterialDialog(row, scope, dt) {
  const dlg = document.getElementById("dlg");
  const r = row || { title: "", kind: "notes", body: "", url: "", order: 0, status: "active" };
  dlg.innerHTML = `<div class="card">
    <h2 style="margin:0 0 .75rem">${row ? "Edit" : "Add"} material</h2>
    <form id="matForm" class="form-stack">
      <label>Title<input name="title" required value="${esc(r.title)}"></label>
      <label>Kind<select name="kind">
        ${KINDS.map((k) => `<option value="${k.value}" ${k.value === r.kind ? "selected" : ""}>${k.label}</option>`).join("")}
      </select></label>
      <label>Body (for notes/summary)<textarea name="body" rows="8">${esc(r.body || "")}</textarea></label>
      <label>URL (for PDF/link)<input name="url" type="url" value="${esc(r.url || "")}" placeholder="https://…"></label>
      <div class="grid4">
        <label>Order<input type="number" name="order" value="${r.order ?? 0}"></label>
        <label>Status<select name="status">
          ${["active","draft","archived"].map((v) => `<option ${v === r.status ? "selected" : ""}>${v}</option>`).join("")}
        </select></label>
      </div>
      <div class="row">
        <button class="btn" type="submit">Save</button>
        <button class="btn ghost" type="button" onclick="document.getElementById('dlg').close()">Cancel</button>
      </div>
    </form></div>`;
  dlg.showModal();

  dlg.querySelector("#matForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const data = {
      title: String(f.get("title")).trim(),
      kind: f.get("kind"),
      body: String(f.get("body") || "").trim(),
      url: String(f.get("url") || "").trim() || null,
      order: +f.get("order") || 0,
      status: f.get("status"),
      updatedAt: Date.now(),
    };
    try {
      if (row) {
        await updateDoc(doc(db, "materials", row.id), data);
      } else {
        const scopeNode = getNode(scope.scopeId);
        const path = [...scopeNode.path, scopeNode.id];
        await writeBatch(db).set(doc(collection(db, "materials")), {
          ...data,
          nodeId: scope.scopeId, nodeLevel: scope.scopeLevel,
          path, createdAt: Date.now(),
        }).commit();
      }
      dlg.close();
      toast("Saved", "ok");
      dt.onRefresh?.();
    } catch (err) { toast(err.message, "bad"); }
  };
}

async function setStatus(ids, status) {
  const b = writeBatch(db);
  ids.forEach((id) => b.update(doc(db, "materials", id), { status, updatedAt: Date.now() }));
  await b.commit();
  toast("Updated", "ok");
}

async function deleteMany(ids) {
  const b = writeBatch(db);
  ids.forEach((id) => b.delete(doc(db, "materials", id)));
  await b.commit();
  toast("Deleted", "ok");
}