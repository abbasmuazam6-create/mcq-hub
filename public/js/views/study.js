// js/views/study.js — #/study/ID opens that chapter's Study tab
export default function ({ arg } = {}) {
  location.replace(arg ? `#/chapter/${arg}?tab=study` : "#/home");
  return "";
}