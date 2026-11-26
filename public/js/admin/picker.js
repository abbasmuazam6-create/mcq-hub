// js/admin/picker.js
// Cascading board→class→subject→chapter→topic picker.
// stopAt: "chapter" | "topic" — the deepest level shown.
// onSelect fires on EVERY change, with { nodeId, level, complete, node }.
//   nodeId/level = deepest level currently selected (or null if nothing selected)
//   complete = true when the deepest selected level equals stopAt
//
// showCounts (via pickerHTML): render "(N)" on leaf options.
//   By default N comes from node.qCount.
//   If you pass `countsById` to mountPicker, that overrides qCount with a
//   caller-supplied Map/object of { nodeId: count } — use this to show live
//   counts derived from the questions collection instead of a cached field.

import { esc } from "../core/dom.js";
import { kidsOf, getNode } from "../core/store.js";

const LEVELS = ["board", "class", "subject", "chapter", "topic"];
export const LEVEL_LABEL = {
  board: "Board", class: "Class", subject: "Subject", chapter: "Chapter", topic: "Topic",
};

const PICKER_STYLE = `
  <style id="pkCompactStyle">
    .pk-bar {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
      gap: .45rem;
      align-items: end;
      min-width: 0;
    }
    .pk-item {
      display: flex;
      flex-direction: column;
      gap: .18rem;
      margin: 0 !important;
      min-width: 0;
    }
    .pk-lbl {
      font-size: .68rem;
      font-weight: 600;
      letter-spacing: .03em;
      text-transform: uppercase;
      color: var(--muted, #64748b);
      line-height: 1.1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .pk-sel {
      width: 100%;
      min-width: 0;
      height: 28px;
      min-height: 28px;
      padding: .18rem .42rem !important;
      font-size: .78rem !important;
      line-height: 1.2;
      border-radius: 6px;
      border: 1px solid var(--border, rgba(128, 128, 128, 0.28));
      background-color: var(--surface, var(--card-bg, #fff));
      color: inherit;
      text-overflow: ellipsis;
      transition: border-color .15s ease, box-shadow .15s ease, opacity .15s ease;
    }
    .pk-sel:focus {
      outline: none;
      border-color: var(--accent, #2563eb);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent, #2563eb) 18%, transparent);
    }
    .pk-sel:disabled {
      opacity: .52;
      cursor: not-allowed;
    }
  </style>
`;

export function pickerHTML(stopAt = "topic", { showCounts = false } = {}) {
  const levels = LEVELS.slice(0, LEVELS.indexOf(stopAt) + 1);
  return `${PICKER_STYLE}<div class="pk-bar" data-pk-counts="${showCounts ? "1" : "0"}">${levels.map((l) => `
    <label class="pk-item">
      <span class="pk-lbl">${LEVEL_LABEL[l]}</span>
      <select class="pk-sel" data-pk="${l}"></select>
    </label>`).join("")}</div>`;
}

function countLookup(countsById, id) {
  if (!countsById) return undefined;
  if (countsById instanceof Map) return countsById.get(id);
  return countsById[id];
}

export function mountPicker(
  root,
  { stopAt = "topic", onSelect, persistKey = "lastPick", countsById = null } = {}
) {
  const levels = LEVELS.slice(0, LEVELS.indexOf(stopAt) + 1);
  const last = JSON.parse(localStorage.getItem(persistKey) || "{}");
  const sels = Object.fromEntries(levels.map((l) => [l, root.querySelector(`[data-pk="${l}"]`)]));

  const bar = root.querySelector(".pk-bar");
  const showCounts = bar?.dataset.pkCounts === "1";

  function currentSelection() {
    let nodeId = null, level = null;
    for (const l of levels) {
      if (sels[l] && sels[l].value) { nodeId = sels[l].value; level = l; }
      else break;
    }
    return { nodeId, level };
  }

  function emit() {
    const { nodeId, level } = currentSelection();
    onSelect?.({
      nodeId,
      level,
      complete: level === stopAt,
      node: nodeId ? getNode(nodeId) : null,
    });
  }

  // Expose cascade so callers can refresh counts without remounting.
  function cascade(from = 0) {
    for (let i = from; i < levels.length; i++) {
      const l = levels[i];
      const parent = i === 0 ? null : (sels[levels[i - 1]].value || null);
      const nodes = i === 0 ? kidsOf(null) : (parent ? kidsOf(parent) : []);
      const isLeaf = i === levels.length - 1;

      sels[l].disabled = i > 0 && !parent;
      sels[l].innerHTML = `<option value="">— ${LEVEL_LABEL[l]} —</option>` +
        nodes.map((n) => {
          let countStr = "";
          if (showCounts && isLeaf) {
            const fromMap = countLookup(countsById, n.id);
            const value = fromMap !== undefined ? fromMap : n.qCount;
            if (Number.isFinite(value) && value > 0) countStr = ` (${value})`;
          }
          const hiddenStr = n.active === false ? " (hidden)" : "";
          return `<option value="${n.id}">${esc(n.name)}${countStr}${hiddenStr}</option>`;
        }).join("");

      if (last[l] && nodes.some((n) => n.id === last[l])) sels[l].value = last[l];
      else sels[l].value = "";
    }
    emit();
  }

  levels.forEach((l, i) => {
    sels[l].onchange = () => {
      last[l] = sels[l].value;
      for (let k = i + 1; k < levels.length; k++) last[levels[k]] = "";
      localStorage.setItem(persistKey, JSON.stringify(last));
      cascade(i + 1);
    };
  });

  cascade(0);

  return {
    sels,
    emit,
    cascade,                 // allows caller to refresh dropdowns with new counts
    getCurrent: currentSelection,
    updateCounts(next) {
      countsById = next;
      cascade(0);
    },
  };
}