import { pageHead, icon, esc, pct, fix, busy, toast, toastError, $ } from "../core/ui.js";
import { api, refreshStats } from "../core/api.js";
import { state } from "../core/store.js";

export const title = "Predict an image";

export function render(root) {
  root.innerHTML = `
    ${pageHead("Predict an image", "Upload a photo of a learner during a lesson to see whether the model reads them as engaged or disengaged.")}
    <div class="grid g-2">
      <div class="card">
        <div class="card-head"><h3>Image</h3></div>
        <label class="drop" data-drop>
          <input type="file" accept="image/*" data-file>
          <div class="di">${icon("image")}</div>
          <b>Drop an image here or click to choose</b>
          <span>JPG or PNG, up to 15 MB</span>
        </label>
        <div class="preview-box" data-preview hidden></div>
        <div class="toolbar" style="margin-top:16px">
          <button class="btn primary" data-go disabled>${icon("scan")}Predict</button>
          <button class="btn" data-reset hidden>Choose another</button>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Result</h3></div>
        <div data-result><div class="empty">${icon("scan")}Choose an image and press Predict.</div></div>
      </div>
    </div>`;

  const fileInput = $("[data-file]", root), drop = $("[data-drop]", root), preview = $("[data-preview]", root);
  const go = $("[data-go]", root), reset = $("[data-reset]", root), out = $("[data-result]", root);
  let file = null, url = null;

  function choose(f) {
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast("Not an image", `${esc(f.name)} is not an image file.`, "warn"); return; }
    file = f;
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(f);
    preview.innerHTML = `<img src="${url}" alt="Selected image">`;
    preview.hidden = false; drop.hidden = true; reset.hidden = false; go.disabled = false;
  }
  fileInput.onchange = () => choose(fileInput.files[0]);
  reset.onclick = () => { fileInput.value = ""; file = null; preview.hidden = true; drop.hidden = false; reset.hidden = true; go.disabled = true; };
  for (const ev of ["dragover", "dragenter"]) drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); });
  for (const ev of ["dragleave", "drop"]) drop.addEventListener(ev, () => drop.classList.remove("over"));
  drop.addEventListener("drop", e => { e.preventDefault(); choose(e.dataTransfer.files[0]); });

  go.onclick = async () => {
    const fd = new FormData(); fd.append("file", file);
    busy(go, true, "Predicting…");
    try {
      const r = await api("/api/predict", { method: "POST", body: fd, label: "Predict image", context: { file: file.name, size_bytes: file.size, type: file.type } });
      state.lastPrediction = r;
      paint(r);
      refreshStats();
    } catch (err) {
      out.innerHTML = `<div class="callout bad"><b>Prediction failed.</b> ${esc(err.message)} <a href="#/logs">See error logs</a></div>`;
      toastError(err, "Prediction failed");
    } finally { busy(go, false); }
  };

  function paint(r) {
    const eng = r.label === "Engagement";
    out.innerHTML = `
      <div class="verdict ${eng ? "eng" : "dis"}">
        <div class="vi">${icon(eng ? "eye" : "eyeoff")}</div>
        <div><span class="muted small">The model reads this learner as</span><b>${esc(r.label)}</b></div>
      </div>
      <div style="margin-top:22px">
        <div class="toolbar small" style="justify-content:space-between"><span class="muted">Disengaged</span><span><b>${pct(r.probability_engaged)}</b> engaged</span></div>
        <div class="bar" style="margin-top:8px"><div style="width:${100 * r.probability_engaged}%"></div><span class="mark" style="left:${100 * r.threshold}%" title="Decision threshold"></span></div>
        <div class="muted small" style="margin-top:6px">Black mark: decision threshold ${fix(r.threshold, 2)}. Above it the learner counts as engaged.</div>
      </div>
      <dl class="kv">
        <dt>Confidence</dt><dd>${pct(r.confidence)}</dd>
        <dt>Model version</dt><dd>v${esc(r.model_version)}</dd>
        <dt>Response time</dt><dd>${esc(r.latency_ms)} ms</dd>
        <dt>Container</dt><dd>${esc(r.container)}</dd>
        <dt>File</dt><dd>${esc(r.filename)}</dd>
      </dl>
      ${r.confidence < 0.6 ? `<div class="callout warn" style="margin-top:16px">Low confidence: the model is unsure about this image. Treat the result with care.</div>` : ""}`;
  }

  if (state.lastPrediction) paint(state.lastPrediction);
  return () => { if (url) URL.revokeObjectURL(url); };
}
