// js/admin/configs/questions.js
// Question table config + Quick Add / Edit dialog + Bulk Paste with live preview.
import {
  db, doc, collection, writeBatch, increment, updateDoc,
} from "../../core/firebase.js";
import { esc, toast } from "../../core/dom.js";
import { getNode, invalidateQuestions } from "../../core/store.js";
import { clearCounts } from "../../core/counts.js";
import { pickerHTML, mountPicker } from "../picker.js";
import {
  LETTERS, detectDoubleMCQ, isDoubleQuestion, parseMCQText, isReady,
} from "../../core/mcq.js";

const bust = (id) => { invalidateQuestions(id); clearCounts(); };

export function makeQuestionsConfig({ scopeId, scopeLevel }) {
  return {
    idKey: "id",
    pageSize: 50,
    searchKeys: ["text"],
    filters: [{
      key: "status", default: "all",
      options: [
        { value: "all", label: "All Statuses" },
        { value: "active", label: "Active" },
        { value: "draft", label: "Draft" },
        { value: "archived", label: "Archived" },
      ],
      predicate: (r, val) => val === "all" || r.status === val,
    }],
    headerActions: [
      { id: "add", label: "⚡ + Quick Add Question",
        onClick: (dt) => openQuestionDialog(null, { scopeId, scopeLevel }, dt) },
    ],
    columns: [
      { type: "checkbox" },
      {
        key: "text", label: "Question", sortable: false,
        render: (r) => {
          const t = r.text || "";
          return `
            <div class="space-y-1">
              <div class="font-medium text-slate-900 dark:text-white line-clamp-2">${esc(t.slice(0, 160)) + (t.length > 160 ? "…" : "")}</div>
              ${isDoubleQuestion(r) ? `<span class="badge warn text-[10px]"><i class="fa-solid fa-clone mr-1"></i> Double / Statement MCQ</span>` : ""}
            </div>`;
        },
      },
      { key: "correct", label: "Ans", render: (r) => `<span class="font-bold text-indigo-600 dark:text-indigo-400">${LETTERS[r.correct] ?? "?"}</span>` },
      { key: "status", label: "Status",
        render: (r) => `<span class="badge ${r.status === "active" ? "ok" : r.status === "archived" ? "bad" : "warn"}">${esc(r.status || "draft")}</span>` },
      { key: "difficulty", label: "Diff", render: (r) => `<span class="capitalize text-xs text-slate-600 dark:text-slate-400">${esc(r.difficulty || "medium")}</span>` },
      { key: "actions", label: "",
        render: (r) => `<button class="btn sm ghost" data-q-edit="${esc(r.id)}"><i class="fa-solid fa-pen-to-square mr-1"></i> Edit</button>` },
    ],
    bulkActions: [
      { id: "move", label: "Move to…", run: (ids, dt) => openMoveDialog(ids, dt, { scopeId, scopeLevel }) },
      { id: "activate", label: "Activate", run: (ids) => setStatus(ids, "active") },
      { id: "archive", label: "Archive", run: (ids) => setStatus(ids, "archived") },
      { id: "review", label: "Mark Reviewed", run: (ids) => markReviewed(ids) },
      { id: "delete", label: "Delete", destructive: true, run: (ids) => deleteMany(ids) },
    ],
  };
}

/* ---------------- shared tiny style helpers ---------------- */
const LBL = "block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1";
const FIELD = "w-full p-2 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500";
const TAB_ON = "flex-1 py-1.5 text-xs font-semibold rounded-md bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs transition-all";
const TAB_OFF = "flex-1 py-1.5 text-xs font-semibold rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-900 transition-all";

function sizeDialog(dlg, wide) {
  dlg.style.width = "fit-content";
  dlg.style.height = "auto";
  dlg.style.minWidth = wide ? "min(94vw, 680px)" : "min(92vw, 480px)";
  dlg.style.maxWidth = wide ? "min(96vw, 780px)" : "min(94vw, 540px)";
}

/* ---------------- Quick Add / Edit dialog ---------------- */
export async function openQuestionDialog(row, scope, dt) {
  const dlg = document.getElementById("dlg");
  if (!dlg) return;

  if (!row && !["chapter", "topic"].includes(scope.scopeLevel)) {
    return toast("Pick a chapter or topic first, then add questions.", "warn");
  }

  sizeDialog(dlg, false);

  const r = row || {
    text: "", options: ["", "", "", ""], correct: -1,
    explanation: "", difficulty: "medium", status: "active", isDouble: false,
  };
  const isEdit = Boolean(row?.id);
  const startDouble = isEdit ? isDoubleQuestion(r) : false;
  let manualDouble = r.doubleManual === true;

  dlg.innerHTML = `
    <div class="p-4 sm:p-5">
      <div class="flex items-center justify-between mb-3.5 pb-2.5 border-b border-slate-200/80 dark:border-white/10">
        <h3 class="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-1.5">
          <i class="fa-solid fa-bolt text-indigo-500 text-xs"></i> ${isEdit ? "Edit MCQ" : "Quick Add MCQ"}
        </h3>
        <button type="button" onclick="document.getElementById('dlg').close()" class="icon-btn w-7 h-7 rounded-full">
          <i class="fa-solid fa-xmark text-xs"></i>
        </button>
      </div>

      ${!isEdit ? `
        <div class="flex items-center gap-1.5 mb-3.5 p-1 bg-slate-100 dark:bg-white/[0.04] rounded-lg border border-slate-200/70 dark:border-white/10">
          <button type="button" id="tabSingle" class="${TAB_ON}">Single Entry</button>
          <button type="button" id="tabBatch" class="${TAB_OFF}">Bulk Paste</button>
        </div>` : ""}

      <!-- Single entry -->
      <form id="qForm" class="space-y-3">
        <div>
          <label class="${LBL}">Question</label>
          <textarea name="text" rows="3" required autofocus placeholder="Type or paste the question (e.g. Statement I: ...)" class="${FIELD}">${esc(r.text)}</textarea>
        </div>

        <div>
          <label class="${LBL}">Options - tick the correct one</label>
          <div class="space-y-1.5">
            ${[0, 1, 2, 3, 4].map((i) => `
              <div class="flex items-center gap-2 p-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] hover:border-indigo-500/50 transition-colors">
                <input type="radio" name="correct" value="${i}" required ${i === r.correct ? "checked" : ""} class="w-3.5 h-3.5 cursor-pointer accent-indigo-600" title="Mark correct">
                <span class="text-[11px] font-bold text-slate-500 w-4 text-center">${LETTERS[i]}</span>
                <input type="text" name="o${i}" value="${esc(r.options[i] || "")}" ${i < 2 ? "required" : ""} placeholder="Option ${LETTERS[i]}${i === 4 ? " (optional)" : ""}" class="flex-1 px-2 py-1 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b101d] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500">
              </div>`).join("")}
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2.5">
          <div>
            <label class="${LBL}">Difficulty</label>
            <select name="difficulty" class="${FIELD}">
              ${["easy", "medium", "hard"].map((v) => `<option value="${v}" ${v === r.difficulty ? "selected" : ""}>${v[0].toUpperCase() + v.slice(1)}</option>`).join("")}
            </select>
          </div>
          <div>
            <label class="${LBL}">Status</label>
            <select name="status" class="${FIELD}">
              ${["active", "draft", "archived"].map((v) => `<option value="${v}" ${v === r.status ? "selected" : ""}>${v[0].toUpperCase() + v.slice(1)}</option>`).join("")}
            </select>
          </div>
        </div>

        <label class="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300">
          <input type="checkbox" name="isDouble" ${startDouble ? "checked" : ""} class="w-4 h-4 rounded accent-indigo-600">
          Double / Statement MCQ <span class="text-slate-400 font-normal">(auto-detected - tick or untick to override)</span>
        </label>

        <div>
          <label class="${LBL}">Explanation (optional)</label>
          <input type="text" name="explanation" value="${esc(r.explanation || "")}" placeholder="Brief solution note..." class="${FIELD}">
        </div>

        <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-200/80 dark:border-white/10">
          <button type="button" onclick="document.getElementById('dlg').close()" class="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-all">Cancel</button>
          <button type="submit" class="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all active:scale-95">${isEdit ? "Update" : "Save & Next ⚡"}</button>
        </div>
      </form>

      <!-- Bulk paste -->
      <div id="batchPane" class="space-y-3 hidden">
        <div>
          <label class="${LBL}">Paste questions (as many as you like)</label>
          <p class="text-[11px] text-slate-400 mb-1.5">
            Separate with blank lines or number them. Options: <b>A)</b> <b>A.</b> <b>(A)</b>.
            Answer: <b>Ans: B</b>, <b>Answer: (B)</b>, <b>Correct answer: B</b> - or mark the option with <b>*</b> / <b>✓</b>.
            Optional <b>Exp:</b> line.
          </p>
          <textarea id="batchText" rows="7" placeholder="1. Statement I: Mitochondria produce ATP.&#10;Statement II: Chloroplasts perform photolysis.&#10;A) Both I and II are correct&#10;B) Only I is correct&#10;C) Only II is correct&#10;D) Neither&#10;Ans: B&#10;&#10;2. Capital of Pakistan?&#10;A) Lahore&#10;B) Islamabad*&#10;C) Karachi&#10;D) Quetta" class="${FIELD} font-mono"></textarea>
        </div>
        <div class="grid grid-cols-2 gap-2.5">
          <div>
            <label class="${LBL}">Difficulty (all)</label>
            <select id="bDiff" class="${FIELD}">${["easy", "medium", "hard"].map((v) => `<option value="${v}" ${v === "medium" ? "selected" : ""}>${v[0].toUpperCase() + v.slice(1)}</option>`).join("")}</select>
          </div>
          <div>
            <label class="${LBL}">Status (all)</label>
            <select id="bStatus" class="${FIELD}">${["active", "draft"].map((v) => `<option value="${v}">${v[0].toUpperCase() + v.slice(1)}</option>`).join("")}</select>
          </div>
        </div>
        <div id="batchSummary" class="text-xs text-slate-500 dark:text-slate-400"></div>
        <div id="batchPreview" class="space-y-2 max-h-[36vh] overflow-y-auto pr-1"></div>
        <div class="flex items-center justify-end gap-2 pt-2.5 border-t border-slate-200/80 dark:border-white/10">
          <button type="button" onclick="document.getElementById('dlg').close()" class="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300">Cancel</button>
          <button type="button" id="btnRunBatch" disabled class="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all active:scale-95 disabled:opacity-50">Save Batch ⚡</button>
        </div>
      </div>
    </div>`;
  dlg.showModal();

  const qForm = dlg.querySelector("#qForm");
  const batchPane = dlg.querySelector("#batchPane");
  const tabSingle = dlg.querySelector("#tabSingle");
  const tabBatch = dlg.querySelector("#tabBatch");

  if (tabSingle && tabBatch) {
    tabSingle.onclick = () => {
      tabSingle.className = TAB_ON; tabBatch.className = TAB_OFF;
      qForm.classList.remove("hidden"); batchPane.classList.add("hidden");
      sizeDialog(dlg, false);
    };
    tabBatch.onclick = () => {
      tabBatch.className = TAB_ON; tabSingle.className = TAB_OFF;
      batchPane.classList.remove("hidden"); qForm.classList.add("hidden");
      sizeDialog(dlg, true);
      dlg.querySelector("#batchText")?.focus();
    };
    mountBatch(dlg, scope, dt);
  }

  /* ---- single form: auto double detection, but the user can override it ---- */
  const cb = qForm.querySelector("input[name='isDouble']");
  const readOptions = () => [0, 1, 2, 3, 4].map((i) => String(qForm.elements["o" + i]?.value || "").trim());
  const autoDetect = () => detectDoubleMCQ({ text: qForm.elements.text.value, options: readOptions().filter(Boolean) });
  qForm.addEventListener("input", () => { if (!manualDouble) cb.checked = autoDetect(); });
  cb.addEventListener("change", () => { manualDouble = true; });

  qForm.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const raw = readOptions();
    const last = raw.map(Boolean).lastIndexOf(true);
    const options = raw.slice(0, last + 1);
    if (options.length < 2) return toast("At least 2 options are required.", "warn");
    if (options.some((o) => !o)) return toast("Please fill options in order - no empty gaps.", "warn");
    const correct = +f.get("correct");
    if (!(correct >= 0 && correct < options.length)) return toast("Pick a correct option that has text.", "warn");

    const text = String(f.get("text")).trim();
    const auto = detectDoubleMCQ({ text, options });
    const checked = f.get("isDouble") === "on";

    const data = {
      text, options, correct,
      explanation: String(f.get("explanation") || "").trim(),
      difficulty: f.get("difficulty"),
      status: f.get("status"),
      isDouble: checked,
      doubleManual: checked !== auto,       // only "manual" when it disagrees with the detector
      updatedAt: Date.now(),
      reviewedAt: Date.now(),
    };

    try {
      if (row) {
        await updateDoc(doc(db, "questions", row.id), data);
        dlg.close();
        toast("Question updated", "ok");
      } else {
        const scopeNode = getNode(scope.scopeId);
        const path = [...(scopeNode.path || []), scopeNode.id];
        const b = writeBatch(db);
        b.set(doc(collection(db, "questions")), {
          ...data,
          nodeId: scope.scopeId,
          nodeLevel: scope.scopeLevel,
          topicId: scope.scopeLevel === "topic" ? scope.scopeId : null,
          path, version: 1, rand: Math.random(), createdAt: Date.now(),
        });
        if (data.status === "active") b.update(doc(db, "nodes", scope.scopeId), { qCount: increment(1) });
        await b.commit();
        toast("Saved! Ready for next ⚡", "ok");
        qForm.reset();
        manualDouble = false;
        qForm.elements.text.focus();
      }
      bust(scope.scopeId);
      dt?.onRefresh?.();
    } catch (err) { toast(err.message, "bad"); }
  };
}

/* ---------------- Bulk paste with live preview ---------------- */
function mountBatch(dlg, scope, dt) {
  const ta = dlg.querySelector("#batchText");
  const prev = dlg.querySelector("#batchPreview");
  const sum = dlg.querySelector("#batchSummary");
  const btn = dlg.querySelector("#btnRunBatch");
  let items = [];
  let timer;

  const card = (it, i) => {
    const ok = isReady(it);
    const needAns = it.correct < 0;
    return `
      <div class="rounded-lg border ${ok ? "border-slate-200 dark:border-white/10" : "border-rose-300 dark:border-rose-500/40"} bg-white/60 dark:bg-white/[0.02] p-2.5">
        <div class="flex items-start justify-between gap-2">
          <div class="text-xs font-medium text-slate-900 dark:text-white whitespace-pre-line break-words">${i + 1}. ${esc(it.text.slice(0, 260))}${it.text.length > 260 ? "…" : ""}</div>
          <button type="button" data-b-del="${i}" title="Remove" class="text-slate-400 hover:text-rose-500 text-sm leading-none px-1">×</button>
        </div>
        <div class="flex flex-wrap gap-1 mt-1">
          ${it.isDouble ? `<span class="badge warn text-[10px]"><i class="fa-solid fa-clone mr-1"></i> Double</span>` : ""}
          ${needAns ? `<span class="badge bad text-[10px]">Pick the correct answer${it.ansNote ? " (" + esc(it.ansNote) + ")" : ""}</span>` : ""}
          ${it.warnings.map((w) => `<span class="badge bad text-[10px]">${esc(w)}</span>`).join("")}
        </div>
        <div class="mt-1.5 grid gap-1">
          ${it.options.map((o, k) => `
            <label class="flex items-start gap-1.5 text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer ${it.correct === k ? "font-semibold text-emerald-600 dark:text-emerald-400" : ""}">
              <input type="radio" name="bc${i}" value="${k}" data-b-ans="${i}" ${it.correct === k ? "checked" : ""} class="mt-0.5 accent-indigo-600">
              <b>${LETTERS[k]}</b><span class="break-words">${esc(o)}</span>
            </label>`).join("")}
        </div>
      </div>`;
  };

  function paint() {
    const st = prev.scrollTop;
    const okN = items.filter(isReady).length;
    const needAns = items.filter((it) => it.text && it.options.length >= 2 && it.options.every(Boolean) && it.correct < 0).length;
    const bad = items.length - okN - needAns;
    const dbl = items.filter((it) => isReady(it) && it.isDouble).length;
    sum.innerHTML = items.length
      ? `<b class="text-slate-800 dark:text-slate-100">${items.length}</b> detected · <span class="text-emerald-600 dark:text-emerald-400">${okN} ready</span>` +
        (needAns ? ` · <span class="text-rose-500">${needAns} need an answer</span>` : "") +
        (bad ? ` · <span class="text-rose-500">${bad} invalid</span>` : "") +
        (dbl ? ` · <span class="text-amber-600">${dbl} double</span>` : "")
      : "Paste one or many questions - a live preview appears here.";
    prev.innerHTML = items.map(card).join("");
    prev.scrollTop = st;
    btn.disabled = !okN;
    btn.textContent = okN ? `Save ${okN} question${okN > 1 ? "s" : ""} ⚡` : "Save Batch ⚡";
  }

  ta.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { items = parseMCQText(ta.value); paint(); }, 200);
  };
  prev.onchange = (e) => {
    const r = e.target.closest("[data-b-ans]");
    if (!r) return;
    items[+r.dataset.bAns].correct = +r.value;
    paint();
  };
  prev.onclick = (e) => {
    const d = e.target.closest("[data-b-del]");
    if (!d) return;
    items.splice(+d.dataset.bDel, 1);
    paint();
  };
  paint();

  btn.onclick = async () => {
    const ready = items.filter(isReady);
    if (!ready.length) return;
    const skipped = items.length - ready.length;
    const difficulty = dlg.querySelector("#bDiff").value;
    const status = dlg.querySelector("#bStatus").value;

    btn.disabled = true;
    btn.textContent = `Saving ${ready.length}…`;
    let saved = 0;
    try {
      const scopeNode = getNode(scope.scopeId);
      const path = [...(scopeNode.path || []), scopeNode.id];
      const now = Date.now();
      for (let i = 0; i < ready.length; i += 400) {
        const chunk = ready.slice(i, i + 400);
        const b = writeBatch(db);
        chunk.forEach((it, k) => b.set(doc(collection(db, "questions")), {
          text: it.text, options: it.options, correct: it.correct,
          explanation: it.explanation, difficulty, status,
          isDouble: it.isDouble, doubleManual: false,
          nodeId: scope.scopeId, nodeLevel: scope.scopeLevel,
          topicId: scope.scopeLevel === "topic" ? scope.scopeId : null,
          path, version: 1, rand: Math.random(),
          createdAt: now + i + k, updatedAt: now, reviewedAt: now,
        }));
        await b.commit();
        saved += chunk.length;
      }
      toast(`Added ${saved} question(s)` + (skipped ? ` - ${skipped} skipped` : ""), "ok");
      dlg.close();
    } catch (err) {
      console.error(err);
      toast(`Batch save failed after ${saved} saved: ${err.message}`, "bad");
      btn.disabled = false;
    } finally {
      if (saved && status === "active") {
        try { await updateDoc(doc(db, "nodes", scope.scopeId), { qCount: increment(saved) }); } catch { /* non-fatal */ }
      }
      if (saved) { bust(scope.scopeId); dt?.onRefresh?.(); }
    }
  };
}

/* ---------------- move & bulk actions ---------------- */
function openMoveDialog(ids, dt, scope) {
  const dlg = document.getElementById("dlg");
  if (!dlg) return;
  sizeDialog(dlg, false);

  dlg.innerHTML = `
    <div class="p-4 sm:p-5">
      <h3 class="font-display font-bold text-base text-slate-900 dark:text-white mb-1">Move ${ids.length} Question(s)</h3>
      <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">Pick a chapter or topic.</p>
      <div class="grid4 mb-3" id="mvPk">${pickerHTML("topic")}</div>
      <p class="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-4" id="mvTarget"></p>
      <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-200/80 dark:border-white/10">
        <button type="button" onclick="document.getElementById('dlg').close()" class="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-white/5 text-slate-600">Cancel</button>
        <button class="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white disabled:opacity-50" id="mvGo" disabled>Move</button>
      </div>
    </div>`;
  dlg.showModal();

  let target = null;
  mountPicker(dlg.querySelector("#mvPk"), {
    stopAt: "topic",
    persistKey: "mvPick",
    onSelect: ({ nodeId, level, node }) => {
      target = nodeId && (level === "chapter" || level === "topic") ? { nodeId, level, node } : null;
      dlg.querySelector("#mvGo").disabled = !target;
      dlg.querySelector("#mvTarget").textContent = node ? `Target: ${level} - ${node.name}` : "";
    },
  });

  dlg.querySelector("#mvGo").onclick = async () => {
    if (!target) return;
    const dest = getNode(target.nodeId);
    const destPath = [...(dest.path || []), dest.id];
    try {
      for (let i = 0; i < ids.length; i += 400) {
        const b = writeBatch(db);
        ids.slice(i, i + 400).forEach((id) => b.update(doc(db, "questions", id), {
          nodeId: target.nodeId,
          nodeLevel: target.level,
          topicId: target.level === "topic" ? target.nodeId : null,
          path: destPath,
          updatedAt: Date.now(),
        }));
        await b.commit();
      }
      dlg.close();
      toast("Questions moved successfully", "ok");
      bust();
      dt.onRefresh?.();
    } catch (e) { toast(e.message, "bad"); }
  };
}

async function chunked(ids, fn) {
  for (let i = 0; i < ids.length; i += 400) {
    const b = writeBatch(db);
    ids.slice(i, i + 400).forEach((id) => fn(b, id));
    await b.commit();
  }
}

async function setStatus(ids, status) {
  await chunked(ids, (b, id) => b.update(doc(db, "questions", id), { status, updatedAt: Date.now() }));
  bust();
  toast(`Updated status to ${status}`, "ok");
}

async function markReviewed(ids) {
  await chunked(ids, (b, id) => b.update(doc(db, "questions", id), { reviewedAt: Date.now() }));
  bust();
  toast("Marked selected questions as reviewed", "ok");
}

async function deleteMany(ids) {
  await chunked(ids, (b, id) => b.delete(doc(db, "questions", id)));
  bust();
  toast(`Deleted ${ids.length} questions`, "ok");
}