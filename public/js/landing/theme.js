// js/landing/theme.js
const icon = document.getElementById("themeIcon");
const btn = document.getElementById("themeToggle");
const dark = localStorage.getItem("theme") === "dark";
document.documentElement.classList.toggle("dark", dark);
if (icon) icon.className = dark ? "fa-solid fa-sun text-sm" : "fa-solid fa-moon text-sm";

btn?.addEventListener("click", () => {
  const isDark = document.documentElement.classList.toggle("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  if (icon) icon.className = isDark ? "fa-solid fa-sun text-sm" : "fa-solid fa-moon text-sm";
});