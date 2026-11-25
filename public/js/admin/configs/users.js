// js/admin/configs/users.js
// Users table config. Admin-only. Role + active bulk actions.

import { db, doc, writeBatch, updateDoc } from "../../core/firebase.js";
import { esc, toast } from "../../core/dom.js";

export function makeUsersConfig({ currentUid }) {
  return {
    idKey: "id",
    pageSize: 100,
    searchKeys: ["name", "email"],
    filters: [{
      key: "role", default: "all",
      options: [
        { value: "all", label: "All roles" },
        { value: "student", label: "Students" },
        { value: "teacher", label: "Teachers" },
        { value: "admin", label: "Admins" },
      ],
      predicate: (r, v) => v === "all" || r.role === v,
    }],
    columns: [
      { type: "checkbox" },
      { key: "name", label: "Name", sortable: true,
        render: (r) => `<b>${esc(r.name || "(no name)")}</b>` },
      { key: "email", label: "Email", sortable: true, render: (r) => esc(r.email || "") },
      { key: "role", label: "Role",
        render: (r) => `<span class="badge ${r.role === "admin" ? "ok" : r.role === "teacher" ? "warn" : ""}">${esc(r.role || "student")}</span>` },
      { key: "createdAt", label: "Joined", sortable: true,
        render: (r) => r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "–" },
      { key: "active", label: "Status",
        render: (r) => `<span class="badge ${r.active === false ? "bad" : "ok"}">${r.active === false ? "inactive" : "active"}</span>` },
      { key: "actions", label: "",
        render: (r) => r.id === currentUid
          ? `<span class="muted" style="font-size:.8rem">(you)</span>`
          : `<button class="btn sm ghost" data-user-toggle="${esc(r.id)}">${r.active === false ? "Activate" : "Deactivate"}</button>` },
    ],
    bulkActions: [
      { id: "promote-teacher", label: "Make teacher", run: (ids) => setRole(ids, "teacher", currentUid) },
      { id: "promote-admin",   label: "Make admin",   run: (ids) => setRole(ids, "admin", currentUid) },
      { id: "demote-student",  label: "Make student", run: (ids) => setRole(ids, "student", currentUid) },
      { id: "activate",   label: "Activate",   run: (ids) => setActive(ids, true) },
      { id: "deactivate", label: "Deactivate", destructive: true, run: (ids) => setActive(ids, false, currentUid) },
    ],
  };
}

async function setRole(ids, role, currentUid) {
  if (ids.includes(currentUid)) { toast("You cannot change your own role.", "warn"); ids = ids.filter((i) => i !== currentUid); }
  if (!ids.length) return;
  const b = writeBatch(db);
  ids.forEach((id) => b.update(doc(db, "users", id), { role }));
  await b.commit();
  toast("Roles updated", "ok");
}

async function setActive(ids, active, currentUid) {
  if (active === false && ids.includes(currentUid)) { toast("You cannot deactivate yourself.", "warn"); ids = ids.filter((i) => i !== currentUid); }
  if (!ids.length) return;
  const b = writeBatch(db);
  ids.forEach((id) => b.update(doc(db, "users", id), { active }));
  await b.commit();
  toast(active ? "Activated" : "Deactivated", "ok");
}

export async function toggleUserActive(userId, currentActive) {
  await updateDoc(doc(db, "users", userId), { active: !currentActive });
  toast(!currentActive ? "Activated" : "Deactivated", "ok");
}