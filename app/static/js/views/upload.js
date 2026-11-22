import { pageHead, icon, esc, num, busy, toast, toastError, table, $ } from "../core/ui.js";
import { api, refreshStats } from "../core/api.js";
import { log } from "../core/logger.js";
import { on, state } from "../core/store.js";

export const title = "Upload data";
const MAX_FILES = 500;

export function render(root) {
  root.innerHTML = `
    ${pageHead("Upload data", "Add labelled images to the database. They are used the next time the model is retrained.")}
    <div class="grid g-2">
      <div class="card">
        <div class="card-head"><h3>1 · Choose the class</h3></div>
        <div class="seg" role="radiogroup" data-seg>
          <button type="button" class="on" data-label="Engagement">Engagement</button>
          <button type="button" data-label="Disengagement">Disengagement</button>
        </div>
        <div class="card-head" style="margin-top:22px"><h3>2 · Add images</h3><div class="sub">All images in one upload get the class above. Up to ${MAX_FILES} at a time, 15 MB each.</div></div>
        <label class="drop" data-drop>
          <input type="file" accept="image/*" multiple data-files>
          <div class="di">${icon("upload")}</div>
          <b>Drop images here or click to choose</b>
          <span>You can select many files at once</span>
        </label>
        <div data-picked></div>
        <div class="toolbar" style="margin-top:16px">
          <button class="btn primary" data-go disabled>${icon("database")}Upload and save</button>
          <button class="btn" data-clear hidden>Clear</button>
        </div>
        <div data-result style="margin-top:16px"></div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Images in the database</h3></div>
        <div data-db></div>
        <p class="muted small" data-note style="margin-top:14px"></p>
        <div class="card-head" style="margin-top:20px"><h3>What happens to each image</h3></div>
        <div class="steps small">
          <div class="step"><span class="n">1</span><div><b>Checked</b><span>Must be a readable image of at least 64 px.</span></div></div>
          <div class="step"><span class="n">2</span><div><b>Cleaned</b><span>EXIF orientation fixed, converted to RGB, resized to 256×256.</span></div></div>
          <div class="step"><span class="n">3</span><div><b>De-duplicated</b><span>Images already stored (same hash) are skipped.</span></div></div>
          <div class="step"><span class="n">4</span><div><b>Stored</b><span>Saved as JPEG in the database, waiting for the next retraining.</span></div></div>
        </div>
      </div>
    </div>`;

  let label = "Engagement", files = [], urls = [];
  const seg = $("[data-seg]", root), input = $("[data-files]", root), drop = $("[data-drop]", root);
  const go = $("[data-go]", root), clear = $("[data-clear]", root), picked = $("[data-picked]", root), out = $("[data-result]", root);

  seg.onclick = e => {
    const b = e.target.closest("button"); if (!b) return;
    label = b.dataset.label;
    for (const x of seg.children) x.classList.toggle("on", x === b);
  };

  function setFiles(list) {
    const imgs = [...list].filter(f => f.type.startsWith("image/"));
    const skipped = list.length - imgs.length;
    if (skipped) toast(`${skipped} file${skipped > 1 ? "s" : ""} ignored`, "Only image files can be uploaded.", "warn");
    if (imgs.length > MAX_FILES) toast("Too many files", `Only the first ${MAX_FILES} will be uploaded.`, "warn");
    files = imgs.slice(0, MAX_FILES);
    urls.forEach(u => URL.revokeObjectURL(u));
    urls = files.slice(0, 11).map(f => URL.createObjectURL(f));
    const mb = files.reduce((a, f) => a + f.size, 0) / 1048576;
    picked.innerHTML = files.length ? `
      <div class="thumbs">${urls.map(u => `<img src="${u}" alt="">`).join("")}${files.length > 11 ? `<span class="more">+${files.length - 11}</span>` : ""}</div>
      <div class="muted small" style="margin-top:8px">${files.length} image${files.length > 1 ? "s" : ""} selected · ${mb.toFixed(1)} MB</div>` : "";
    go.disabled = !files.length; clear.hidden = !files.length;
  }
  input.onchange = () => setFiles(input.files);
  clear.onclick = () => { input.value = ""; setFiles([]); out.innerHTML = ""; };
  for (const ev of ["dragover", "dragenter"]) drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); });
  for (const ev of ["dragleave", "drop"]) drop.addEventListener(ev, () => drop.classList.remove("over"));
  drop.addEventListener("drop", e => { e.preventDefault(); setFiles(e.dataTransfer.files); });

  go.onclick = async () => {
    const fd = new FormData(); fd.append("label", label);
    files.forEach(f => fd.append("files", f));
    busy(go, true, `Uploading ${files.length}…`);
    try {
      const r = await api("/api/upload", { method: "POST", body: fd, label: "Upload images",
        context: { label, files: files.length, total_mb: +(files.reduce((a, f) => a + f.size, 0) / 1048576).toFixed(2) } });
      if (r.rejected.length) log({ level: "warn", source: "upload", title: `${r.rejected.length} of ${r.received} images rejected`,
                                   message: r.rejected.slice(0, 3).map(x => `${x.file}: ${x.reason}`).join("; "), details: r.rejected });
      out.innerHTML = `
        <div class="callout ${r.saved ? "ok" : "warn"}"><b>${r.saved} saved</b> as ${esc(r.label)} out of ${r.received} received.
          ${r.duplicates_skipped} duplicate${r.duplicates_skipped === 1 ? "" : "s"} skipped, ${r.rejected.length} rejected.
          ${r.automatic_retraining_started ? `<br><b>Automatic retraining started (run ${esc(r.automatic_retraining_started)}).</b> <a href="#/retraining">Follow it</a>` : ""}</div>
        ${r.rejected.length ? `<div class="callout bad" style="margin-top:10px"><b>Rejected files</b><br>${r.rejected.slice(0, 8).map(x => `${esc(x.file)}: ${esc(x.reason)}`).join("<br>")}${r.rejected.length > 8 ? `<br>…and ${r.rejected.length - 8} more. <a href="#/logs">Full list in error logs</a>` : ""}</div>` : ""}`;
      toast("Upload finished", `${r.saved} saved, ${r.waiting_for_retraining} waiting for retraining.`, "ok");
      input.value = ""; setFiles([]);
      refreshStats();
    } catch (err) {
      out.innerHTML = `<div class="callout bad"><b>Upload failed.</b> ${esc(err.message)} <a href="#/logs">See error logs</a></div>`;
      toastError(err, "Upload failed");
    } finally { busy(go, false); go.disabled = !files.length; }
  };

  const paintDb = () => {
    const s = state.stats; if (!s) return;
    const rows = ["Engagement", "Disengagement"].map(c => ({ c, t: s.uploads.by_label[c]?.total || 0, w: s.uploads.by_label[c]?.waiting || 0 }));
    rows.push({ c: "Total", t: s.uploads.total || 0, w: s.uploads.waiting || 0, total: true });
    $("[data-db]", root).innerHTML = table(rows, [
      { label: "Class", render: r => r.total ? "<b>Total</b>" : esc(r.c) },
      { label: "Stored", num: true, render: r => num(r.t) },
      { label: "Waiting", num: true, render: r => num(r.w) },
    ]);
    $("[data-note]", root).textContent = `Retraining needs at least ${s.min_new_per_class} new images per class. It starts automatically when ${s.retrain_threshold} or more images are waiting.`;
  };
  paintDb();
  const off = on("stats", paintDb);
  return () => { off(); urls.forEach(u => URL.revokeObjectURL(u)); };
}
