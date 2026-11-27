// js/core/mcq.js
// Shared MCQ helpers used by the question dialog, the bank and the importer.
//  - detectDoubleMCQ / isDoubleQuestion : accurate "Double / Statement" detection
//  - parseMCQText                       : multi-question paste parser

export const LETTERS = "ABCDE";

/* ======================================================================
 * DOUBLE / STATEMENT MCQ DETECTION
 * A question counts as "double" when it has real statement structure:
 *   1. Assertion + Reason
 *   2. Two or more labelled statements  (Statement I / Statement II / Statement 1 ...)
 *   3. Two or more enumerated items     ((i) (ii) / 1. 2. / (1) (2))
 *   4. Options that refer to those items ("1 and 2 only", "Both I and II" ...)
 * Length alone, or words like "reason"/"i" inside normal prose, do NOT count.
 * ==================================================================== */
const STATEMENT_RE = /\bstatements?[\s\-–:]*\(?(\d+|iv|v|i{1,3})\)?(?![a-z0-9])/gi;
const ITEM_RE = /(?:^|[\s:;,.(])\(?\s*(iv|v|i{1,3}|[1-4])\s*[).:](?=\s)/gim;
const REF = "\\(?(?:iv|v|i{1,3}|[1-4])\\)?";
const OPT_REF_RE = new RegExp(
  `^(?:(?:both|only|all\\s+of|statements?)\\s+)*${REF}(?:\\s*(?:,|and|&)\\s*${REF})*` +
  `(?:\\s+(?:only|are\\s+correct|is\\s+correct|are\\s+true|is\\s+true|are\\s+false|is\\s+false))?\\.?$`,
  "i"
);
const CONJ_RE = /\b(?:and|only|both)\b|[,&]/i;
const BOTH_STMT_RE = /\b(?:both|neither|only)\b.{0,30}\bstatements?\b|\bstatements?\b.{0,30}\b(?:correct|incorrect|true|false)\b/i;

export function detectDoubleMCQ(q = {}) {
  const text = String(q.text || "");
  const options = (Array.isArray(q.options) ? q.options : []).map((o) => String(o ?? "").trim());

  if (/\bassertion\b/i.test(text) && /\breason\b/i.test(text)) return true;

  const labels = new Set();
  for (const m of text.matchAll(STATEMENT_RE)) labels.add(m[1].toLowerCase());
  if (labels.size >= 2) return true;

  const items = new Set();
  for (const m of text.matchAll(ITEM_RE)) items.add(m[1].toLowerCase());
  if (items.size >= 2) return true;

  const refOpts = options.filter(
    (o) => (OPT_REF_RE.test(o) && CONJ_RE.test(o)) || BOTH_STMT_RE.test(o)
  );
  return refOpts.length >= 2;
}

// What the UI should show. A manual override (doubleManual) wins; otherwise we
// always re-evaluate, so flags saved by the old, buggy detector are ignored.
export function isDoubleQuestion(q) {
  if (q?.doubleManual === true) return !!q.isDouble;
  return detectDoubleMCQ(q);
}

/* ======================================================================
 * PASTE PARSER
 * Handles many questions in one paste:
 *   - separated by blank lines, OR numbered (1. / Q1. / Q.2) OR just back-to-back
 *   - options:  A)  A.  (A)  [A]  a)  A:  A -   (also "A) x  B) y  C) z" on one line)
 *   - answers:  Ans: B | Answer: (B) | Correct answer: B | Correct option is C |
 *               Answer is B | Key: B | Ans B | Answer: <full option text> | Ans: 2
 *   - or mark the right option itself with  *  ✓  ✔  or (correct)
 *   - Explanation: / Exp: / Solution:   (multi-line)
 * If no answer can be read, correct = -1 (the UI makes you pick it - no silent "A").
 * ==================================================================== */
const OPT_RE = /^[-*•]?\s*(?:[(\[]([A-Ea-e])[)\]]|([A-Ea-e])(?:[).]|[:\-–](?=\s)))\s*(.*)$/;
const ANS_RE = /^(?:the\s+)?(?:correct\s+|right\s+)?(?:answer|ans|key|option|correct)\s*(?:[:=\-–.]|\bis\b)\s*(.*)$/i;
const ANS_SHORT_RE = /^(?:answer|ans|key)\s+[(\[]?([A-Ea-e])[)\]]?\.?$/i;
const EXP_RE = /^(?:explanation|exp|solution|sol)\s*[:\-–.]\s*(.*)$/i;
const Q_START_RE = /^(?:Q(?:uestion)?\s*\.?\s*)?[(\[]?\d{1,4}\s*[)\].:\-]\s+/i;
const MARK_RE = /\s*(?:\*+|[✓✔✅]|[(\[]\s*correct\s*[)\]])\s*$/i;
const INLINE_ANS_RE = /\s+(?:ans(?:wer)?|correct(?:\s+(?:answer|option))?)\s*[:=\-–]\s*[(\[]?([A-Ea-e])[)\]]?\.?\s*$/i;

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function readAnswer(val, options) {
  const v = String(val).trim();
  let m = v.match(/^[(\[]?([A-Ea-e])(?:(?:[)\]]|[.:\-–](?=\s|$))(?:\s*.*)?)?$/);
  if (m) return LETTERS.indexOf(m[1].toUpperCase());
  m = v.match(/^[(\[]?([1-5])[)\]]?\.?$/);
  if (m) return +m[1] - 1;
  const nv = norm(v);
  if (nv) {
    const i = options.findIndex((o) => norm(o) === nv);
    if (i >= 0) return i;
  }
  return -1;
}

function splitInline(body, startIdx, upper, sep) {
  const sepRe = sep === "." ? "\\." : sep === ":" ? ":" : (sep === "-" || sep === "–") ? "[-–]" : "[)\\]]";
  const parts = [];
  let rest = body;
  let idx = startIdx + 1;
  while (idx < 5) {
    const L = upper ? LETTERS[idx] : LETTERS[idx].toLowerCase();
    const m = new RegExp(`\\s+[(\\[]?${L}${sepRe}(?=\\s|$)`).exec(rest);
    if (!m) break;
    parts.push(rest.slice(0, m.index));
    rest = rest.slice(m.index + m[0].length);
    idx++;
  }
  parts.push(rest);
  return parts;
}

export function parseMCQText(raw) {
  const lines = String(raw || "").replace(/\r\n?/g, "\n").split("\n");
  const items = [];
  let cur = blank();
  let state = "q";           // q = question text | opt = options | ans = answer seen | exp = explanation
  let gap = false;           // was there a blank line just before this line?

  function blank() {
    return { text: "", options: [], marked: -1, ansRaw: null, explanation: "" };
  }

  function pushOption(txt) {
    let t = String(txt).trim();
    const mk = t.match(MARK_RE);
    if (mk) { t = t.slice(0, mk.index).trim(); cur.marked = cur.options.length; }
    cur.options.push(t);
  }

  function finish() {
    const text = cur.text.trim();
    if (text || cur.options.length) {
      const options = cur.options.map((o) => o.trim());
      const warnings = [];
      let correct = cur.marked;
      let ansNote = "";
      if (cur.ansRaw != null) {
        const idx = readAnswer(cur.ansRaw, options);
        if (idx >= 0) correct = idx;
        else if (correct < 0) ansNote = `could not read "${cur.ansRaw.slice(0, 30)}"`;
      }
      if (correct >= options.length) { ansNote = "answer is outside the options"; correct = -1; }
      if (!text) warnings.push("Missing question text");
      if (options.length < 2) warnings.push("Needs at least 2 options");
      if (options.some((o) => !o)) warnings.push("Empty option");
      items.push({
        text, options, correct,
        explanation: cur.explanation.trim(),
        warnings, ansNote,
        isDouble: detectDoubleMCQ({ text, options }),
      });
    }
    cur = blank();
    state = "q";
  }

  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line) { gap = true; continue; }
    const hadGap = gap; gap = false;
    let m;

    // answer / explanation lines (only meaningful once options exist)
    if (cur.options.length) {
      if ((m = line.match(ANS_RE))) { cur.ansRaw = m[1].trim(); state = "ans"; continue; }
      if ((m = line.match(ANS_SHORT_RE))) { cur.ansRaw = m[1]; state = "ans"; continue; }
      if ((m = line.match(EXP_RE))) { cur.explanation = m[1]; state = "exp"; continue; }
    }

    // option line (must be the NEXT letter in sequence, so "E. coli" in a stem is safe)
    const om = line.match(OPT_RE);
    if (om && (state === "q" || state === "opt")) {
      const letter = om[1] || om[2];
      const idx = LETTERS.indexOf(letter.toUpperCase());
      if (idx === cur.options.length && (idx > 0 || cur.text.trim())) {
        let body = om[3] || "";
        const ia = body.match(INLINE_ANS_RE);
        if (ia) { cur.ansRaw = ia[1]; body = body.slice(0, ia.index); }
        const sep = (line.match(/^[-*•]?\s*[(\[]?[A-Ea-e]([)\]\.:\-–])/) || [])[1] || ")";
        const parts = splitInline(body, idx, letter === letter.toUpperCase(), sep);
        parts.forEach(pushOption);
        state = "opt";
        continue;
      }
    }

    const isQ = Q_START_RE.test(line);

    if (state === "exp" && !hadGap && !isQ) { cur.explanation += " " + line; continue; }
    if (state === "opt" && !hadGap && !isQ && cur.options.length) {
      cur.options[cur.options.length - 1] += " " + line;      // wrapped option text
      continue;
    }
    if (state === "opt" || state === "ans" || state === "exp") finish();

    if (!cur.text) line = line.replace(Q_START_RE, "");
    cur.text += (cur.text ? "\n" : "") + line;
  }
  finish();
  return items;
}

export function isReady(it) {
  return Boolean(
    it.text && it.options.length >= 2 && it.options.every(Boolean) &&
    it.correct >= 0 && it.correct < it.options.length
  );
}