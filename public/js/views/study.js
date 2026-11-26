// js/views/chapter.js — Chapter detail view with accurate question counts and logo support
import { esc } from "../core/dom.js";
import { getNode, kidsOf } from "../core/store.js";

export default async function ({ arg, query } = {}) {
  const chapterId = arg;
  const chapter = getNode(chapterId);

  if (!chapter) {
    return {
      html: `<div class="card center"><h2>Chapter not found</h2><p class="muted">The requested chapter could not be located.</p></div>`,
      mount: () => {}
    };
  }

  const topics = kidsOf(chapter.id);
  // Accurately calculate total questions by summing up qCount across all child topics
  const totalQuestions = topics.reduce((sum, t) => sum + (t.qCount || 0), 0);

  // Get parent board or subject logo if available
  let parentNode = getNode(chapter.parentId);
  let logoUrl = chapter.logoUrl || parentNode?.logoUrl || "";

  const iconMarkup = logoUrl
    ? `<img src="${esc(logoUrl)}" alt="${esc(chapter.name)} logo" class="chapter-logo-img" />`
    : `<div class="chapter-icon-fallback">📖</div>`;

  const html = `
    <div class="card chapter-header-card">
      <div class="chapter-title-row">
        ${iconMarkup}
        <div>
          <h2>${esc(chapter.name)}</h2>
          <p class="muted">${topics.length} topics · <b>${totalQuestions}</b> Total Questions Available</p>
        </div>
      </div>
      <div class="row" style="margin-top: 16px;">
        <button class="btn" data-act="practice-chapter" data-id="${chapter.id}" data-name="${esc(chapter.name)}" ${totalQuestions ? "" : "disabled"}>
          ⚡ Practice Whole Chapter (${totalQuestions} Qs)
        </button>
      </div>
    </div>

    <div class="card">
      <h3>Topics in this Chapter</h3>
      <div class="topics-list" style="margin-top: 12px;">
        ${topics.map((t) => `
          <div class="trow">
            <div>
              <b>${esc(t.name)}</b>
              <small class="q-badge" style="margin-left: 8px;">${t.qCount || 0} Qs</small>
            </div>
            <button class="btn sm" data-act="practice" data-id="${t.id}" data-name="${esc(t.name)}" ${t.qCount ? "" : "disabled"}>
              Practice Topic
            </button>
          </div>
        `).join("") || `<p class="muted">No topics available in this chapter yet.</p>`}
      </div>
    </div>
  `;

  return {
    html,
    mount: (root) => {
      root.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-act]");
        if (!btn) return;
        const act = btn.dataset.act;
        const id = btn.dataset.id;
        const name = btn.dataset.name;

        if (act === "practice" || act === "practice-chapter") {
          location.hash = `#/quiz?id=${id}&name=${encodeURIComponent(name)}`;
        }
      });
    }
  };
}