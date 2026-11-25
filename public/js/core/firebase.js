// js/core/firebase.js
// Firebase bootstrap. Persistent IndexedDB cache stays enabled.
// The only change from the old js/firebase.js: this file lives under core/.

const firebaseConfig = {
  apiKey: "AIzaSyCqDZrv4l1PlCiKjFNlkr0QUoQbAfl7Mso",
  authDomain: "topper-hub-eb1f5.firebaseapp.com",
  projectId: "topper-hub-eb1f5",
  storageBucket: "topper-hub-eb1f5.firebasestorage.app",
  messagingSenderId: "165013357143",
  appId: "1:165013357143:web:bc00e63f23d4ec0f1e5912",
  measurementId: "G-2KWZDPCS0E"
};

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// Reuse app if already initialized
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Reuse Firestore if already initialized, otherwise create with persistent cache
let db;
try {
  db = getFirestore(app);
} catch {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
}
export { db };

export * from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
export * from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";