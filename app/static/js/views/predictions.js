import { pageHead, stat, setStat, esc, num, fix, table, pill, when, LABEL_CLASS, $ } from "../core/ui.js";
import { on, state } from "../core/store.js";

export const title = "Predictions log";

export function render(root) {
  root.innerHTML = `
    ${pageHead("Predictions log", "Every prediction is saved in the database with its timing and the container that served it.")}
    <div class="grid g-4">
      ${stat({ id: "count", k: "Predictions served", v: "…" })}
      ${stat({ id: "avg", k: "Average prediction time", v: "…" })}
      ${stat({ id: "eng", k: "Engaged in recent", v: "…" })}
      ${stat({ id: "containers", k: "Containers in recent", v: "…" })}
    </div>
    <div class="card section">
      <div class="card-head"><h3>Latest predictions</h3><div class="sub">The 10 most recent, refreshed every 5 seconds</div></div>
      <div data-table></div>
    </div>`;

  const paint = () => {
    const s = state.stats; if (!s) return;
    const p = s.predictions, recent = p.recent;
    setStat(root, "count", num(p.count));
    setStat(root, "avg", p.count ? `${p.avg_latency_ms}<span class="unit">ms</span>` : "–");
    const eng = recent.filter(r => r.label === "Engagement").length;
    setStat(root, "eng", recent.length ? `${eng} / ${recent.length}` : "–");
    setStat(root, "containers", String(new Set(recent.map(r => r.container)).size || "–"), "Shows load balancing across containers");
    $("[data-table]", root).innerHTML = table(recent, [
      { label: "Time", render: r => when(r.created_at) },
      { label: "File", render: r => esc(r.filename) },
      { label: "Prediction", render: r => pill(r.label, LABEL_CLASS(r.label)) },
      { label: "P(engaged)", num: true, render: r => fix(r.probability, 3) },
      { label: "ms", num: true, render: r => fix(r.latency_ms, 1) },
      { label: "Model", render: r => `v${esc(r.model_version)}` },
      { label: "Container", render: r => `<code class="small">${esc(r.container)}</code>` },
    ], "No predictions yet.");
  };
  paint();
  return on("stats", paint);
}
