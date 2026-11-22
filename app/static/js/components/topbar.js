import { icon, $, pill } from "../core/ui.js";
import { on, state } from "../core/store.js";
import { unseenCount } from "../core/logger.js";

export function renderTopbar(shell) {
  const el = $(".topbar", shell);
  el.innerHTML = `
    <button class="icon-btn menu-btn" type="button" aria-label="Open menu">${icon("menu")}</button>
    <div class="ws">
      <div class="ws-icon">${icon("building")}</div>
      <div class="ws-text"><small>Project</small><b>Student Engagement</b></div>
      <span class="pill dark">MLOps</span>
      <span data-conn>${pill("Connecting…", "muted")}</span>
    </div>
    <div class="topbar-right">
      <a class="icon-btn" href="#/logs" aria-label="Error logs" title="Error logs">${icon("bell")}<span class="badge" data-bell hidden></span></a>
      <div class="vsep"></div>
      <div class="who">
        <div class="avatar">AS</div>
        <div class="who-text"><b>Anglebert Shumbusho</b><span>Admin</span></div>
      </div>
    </div>`;

  $(".menu-btn", el).onclick = () => shell.classList.add("nav-open");
  $(".backdrop", shell).onclick = () => shell.classList.remove("nav-open");

  const conn = $("[data-conn]", el);
  const paint = () => {
    const h = state.health;
    if (state.healthOk === false) conn.innerHTML = pill("Offline", "bad", true);
    else if (!h) conn.innerHTML = pill("Connecting…", "muted");
    else if (!h.model_loaded) conn.innerHTML = pill("Model not loaded", "warn", true);
    else conn.innerHTML = pill(`Online · v${h.model_version}`, "ok", true);
  };
  on("health", paint); on("healthOk", paint);

  const bell = $("[data-bell]", el);
  const count = () => { const n = unseenCount(); bell.hidden = !n; bell.textContent = n > 99 ? "99+" : n; };
  on("logs", count); count();
}
