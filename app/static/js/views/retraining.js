import { pageHead, stat, setStat, icon, esc, num, fix, table, pill, when, busy, toast, toastError, $ } from "../core/ui.js";
import { api, refreshStats, refreshModel } from "../core/api.js";
import { on, state } from "../core/store.js";

export const title = "Retraining";

const STATUS = { running: "warn", done: "ok", failed: "bad" };

export function render(root) {
  root.innerHTML = `
    ${pageHead("Retraining", "Fine-tune the saved model on the new images in the database. The new version replaces the current one only if it scores better.")}
    <div class="grid g-4">
      ${stat({ id: "waiting", k: "Images waiting", v: "…" })}
      ${stat({ id: "ready", k: "Ready to retrain", v: "…" })}
      ${stat({ id: "version", k: "Model in production", v: "…" })}
      ${stat({ id: "last", k: "Last run", v: "…", sm: true })}
    </div>

    <div class="grid g-2 section">
      <div class="card">
        <div class="card-head"><h3>Start a run</h3><div class="sub">Runs in the background; you can leave this page.</div></div>
        <div class="toolbar">
          <button class="btn primary" data-go>${icon("refresh")}Retrain now</button>
          <a class="btn" href="#/upload">${icon("upload")}Upload more data</a>
        </div>
        <div data-msg style="margin-top:16px"></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>How a run works</h3></div>
        <div class="steps small">
          <div class="step"><span class="n">1</span><div><b>New + earlier images</b><span>Images waiting in the database, plus up to 1,000 from earlier runs (replay) so the model does not forget.</span></div></div>
          <div class="step"><span class="n">2</span><div><b>Fine-tune</b><span>Training continues from the model in production.</span></div></div>
          <div class="step"><span class="n">3</span><div><b>Compare</b><span>Old and new versions are scored on the same validation images.</span></div></div>
          <div class="step"><span class="n">4</span><div><b>Promote or keep</b><span>The better model is served; the previous one is kept as a backup.</span></div></div>
        </div>
      </div>
    </div>

    <div class="card section">
      <div class="card-head"><h3>Run history</h3><div class="sub">Last 10 runs, all containers</div></div>
      <div data-history></div>
    </div>`;

  const go = $("[data-go]", root), msg = $("[data-msg]", root);
  let lastVersion = state.health?.model_version;

  go.onclick = async () => {
    busy(go, true, "Starting…");
    try {
      const r = await api("/api/retrain", { method: "POST", label: "Start retraining", level: "warn" });
      msg.innerHTML = `<div class="callout info">Run ${esc(r.run_id)} started. Progress appears in the history below.</div>`;
      toast("Retraining started", `Run ${esc(r.run_id)}`, "ok");
    } catch (err) {
      msg.innerHTML = `<div class="callout bad"><b>Could not start retraining.</b> ${esc(err.message)}</div>`;
      toastError(err, "Retraining not started");
    } finally { busy(go, false); refreshStats(); }
  };

  const paint = () => {
    const s = state.stats; if (!s) return;
    const w = s.uploads.by_label, need = s.min_new_per_class;
    const we = w.Engagement?.waiting || 0, wd = w.Disengagement?.waiting || 0;
    const ready = we >= need && wd >= need;
    setStat(root, "waiting", num(s.uploads.waiting), `${we} engaged · ${wd} disengaged`);
    setStat(root, "ready", ready ? "Yes" : "No", ready ? `At least ${need} new per class` : `Needs ${need} new images per class`, ready ? "ok" : "warn");

    const runs = s.retraining || [];
    const running = runs.find(r => r.status === "running");
    go.disabled = !!running;
    if (running) go.title = `Run ${running.id} is in progress`; else go.removeAttribute("title");
    const last = runs[0];
    setStat(root, "last", last ? `Run ${last.id}` : "None",
      last ? `${pill(last.status, STATUS[last.status] || "muted")} ${when(last.started_at)}` : "No runs yet");

    const v = last?.model_version;
    if (!running && v != null && v !== lastVersion) { lastVersion = v; refreshModel(); }

    $("[data-history]", root).innerHTML = table(runs, [
      { label: "Run", render: r => `<b>#${esc(r.id)}</b>` },
      { label: "Trigger", render: r => esc(r.trigger_type) },
      { label: "Status", render: r => pill(r.status, STATUS[r.status] || "muted", r.status === "running") },
      { label: "Started", render: r => when(r.started_at) },
      { label: "Finished", render: r => when(r.finished_at) },
      { label: "Images", render: r => r.new_images != null ? `${num(r.new_images)} new + ${num(r.result?.replay_images ?? 0)} earlier` : "–" },
      { label: "Accuracy", render: r => r.result?.old_val ? `${fix(r.result.old_val.accuracy)} → ${fix(r.result.new_val.accuracy)}` : "–" },
      { label: "F1", render: r => r.result?.old_val ? `${fix(r.result.old_val.f1)} → ${fix(r.result.new_val.f1)}` : "–" },
      { label: "Result", render: r => r.status === "done"
          ? (r.promoted ? pill(`promoted to v${r.model_version}`, "ok") : pill(`kept v${r.model_version}`, "muted"))
          : r.error ? `<a href="#/logs" class="small" style="color:var(--bad)" title="${esc(r.error)}">${esc(r.error.slice(0, 60))}${r.error.length > 60 ? "…" : ""}</a>` : "–" },
    ], "No retraining runs yet.");
  };
  const paintHealth = () => { const h = state.health; if (h) setStat(root, "version", h.model_version != null ? `v${h.model_version}` : "none"); };

  paint(); paintHealth();
  const offs = [on("stats", paint), on("health", paintHealth)];
  return () => offs.forEach(f => f());
}
