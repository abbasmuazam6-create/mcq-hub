import {
  auth, db, onAuthStateChanged, signOut,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, deleteUser,
  doc, getDoc, setDoc,
} from "./firebase.js";
import { $, toast } from "./common.js";

const authMsg = (e) => ({
  "auth/invalid-credential": "Wrong email or password.",
  "auth/wrong-password": "Wrong email or password.",
  "auth/user-not-found": "Wrong email or password.",
  "auth/email-already-in-use": "This email is already registered. Please log in.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/too-many-requests": "Too many attempts. Please wait a minute and try again.",
  "auth/network-request-failed": "Network problem. Check your connection.",
}[e.code] || e.message);

let regOpen = true;
let busy = false; // true while a login/register submit is running (stops the auto-redirect racing it)
let bound = false;

function showGlobalNotice(message) {
  const n = $("#notice");
  if (!n) return;
  n.hidden = false;
  n.textContent = message;
}

if (new URLSearchParams(location.search).get("err") === "noaccess") {
  showGlobalNotice("Your account has no access (deactivated or not set up). Contact the administrator.");
  window.openLoginModal?.();
}

async function loadSettings() {
  const regClosedEl = $("#regClosed");
  const rBtn = $("#rBtn");

  try {
    const s = await getDoc(doc(db, "settings", "app"));
    if (!s.exists()) {
      showGlobalNotice("Setup needed: create the document settings/app in Firestore (see README).");
      regOpen = false;
    } else {
      regOpen = s.data().registrationOpen === true;
    }
  } catch (e) {
    console.warn(e);
  }

  if (regClosedEl) regClosedEl.hidden = regOpen;
  if (rBtn) rBtn.disabled = !regOpen;
}

async function goHome(user) {
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists() || snap.data().active === false) {
    await signOut(auth);
    throw new Error("Your account has no access. Contact the administrator.");
  }
  location.replace(snap.data().role === "admin" || snap.data().role === "teacher" ? "admin.html" : "app.html");
}

function bindAuthForms() {
  if (bound) {
    loadSettings();
    return;
  }

  const loginForm = $("#loginForm");
  const regForm = $("#regForm");
  const forgotLink = $("#forgot");

  if (!loginForm || !regForm) return;
  bound = true;

  // If registration is locked and a user clicks Register, ensure they see #regClosed inside #registerModal
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest('[data-auth-action="register"]');
    if (trigger && !regOpen) {
      setTimeout(() => {
        const regClosedEl = $("#regClosed");
        if (regClosedEl) regClosedEl.hidden = false;
      }, 60);
    }
  });

  loginForm.onsubmit = async (e) => {
    e.preventDefault();
    $("#lErr").textContent = "";
    $("#lBtn").disabled = true;
    busy = true;
    try {
      const cred = await signInWithEmailAndPassword(auth, $("#lEmail").value.trim(), $("#lPass").value);
      await goHome(cred.user);
    } catch (err) {
      $("#lErr").textContent = authMsg(err);
      $("#lBtn").disabled = false;
      busy = false;
    }
  };

  if (forgotLink) {
    forgotLink.onclick = async (e) => {
      e.preventDefault();
      const email = $("#lEmail").value.trim();
      if (!email) {
        $("#lErr").textContent = "Enter your email above first.";
        return;
      }
      try {
        await sendPasswordResetEmail(auth, email);
        toast("Password reset email sent (check spam too).", "ok");
      } catch (err) {
        $("#lErr").textContent = authMsg(err);
      }
    };
  }

  regForm.onsubmit = async (e) => {
    e.preventDefault();
    $("#rErr").textContent = "";
    if (!regOpen) return;

    const termsAgree = $("#rTermsAgree");
    if (termsAgree && !termsAgree.checked) {
      $("#rErr").textContent = "Please accept the Terms & Conditions to create an account.";
      return;
    }

    $("#rBtn").disabled = true;
    busy = true;
    let cred;
    try {
      cred = await createUserWithEmailAndPassword(auth, $("#rEmail").value.trim(), $("#rPass").value);
      // Firestore rules reject this write if the admin locked registration.
      await setDoc(doc(db, "users", cred.user.uid), {
        name: $("#rName").value.trim(),
        email: cred.user.email,
        role: "student",
        active: true,
        agreedToTerms: true,
        createdAt: Date.now(),
      });
      location.replace("app.html");
    } catch (err) {
      if (cred && cred.user) {
        try { await deleteUser(cred.user); } catch (_) { /* ignore */ }
      }
      let msg = authMsg(err);
      if (err.code === "permission-denied") {
        await loadSettings();   // re-read the real setting before blaming "closed"
        msg = regOpen
          ? "Could not create your profile (permission denied). Please contact the administrator."
          : "Registration is currently closed.";
      }
      $("#rErr").textContent = msg;
      $("#rBtn").disabled = !regOpen;
      busy = false;
    }
  };

  loadSettings();
}

if ($("#loginForm") && $("#regForm")) {
  bindAuthForms();
} else {
  window.addEventListener("modals:ready", bindAuthForms, { once: true });
}

// Already signed in? jump straight in.
onAuthStateChanged(auth, (u) => {
  if (u && !busy && !location.search.includes("err=")) goHome(u).catch(() => {});
});