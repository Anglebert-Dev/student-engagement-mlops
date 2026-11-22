import { pageHead, stat, setStat, esc, num, pct, uptime, when, chart, COLORS, $ } from "../core/ui.js";
import { refreshHealth } from "../core/api.js";
import { on, state } from "../core/store.js";

export const title = "Service status";

export function render(root) {
  root.innerHTML = `
    ${pageHead("Service status", "Live health of the API. Checked every 5 seconds while this page is open.")}
    <div class="grid g-4">
      ${stat({ id: "service", k: "Service", v: "…" })}
      ${stat({ id: "avail", k: "Availability since page opened", v: "…" })}
      ${stat({ id: "uptime", k: "Uptime (answering container)", v: "…" })}
      ${stat({ id: "ping", k: "Last response time", v: "…" })}
      ${stat({ id: "container", k: "Answering container", v: "…", sm: true })}
      ${stat({ id: "requests", k: "Requests served (this container)", v: "…" })}
      ${stat({ id: "preds", k: "Predictions (this container)", v: "…" })}
      ${stat({ id: "model", k: "Model version", v: "…" })}
    </div>
    <div class="card section">
      <div class="card-head"><h3>Health check response time (ms)</h3><div class="sub">Each request may be answered by a different container behind nginx</div>
        <div class="actions"><button class="btn sm" data-check>Check now</button></div></div>
      <div class="chart-box sm"><canvas data-c></canvas></div>
    </div>
    <div data-err></div>`;

  const c = chart($("[data-c]", root), { type: "line",
    data: { labels: [], datasets: [{ data: [], borderColor: COLORS.eng, backgroundColor: COLORS.eng + "1f", fill: true, pointRadius: 0, tension: .3, borderWidth: 2 }] },
    options: { animation: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { beginAtZero: true } } } });

  $("[data-check]", root).onclick = refreshHealth;

  const paint = () => {
    const h = state.health;
    if (state.healthOk === false) setStat(root, "service", "Offline", "No answer from the API", "bad");
    else if (h) setStat(root, "service", h.model_loaded ? "Online" : "Degraded", h.model_loaded ? "Model loaded" : "Model not loaded", h.model_loaded ? "ok" : "bad");
    setStat(root, "avail", state.checks ? pct(state.okChecks / state.checks) : "–", `${state.okChecks} of ${state.checks} checks answered`);
    const last = state.pings.at(-1);
    setStat(root, "ping", last ? `${last.ms}<span class="unit">ms</span>` : "–");
    if (h) {
      setStat(root, "uptime", uptime(h.uptime_seconds), `Started ${when(h.started_at)}`);
      setStat(root, "container", esc(h.container));
      setStat(root, "requests", num(h.requests_served));
      setStat(root, "preds", num(h.predictions_served), h.avg_prediction_ms != null ? `Average ${h.avg_prediction_ms} ms` : "");
      setStat(root, "model", h.model_version != null ? `v${h.model_version}` : "none");
    }
    $("[data-err]", root).innerHTML = h?.model_error
      ? `<div class="callout bad section"><b>Model error:</b> ${esc(h.model_error)} <a href="#/logs">Open error logs</a></div>` : "";
    if (c) {
      c.data.labels = state.pings.map(p => new Date(p.t).toLocaleTimeString());
      c.data.datasets[0].data = state.pings.map(p => p.ms);
      c.update();
    }
  };
  paint();
  const offs = [on("health", paint), on("healthOk", paint)];
  return () => { offs.forEach(f => f()); c?.destroy(); };
}
