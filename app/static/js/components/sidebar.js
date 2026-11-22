import { icon, esc, $ } from "../core/ui.js";
import { on } from "../core/store.js";
import { unseenCount } from "../core/logger.js";

export const NAV = [
  { title: "Workspace", items: [
    { path: "overview", label: "Dashboard", icon: "home" },
    { path: "predict", label: "Predict an image", icon: "scan" },
  ] },
  { title: "Data & model", items: [
    { path: "insights", label: "Data insights", icon: "chart" },
    { path: "experiments", label: "Experiments", icon: "flask" },
    { path: "evaluate", label: "Evaluation", icon: "shield" },
  ] },
  { title: "MLOps", items: [
    { path: "upload", label: "Upload data", icon: "upload" },
    { path: "retraining", label: "Retraining", icon: "refresh" },
    { path: "predictions", label: "Predictions log", icon: "list" },
  ] },
  { title: "System", items: [
    { path: "status", label: "Service status", icon: "activity" },
    { path: "logs", label: "Error logs", icon: "alert", badge: true },
  ] },
];

export function renderSidebar(shell) {
  const el = $(".sidebar", shell);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  el.innerHTML = `
    <a class="brand" href="#/overview" aria-label="Home">
      <div class="brand-mark">${icon("logo")}</div>
      <div class="brand-text"><b>ENGAGE&nbsp;ML</b><span>Student engagement</span></div>
    </a>
    <nav class="nav" aria-label="Main">
      ${NAV.map(g => `
        <div class="nav-group">
          <div class="nav-title">${esc(g.title)}</div>
          ${g.items.map(i => `<a class="nav-link" href="#/${i.path}" data-path="${i.path}" title="${esc(i.label)}">
              ${icon(i.icon)}<span>${esc(i.label)}</span>${i.badge ? '<em class="count" data-log-count hidden></em>' : ""}</a>`).join("")}
        </div>`).join("")}
    </nav>
    <div class="sidebar-foot">
      <div class="tz">Times shown in ${esc(tz)}</div>
      <button class="collapse-btn" type="button">${icon("chevrons")}<span>Collapse menu</span></button>
    </div>`;

  const collapsed = (() => { try { return localStorage.getItem("sem.collapsed") === "1"; } catch { return false; } })();
  shell.classList.toggle("collapsed", collapsed);
  $(".collapse-btn", el).onclick = () => {
    const c = shell.classList.toggle("collapsed");
    try { localStorage.setItem("sem.collapsed", c ? "1" : "0"); } catch {}
    window.dispatchEvent(new Event("resize"));
  };

  const updateCount = () => {
    const n = unseenCount(), badge = $("[data-log-count]", el);
    badge.hidden = !n; badge.textContent = n > 99 ? "99+" : n;
  };
  on("logs", updateCount); updateCount();
}

export function setActive(shell, path) {
  for (const a of shell.querySelectorAll(".nav-link")) {
    const active = a.dataset.path === path;
    a.classList.toggle("active", active);
    if (active) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
}
