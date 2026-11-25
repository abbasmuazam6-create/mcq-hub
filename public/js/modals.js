// js/modals.js — Loads standalone Login & Register modals and manages modal visibility

async function loadAuthModals() {
  const container = document.getElementById("authModalsContainer");
  if (!container) return;

  try {
    const [loginRes, registerRes] = await Promise.all([
      fetch("modals/login-modal.html"),
      fetch("modals/register-modal.html"),
    ]);

    const [loginHtml, registerHtml] = await Promise.all([
      loginRes.text(),
      registerRes.text(),
    ]);

    container.innerHTML = `${loginHtml}\n${registerHtml}`;
    bindAuthModalEvents();

    // Notify auth.js that #loginForm and #regForm are now mounted in the DOM
    window.dispatchEvent(new CustomEvent("modals:ready"));
  } catch (err) {
    console.error("Failed to load auth modals:", err);
  }
}

export function openLoginModal() {
  closeRegisterModal();
  const modal = document.getElementById("loginModal");
  if (!modal) return;
  modal.classList.add("is-open");
  syncBodyLock();
  setTimeout(() => document.getElementById("lEmail")?.focus(), 160);
}

export function closeLoginModal() {
  document.getElementById("loginModal")?.classList.remove("is-open");
  syncBodyLock();
}

export function openRegisterModal() {
  closeLoginModal();
  const modal = document.getElementById("registerModal");
  if (!modal) return;
  modal.classList.add("is-open");
  syncBodyLock();
  setTimeout(() => document.getElementById("rName")?.focus(), 160);
}

export function closeRegisterModal() {
  document.getElementById("registerModal")?.classList.remove("is-open");
  syncBodyLock();
}

function syncBodyLock() {
  const isAnyOpen =
    document.getElementById("loginModal")?.classList.contains("is-open") ||
    document.getElementById("registerModal")?.classList.contains("is-open") ||
    document.getElementById("termsModal")?.classList.contains("is-open");
  document.body.style.overflow = isAnyOpen ? "hidden" : "";
}

function bindAuthModalEvents() {
  // Open buttons across navbar, hero, subject cards, and footer
  document.querySelectorAll("[data-auth-action]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const action = btn.getAttribute("data-auth-action");
      if (action === "register") openRegisterModal();
      else openLoginModal();
    });
  });

  // Explicit close buttons inside each modal
  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-close-modal");
      if (targetId === "loginModal") closeLoginModal();
      else if (targetId === "registerModal") closeRegisterModal();
    });
  });

  // Backdrop click-to-close
  ["loginModal", "registerModal"].forEach((id) => {
    const modal = document.getElementById(id);
    modal?.addEventListener("click", (e) => {
      if (e.target === modal) {
        if (id === "loginModal") closeLoginModal();
        else closeRegisterModal();
      }
    });
  });

  // Password visibility toggle inside injected modals
  document.querySelectorAll("#authModalsContainer .toggle-pass").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.togglePass);
      if (!input) return;
      const isPass = input.type === "password";
      input.type = isPass ? "text" : "password";
      btn.innerHTML = isPass
        ? '<i class="fa-regular fa-eye-slash"></i>'
        : '<i class="fa-regular fa-eye"></i>';
    });
  });

  // Escape key closes whichever modal is open
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const termsModal = document.getElementById("termsModal");
    if (termsModal?.classList.contains("is-open")) return;
    closeLoginModal();
    closeRegisterModal();
  });
}

// Expose globally in case non-module scripts need them
window.openLoginModal = openLoginModal;
window.openRegisterModal = openRegisterModal;

loadAuthModals();