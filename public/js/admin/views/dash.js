// js/admin/views/dash.js — Upgraded Maximum-Feature Admin Dashboard View
import {
  db, doc, getDoc, setDoc, updateDoc,
  collection, getCountFromServer, query, where,
} from "../../core/firebase.js";
import { $, esc, toast } from "../../core/dom.js";
import { getSyllabus, bumpSyllabusVersion } from "../../common.js";

export default async function () {
  const snap = await getDoc(doc(db, "settings", "app"));
  const set = snap.exists() ? snap.data() : null;
  return { html: render(set), mount: wire };
}

function render(set) {
  const isAdmin = window.__isAdmin;
  const syllabusVer = set?.syllabusVersion ? new Date(set.syllabusVersion).toLocaleString() : "Not set";

  return `
    <div class="space-y-6 animate-fadeIn pb-12">
      
      <!-- Top Welcome Hero Banner -->
      <div class="card p-6 sm:p-8 rounded-3xl border border-slate-200/80 dark:border-white/[0.08] bg-white/70 dark:bg-[#11162a]/70 backdrop-blur-2xl shadow-sm relative overflow-hidden">
        <div class="absolute -right-16 -top-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div class="absolute -left-16 -bottom-16 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
        
        <div class="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div class="flex items-center gap-2 mb-2">
              <span class="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> System Operational
              </span>
              <span class="text-xs text-slate-400 dark:text-slate-500">• Control Console v2.5</span>
            </div>
            <h1 class="text-2xl sm:text-3xl font-display font-extrabold tracking-tight text-slate-900 dark:text-white">
              Welcome back, <span class="bg-gradient-to-r from-indigo-500 to-cyan-400 bg-clip-text text-transparent">${esc(window.__ctx?.profile?.name || 'Administrator')}</span>
            </h1>
            <p class="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
              Monitor student engagement, audit question banks, manage syllabus trees, and oversee global platform settings in real time.
            </p>
          </div>

          <!-- Quick Action Buttons -->
          <div class="flex flex-wrap items-center gap-2.5">
            <a href="#/bank" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-500 shadow-md shadow-indigo-500/20 transition-all active:scale-95">
              <i class="fa-solid fa-database text-xs"></i>
              <span>Question Bank</span>
            </a>
            <a href="#/import" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 transition-all active:scale-95">
              <i class="fa-solid fa-file-excel text-xs text-emerald-500"></i>
              <span>Excel Import</span>
            </a>
          </div>
        </div>
      </div>

      <!-- Core Metrics Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <!-- Users Card -->
        <div class="card p-5 rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white/70 dark:bg-[#11162a]/70 backdrop-blur-xl shadow-xs hover:border-indigo-500/40 transition-all group">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Students &amp; Staff</span>
            <div class="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center group-hover:scale-110 transition-transform shadow-xs">
              <i class="fa-solid fa-users text-sm"></i>
            </div>
          </div>
          <div class="flex items-baseline gap-2">
            <b id="cUsers" class="text-3xl font-display font-extrabold text-slate-900 dark:text-white">…</b>
          </div>
          <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-1 flex items-center gap-1">
            <i class="fa-solid fa-arrow-trend-up text-emerald-500"><span>Registered accounts</span></i>
          </p>
        </div>

        <!-- Questions Card -->
        <div class="card p-5 rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white/70 dark:bg-[#11162a]/70 backdrop-blur-xl shadow-xs hover:border-violet-500/40 transition-all group">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Questions</span>
            <div class="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-500 flex items-center justify-center group-hover:scale-110 transition-transform shadow-xs">
              <i class="fa-solid fa-database text-sm"></i>
            </div>
          </div>
          <div class="flex items-baseline gap-2">
            <b id="cQ" class="text-3xl font-display font-extrabold text-slate-900 dark:text-white">…</b>
          </div>
          <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-1">In question bank store</p>
        </div>

        <!-- Active Questions Card -->
        <div class="card p-5 rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white/70 dark:bg-[#11162a]/70 backdrop-blur-xl shadow-xs hover:border-emerald-500/40 transition-all group">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Active Questions</span>
            <div class="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center group-hover:scale-110 transition-transform shadow-xs">
              <i class="fa-solid fa-circle-check text-sm"></i>
            </div>
          </div>
          <div class="flex items-baseline gap-2">
            <b id="cQA" class="text-3xl font-display font-extrabold text-slate-900 dark:text-white">…</b>
          </div>
          <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Published &amp; live for tests</p>
        </div>

        <!-- Attempts Card -->
        <div class="card p-5 rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white/70 dark:bg-[#11162a]/70 backdrop-blur-xl shadow-xs hover:border-cyan-500/40 transition-all group">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Attempts</span>
            <div class="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center group-hover:scale-110 transition-transform shadow-xs">
              <i class="fa-solid fa-chart-line text-sm"></i>
            </div>
          </div>
          <div class="flex items-baseline gap-2">
            <b id="cAtt" class="text-3xl font-display font-extrabold text-slate-900 dark:text-white">…</b>
          </div>
          <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Student test submissions</p>
        </div>
      </div>

      <!-- Management & Control Grid (2 Columns) -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        <!-- Registration Control Card -->
        <div class="card p-6 sm:p-7 rounded-3xl border border-slate-200/80 dark:border-white/[0.08] bg-white/70 dark:bg-[#11162a]/70 backdrop-blur-xl shadow-sm flex flex-col justify-between">
          <div>
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                <i class="fa-solid fa-user-plus text-base"></i>
              </div>
              <div>
                <h2 class="text-base font-display font-bold text-slate-900 dark:text-white">Student Registration Gate</h2>
                <p class="text-xs text-slate-500 dark:text-slate-400">Control public onboarding access</p>
              </div>
            </div>

            ${!isAdmin ? `
              <div class="p-4 rounded-2xl bg-slate-100 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/[0.05] text-xs text-slate-500">
                <i class="fa-solid fa-lock mr-1.5 text-amber-500"></i> Only administrators can modify registration status.
              </div>
            ` : set ? `
              <div class="p-4 sm:p-5 rounded-2xl border border-slate-200/70 dark:border-white/[0.06] bg-slate-50/80 dark:bg-white/[0.02] flex items-center justify-between gap-4">
                <label class="cursor-pointer flex items-center gap-3 text-sm font-semibold text-slate-900 dark:text-white select-none">
                  <input type="checkbox" id="regToggle" class="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600" ${set.registrationOpen ? "checked" : ""}>
                  Allow new registrations
                </label>
                <div class="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold ${set.registrationOpen ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'}">
                  <span class="w-2 h-2 rounded-full ${set.registrationOpen ? 'bg-emerald-500' : 'bg-rose-500'} animate-pulse"></span>
                  <span id="regState" class="font-semibold">${set.registrationOpen ? "Open" : "Locked"}</span>
                </div>
              </div>
            ` : `
              <div class="text-center py-6 p-4 rounded-2xl border border-dashed border-slate-300 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.01]">
                <p class="text-xs font-medium text-amber-600 dark:text-amber-400 mb-3">Settings document not initialized.</p>
                <button class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md transition-all active:scale-95" id="mkSettings">
                  <i class="fa-solid fa-plus mr-1.5"></i> Create Settings
                </button>
              </div>
            `}
          </div>
          <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-4">When locked, registration endpoint rejects new student sign-up requests.</p>
        </div>

        <!-- Syllabus & Cache Manager Card -->
        <div class="card p-6 sm:p-7 rounded-3xl border border-slate-200/80 dark:border-white/[0.08] bg-white/70 dark:bg-[#11162a]/70 backdrop-blur-xl shadow-sm flex flex-col justify-between">
          <div>
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-500 flex items-center justify-center">
                <i class="fa-solid fa-sitemap text-base"></i>
              </div>
              <div>
                <h2 class="text-base font-display font-bold text-slate-900 dark:text-white">Syllabus Cache &amp; Version</h2>
                <p class="text-xs text-slate-500 dark:text-slate-400">Manage student sync versions</p>
              </div>
            </div>

            <div class="p-4 rounded-2xl border border-slate-200/70 dark:border-white/[0.06] bg-slate-50/80 dark:bg-white/[0.02] space-y-3">
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500 dark:text-slate-400 font-medium">Last Syllabus Version:</span>
                <span id="syllabusVerLabel" class="font-mono font-semibold text-slate-700 dark:text-slate-200">${syllabusVer}</span>
              </div>
              <div class="pt-2 border-t border-slate-200/60 dark:border-white/[0.05] flex items-center justify-between">
                <span class="text-xs text-slate-500 dark:text-slate-400">Force student cache refresh</span>
                <button id="bumpSyllabusBtn" class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white shadow-sm transition-all active:scale-95">
                  <i class="fa-solid fa-rotate mr-1"></i> Bump Version
                </button>
              </div>
            </div>
          </div>
          <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-4">Bumping version invalidates student client caches instantly upon next app load.</p>
        </div>

      </div>

      <!-- Quick Shortcuts Hub -->
      <div class="card p-6 rounded-3xl border border-slate-200/80 dark:border-white/[0.08] bg-white/70 dark:bg-[#11162a]/70 backdrop-blur-xl shadow-sm">
        <h3 class="text-sm font-display font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <i class="fa-solid fa-bolt text-amber-500"></i> Quick Management Shortcuts
        </h3>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <a href="#/syllabus" class="p-3.5 rounded-2xl border border-slate-200/70 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.02] hover:bg-indigo-50/50 dark:hover:bg-indigo-500/10 hover:border-indigo-500/30 transition-all text-center group">
            <i class="fa-solid fa-sitemap text-indigo-500 text-lg mb-1.5 group-hover:scale-110 transition-transform"></i>
            <div class="text-xs font-semibold text-slate-800 dark:text-slate-200">Syllabus Tree</div>
            <div class="text-[10px] text-slate-400 mt-0.5">Boards &amp; classes</div>
          </a>
          <a href="#/bank" class="p-3.5 rounded-2xl border border-slate-200/70 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.02] hover:bg-violet-50/50 dark:hover:bg-violet-500/10 hover:border-violet-500/30 transition-all text-center group">
            <i class="fa-solid fa-database text-violet-500 text-lg mb-1.5 group-hover:scale-110 transition-transform"></i>
            <div class="text-xs font-semibold text-slate-800 dark:text-slate-200">Question Bank</div>
            <div class="text-[10px] text-slate-400 mt-0.5">MCQs &amp; answers</div>
          </a>
          <a href="#/materials" class="p-3.5 rounded-2xl border border-slate-200/70 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.02] hover:bg-emerald-50/50 dark:hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all text-center group">
            <i class="fa-solid fa-book-open text-emerald-500 text-lg mb-1.5 group-hover:scale-110 transition-transform"></i>
            <div class="text-xs font-semibold text-slate-800 dark:text-slate-200">Study Materials</div>
            <div class="text-[10px] text-slate-400 mt-0.5">PDFs &amp; notes</div>
          </a>
          <a href="#/users" class="p-3.5 rounded-2xl border border-slate-200/70 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.02] hover:bg-amber-50/50 dark:hover:bg-amber-500/10 hover:border-amber-500/30 transition-all text-center group">
            <i class="fa-solid fa-users-gear text-amber-500 text-lg mb-1.5 group-hover:scale-110 transition-transform"></i>
            <div class="text-xs font-semibold text-slate-800 dark:text-slate-200">User Manager</div>
            <div class="text-[10px] text-slate-400 mt-0.5">Roles &amp; access</div>
          </a>
        </div>
      </div>

    </div>`;
}

function wire(root) {
  const count = async (id, q) => {
    try { 
      const el = $(id, root);
      if (el) el.textContent = (await getCountFromServer(q)).data().count; 
    } catch {}
  };
  
  count("#cUsers", collection(db, "users"));
  count("#cQ", collection(db, "questions"));
  count("#cQA", query(collection(db, "questions"), where("status", "==", "active")));
  count("#cAtt", collection(db, "attempts"));

  // Registration toggle handler
  $("#regToggle", root)?.addEventListener("change", async (e) => {
    try {
      await updateDoc(doc(db, "settings", "app"), { registrationOpen: e.target.checked });
      const regState = $("#regState", root);
      if (regState) {
        regState.textContent = e.target.checked ? "Open" : "Locked";
        const badge = regState.closest('div');
        if (badge) {
          badge.className = e.target.checked 
            ? "flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
            : "flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20";
        }
      }
      toast("Registration settings updated successfully", "ok");
    } catch (err) { 
      toast(err.message, "bad"); 
      e.target.checked = !e.target.checked; 
    }
  });

  // Create settings button handler
  $("#mkSettings", root)?.addEventListener("click", async () => {
    try {
      await setDoc(doc(db, "settings", "app"), { registrationOpen: true, syllabusVersion: Date.now() });
      toast("Settings document created successfully", "ok");
      setTimeout(() => location.reload(), 400);
    } catch (err) {
      toast(err.message, "bad");
    }
  });

  // Bump syllabus version handler
  $("#bumpSyllabusBtn", root)?.addEventListener("click", async () => {
    try {
      await bumpSyllabusVersion();
      toast("Syllabus version bumped! Student caches invalidated.", "ok");
      const label = $("#syllabusVerLabel", root);
      if (label) label.textContent = new Date().toLocaleString();
    } catch (err) {
      toast("Failed to bump syllabus version: " + err.message, "bad");
    }
  });
}