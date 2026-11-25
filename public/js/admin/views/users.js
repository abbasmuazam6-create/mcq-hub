// js/admin/views/users.js
import { db, collection, getDocs } from "../../core/firebase.js";
import { $, toast } from "../../core/dom.js";
import { DataTable } from "../DataTable.js";
import { makeUsersConfig, toggleUserActive } from "../configs/users.js";

let dt = null;

export default async function () {
  if (!window.__isAdmin) return { html: `<div class="card">Admins only.</div>` };
  return { html: `<div id="usersHost"><div class="card center">Loading…</div></div>`, mount: wire };
}

async function wire() {
  const snap = await getDocs(collection(db, "users"));
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const cfg = makeUsersConfig({ currentUid: window.__ctx.user.uid });
  if (!dt) {
    dt = new DataTable({ mount: "#usersHost", config: cfg, rows, onRefresh: async () => {
      const s = await getDocs(collection(db, "users"));
      dt.setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })));
    }});
  } else {
    dt.config = cfg;
    dt.setRows(rows);
  }
  dt.render();
  wireToggle();
}

function wireToggle() {
  const host = $("#usersHost");
  if (!host || host._toggleWired) return;
  host._toggleWired = true;
  host.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-user-toggle]");
    if (!btn) return;
    const row = dt?.rows.find((r) => r.id === btn.dataset.userToggle);
    if (!row) return;
    btn.disabled = true;
    try {
      await toggleUserActive(row.id, row.active !== false);
      await dt.onRefresh?.();
    } catch (err) { toast(err.message, "bad"); btn.disabled = false; }
  });
}