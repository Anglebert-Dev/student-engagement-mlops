import { pageHead, stat, icon, esc, fix, pct, table, pill, metricChips, busy, toast, toastError, LABEL_CLASS, $ } from "../core/ui.js";
import { api } from "../core/api.js";
import { on, state, set } from "../core/store.js";

export const title = "Evaluation";

export function render(root) {
  root.innerHTML = `
    ${pageHead("Evaluation", "Score the model currently in production on the held-out labelled images shipped with the app (data/test).")}
    <div class="grid g-2">
      <div class="card">
        <div class="card-head"><h3>Saved with this model version</h3><div class="sub" data-sub></div></div>
        <div data-saved></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Run an evaluation</h3><div class="sub">Takes a few seconds. Nothing is changed on the server.</div></div>
        <button class="btn primary" data-go>${icon("play")}Evaluate current model</button>
        <div data-summary style="margin-top:16px"></div>
      </div>
    </div>
    <div data-results></div>`;

  const go = $("[data-go]", root);

  const paintSaved = () => {
    const m = state.model;
    $("[data-saved]", root).innerHTML = m ? metricChips(m.metrics) : `<div class="callout warn">Model information is unavailable. <a href="#/logs">See error logs</a>.</div>`;
    $("[data-sub]", root).textContent = m ? `Version ${m.version} · ${m.version > 1 ? "measured on data/test after retraining" : "measured on the 1,669-image test set in the notebook"}` : "";
  };

  const paintResult = () => {
    const r = state.evaluation; if (!r) return;
    const m = r.metrics, wrong = r.predictions.filter(p => p.true !== p.label).length;
    $("[data-summary]", root).innerHTML = `<div class="callout info">Model v${esc(r.model_version)} scored on ${esc(r.images)} images in ${esc(r.seconds)} s: accuracy <b>${pct(m.accuracy)}</b>, ${wrong} wrong.</div>`;
    $("[data-results]", root).innerHTML = `
      <div class="card section">
        <div class="card-head"><h3>Result on held-out images</h3><div class="sub">Change compared with the metrics saved with the model</div></div>
        ${metricChips(m, state.model?.metrics)}
      </div>
      <div class="grid g-4 section">
        ${stat({ k: "Engaged found", v: fix(m.tp, 0), note: "true positives", noteCls: "ok" })}
        ${stat({ k: "Engaged missed", v: fix(m.fn, 0), note: "false negatives", noteCls: "bad" })}
        ${stat({ k: "Disengaged found", v: fix(m.tn, 0), note: "true negatives", noteCls: "ok" })}
        ${stat({ k: "Disengaged marked engaged", v: fix(m.fp, 0), note: "false positives", noteCls: "bad" })}
      </div>
      <div class="card section">
        <div class="card-head"><h3>Every image</h3></div>
        ${table(r.predictions, [
          { label: "Image", render: p => esc(p.file) },
          { label: "True class", render: p => pill(p.true, LABEL_CLASS(p.true)) },
          { label: "Predicted", render: p => pill(p.label, LABEL_CLASS(p.label)) },
          { label: "P(engaged)", num: true, render: p => fix(p.probability_engaged, 3) },
          { label: "Correct", render: p => p.true === p.label ? pill("yes", "ok") : pill("no", "bad") },
        ])}
      </div>`;
  };

  go.onclick = async () => {
    busy(go, true, "Evaluating…");
    try {
      set("evaluation", await api("/api/evaluate", { method: "POST", label: "Evaluate model" }));
      toast("Evaluation finished", "", "ok");
    } catch (err) { toastError(err, "Evaluation failed"); }
    finally { busy(go, false); }
  };

  paintSaved(); paintResult();
  const offs = [on("model", paintSaved), on("evaluation", paintResult)];
  return () => offs.forEach(f => f());
}
