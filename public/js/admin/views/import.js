// js/admin/views/import.js
import { db, collection, doc, setDoc, writeBatch, getDocs, query, where, increment, updateDoc } from "../../core/firebase.js";
import { $, esc, toast } from "../../core/dom.js";
import { getSyllabus, getNode } from "../../core/store.js";
import { pickerHTML, mountPicker } from "../picker.js";

const TEMPLATE_HEAD = ["question", "A", "B", "C", "D", "E", "correct", "explanation", "difficulty"];
const LETTERS = "ABCDE";

const imp = { scopeId: null, scopeLevel: null, rows: [], fileName: "" };

export default async function () {
  await getSyllabus({ all: true });
  return { html: render(), mount: wire };
}

function render() {
  return `
    <div class="card"><h2>Import MCQs</h2>
      <p class="muted">1) Pick destination — <b>chapter</b> or <b>topic</b> (optional) &nbsp; 2) Upload &nbsp; 3) Preview &nbsp; 4) Import.</p>
      <div class="grid4" id="impPk">${pickerHTML("topic")}</div>
      <p class="muted" id="impTarget" style="margin:.75rem 0 0"></p>
      <div class="row" style="margin-top:.75rem">
        <button class="btn ghost" data-imp="tpl">Download template</button>
        <input type="file" id="xlsFile" accept=".xlsx,.xls,.csv" style="max-width:340px" disabled>
      </div>
    </div>
    <div id="impPreview"></div>
    <div class="card"><h3>Recent imports</h3><div id="impHistory" class="muted">Loading…</div></div>`;
}

function formatTargetLabel(level, node) {
  if (!node) return "";
  if (level === "topic") {
    const parentChapter = node.parentId ? getNode(node.parentId) : null;
    return parentChapter
      ? `Target: Topic — ${node.name} (Chapter: ${parentChapter.name})`
      : `Target: Topic — ${node.name}`;
  }
  if (level === "chapter") {
    return `Target: Chapter — ${node.name} (topic skipped; topicId will be empty)`;
  }
  return `Target: ${level} — ${node.name}`;
}

function wire(root) {
  mountPicker($("#impPk", root), {
    stopAt: "topic",
    persistKey: "impPick",
    onSelect: ({ nodeId, level, node }) => {
      const validDestination = Boolean(nodeId && (level === "chapter" || level === "topic"));
      imp.scopeId = validDestination ? nodeId : null;
      imp.scopeLevel = validDestination ? level : null;
      imp.rows = [];
      $("#impPreview", root).innerHTML = "";
      $("#xlsFile", root).disabled = !validDestination;
      $("#impTarget", root).textContent = validDestination
        ? formatTargetLabel(level, node)
        : (node ? "Select a chapter (topic is optional)." : "");
    },
  });

  $("#xlsFile", root).addEventListener("change", (e) => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
  });

  root.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-imp]");
    if (!btn) return;
    if (btn.dataset.imp === "tpl") downloadTemplate();
    else if (btn.dataset.imp === "commit") commitImport();
  });

  loadHistory();
}

/* -------- template -------- */
function downloadTemplate() {
  if (!window.XLSX) return toast("Excel library not loaded.", "bad");
  const ws = XLSX.utils.aoa_to_sheet([
    TEMPLATE_HEAD,
    ["What is 2 + 2?", "3", "4", "5", "6", "", "B", "Basic addition", "easy"],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "MCQs");
  XLSX.writeFile(wb, "mcq-import-template.xlsx");
}

/* -------- parse rows -------- */
function parseRow(raw) {
  const r = {};
  for (const [k, v] of Object.entries(raw)) r[k.toLowerCase().replace(/[^a-z0-9]/g, "")] = String(v ?? "").trim();
  const pick = (...ks) => { for (const k of ks) if (r[k]) return r[k]; return ""; };
  const errors = [];
  const text = pick("question", "questiontext", "text", "q");
  const raws = [
    pick("a", "optiona", "option1", "1"), pick("b", "optionb", "option2", "2"),
    pick("c", "optionc", "option3", "3"), pick("d", "optiond", "option4", "4"),
    pick("e", "optione", "option5", "5"),
  ];
  const last = raws.map(Boolean).lastIndexOf(true);
  const options = raws.slice(0, last + 1);
  if (!text) errors.push("Missing question");
  if (options.length < 2) errors.push("Need 2+ options");
  else if (options.some((o) => !o)) errors.push("Gap in options");
  let correct = -1;
  const c = pick("correct", "answer", "ans", "correctanswer", "correctoption");
  if (!c) errors.push("Missing correct answer");
  else if (/^[a-eA-E]$/.test(c)) correct = "ABCDE".indexOf(c.toUpperCase());
  else if (/^[1-5]$/.test(c)) correct = +c - 1;
  else correct = options.findIndex((o) => o.toLowerCase() === c.toLowerCase());
  if (c && (correct < 0 || correct >= options.length)) errors.push(`Correct "${c}" invalid`);
  let difficulty = pick("difficulty", "level").toLowerCase();
  if (!["easy", "medium", "hard"].includes(difficulty)) difficulty = "medium";
  return { text, options, correct, explanation: pick("explanation", "explain", "reason"), difficulty, errors };
}

async function handleFile(file) {
  if (!window.XLSX) return toast("Excel library not loaded.", "bad");
  try {
    const wb = XLSX.read(await file.arrayBuffer());
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false });
    if (!raw.length) return toast("Sheet is empty.", "warn");

    $("#impPreview").innerHTML = `<div class="card center">Checking ${raw.length} rows…</div>`;
    imp.rows = raw.map((r, i) => { const p = parseRow(r); p.n = i + 2; return p; });
    imp.fileName = file.name;
    drawPreview();
  } catch (e) {
    toast("Could not read file: " + e.message, "bad");
  }
}

function drawPreview() {
  const ok = imp.rows.filter((r) => !r.errors.length).length;
  const bad = imp.rows.filter((r) => r.errors.length).length;
  $("#impPreview").innerHTML = `
    <div class="card">
      <div class="row between" style="margin-top:0">
        <div>
          <h3 style="margin:0">Preview – ${esc(imp.fileName)}</h3>
          <span class="badge ok">${ok} ready</span>
          <span class="badge bad">${bad} with errors (skipped)</span>
        </div>
        <button class="btn" data-imp="commit" id="impBtn" ${ok ? "" : "disabled"}>Import ${ok}</button>
      </div>
      <div class="tablewrap" style="margin-top:12px">
        <table><thead><tr><th>Row</th><th>Question</th><th>Options</th><th>Ans</th><th>Result</th></tr></thead>
        <tbody>
          ${imp.rows.slice(0, 300).map((r) => `<tr class="${r.errors.length ? "bad" : ""}">
            <td>${r.n}</td><td>${esc((r.text || "").slice(0, 120))}</td>
            <td>${r.options.length}</td>
            <td>${r.correct >= 0 ? LETTERS[r.correct] : "?"}</td>
            <td>${r.errors.length ? esc(r.errors.join("; ")) : "OK"}</td></tr>`).join("")}
        </tbody></table>
      </div>
    </div>`;
}

async function commitImport() {
  const good = imp.rows.filter((r) => !r.errors.length);
  if (!good.length || !imp.scopeId) return;
  const btn = $("#impBtn");
  btn.disabled = true; btn.textContent = "Importing…";

  try {
    const scopeNode = getNode(imp.scopeId);
    const isTopic = imp.scopeLevel === "topic";
    const topicId = isTopic ? scopeNode.id : null;
    const path = [...(scopeNode.path || []), scopeNode.id];
    const batchRef = doc(collection(db, "imports"));
    const now = Date.now();

    for (let i = 0; i < good.length; i += 400) {
      const chunk = good.slice(i, i + 400);
      const b = writeBatch(db);
      chunk.forEach((r) => b.set(doc(collection(db, "questions")), {
        text: r.text,
        options: r.options,
        correct: r.correct,
        explanation: r.explanation,
        difficulty: r.difficulty,
        status: "active",
        version: 1,
        nodeId: imp.scopeId,
        nodeLevel: imp.scopeLevel,
        topicId,
        path,
        rand: Math.random(),
        createdAt: now,
        updatedAt: now,
        reviewedAt: now,
        importBatchId: batchRef.id,
      }));
      await b.commit();
    }

    await setDoc(batchRef, {
      nodeId: imp.scopeId,
      nodeName: scopeNode.name,
      nodeLevel: imp.scopeLevel,
      topicId,
      fileName: imp.fileName,
      total: imp.rows.length,
      created: good.length,
      failed: imp.rows.length - good.length,
      status: "done",
      at: now,
      by: window.__ctx.user.uid,
    });

    if (isTopic) {
      await updateDoc(doc(db, "nodes", imp.scopeId), { qCount: increment(good.length) });
    }

    toast(`Imported ${good.length}`, "ok");
    imp.rows = []; $("#impPreview").innerHTML = ""; $("#xlsFile").value = "";
    loadHistory();
  } catch (e) {
    toast("Import failed: " + e.message, "bad");
    btn.disabled = false; btn.textContent = "Retry import";
  }
}

async function loadHistory() {
  const box = $("#impHistory");
  if (!box) return;
  try {
    const snap = await getDocs(query(collection(db, "imports"), where("status", "==", "done")));
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 15);
    box.innerHTML = rows.length ? `<div class="tablewrap"><table>
      <thead><tr><th>When</th><th>File</th><th>Target</th><th>Level</th><th>Added</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td>${new Date(r.at).toLocaleString()}</td>
        <td>${esc(r.fileName)}</td>
        <td>${esc(r.nodeName)}</td>
        <td><span class="badge">${esc(r.nodeLevel || "topic")}</span></td>
        <td>${r.created}</td></tr>`).join("")}</tbody></table></div>`
      : "No imports yet.";
  } catch (e) { box.textContent = e.message; }
}