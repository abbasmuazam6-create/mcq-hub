// js/admin/configs/videos.js
import { db, doc, collection, writeBatch, updateDoc } from "../../core/firebase.js";
import { esc, toast } from "../../core/dom.js";
import { getNode } from "../../core/store.js";

const YT_ID = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

export function parseYouTubeId(input) {
  if (!input) return null;
  const m = String(input).trim().match(YT_ID);
  return m ? m[1] : null;
}

export function makeVideosConfig({ scopeId, scopeLevel }) {
  return {
    idKey: "id",
    pageSize: 50,
    searchKeys: ["title", "channel"],
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
      { id: "add", label: "+ Add video", onClick: (dt) => openVideoDialog(null, { scopeId, scopeLevel }, dt) },
    ],
    columns: [
      { type: "checkbox" },
      { key: "youtubeId", label: "Thumb", render: (r) =>
          `<img src="https://i.ytimg.com/vi/${esc(r.youtubeId)}/mqdefault.jpg" alt="" style="width:80px;height:45px;object-fit:cover;border-radius:6px">` },
      { key: "title", label: "Title", sortable: true, render: (r) => `<b>${esc(r.title || "")}</b>` },
      { key: "channel", label: "Channel", render: (r) => esc(r.channel || "–") },
      { key: "order", label: "Order", sortable: true, render: (r) => r.order ?? 0 },
      { key: "status", label: "Status",
        render: (r) => `<span class="badge ${r.status === "active" ? "ok" : r.status === "archived" ? "warn" : ""}">${esc(r.status || "draft")}</span>` },
      { key: "actions", label: "",
        render: (r) => `<button class="btn sm ghost" data-vid-edit="${esc(r.id)}">Edit</button>` },
    ],
    bulkActions: [
      { id: "activate", label: "Activate", run: (ids) => setStatus(ids, "active") },
      { id: "archive",  label: "Archive",  run: (ids) => setStatus(ids, "archived") },
      { id: "delete",   label: "Delete",   destructive: true, run: (ids) => deleteMany(ids) },
    ],
  };
}

export async function openVideoDialog(row, scope, dt) {
  const dlg = document.getElementById("dlg");
  const r = row || { title: "", youtubeId: "", channel: "", order: 0, status: "active" };
  const initialUrl = r.youtubeId ? `https://youtu.be/${r.youtubeId}` : "";

  dlg.innerHTML = `<div class="card">
    <h2 style="margin:0 0 .75rem">${row ? "Edit" : "Add"} video</h2>
    <form id="vidForm" class="form-stack">
      <label>YouTube URL or ID
        <input name="url" required value="${esc(initialUrl)}" placeholder="https://www.youtube.com/watch?v=…">
      </label>
      <div id="vidPreview" style="display:${r.youtubeId ? "block" : "none"}">
        <img id="vidThumb" src="https://i.ytimg.com/vi/${esc(r.youtubeId || "")}/mqdefault.jpg"
             style="width:100%;max-width:320px;border-radius:8px;display:block">
      </div>
      <label>Title<input name="title" required value="${esc(r.title)}"></label>
      <label>Channel (optional)<input name="channel" value="${esc(r.channel || "")}"></label>
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

  const urlInput = dlg.querySelector("[name=url]");
  const preview = dlg.querySelector("#vidPreview");
  const thumb = dlg.querySelector("#vidThumb");
  const urlErr = document.createElement("div");
  urlErr.className = "err";
  urlInput.after(urlErr);

  urlInput.addEventListener("input", () => {
    const id = parseYouTubeId(urlInput.value);
    if (id) {
      urlErr.textContent = "";
      preview.style.display = "block";
      thumb.src = `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
    } else if (urlInput.value.trim()) {
      urlErr.textContent = "Not a valid YouTube URL or ID.";
      preview.style.display = "none";
    } else {
      urlErr.textContent = "";
      preview.style.display = "none";
    }
  });

  dlg.querySelector("#vidForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const youtubeId = parseYouTubeId(f.get("url"));
    if (!youtubeId) return toast("Paste a valid YouTube URL or 11-character ID.", "warn");

    const data = {
      title: String(f.get("title")).trim(),
      youtubeId,
      channel: String(f.get("channel") || "").trim() || null,
      order: +f.get("order") || 0,
      status: f.get("status"),
      updatedAt: Date.now(),
    };

    try {
      if (row) {
        await updateDoc(doc(db, "videos", row.id), data);
      } else {
        const scopeNode = getNode(scope.scopeId);
        const path = [...scopeNode.path, scopeNode.id];
        await writeBatch(db).set(doc(collection(db, "videos")), {
          ...data, nodeId: scope.scopeId, nodeLevel: scope.scopeLevel,
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
  ids.forEach((id) => b.update(doc(db, "videos", id), { status, updatedAt: Date.now() }));
  await b.commit();
  toast("Updated", "ok");
}

async function deleteMany(ids) {
  const b = writeBatch(db);
  ids.forEach((id) => b.delete(doc(db, "videos", id)));
  await b.commit();
  toast("Deleted", "ok");
}