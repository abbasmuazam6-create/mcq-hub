// js/admin/configs/questions.js — Auto-detection & highlighting for double/matching MCQs
import {
  db, doc, collection, writeBatch, increment, updateDoc,
} from "../../core/firebase.js";
import { esc, toast } from "../../core/dom.js";
import { getNode, invalidateQuestions } from "../../core/store.js";
import { pickerHTML, mountPicker } from "../picker.js";

const LETTERS = "ABCDE";

// Helper to automatically detect if a question is a double / statement-based MCQ
function detectDoubleMCQ(r) {
  if (r.isDouble || r.doubleQuestion) return true;
  const text = String(r.text || "").toLowerCase();
  
  // Detects multi-statement markers (Statement I, Statement II, Assertion, Reason, etc.)
  const hasSubStatements = 
    (text.includes("statement") && (text.includes("i") || text.includes("1"))) ||
    text.includes("assertion") || 
    text.includes("reason") ||
    text.includes("both statements") ||
    (text.match(/\([1-2iv]+\)/g) || []).length >= 2;

  // Detects if prompt text is exceptionally long or complex
  const isLong = text.length > 320;
  
  return hasSubStatements || isLong;
}

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
        key: "text", 
        label: "Question", 
        sortable: false,
        render: (r) => {
          const isDouble = detectDoubleMCQ(r);
          return `
            <div class="space-y-1">
              <div class="font-medium text-slate-900 dark:text-white line-clamp-2">${esc((r.text || "").slice(0, 160)) + ((r.text || "").length > 160 ? "…" : "")}</div>
              ${isDouble ? `<span class="badge warn text-[10px]"><i class="fa-solid fa-clone mr-1"></i> Double / Statement MCQ</span>` : ""}
            </div>
          `;
        }
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

/* ---------------- Compact Fitted Add / Edit Dialog ---------------- */
export async function openQuestionDialog(row, scope, dt) {
  const dlg = document.getElementById("dlg");
  if (!dlg) return;

  dlg.style.width = "fit-content";
  dlg.style.minWidth = "min(92vw, 480px)";
  dlg.style.maxWidth = "min(94vw, 540px)";
  dlg.style.height = "auto";

  const r = row || {
    text: "", options: ["", "", "", ""], correct: 0,
    explanation: "", difficulty: "medium", status: "active", isDouble: false,
  };

  const isEdit = Boolean(row?.id);
  const autoDouble = detectDoubleMCQ(r);

  dlg.innerHTML = `
    <div class="p-4 sm:p-5">
      <div class="flex items-center justify-between mb-3.5 pb-2.5 border-b border-slate-200/80 dark:border-white/10">
        <div>
          <h3 class="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-1.5">
            <i class="fa-solid fa-bolt text-indigo-500 text-xs"></i> ${isEdit ? "Edit MCQ" : "Quick Add MCQ"}
          </h3>
        </div>
        <button type="button" onclick="document.getElementById('dlg').close()" class="icon-btn w-7 h-7 rounded-full">
          <i class="fa-solid fa-xmark text-xs"></i>
        </button>
      </div>

      ${!isEdit ? `
        <div class="flex items-center gap-1.5 mb-3.5 p-1 bg-slate-100 dark:bg-white/[0.04] rounded-lg border border-slate-200/70 dark:border-white/10">
          <button type="button" id="tabSingle" class="flex-1 py-1.5 text-xs font-semibold rounded-md bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs transition-all">Single Entry</button>
          <button type="button" id="tabBatch" class="flex-1 py-1.5 text-xs font-semibold rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-900 transition-all">Bulk Batch Paste</button>
        </div>
      ` : ""}

      <!-- Single Entry Form -->
      <form id="qForm" class="space-y-3">
        <div>
          <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Question Prompt</label>
          <textarea name="text" rows="2" required autofocus placeholder="Type or paste question statement (e.g. Statement I: ...)" class="w-full p-2.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none">${esc(r.text)}</textarea>
        </div>

        <div>
          <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Options (Select radio for correct answer)</label>
          <div class="space-y-1.5">
            ${[0, 1, 2, 3].map((i) => `
              <div class="flex items-center gap-2 p-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] hover:border-indigo-500/50 transition-colors">
                <input type="radio" name="correct" value="${i}" ${i === (r.correct ?? 0) ? "checked" : ""} class="w-3.5 h-3.5 text-indigo-600 cursor-pointer accent-indigo-600" title="Mark correct">
                <span class="text-[11px] font-bold text-slate-500 w-4 uppercase text-center">${LETTERS[i]}</span>
                <input type="text" name="o${i}" value="${esc(r.options[i] || "")}" ${i < 2 ? "required" : ""} placeholder="Option ${LETTERS[i]}..." class="flex-1 px-2 py-1 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b101d] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500">
              </div>
            `).join("")}
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2.5">
          <div>
            <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Difficulty</label>
            <select name="difficulty" class="w-full p-2 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-xs text-slate-900 dark:text-white focus:outline-none">
              ${["easy", "medium", "hard"].map((v) =>
                `<option value="${v}" ${v === r.difficulty ? "selected" : ""}>${v.charAt(0).toUpperCase() + v.slice(1)}</option>`
              ).join("")}
            </select>
          </div>
          <div>
            <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Status</label>
            <select name="status" class="w-full p-2 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-xs text-slate-900 dark:text-white focus:outline-none">
              ${["active", "draft", "archived"].map((v) =>
                `<option value="${v}" ${v === r.status ? "selected" : ""}>${v.charAt(0).toUpperCase() + v.slice(1)}</option>`
              ).join("")}
            </select>
          </div>
        </div>

        <div class="flex items-center pt-1">
          <label class="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300">
            <input type="checkbox" name="isDouble" ${r.isDouble || autoDouble ? "checked" : ""} class="w-4 h-4 rounded text-indigo-600 accent-indigo-600">
            Mark as Double / Statement MCQ (Auto-detected if statements match)
          </label>
        </div>

        <div>
          <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Explanation (Optional)</label>
          <input type="text" name="explanation" value="${esc(r.explanation || "")}" placeholder="Brief solution note..." class="w-full p-2 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-slate-900 dark:text-white text-xs focus:outline-none">
        </div>

        <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-200/80 dark:border-white/10">
          <button type="button" onclick="document.getElementById('dlg').close()" class="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-all">
            Cancel
          </button>
          <button type="submit" class="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all active:scale-95">
            ${isEdit ? "Update" : "Save & Next ⚡"}
          </button>
        </div>
      </form>

      <!-- Batch Import Pane -->
      <div id="batchPane" class="space-y-3 hidden">
        <div>
          <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Paste Questions Block</label>
          <p class="text-[11px] text-slate-400 mb-1.5">Statement-based or double MCQs pasted here will be auto-flagged.</p>
          <textarea id="batchText" rows="7" placeholder="Statement I: Mitochondria produce ATP.&#10;Statement II: Chloroplasts perform photolysis.&#10;A) Both I and II are correct&#10;B) Only I is correct&#10;Ans: A" class="w-full p-2.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"></textarea>
        </div>
        <div class="flex items-center justify-end gap-2 pt-2.5 border-t border-slate-200/80 dark:border-white/10">
          <button type="button" onclick="document.getElementById('dlg').close()" class="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300">
            Cancel
          </button>
          <button type="button" id="btnRunBatch" class="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all active:scale-95">
            Save Batch ⚡
          </button>
        </div>
      </div>
    </div>
  `;
  dlg.showModal();

  const tabSingle = dlg.querySelector("#tabSingle");
  const tabBatch = dlg.querySelector("#tabBatch");
  const qForm = dlg.querySelector("#qForm");
  const batchPane = dlg.querySelector("#batchPane");

  if (tabSingle && tabBatch) {
    tabSingle.onclick = () => {
      tabSingle.className = "flex-1 py-1.5 text-xs font-semibold rounded-md bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs transition-all";
      tabBatch.className = "flex-1 py-1.5 text-xs font-semibold rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-900 transition-all";
      qForm.classList.remove("hidden");
      batchPane.classList.add("hidden");
    };
    tabBatch.onclick = () => {
      tabBatch.className = "flex-1 py-1.5 text-xs font-semibold rounded-md bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs transition-all";
      tabSingle.className = "flex-1 py-1.5 text-xs font-semibold rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-900 transition-all";
      batchPane.classList.remove("hidden");
      qForm.classList.add("hidden");
      dlg.querySelector("#batchText")?.focus();
    };
  }

  // Live auto-check listener as user types prompt text
  const textInput = qForm.querySelector("textarea[name='text']");
  const doubleCheckbox = qForm.querySelector("input[name='isDouble']");
  if (textInput && doubleCheckbox) {
    textInput.oninput = () => {
      const tempVal = { text: textInput.value };
      doubleCheckbox.checked = detectDoubleMCQ(tempVal);
    };
  }

  qForm.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const raw = [0, 1, 2, 3].map((i) => String(f.get("o" + i) || "").trim());
    const options = raw.filter(Boolean);
    if (options.length < 2) return toast("At least 2 options are required.", "warn");
    const correct = +f.get("correct");

    const textVal = String(f.get("text")).trim();
    const isDoubleChecked = f.get("isDouble") === "on" || detectDoubleMCQ({ text: textVal });

    const data = {
      text: textVal,
      options, correct,
      explanation: String(f.get("explanation") || "").trim(),
      difficulty: f.get("difficulty"),
      status: f.get("status"),
      isDouble: isDoubleChecked,
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
        const path = [...scopeNode.path, scopeNode.id];
        const b = writeBatch(db);
        const ref = doc(collection(db, "questions"));
        b.set(ref, {
          ...data,
          nodeId: scope.scopeId,
          nodeLevel: scope.scopeLevel,
          topicId: scope.scopeLevel === "topic" ? scope.scopeId : null,
          path,
          version: 1,
          rand: Math.random(),
          createdAt: Date.now(),
        });
        if (data.status === "active") {
          b.update(doc(db, "nodes", scope.scopeId), { qCount: increment(1) });
        }
        await b.commit();
        toast("Saved! Ready for next ⚡", "ok");
        qForm.reset();
        qForm.querySelector("textarea[name='text']").focus();
      }
      invalidateQuestions(scope.scopeId);
      dt.onRefresh?.();
    } catch (err) { toast(err.message, "bad"); }
  };

  const btnRunBatch = dlg.querySelector("#btnRunBatch");
  if (btnRunBatch) {
    btnRunBatch.onclick = async () => {
      const rawText = dlg.querySelector("#batchText")?.value.trim();
      if (!rawText) return toast("Please paste questions first.", "warn");

      const blocks = rawText.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
      const parsed = [];

      for (const block of blocks) {
        const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.length < 3) continue;

        const qLines = [];
        const options = [];
        let correct = 0;
        let explanation = "";

        for (const line of lines) {
          const optMatch = line.match(/^([A-Ea-e])[).:\-]\s*(.+)$/);
          const ansMatch = line.match(/^(?:Ans|Answer|Correct)\s*[:\-]?\s*([A-Ea-e])/i);
          const expMatch = line.match(/^(?:Exp|Explanation)\s*[:\-]\s*(.+)$/i);

          if (ansMatch) {
            const idx = LETTERS.indexOf(ansMatch[1].toUpperCase());
            if (idx !== -1) correct = idx;
          } else if (expMatch) {
            explanation = expMatch[1].trim();
          } else if (optMatch) {
            options.push(optMatch[2].trim());
          } else if (options.length === 0) {
            qLines.push(line.replace(/^(?:Q?\d+[).:\-]\s*)/i, ""));
          }
        }

        const text = qLines.join(" ").trim();
        if (text && options.length >= 2) {
          const isDouble = detectDoubleMCQ({ text, options });
          parsed.push({
            text,
            options,
            correct: Math.min(correct, options.length - 1),
            explanation,
            isDouble,
          });
        }
      }

      if (!parsed.length) {
        return toast("Could not parse valid MCQs. Check format (A) B) C) and Ans: X).", "bad");
      }

      btnRunBatch.disabled = true;
      btnRunBatch.textContent = `Saving ${parsed.length}…`;

      try {
        const scopeNode = getNode(scope.scopeId);
        const path = [...scopeNode.path, scopeNode.id];
        const b = writeBatch(db);
        const now = Date.now();

        for (let i = 0; i < parsed.length; i++) {
          const item = parsed[i];
          const ref = doc(collection(db, "questions"));
          b.set(ref, {
            ...item,
            difficulty: "medium",
            status: "active",
            nodeId: scope.scopeId,
            nodeLevel: scope.scopeLevel,
            topicId: scope.scopeLevel === "topic" ? scope.scopeId : null,
            path,
            version: 1,
            rand: Math.random(),
            createdAt: now + i,
            updatedAt: now + i,
            reviewedAt: now + i,
          });
        }

        b.update(doc(db, "nodes", scope.scopeId), { qCount: increment(parsed.length) });
        await b.commit();

        toast(`Successfully added ${parsed.length} question(s)!`, "ok");
        dlg.close();
        invalidateQuestions(scope.scopeId);
        dt.onRefresh?.();
      } catch (err) {
        console.error(err);
        toast("Batch save failed: " + err.message, "bad");
      } finally {
        btnRunBatch.disabled = false;
        btnRunBatch.textContent = "Save Batch ⚡";
      }
    };
  }
}

/* ---------------- move & bulk actions ---------------- */
function openMoveDialog(ids, dt, scope) {
  const dlg = document.getElementById("dlg");
  if (!dlg) return;

  dlg.style.width = "fit-content";
  dlg.style.minWidth = "min(92vw, 460px)";
  dlg.style.maxWidth = "min(94vw, 540px)";

  dlg.innerHTML = `
    <div class="p-4 sm:p-5">
      <h3 class="font-display font-bold text-base text-slate-900 dark:text-white mb-1">Move ${ids.length} Question(s)</h3>
      <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">Pick any destination node.</p>
      <div class="grid4 mb-3" id="mvPk">${pickerHTML("topic")}</div>
      <p class="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-4" id="mvTarget"></p>
      <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-200/80 dark:border-white/10">
        <button type="button" onclick="document.getElementById('dlg').close()" class="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-white/5 text-slate-600">Cancel</button>
        <button class="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white disabled:opacity-50" id="mvGo" disabled>Move</button>
      </div>
    </div>
  `;
  dlg.showModal();

  let target = null;
  mountPicker(dlg.querySelector("#mvPk"), {
    stopAt: "topic",
    persistKey: "mvPick",
    onSelect: ({ nodeId, level, node }) => {
      target = nodeId ? { nodeId, level, node } : null;
      dlg.querySelector("#mvGo").disabled = !target;
      dlg.querySelector("#mvTarget").textContent = node ? `Target: ${level} — ${node.name}` : "";
    },
  });

  dlg.querySelector("#mvGo").onclick = async () => {
    if (!target) return;
    const dest = getNode(target.nodeId);
    const destPath = [...dest.path, dest.id];
    try {
      const b = writeBatch(db);
      for (const id of ids) {
        b.update(doc(db, "questions", id), {
          nodeId: target.nodeId,
          nodeLevel: target.level,
          topicId: target.level === "topic" ? target.nodeId : null,
          path: destPath,
          updatedAt: Date.now(),
        });
      }
      await b.commit();
      dlg.close();
      toast("Questions moved successfully", "ok");
      invalidateQuestions();
      dt.onRefresh?.();
    } catch (e) { toast(e.message, "bad"); }
  };
}

async function setStatus(ids, status) {
  const b = writeBatch(db);
  ids.forEach((id) => b.update(doc(db, "questions", id), { status, updatedAt: Date.now() }));
  await b.commit();
  invalidateQuestions();
  toast(`Updated status to ${status}`, "ok");
}

async function markReviewed(ids) {
  const b = writeBatch(db);
  ids.forEach((id) => b.update(doc(db, "questions", id), { reviewedAt: Date.now() }));
  await b.commit();
  invalidateQuestions();
  toast("Marked selected questions as reviewed", "ok");
}

async function deleteMany(ids) {
  const b = writeBatch(db);
  ids.forEach((id) => b.delete(doc(db, "questions", id)));
  await b.commit();
  invalidateQuestions();
  toast(`Deleted ${ids.length} questions`, "ok");
}