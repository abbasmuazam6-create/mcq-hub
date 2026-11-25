// js/views/marks.js — Bookmarks (#/bookmarks) and Mistakes (#/wrong)
import { db, collection, getDocs, doc, deleteDoc } from "../core/firebase.js";
import { esc, toast, shuffle } from "../core/dom.js";
import { getDocCached } from "../core/store.js";
import { current } from "../core/router.js";

const L = "ABCDE";

export default async function () {
  const kind = current()?.name === "wrong" ? "wrong" : "bookmarks";
  const M = kind === "wrong"
    ? { t: "Mistakes", ic: "🎯", fg: "#d92d20", e: "No mistakes to review. Nice work!" }
    : { t: "Bookmarks", ic: "★", fg: "#b54708", e: "Tap the ★ during a quiz to save questions here." };
  const uid = window.__ctx.user.uid;
  let ids = [];
  try {
    const s = await getDocs(collection(db, "users", uid, kind));
    ids = s.docs.map((d) => ({ id: d.id, at: d.data().at || 0 })).sort((a, b) => b.at - a.at).map((x) => x.id);
  } catch (e) { return `<div class="st-empty"><div class="big">⚠️</div><p>${esc(e.message)}</p></div>`; }

  const qs = (await Promise.all(ids.slice(0, 60).map((id) => getDocCached("questions", id).catch(() => null)))).filter(Boolean);
  const head = `<section class="bhead" style="--fg:${M.fg}"><div class="bhead-ic">${M.ic}</div>
    <div class="bhead-t"><small>Your list</small><h1>${M.t}</h1><div class="bhead-pills"><span id="cnt">${qs.length} question${qs.length === 1 ? "" : "s"}</span></div></div>
    ${qs.length ? `<button class="btn" data-practice>Practice these</button>` : ""}</section>`;
  if (!qs.length) return head + `<div class="st-empty"><div class="big">${M.ic}</div><p>${M.e}</p><a class="btn" href="#/home">Start practicing</a></div>`;

  const html = head + `<div class="stagger" id="ml">${qs.map((q, i) => `
    <div class="card rq" data-id="${q.id}" style="--i:${Math.min(i, 10)}">
      <div><b>${i + 1}.</b> ${esc(q.text)}</div>
      <div class="opts shown" style="margin-top:.6rem">${(q.options || []).map((o, k) => `<div class="opt ${k === q.correct ? "correct" : ""}"><b>${L[k]}</b><span>${esc(o)}</span></div>`).join("")}</div>
      ${q.explanation ? `<div class="expl ok">${esc(q.explanation)}</div>` : ""}
      <div class="row between"><span></span><button class="btn ghost sm" data-rm="${q.id}">Remove</button></div>
    </div>`).join("")}</div>`;

  return {
    html,
    mount(root) {
      root.addEventListener("click", async (e) => {
        if (e.target.closest("[data-practice]")) {
          window.__customSession = { mode: "practice", title: M.t, qs: shuffle(qs).slice(0, 20), answers: {}, idx: 0, startedAt: Date.now(), limitSec: 0 };
          location.hash = "#/quiz";
          return;
        }
        const rm = e.target.closest("[data-rm]");
        if (!rm) return;
        try {
          await deleteDoc(doc(db, "users", uid, kind, rm.dataset.rm));
          rm.closest(".card").remove();
          const n = root.querySelectorAll("#ml .card").length;
          root.querySelector("#cnt").textContent = `${n} question${n === 1 ? "" : "s"}`;
        } catch (err) { toast(err.message, "bad"); }
      });
    },
  };
}