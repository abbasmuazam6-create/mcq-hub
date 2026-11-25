// js/admin/DataTable.js
// One config-driven table for every admin entity.
// Usage:
//   const dt = new DataTable({ mount: "#host", config, rows, onRefresh });
//   dt.render();

import { $, esc, toast } from "../core/dom.js";

const DEFAULT_PAGE_SIZES = [15, 50, 100, 250, 500];

const TABLE_STYLES = `
  <style id="dtStyles">
    .dt, .dt * { box-sizing: border-box; }
    .dt .dt-toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: .4rem;
      min-width: 0;
    }
    .dt .dt-toolbar > * {
      min-width: 0;
      max-width: 100%;
    }
    .dt .dt-scroll {
      max-height: 65vh;
      overflow: auto;
      position: relative;
      min-width: 0;
    }
    .dt .dt-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
    }
    .dt .dt-table thead th {
      position: sticky;
      top: 0;
      z-index: 2;
      background: var(--card-bg, var(--surface, #fff));
      box-shadow: inset 0 -1px 0 var(--border, rgba(128, 128, 128, 0.25));
    }
    .dt .dt-footer {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: .5rem;
      margin-top: .45rem;
      min-width: 0;
    }
    .dt .dt-footer-right {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: .5rem;
      min-width: 0;
    }
    .dt.dt-compact .card { padding: .55rem .75rem; margin-bottom: .55rem; }
    .dt.dt-compact .dt-toolbar input[type="search"],
    .dt.dt-compact .dt-toolbar select,
    .dt.dt-compact .dt-footer select {
      font-size: .78rem;
      padding: .24rem .45rem;
      min-height: 28px;
      width: auto;
    }
    .dt.dt-compact .btn {
      font-size: .75rem;
      padding: .24rem .5rem;
      min-height: 28px;
      line-height: 1.15;
      white-space: nowrap;
    }
    .dt.dt-compact .dt-bulkbar { margin-top: .4rem; gap: .35rem; font-size: .76rem; }
    .dt.dt-compact .dt-table { font-size: .78rem; }
    .dt.dt-compact .dt-table th,
    .dt.dt-compact .dt-table td {
      padding: .26rem .45rem !important;
      line-height: 1.25;
      vertical-align: middle;
    }
    .dt.dt-compact .dt-table tbody tr { height: 30px; }
    .dt.dt-compact .badge { font-size: .68rem; padding: .1rem .36rem; }
    .dt.dt-compact .dt-footer { font-size: .76rem; }
  </style>
`;

function sanitizeSizes(list) {
  const arr = Array.isArray(list) ? list : DEFAULT_PAGE_SIZES;
  return [...new Set(arr.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0 && n !== 25))]
    .sort((a, b) => a - b);
}

export class DataTable {
  constructor({ mount, config, rows = [], onRefresh }) {
    this.mount = typeof mount === "string" ? $(mount) : mount;
    this.config = config || {};
    this.rows = Array.isArray(rows) ? rows : [];
    this.onRefresh = onRefresh;
    this.sel = new Set();
    this.sortKey = this.config.defaultSort || null;
    this.sortDir = this.config.defaultSortDir || "asc";
    this.filters = Object.fromEntries(
      (this.config.filters || []).map((f) => [f.key, f.default ?? "all"])
    );
    this.filter = this.filters[this.config.filters?.[0]?.key] ?? "all";
    this.search = "";
    this.page = 1;
    this.pageSizes = sanitizeSizes(this.config.pageSizes);
    if (!this.pageSizes.length) this.pageSizes = [...DEFAULT_PAGE_SIZES];
    const initialSize = Number(this.config.pageSize);
    this.pageSize = (Number.isFinite(initialSize) && initialSize > 0 && initialSize !== 25)
      ? initialSize
      : (this.pageSizes.includes(50) ? 50 : this.pageSizes[0]);
    this._refreshing = false;
    this._wire();
  }

  setConfig(config) {
    this.config = config || {};
    const nextFilters = {};
    for (const f of this.config.filters || []) {
      nextFilters[f.key] = this.filters[f.key] ?? f.default ?? "all";
    }
    this.filters = nextFilters;
    this.filter = this.filters[this.config.filters?.[0]?.key] ?? "all";

    if (this.config.pageSizes) {
      const cleaned = sanitizeSizes(this.config.pageSizes);
      if (cleaned.length) this.pageSizes = cleaned;
    }
    if (!this.pageSize || this.pageSize === 25) {
      const cfgSize = Number(this.config.pageSize);
      this.pageSize = (Number.isFinite(cfgSize) && cfgSize > 0 && cfgSize !== 25)
        ? cfgSize
        : (this.pageSizes.includes(50) ? 50 : this.pageSizes[0]);
    }
  }

  setRows(rows, { preserveState = true } = {}) {
    this.rows = Array.isArray(rows) ? rows : [];
    if (!preserveState) {
      this.sel.clear();
      this.page = 1;
    } else {
      const idKey = this.config.idKey || "id";
      const validIds = new Set(this.rows.map((r) => String(r[idKey])));
      for (const id of [...this.sel]) {
        if (!validIds.has(String(id))) this.sel.delete(id);
      }
      const totalPages = Math.max(1, Math.ceil(this._filtered().length / this.pageSize));
      if (this.page > totalPages) this.page = totalPages;
    }
    this.render();
  }

  _wire() {
    if (!this.mount) return;
    if (this.mount._dtWired) {
      this.mount._dt = this;
      return;
    }
    this.mount._dtWired = true;
    this.mount._dt = this;
    this.mount.addEventListener("click", (e) => {
      if (this.mount._dt) this.mount._dt._onClick(e);
    });
    this.mount.addEventListener("change", (e) => {
      if (this.mount._dt) this.mount._dt._onChange(e);
    });
    this.mount.addEventListener("input", (e) => {
      if (this.mount._dt) this.mount._dt._onInput(e);
    });
  }

  _uniqueFilters() {
    const seen = new Set();
    return (this.config.filters || []).filter((f) => {
      if (!f?.key || seen.has(f.key)) return false;
      seen.add(f.key);
      return true;
    });
  }

  _hasConfigRefreshAction() {
    return (this.config.headerActions || []).some((a) =>
      a.id === "refresh" || /refresh/i.test(a.label || "")
    );
  }

  _totalLabel() {
    const shown = this._filtered().length;
    const all = this.rows.length;
    return shown === all ? `${all} total` : `${shown} of ${all} total`;
  }

  _sizeOptions() {
    const base = sanitizeSizes(this.pageSizes);
    if (this.pageSize && this.pageSize !== 25 && !base.includes(this.pageSize)) {
      base.push(this.pageSize);
    }
    return base.sort((a, b) => a - b);
  }

  render() {
    if (!this.mount) return;
    this.mount._dt = this;

    const c = this.config;
    const compactClass = c.compact !== false ? "dt-compact" : "";
    const filters = this._uniqueFilters();
    const showBuiltInRefresh = Boolean(this.onRefresh && !this._hasConfigRefreshAction());
    const sizes = this._sizeOptions();

    this.mount.innerHTML = `
      ${TABLE_STYLES}
      <div class="dt ${compactClass}">
        <div class="card">
          <div class="dt-toolbar">
            <input type="search" placeholder="Search…" value="${esc(this.search)}" data-dt="search" style="min-width:180px">
            ${filters.map((f) => {
              const cur = this.filters[f.key] ?? f.default ?? "all";
              return `<select data-dt="filter" data-key="${esc(f.key)}">
                ${f.options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(cur) ? "selected" : ""}>${esc(o.label)}</option>`).join("")}
              </select>`;
            }).join("")}
            ${c.headerActions ? c.headerActions.map((a) =>
              `<button type="button" class="btn ${a.kind || ""}" data-dt-act="${esc(a.id)}">${esc(a.label)}</button>`).join("") : ""}
            ${showBuiltInRefresh ? `<button type="button" class="btn ghost" data-dt="refresh" style="margin-left:auto" ${this._refreshing ? "disabled" : ""}>${this._refreshing ? "Refreshing…" : "↻ Refresh"}</button>` : ""}
          </div>
          <div class="dt-bulkbar ${this.sel.size ? "on" : ""}" data-dt="bulkbar">
            <small>${this.sel.size} selected</small>
            ${(c.bulkActions || []).map((b) =>
              `<button type="button" class="btn sm ${b.destructive ? "danger" : "ghost"}" data-dt-bulk="${esc(b.id)}">${esc(b.label)}</button>`).join("")}
            <button type="button" class="btn sm ghost" data-dt-bulk="__clear">Clear</button>
          </div>
        </div>
        <div class="card">
          <div class="tablewrap dt-scroll">${this._tableHTML()}</div>
          <div class="dt-footer">
            <span data-dt="total">${this._totalLabel()}</span>
            <div class="dt-footer-right">
              <label style="display:inline-flex;align-items:center;gap:.3rem;margin:0">
                <span class="muted">Per page</span>
                <select data-dt="pagesize">
                  ${sizes.map((n) => `<option value="${n}" ${Number(n) === Number(this.pageSize) ? "selected" : ""}>${n}</option>`).join("")}
                </select>
              </label>
              <span data-dt="pager">${this._pagerHTML()}</span>
            </div>
          </div>
        </div>
      </div>`;
  }

  _filtered() {
    const q = this.search.trim().toLowerCase();
    let rows = this.rows.slice();

    for (const f of this._uniqueFilters()) {
      const val = this.filters[f.key] ?? f.default ?? "all";
      if (f.predicate) {
        rows = rows.filter((r) => f.predicate(r, val, this));
      } else if (val !== "all" && val !== "") {
        rows = rows.filter((r) => String(r[f.key] ?? "") === String(val));
      }
    }

    if (q) {
      const keys = this.config.searchKeys || this.config.columns.filter((c) => c.searchable).map((c) => c.key);
      rows = rows.filter((r) =>
        keys.some((k) => {
          const v = r[k];
          return Array.isArray(v)
            ? v.join(" ").toLowerCase().includes(q)
            : String(v ?? "").toLowerCase().includes(q);
        })
      );
    }

    if (this.sortKey) {
      const dir = this.sortDir === "asc" ? 1 : -1;
      rows.sort((a, b) => {
        const av = a[this.sortKey], bv = b[this.sortKey];
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
        return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
      });
    }
    return rows;
  }

  _pagerHTML() {
    const total = this._filtered().length;
    const pages = Math.max(1, Math.ceil(total / this.pageSize));
    if (pages <= 1) return "";
    return `<span>
      <button type="button" class="btn sm ghost" data-dt-page="${this.page - 1}" ${this.page <= 1 ? "disabled" : ""}>‹</button>
      <span style="margin:0 .4rem">${this.page} / ${pages}</span>
      <button type="button" class="btn sm ghost" data-dt-page="${this.page + 1}" ${this.page >= pages ? "disabled" : ""}>›</button>
    </span>`;
  }

  _tableHTML() {
    const rows = this._filtered();
    const start = (this.page - 1) * this.pageSize;
    const page = rows.slice(start, start + this.pageSize);
    if (!page.length) return `<div class="dt-empty">Nothing matches.</div>`;

    const cols = this.config.columns;
    const idKey = this.config.idKey || "id";
    const allSel = page.length > 0 && page.every((r) => this.sel.has(r[idKey]));
    const head = cols.map((c) => {
      if (c.type === "checkbox") return `<th><input type="checkbox" data-dt="all" ${allSel ? "checked" : ""}></th>`;
      const sortable = c.sortable !== false && c.key;
      return `<th class="${sortable ? "sortable" : ""}" data-dt-sort="${c.key || ""}">
        ${esc(c.label || "")}${sortable && this.sortKey === c.key ? (this.sortDir === "asc" ? " ↑" : " ↓") : ""}
      </th>`;
    }).join("");

const body = page.map((r) => {
      const id = r[idKey];
      // Evaluate rowClass from config if provided
      const customRowClass = typeof this.config.rowClass === "function" ? this.config.rowClass(r) : "";
      
      return `<tr class="${customRowClass}">${cols.map((c) => {
        if (c.type === "checkbox")
          return `<td><input type="checkbox" data-dt="row" value="${esc(id)}" ${this.sel.has(id) ? "checked" : ""}></td>`;
        const raw = r[c.key];
        const html = c.render ? c.render(r, this) : esc(raw ?? "");
        return `<td class="${c.className || ""}">${html}</td>`;
      }).join("")}</tr>`;
    }).join("");
    
    return `<table class="dt-table">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;
  }

  /* ============ events ============ */
  _onInput(e) {
    const input = e.target.closest('[data-dt="search"]');
    if (!input || !this.mount.contains(input)) return;
    this.search = input.value;
    this.page = 1;
    this._rerenderBody();
  }

  _onChange(e) {
    const t = e.target.closest("[data-dt]");
    if (!t || !this.mount.contains(t)) return;

    if (t.dataset.dt === "all") {
      const idKey = this.config.idKey || "id";
      const rows = this._pageRows();
      rows.forEach((r) => {
        const id = r[idKey];
        t.checked ? this.sel.add(id) : this.sel.delete(id);
      });
      this.render();
    } else if (t.dataset.dt === "row") {
      t.checked ? this.sel.add(t.value) : this.sel.delete(t.value);
      this.render();
    } else if (t.dataset.dt === "filter") {
      const key = t.dataset.key || this.config.filters?.[0]?.key;
      if (key) this.filters[key] = t.value;
      if (key === this.config.filters?.[0]?.key) this.filter = t.value;
      this.page = 1;
      this.render();
    } else if (t.dataset.dt === "pagesize") {
      const next = parseInt(t.value, 10);
      if (Number.isFinite(next) && next > 0 && next !== 25) {
        this.pageSize = next;
        if (this.config) this.config.pageSize = next;
        this.page = 1;
        this.render();
      }
    }
  }

  _pageRows() {
    const start = (this.page - 1) * this.pageSize;
    return this._filtered().slice(start, start + this.pageSize);
  }

  _rerenderBody() {
    const tableWrap = this.mount.querySelector(".tablewrap");
    if (tableWrap) tableWrap.innerHTML = this._tableHTML();
    const totalEl = this.mount.querySelector('[data-dt="total"]');
    if (totalEl) totalEl.textContent = this._totalLabel();
    const pagerEl = this.mount.querySelector('[data-dt="pager"]');
    if (pagerEl) pagerEl.innerHTML = this._pagerHTML();
  }

  async triggerRefresh() {
    if (!this.onRefresh || this._refreshing) return;
    this._refreshing = true;
    const btn = this.mount?.querySelector('[data-dt="refresh"]');
    if (btn) { btn.disabled = true; btn.textContent = "Refreshing…"; }
    try {
      await this.onRefresh();
    } finally {
      this._refreshing = false;
      const liveBtn = this.mount?.querySelector('[data-dt="refresh"]');
      if (liveBtn) { liveBtn.disabled = false; liveBtn.textContent = "↻ Refresh"; }
    }
  }

  async _onClick(e) {
    const t = e.target.closest("[data-dt], [data-dt-sort], [data-dt-page], [data-dt-act], [data-dt-bulk]");
    if (!t || !this.mount.contains(t)) return;

    if (t.dataset.dt === "refresh") {
      await this.triggerRefresh();
      return;
    }
    if (t.dataset.dtSort !== undefined) {
      const key = t.dataset.dtSort;
      if (!key) return;
      if (this.sortKey === key) this.sortDir = this.sortDir === "asc" ? "desc" : "asc";
      else { this.sortKey = key; this.sortDir = "asc"; }
      this.render();
      return;
    }
    if (t.dataset.dtPage !== undefined) {
      this.page = +t.dataset.dtPage;
      this.render();
      return;
    }
    if (t.dataset.dtAct !== undefined) {
      const action = (this.config.headerActions || []).find((a) => a.id === t.dataset.dtAct);
      if (action?.onClick) action.onClick(this);
      return;
    }
    if (t.dataset.dtBulk !== undefined) {
      if (t.dataset.dtBulk === "__clear") { this.sel.clear(); this.render(); return; }
      const action = (this.config.bulkActions || []).find((b) => b.id === t.dataset.dtBulk);
      if (!action) return;
      const ids = [...this.sel];
      if (!ids.length) return toast("Select rows first.", "warn");
      if (action.destructive && !confirm(`Confirm: ${action.label} — ${ids.length} item(s)?`)) return;
      try {
        await action.run(ids, this);
        this.sel.clear();
        if (this.onRefresh) await this.triggerRefresh();
      } catch (err) {
        console.error(err); toast(err.message, "bad");
      }
      return;
    }
  }
}
