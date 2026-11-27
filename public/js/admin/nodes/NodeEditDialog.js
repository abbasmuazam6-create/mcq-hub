// js/admin/nodes/NodeEditDialog.js
// Shared per-row dialog for syllabus nodes (board/class/subject/chapter/topic).
// Three modes: edit, addChild, delete.
//
//   openNodeDialog({ mode: "edit",     node })
//   openNodeDialog({ mode: "addChild", node })         // node becomes the parent
//   openNodeDialog({ mode: "delete",   node })
//
// All mutations call the same afterWrite() routine as nodes.js: force-reload
// syllabus, invalidate cache, bump version — then call onDone().

import {
  db, collection, doc, deleteDoc, writeBatch,
  query, where, getDocs,
} from "../../core/firebase.js";
import { esc, toast } from "../../core/dom.js";
import { kidsOf, getNode, invalidateSyllabus, getSyllabus } from "../../core/store.js";
import { bumpCacheVersion } from "../../core/cache.js";

const LEVELS = ["board", "class", "subject", "chapter", "topic"];
const LABEL = { board: "Board", class: "Class", subject: "Subject", chapter: "Chapter", topic: "Topic" };

function nextLevel(level) {
  const i = LEVELS.indexOf(level);
  return i >= 0 && i < LEVELS.length - 1 ? LEVELS[i + 1] : null;
}

async function afterWrite() {
  await getSyllabus({ all: true, force: true });
  invalidateSyllabus();
  bumpCacheVersion();
}

export async function openNodeDialog({ mode, node, onDone } = {}) {
  const dlg = document.getElementById("dlg");
  if (!dlg) return;

  if (mode === "edit")    return openEdit(dlg, node, onDone);
  if (mode === "addChild") return openAddChild(dlg, node, onDone);
  if (mode === "delete")  return openDelete(dlg, node, onDone);
  throw new Error("Unknown mode: " + mode);
}

/* -------------------- EDIT -------------------- */
async function openEdit(dlg, node, onDone) {
  if (!node) return;
  const lvl = node.level;
  dlg.style.minWidth = "min(92vw, 440px)";
  dlg.style.maxWidth = "min(94vw, 500px)";

  dlg.innerHTML = `
    <div class="card">
      <h2 style="margin:0 0 .75rem">Edit ${esc(LABEL[lvl])}</h2>
      <form id="nodeEditForm" class="form-stack">
        <label>Name
          <input type="text" name="name" value="${esc(node.name || "")}" required>
        </label>
        <label>Order
          <input type="number" name="order" value="${Number(node.order ?? 0)}">
        </label>
        <label style="display:flex;align-items:center;gap:.5rem">
          <input type="checkbox" name="active" ${node.active === false ? "" : "checked"}>
          Visible to students
        </label>
        <div class="row" style="margin-top:.75rem">
          <button class="btn" type="submit">Save</button>
          <button class="btn ghost" type="button" onclick="document.getElementById('dlg').close()">Cancel</button>
        </div>
      </form>
    </div>`;
  dlg.showModal();

  dlg.querySelector("#nodeEditForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const name = String(f.get("name") || "").trim();
    if (!name) return toast("Name is required.", "warn");
    try {
      await writeBatch(db).update(doc(db, "nodes", node.id), {
        name,
        order: Number(f.get("order")) || 0,
        active: f.get("active") === "on",
      }).commit();
      await afterWrite();
      dlg.close();
      toast("Updated", "ok");
      onDone?.();
    } catch (err) {
      toast("Update failed: " + err.message, "bad");
    }
  };
}

/* -------------------- ADD CHILD -------------------- */
function openAddChild(dlg, parent, onDone) {
  const childLevel = nextLevel(parent.level);
  if (!childLevel) return toast("Topics are the deepest level.", "warn");

  dlg.style.minWidth = "min(92vw, 440px)";
  dlg.style.maxWidth = "min(94vw, 500px)";
  dlg.innerHTML = `
    <div class="card">
      <h2 style="margin:0 0 .35rem">Add ${esc(LABEL[childLevel])}</h2>
      <p style="margin:0 0 .75rem;font-size:.8rem;color:var(--muted)">
        Under: <b>${esc(parent.name)}</b>
      </p>
      <form id="nodeAddChildForm" class="form-stack">
        <label>Names (one per line)
          <textarea name="names" rows="4" required placeholder="${esc(LABEL[childLevel])} name…"></textarea>
        </label>
        <label>Order start
          <input type="number" name="order" value="0">
        </label>
        <div class="row" style="margin-top:.75rem">
          <button class="btn" type="submit">Add</button>
          <button class="btn ghost" type="button" onclick="document.getElementById('dlg').close()">Cancel</button>
        </div>
      </form>
    </div>`;
  dlg.showModal();

  dlg.querySelector("#nodeAddChildForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const names = String(f.get("names") || "").split("\n").map((s) => s.trim()).filter(Boolean);
    if (!names.length) return toast("Type at least one name.", "warn");
    const startOrder = Number(f.get("order")) || 0;
    let order = Math.max(startOrder - 1, ...kidsOf(parent.id).map((n) => n.order || 0));
    try {
      const b = writeBatch(db);
      names.forEach((name) => b.set(doc(collection(db, "nodes")), {
        level: childLevel,
        name,
        parentId: parent.id,
        path: [...(parent.path || []), parent.id],
        order: ++order,
        active: true,
        qCount: 0,
        createdAt: Date.now(),
      }));
      await b.commit();
      await afterWrite();
      dlg.close();
      toast(`${names.length} ${LABEL[childLevel].toLowerCase()}${names.length === 1 ? "" : "s"} added`, "ok");
      onDone?.();
    } catch (err) {
      toast("Add failed: " + err.message, "bad");
    }
  };
}

/* -------------------- DELETE -------------------- */
async function openDelete(dlg, node, onDone) {
  if (!node) return;
  const kids = kidsOf(node.id);
  const hasKids = kids.length > 0;

  let questionCount = 0;
  try {
    const snap = await getDocs(query(collection(db, "questions"), where("nodeId", "==", node.id)));
    questionCount = snap.size;
  } catch { /* ignore */ }

  dlg.style.minWidth = "min(92vw, 420px)";
  dlg.style.maxWidth = "min(94vw, 480px)";

  if (hasKids) {
    dlg.innerHTML = `
      <div class="card">
        <h2 style="margin:0 0 .75rem">Can't delete</h2>
        <p style="margin:0 0 .5rem">
          <b>${esc(node.name)}</b> has <b>${kids.length}</b> ${LABEL[nextLevel(node.level)]?.toLowerCase() ?? "child"}${kids.length === 1 ? "" : "s"}.
        </p>
        <p style="margin:0 0 .75rem;font-size:.85rem;color:var(--muted)">
          Delete or move those first, then come back.
        </p>
        <div class="row">
          <button class="btn ghost" type="button" onclick="document.getElementById('dlg').close()">Close</button>
        </div>
      </div>`;
    dlg.showModal();
    return;
  }

  if (questionCount > 0) {
    dlg.innerHTML = `
      <div class="card">
        <h2 style="margin:0 0 .75rem">Can't delete</h2>
        <p style="margin:0 0 .5rem">
          <b>${esc(node.name)}</b> has <b>${questionCount}</b> question${questionCount === 1 ? "" : "s"}.
        </p>
        <p style="margin:0 0 .75rem;font-size:.85rem;color:var(--muted)">
          Delete or move its questions first.
        </p>
        <div class="row">
          <button class="btn ghost" type="button" onclick="document.getElementById('dlg').close()">Close</button>
        </div>
      </div>`;
    dlg.showModal();
    return;
  }

  dlg.innerHTML = `
    <div class="card">
      <h2 style="margin:0 0 .75rem">Delete ${esc(LABEL[node.level])}?</h2>
      <p style="margin:0 0 .75rem">
        <b>${esc(node.name)}</b> will be permanently removed. This can't be undone.
      </p>
      <div class="row">
        <button class="btn danger" type="button" id="confirmDel">Delete</button>
        <button class="btn ghost" type="button" onclick="document.getElementById('dlg').close()">Cancel</button>
      </div>
    </div>`;
  dlg.showModal();

  dlg.querySelector("#confirmDel").onclick = async () => {
    try {
      await deleteDoc(doc(db, "nodes", node.id));
      await afterWrite();
      dlg.close();
      toast("Deleted", "ok");
      onDone?.();
    } catch (err) {
      toast("Delete failed: " + err.message, "bad");
    }
  };
}