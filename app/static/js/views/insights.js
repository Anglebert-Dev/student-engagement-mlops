import { pageHead, stat, empty, num, pct, chart, COLORS, $ } from "../core/ui.js";
import { on, state } from "../core/store.js";

export const title = "Data insights";

export function render(root) {
  let charts = [];
  const destroy = () => { charts.forEach(c => c?.destroy()); charts = []; };

  function paint() {
    destroy();
    const d = state.insights;
    if (!d) { root.innerHTML = pageHead("Data insights") + `<div class="card">${empty("Loading data insights…", "chart")}</div>`; return; }
    if (!d.age_by_label) {
      root.innerHTML = pageHead("Data insights") + `<div class="callout warn">outputs/dataset_summary.json was not found on the server, so there is nothing to show. <a href="#/logs">See error logs</a>.</div>`;
      return;
    }
    const c = d.cleaning, removed = c.images_before - c.images_after;
    const girls = d.gender_by_label ? d.gender_by_label.values[1].reduce((a, b) => a + b, 0) : null;
    const young = d.age_by_label.values.slice(0, 2).flat().reduce((a, b) => a + b, 0);

    root.innerHTML = `
      ${pageHead("Data insights", `Dataset: ${d.source}`)}
      <div class="grid g-4">
        ${stat({ k: "Images received", v: num(c.images_before) })}
        ${stat({ k: "Kept after cleaning", v: num(c.images_after), note: `${num(removed)} copies removed (${pct(removed / c.images_before)})` })}
        ${stat({ k: "Children aged 5-15", v: pct(young / c.images_after), note: "of the clean images" })}
        ${stat({ k: "Girls", v: girls != null ? pct(girls / c.images_after) : "–", note: "of the clean images" })}
      </div>

      <div class="grid g-2 section">
        <div class="card">
          <div class="card-head"><h3>Feature 1 · Age group</h3><div class="sub">Images per class in each age group</div></div>
          <div class="chart-box"><canvas data-c="age"></canvas></div>
          <p class="story">Children aged 5 to 15 make up ${pct(young / c.images_after)} of the clean images, which suits an education platform for school children. Engaged and disengaged images are almost equal inside every age group, so age alone cannot predict engagement.</p>
        </div>
        <div class="card">
          <div class="card-head"><h3>Feature 2 · Gender within age group</h3><div class="sub">Boys and girls per age group</div></div>
          <div class="chart-box"><canvas data-c="gender"></canvas></div>
          <p class="story">Boys and girls are equal at ages 5 to 15, but few images of boys aged 16 to 21 remain, because most of that folder was copies of the same photos.${girls != null ? ` Girls make up ${pct(girls / c.images_after, 0)} of the clean data.` : ""}</p>
        </div>
        <div class="card">
          <div class="card-head"><h3>Feature 3 · Image brightness by class</h3><div class="sub">Share of images at each average grey level</div></div>
          <div class="chart-box"><canvas data-c="bright"></canvas></div>
          <p class="story" data-bright></p>
        </div>
        <div class="card">
          <div class="card-head"><h3>Copies removed during cleaning</h3><div class="sub">Percentage of each folder that was duplicate files</div></div>
          <div class="chart-box"><canvas data-c="copies"></canvas></div>
          <p class="story">Copies were removed before splitting, and the split was made by recording session so that near-identical frames never sit in both training and test data.</p>
        </div>
      </div>

      <div class="card section">
        <div class="card-head"><h3>What the data tells us</h3></div>
        <p class="story" style="margin:0">The dataset is built around school-age children and is balanced by label in every age and gender group, while simple image properties such as brightness carry almost no information about the label. A model that scores well must therefore use the learner's posture, gaze and activity. Its weak points are copied files (removed before training), fewer older boys, and photos taken in sessions of about 20, which is why the data was split by session.</p>
      </div>`;

    const ds = (t, i, color) => ({ label: t.columns[i], data: t.values.map(v => v[i]), backgroundColor: color, borderRadius: 6, maxBarThickness: 38 });
    const bar = { scales: { x: { grid: { display: false } }, y: { beginAtZero: true } }, plugins: { legend: { position: "bottom" } } };
    const cv = k => $(`[data-c="${k}"]`, root);

    charts.push(chart(cv("age"), { type: "bar", options: bar, data: {
      labels: d.age_by_label.index.map(a => a + " yrs"), datasets: [ds(d.age_by_label, 0, COLORS.dis), ds(d.age_by_label, 1, COLORS.eng)] } }));
    charts.push(chart(cv("gender"), { type: "bar", options: bar, data: {
      labels: d.age_by_gender.index.map(a => a + " yrs"), datasets: [ds(d.age_by_gender, 0, COLORS.navy), ds(d.age_by_gender, 1, COLORS.violet)] } }));

    const q = d.image_quality, b = q?.brightness;
    if (b) {
      const centres = b.bin_edges.slice(0, -1).map((e, i) => ((e + b.bin_edges[i + 1]) / 2).toFixed(0));
      const line = (label, color) => ({ label, data: b.share_per_class[label], borderColor: color, backgroundColor: color + "22", fill: true, pointRadius: 0, tension: .35, borderWidth: 2 });
      charts.push(chart(cv("bright"), { type: "line", data: { labels: centres, datasets: [line("Disengagement", COLORS.dis), line("Engagement", COLORS.eng)] },
        options: { plugins: { legend: { position: "bottom" } }, interaction: { mode: "index", intersect: false },
          scales: { x: { grid: { display: false }, title: { display: true, text: "Average grey level (0 to 255)" } }, y: { title: { display: true, text: "Share of images" } } } } }));
      $("[data-bright]", root).textContent = `The two classes overlap almost completely: median brightness is ${b.median?.Disengagement} for disengaged and ${b.median?.Engagement} for engaged images. Used alone, brightness, contrast and sharpness reach a ROC-AUC of only ${q.brightness.roc_auc_alone}, ${q.contrast?.roc_auc_alone} and ${q.sharpness?.roc_auc_alone} (0.5 is guessing), so lighting and camera quality do not give the answer away.`;
    }
    if (d.copies_removed) {
      charts.push(chart(cv("copies"), { type: "bar", data: {
        labels: d.copies_removed.map(r => `${r.age_group} ${r.gender}`),
        datasets: [{ label: "% removed", data: d.copies_removed.map(r => r.removed_pct), backgroundColor: COLORS.slate, borderRadius: 6, maxBarThickness: 22 }] },
        options: { indexAxis: "y", plugins: { legend: { display: false } }, scales: { x: { max: 100, beginAtZero: true }, y: { grid: { display: false } } } } }));
    }
  }

  paint();
  const off = on("insights", paint);
  return () => { off(); destroy(); };
}
