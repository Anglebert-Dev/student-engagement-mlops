import { pageHead, stat, empty, table, esc, fix, pill, chart, COLORS, $ } from "../core/ui.js";
import { on, state } from "../core/store.js";

export const title = "Experiments";

export function render(root) {
  let c = null;

  function paint() {
    c?.destroy(); c = null;
    const ex = state.insights?.experiments;
    if (!state.insights) { root.innerHTML = pageHead("Experiments") + `<div class="card">${empty("Loading…", "flask")}</div>`; return; }
    if (!ex?.length) { root.innerHTML = pageHead("Experiments") + `<div class="callout warn">outputs/experiments.csv was not found on the server.</div>`; return; }

    const best = ex.reduce((a, b) => (b.val_f1 > a.val_f1 ? b : a));
    const inProd = state.model?.experiment;
    root.innerHTML = `
      ${pageHead("Experiments", "MobileNetV2 transfer-learning runs compared on the validation set. The model and threshold were chosen here; the test set was used once.")}
      <div class="grid g-4">
        ${stat({ k: "Experiments", v: String(ex.length) })}
        ${stat({ k: "Best validation F1", v: fix(best.val_f1), note: esc(best.name) })}
        ${stat({ k: "Best ROC-AUC", v: fix(Math.max(...ex.map(e => e.val_roc_auc))) })}
        ${stat({ k: "In production", v: esc(inProd || "–"), sm: true, note: state.model ? `Model v${state.model.version}` : "" })}
      </div>
      <div class="card section">
        <div class="card-head"><h3>Validation metrics by experiment</h3></div>
        <div class="chart-box"><canvas data-c></canvas></div>
      </div>
      <div class="card section">
        <div class="card-head"><h3>All runs</h3><div class="sub">Training accuracy far above validation accuracy means the model overfits.</div></div>
        ${table(ex, [
          { label: "Experiment", render: r => `<b>${esc(r.name)}</b> ${r.name === inProd ? pill("production", "ok") : ""}` },
          { label: "Epochs", num: true, render: r => esc(r.epochs_run) },
          { label: "Minutes", num: true, render: r => fix(r.train_minutes, 1) },
          { label: "Train acc.", num: true, render: r => fix(r.train_accuracy_last) },
          { label: "Val acc.", num: true, render: r => fix(r.val_accuracy) },
          { label: "Precision", num: true, render: r => fix(r.val_precision) },
          { label: "Recall", num: true, render: r => fix(r.val_recall) },
          { label: "F1", num: true, render: r => r === best ? `<b>${fix(r.val_f1)}</b>` : fix(r.val_f1) },
          { label: "ROC-AUC", num: true, render: r => fix(r.val_roc_auc) },
          { label: "Loss", num: true, render: r => fix(r.val_loss) },
        ])}
      </div>`;

    const keys = [["val_accuracy", "Accuracy", COLORS.navy], ["val_f1", "F1", COLORS.eng], ["val_roc_auc", "ROC-AUC", COLORS.violet], ["train_accuracy_last", "Train accuracy", COLORS.slate]];
    c = chart($("[data-c]", root), { type: "bar", data: {
      labels: ex.map(e => e.name.replace(/_/g, " ")),
      datasets: keys.map(([k, label, color]) => ({ label, data: ex.map(e => e[k]), backgroundColor: color, borderRadius: 5, maxBarThickness: 26 })) },
      options: { plugins: { legend: { position: "bottom" } }, scales: { x: { grid: { display: false } }, y: { min: 0.4, max: 1 } } } });
  }

  paint();
  const offs = [on("insights", paint), on("model", paint)];
  return () => { offs.forEach(f => f()); c?.destroy(); };
}
