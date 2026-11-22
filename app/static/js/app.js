import "./core/logger.js";
import { renderSidebar, setActive } from "./components/sidebar.js";
import { renderTopbar } from "./components/topbar.js";
import { refreshHealth, refreshStats, refreshModel, refreshInsights } from "./core/api.js";
import { log } from "./core/logger.js";
import { esc } from "./core/ui.js";
import { on } from "./core/store.js";

import * as overview from "./views/overview.js";
import * as predict from "./views/predict.js";
import * as insights from "./views/insights.js";
import * as experiments from "./views/experiments.js";
import * as evaluate from "./views/evaluate.js";
import * as upload from "./views/upload.js";
import * as retraining from "./views/retraining.js";
import * as predictions from "./views/predictions.js";
import * as status from "./views/status.js";
import * as logs from "./views/logs.js";

const ROUTES = { overview, predict, insights, experiments, evaluate, upload, retraining, predictions, status, logs };
const POLL_MS = 5000;

const shell = document.querySelector(".shell");
const content = document.querySelector(".content");
let cleanup = null;

function route() {
  const path = (location.hash.replace(/^#\/?/, "") || "overview").split("?")[0];
  const view = ROUTES[path] || ROUTES.overview;
  const key = ROUTES[path] ? path : "overview";

  try { cleanup?.(); } catch (err) { console.error(err); }
  cleanup = null;
  shell.classList.remove("nav-open");
  setActive(shell, key);
  document.title = `${view.title} · Student Engagement`;
  content.scrollTop = 0; window.scrollTo(0, 0);

  try {
    cleanup = view.render(content) || null;
  } catch (err) {
    log({ source: "browser", title: `The ${view.title} page failed to render`, message: err.message, details: err.stack });
    content.innerHTML = `<div class="callout bad"><b>This page failed to load.</b> ${esc(err.message)} <a href="#/logs">See error logs</a></div>`;
  }
  content.focus({ preventScroll: true });
}

renderSidebar(shell);
renderTopbar(shell);
window.addEventListener("hashchange", route);
document.addEventListener("keydown", e => { if (e.key === "Escape") shell.classList.remove("nav-open"); });
route();

refreshHealth(); refreshStats(); refreshModel(); refreshInsights();
let lastVersion = null;
setInterval(() => {
  if (document.hidden) return;
  refreshHealth(); refreshStats();
}, POLL_MS);
document.addEventListener("visibilitychange", () => { if (!document.hidden) { refreshHealth(); refreshStats(); } });

on("health", h => {
  const v = h?.model_version;
  if (v != null && lastVersion != null && v !== lastVersion) refreshModel();
  if (v != null) lastVersion = v;
});
