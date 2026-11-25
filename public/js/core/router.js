// js/core/router.js — hash router shared by app.js and admin.js
// Routes: "#/name/arg". A "?query" part is ignored by the router (views read it themselves).
// Fixes: "#/quiz?topic=ID" used to resolve to the home view; cached views came back
// without event listeners or mount(), so back/forward gave dead pages. Views are no longer HTML-cached
// (store.js already caches the data).
const registry = new Map();
let currentView = null;

export function register(name, importer) { registry.set(name, importer); }
export function navigate(hash) { if (location.hash !== hash) location.hash = hash; }
export function current() { return currentView; }
export function invalidateViewCache() { /* kept for compatibility */ }

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "").split("?")[0];
  const [name = "", ...rest] = raw.split("/");
  return { name: name || "home", arg: rest[0] };
}

async function resolve(name) {
  const importer = registry.get(name) || registry.get("home");
  if (!importer) throw new Error(`No view registered for "${name}"`);
  const mod = await importer();
  return mod.default || mod.render || (() => `<div class="card">Empty view: ${name}</div>`);
}

export function start({ mount, onBefore, onError, loading } = {}) {
  const root = typeof mount === "string" ? document.querySelector(mount) : mount;
  if (!root) throw new Error("router.start: mount not found");
  let token = 0;

  async function run() {
    const my = ++token;
    const { name, arg } = parseHash();
    currentView = { name, arg };
    console.info("[route]", location.hash, "->", registry.has(name) ? name : `${name} (not registered, using home)`, arg ?? "");
    try {
      if (onBefore) onBefore({ name, arg });
      root.innerHTML = loading ?? `<div class="card center">Loading…</div>`;
      const render = await resolve(name);
      const out = await render({ name, arg });
      if (my !== token) return;                       // a newer navigation won
      const node = document.createElement("div");
      node.innerHTML = typeof out === "string" ? out : out?.html ?? "";
      root.innerHTML = "";
      root.appendChild(node);
      window.scrollTo(0, 0);
      if (out && typeof out === "object" && out.mount) out.mount(node);
    } catch (e) {
      console.error("[router]", e);
      if (onError) onError(e);
      if (my === token) root.innerHTML = `<div class="card">Something went wrong: ${e.message}</div>`;
    }
  }
  window.addEventListener("hashchange", run);
  run();
}