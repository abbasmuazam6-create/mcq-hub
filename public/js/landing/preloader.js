// js/landing/preloader.js
const preloader = document.getElementById("preloader");
const loaderBar = document.getElementById("loaderProgressBar");
const loaderPercent = document.getElementById("loaderPercentText");
const loaderStatus = document.getElementById("loaderStatusText");

const stages = [
  { pct: 30, text: "Loading Topper Hub Engine..." },
  { pct: 68, text: "Syncing Board & Topic Banks..." },
  { pct: 95, text: "Preparing Student Portal..." },
  { pct: 100, text: "Welcome to Topper Hub!" },
];

function start() {
  if (!preloader) return;
  let progress = 0;
  const timer = setInterval(() => {
    progress += Math.floor(Math.random() * 16) + 10;
    if (progress >= 100) {
      progress = 100;
      clearInterval(timer);
      loaderBar.style.width = "100%";
      loaderPercent.textContent = "100%";
      loaderStatus.textContent = "Welcome to Topper Hub!";
      setTimeout(() => {
        preloader.classList.add("loader-exit");
        document.body.classList.add("app-ready");
        window.dispatchEvent(new CustomEvent("preloader:done"));
      }, 280);
    } else {
      loaderBar.style.width = `${progress}%`;
      loaderPercent.textContent = `${progress}%`;
      const stage = stages.find((s) => progress <= s.pct);
      if (stage) loaderStatus.textContent = stage.text;
    }
  }, 85);
}

if (document.readyState === "complete") start();
else window.addEventListener("load", start);