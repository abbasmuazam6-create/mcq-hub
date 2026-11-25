// js/admin.js — Upgraded Admin SPA bootstrap & controller
import { $, $$, esc, toast } from "./core/dom.js";
import { start, register } from "./core/router.js";
import { clearAll, invalidateSyllabus } from "./core/store.js";
import { invalidateAll } from "./core/cache.js";
import { requireUser, logout } from "./common.js";

/* ---------- Auth Gate & Shell Bootstrapping ---------- */
async function boot() {
  const ctx = await requireUser({ staff: true });
  window.__ctx = ctx;                       
  window.__isAdmin = ctx.profile.role === "admin";

  const who = $("#who");
  if (who) who.textContent = `${ctx.profile.name || ctx.user.email} (${ctx.profile.role})`;
  
  const out = $("#logout");
  if (out) out.onclick = logout;
  
  if (!window.__isAdmin) {
    $("#usersLink")?.setAttribute("hidden", "");
  }

  /* ---------- Component Wiring ---------- */
  wireSidebar();
  wireTheme();
  wireSyncButton();
  wireNavHighlight();

  /* ---------- Lazy Route Registrations ---------- */
  register("dash",     () => import("./admin/views/dash.js"));
  register("syllabus", () => import("./admin/views/syllabus.js"));
  register("bank",     () => import("./admin/views/bank.js"));
  register("import",   () => import("./admin/views/import.js"));
  register("users",    () => import("./admin/views/users.js"));
  register("materials",() => import("./admin/views/materials.js"));
  register("videos",   () => import("./admin/views/videos.js"));

  start({ mount: "#view" });
}

/* ---------- Mobile Sidebar Drawer Logic ---------- */
function wireSidebar() {
  const sidebar = $("#adminSidebar");
  const backdrop = $("#adminSidebarBackdrop");
  const toggle = $("#adminSidebarToggle");
  if (!sidebar || !toggle) return;

  const open  = () => { 
    sidebar.classList.remove("-translate-x-full"); 
    backdrop?.classList.remove("hidden"); 
  };
  const close = () => { 
    sidebar.classList.add("-translate-x-full");    
    backdrop?.classList.add("hidden"); 
  };

  toggle.addEventListener("click", () => {
    if (sidebar.classList.contains("-translate-x-full")) open(); else close();
  });
  
  backdrop?.addEventListener("click", close);
  
  $$("#nav a").forEach((a) => a.addEventListener("click", () => {
    if (window.innerWidth < 1024) close();
  }));
}

/* ---------- Color Theme Persistence & Toggle ---------- */
function wireTheme() {
  const btn  = $("#themeToggle");
  const icon = $("#themeIcon");
  if (!btn) return;
  
  const dark = localStorage.getItem("theme") === "dark";
  document.documentElement.classList.toggle("dark", dark);
  if (icon) icon.className = dark ? "fa-solid fa-sun text-xs" : "fa-solid fa-moon text-xs";

  btn.addEventListener("click", () => {
    const isDark = document.documentElement.classList.toggle("dark");
    localStorage.setItem("theme", isDark ? "dark" : "light");
    if (icon) icon.className = isDark ? "fa-solid fa-sun text-xs" : "fa-solid fa-moon text-xs";
    
    window.dispatchEvent(new CustomEvent("themecasedchanged", { detail: { isDark } }));
  });
}

/* ---------- Cache Invalidation & Sync Button ---------- */
function wireSyncButton() {
  const btn = $("#clearCacheBtn");
  if (!btn) return;
  
  btn.addEventListener("click", () => {
    try {
      clearAll();
      invalidateSyllabus();
      invalidateAll();
      toast("Cache cleared successfully — reloading console…", "ok");
      setTimeout(() => location.reload(), 400);
    } catch (err) {
      console.error("Cache sync error:", err);
      toast("Failed to clear cache. Check console.", "bad");
    }
  });
}

/* ---------- Active Navigation Routing State ---------- */
function wireNavHighlight() {
  const sync = () => {
    const current = location.hash || "#/dash";
    $$("#nav a[href^='#/']").forEach((link) => {
      const match = link.getAttribute("href") === current;
      link.classList.toggle("active", match);
      if (match) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  };
  
  window.addEventListener("hashchange", sync);
  sync();
}

/* ---------- App Boot Initialization with Error Guard ---------- */
boot().catch((e) => {
  console.error("Admin Boot Error:", e);
  const v = $("#view");
  if (v) {
    v.innerHTML = `
      <div class="card p-8 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 max-w-xl mx-auto my-12 text-center shadow-lg backdrop-blur-md">
        <div class="w-12 h-12 rounded-full bg-rose-500/20 flex items-center justify-center mx-auto mb-4">
          <i class="fa-solid fa-triangle-exclamation text-xl"></i>
        </div>
        <h3 class="font-display font-bold text-lg mb-1 text-slate-900 dark:text-white">Admin Console Initialization Failed</h3>
        <p class="text-sm opacity-90 mb-4">${esc(e.message)}</p>
        <button onclick="location.reload()" class="px-4 py-2 rounded-xl bg-rose-500 text-white font-medium text-xs shadow-md hover:bg-rose-600 transition-all">
          Reload Workspace
        </button>
      </div>`;
  }
});