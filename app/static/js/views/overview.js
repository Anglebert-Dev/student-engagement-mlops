import { pageHead, sectionHead, stat, setStat, linkBtn, icon, esc, num, uptime, pct, fix, table, when, LABEL_CLASS, pill, metricChips } from "../core/ui.js";
import { on, state } from "../core/store.js";
import { getLogs } from "../core/logger.js";

export const title = "Dashboard";

export function render(root) {
  root.innerHTML = `
    ${pageHead("Dashboard", "An overview of the engagement classifier, its data and recent activity.")}

    <section class="section">
      ${sectionHead("Engagement classifier",
        linkBtn("#/predict", "Predict", "scan") + linkBtn("#/upload", "Upload data", "upload") +
        linkBtn("#/retraining", "Retrain", "refresh") + linkBtn("#/evaluate", "Evaluate", "shield"))}
      <div class="grid g-4">
        ${stat({ id: "service", k: "Service", v: "…", note: "" })}
        ${stat({ id: "preds", k: "Predictions served (all containers)", v: "…" })}
        ${stat({ id: "latency", k: "Average prediction time", v: "…" })}
        ${stat({ id: "issues", k: "Needs you", v: "…" })}
        ${stat({ id: "version", k: "Model in production", v: "…" })}
        ${stat({ id: "f1", k: "F1 score (held-out test)", v: "…" })}
        ${stat({ id: "waiting", k: "New images waiting", v: "…" })}
        ${stat({ id: "uptime", k: "Uptime (answering container)", v: "…" })}
      </div>
    </section>

    <section class="section">
      <div class="card">
        <div class="card-head"><h3>Needs you</h3></div>
        <div data-needs></div>
      </div>
    </section>

    <section class="section grid g-2">
      <div class="card">
        <div class="card-head"><h3>Model metrics</h3><div class="actions">${linkBtn("#/evaluate", "Evaluate now", "", "sm")}</div><div class="sub" data-model-sub></div></div>
        <div data-model></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Latest predictions</h3><div class="actions">${linkBtn("#/predictions", "View all", "", "sm")}</div></div>
        <div data-recent></div>
      </div>
    </section>

    <section class="section">
      ${sectionHead("Data & training", "", true)}
      <div class="grid g-4">
        ${stat({ id: "clean", k: "Clean training images", v: "…" })}
        ${stat({ id: "removed", k: "Copies removed", v: "…" })}
        ${stat({ id: "experiments", k: "Experiments compared", v: "…" })}
        ${stat({ id: "runs", k: "Retraining runs", v: "…" })}
      </div>
    </section>

    <section class="section card">
      <h2 class="section-title" style="margin-bottom:16px">Quick actions</h2>
      <div class="quick">
        <a class="t-green" href="#/predict"><span class="qi">${icon("scan")}</span>Predict an image</a>
        <a class="t-violet" href="#/upload"><span class="qi">${icon("upload")}</span>Upload labelled data</a>
        <a class="t-amber" href="#/retraining"><span class="qi">${icon("refresh")}</span>Retrain model</a>
        <a class="t-plain" href="#/insights"><span class="qi">${icon("chart")}</span>Data insights</a>
        <a class="t-plain" href="#/logs"><span class="qi">${icon("alert")}</span>Error logs</a>
      </div>
    </section>`;

  const paintHealth = () => {
    const h = state.health;
    if (state.healthOk === false) setStat(root, "service", "Offline", "The API is not answering. See Error logs.", "bad");
    else if (h) {
      setStat(root, "service", h.model_loaded ? "Online" : "Degraded",
        h.model_loaded ? `Answered by container ${esc(h.container)}` : "The model is not loaded.", h.model_loaded ? "ok" : "bad");
      setStat(root, "uptime", uptime(h.uptime_seconds), `Availability since page opened: ${pct(state.okChecks / state.checks)}`);
      setStat(root, "version", h.model_version != null ? `v${h.model_version}` : "none");
    }
    paintNeeds();
  };

  const paintStats = () => {
    const s = state.stats; if (!s) return;
    const p = s.predictions;
    setStat(root, "preds", num(p.count));
    setStat(root, "latency", p.count ? `${p.avg_latency_ms}<span class="unit">ms</span>` : "–", p.count ? "" : "No predictions yet");
    const w = s.uploads.waiting || 0;
    setStat(root, "waiting", num(w), `Auto-retrains at ${s.retrain_threshold}`, "");
    const runs = s.retraining || [];
    const last = runs[0];
    setStat(root, "runs", runs.length >= 10 ? "10+" : String(runs.length),
      last ? `Last: run ${last.id}, ${esc(last.status)}` : "No runs yet", last?.status === "failed" ? "bad" : "");
    root.querySelector("[data-recent]").innerHTML = table(p.recent.slice(0, 6), [
      { label: "Time", render: r => when(r.created_at) },
      { label: "File", render: r => `<span title="${esc(r.filename)}">${esc(truncate(r.filename, 22))}</span>` },
      { label: "Prediction", render: r => pill(r.label, LABEL_CLASS(r.label)) },
      { label: "P(engaged)", num: true, render: r => fix(r.probability, 2) },
    ], "No predictions yet. Try Predict an image.");
    paintNeeds();
  };

  const paintModel = () => {
    const m = state.model;
    const box = root.querySelector("[data-model]");
    if (!m) { box.innerHTML = `<div class="callout warn">Model information is unavailable. <a href="#/logs">See error logs</a>.</div>`; setStat(root, "f1", "–"); return; }
    root.querySelector("[data-model-sub]").textContent = `Version ${m.version} · ${m.experiment || ""} · trained ${when(m.trained_at)} · threshold ${m.threshold}`;
    box.innerHTML = metricChips(m.metrics);
    setStat(root, "f1", fix(m.metrics?.f1), `Accuracy ${fix(m.metrics?.accuracy)} · ROC-AUC ${fix(m.metrics?.roc_auc)}`);
  };

  const paintInsights = () => {
    const d = state.insights; if (!d) return;
    if (!d.cleaning) { setStat(root, "clean", "–", "Dataset summary not found", "warn"); return; }
    setStat(root, "clean", num(d.cleaning.images_after), `From ${num(d.cleaning.images_before)} images received`);
    const removed = d.cleaning.images_before - d.cleaning.images_after;
    setStat(root, "removed", num(removed), `${pct(removed / d.cleaning.images_before)} were duplicates`);
    const ex = d.experiments || [];
    const best = ex.reduce((a, b) => (b.val_f1 > (a?.val_f1 ?? -1) ? b : a), null);
    setStat(root, "experiments", num(ex.length), best ? `Best val F1: ${esc(best.name)} (${fix(best.val_f1)})` : "");
  };

  function paintNeeds() {
    const items = [];
    const h = state.health, s = state.stats;
    if (state.healthOk === false) items.push(["bad", "The API is not answering health checks."]);
    if (h && !h.model_loaded) items.push(["bad", `The model is not loaded: ${esc(h.model_error || "unknown reason")}`]);
    const failed = (s?.retraining || []).filter(r => r.status === "failed").slice(0, 1);
    for (const r of failed) items.push(["warn", `Retraining run ${r.id} failed: ${esc(r.error || "no message")}`]);
    if (s && s.uploads.waiting >= s.retrain_threshold) items.push(["warn", `${s.uploads.waiting} new images are waiting for retraining.`]);
    const recentErrors = getLogs().filter(e => e.level === "error" && Date.now() - e.last_ts < 15 * 60e3).length;
    if (recentErrors) items.push(["warn", `${recentErrors} error${recentErrors > 1 ? "s" : ""} logged in the last 15 minutes.`]);

    setStat(root, "issues", String(items.length), items.length ? `<a href="#/logs">Review</a>` : "All clear", items.length ? "bad" : "ok");
    root.querySelector("[data-needs]").innerHTML = items.length
      ? items.map(([k, t]) => `<div class="callout ${k}" style="margin-top:8px">${t} <a href="#/logs">Details</a></div>`).join("")
      : `<div class="ok-text">Nothing needs you: the API is online, the model is loaded and no errors were logged recently.</div>`;
  }

  paintHealth(); paintStats(); paintModel(); paintInsights();
  const offs = [on("health", paintHealth), on("healthOk", paintHealth), on("stats", paintStats), on("model", paintModel), on("insights", paintInsights), on("logs", paintNeeds)];
  return () => offs.forEach(f => f());
}

const truncate = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + "…" : s || "");
