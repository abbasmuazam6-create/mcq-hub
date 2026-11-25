// js/core/sw-register.js
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        nw?.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) {
            // New version available — reload silently next visit
            console.log("[sw] new version ready");
          }
        });
      });
    }).catch((e) => console.warn("[sw]", e));
  });
}