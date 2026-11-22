const PATHS = {
  logo: '<path d="M12 3 2 8l10 5 10-5-10-5Z"/><path d="M6 10.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="10" r="3"/><path d="M7 18c1-2 3-3 5-3s4 1 5 3"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="5"/><rect x="12" y="8" width="3" height="9"/><rect x="17" y="5" width="3" height="12"/>',
  flask: '<path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/><path d="M7 15h10"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 12A9 9 0 0 1 18.5 5.7L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  alert: '<path d="m10.3 3.9-8.4 14.5A2 2 0 0 0 3.6 21h16.8a2 2 0 0 0 1.7-2.6L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
  chevrons: '<path d="m11 17-5-5 5-5M18 17l-5-5 5-5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M9.9 4.2A10 10 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s3.5 8 10 8a9.7 9.7 0 0 0 5.4-1.6M2 2l20 20M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
  trash: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  play: '<path d="m6 3 14 9-14 9V3Z"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1Z"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
};

export const icon = (name, cls = "") => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] || ""}</svg>`;

export const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const num = v => v == null || v === "" ? "–" : Number(v).toLocaleString("en-US");
export const fix = (v, d = 3) => v == null || v === "" || isNaN(v) ? "–" : Number(v).toFixed(d);
export const pct = (v, d = 1) => v == null || isNaN(v) ? "–" : (100 * v).toFixed(d) + "%";
export function uptime(s) {
  if (s == null) return "–";
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`;
}
export function when(iso) {
  if (!iso) return "–";
  const d = new Date(iso);
  if (isNaN(d)) return esc(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
export function ago(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}
export const LABEL_CLASS = l => l === "Engagement" ? "eng" : l === "Disengagement" ? "dis" : "muted";

export const pageHead = (title, sub) => `<div class="page-head"><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ""}</div>`;

export const sectionHead = (title, actions = "", soft = false) =>
  `<div class="section-head"><h2 class="section-title${soft ? " soft" : ""}">${esc(title)}</h2>${actions ? `<div class="actions">${actions}</div>` : ""}</div>`;

export const stat = ({ id = "", k, v = "", note = "", noteCls = "", sm = false }) =>
  `<div class="card stat"${id ? ` data-stat="${id}"` : ""}><div class="k">${esc(k)}</div><div class="v${sm ? " sm" : ""}">${v}</div><div class="note ${noteCls}">${note}</div></div>`;

export function setStat(root, id, v, note, noteCls = "") {
  const el = root.querySelector(`[data-stat="${id}"]`);
  if (!el) return;
  if (v !== undefined) el.querySelector(".v").innerHTML = v;
  if (note !== undefined) { const n = el.querySelector(".note"); n.innerHTML = note; n.className = "note " + noteCls; }
}

export const linkBtn = (href, label, ic, cls = "") => `<a class="btn ${cls}" href="${href}">${ic ? icon(ic) : ""}${esc(label)}</a>`;
export const pill = (text, cls = "muted", dot = false) => `<span class="pill ${cls}">${dot ? '<span class="dot"></span>' : ""}${esc(text)}</span>`;
export const empty = (text, ic = "inbox") => `<div class="empty">${icon(ic)}${esc(text)}</div>`;

export function table(rows, cols, emptyText = "Nothing to show yet.") {
  if (!rows || !rows.length) return empty(emptyText);
  const th = cols.map(c => `<th class="${c.num ? "num" : ""}">${esc(c.label)}</th>`).join("");
  const tb = rows.map(r => "<tr>" + cols.map(c => `<td class="${c.num ? "num" : ""}">${c.render ? c.render(r) : esc(r[c.k])}</td>`).join("") + "</tr>").join("");
  return `<div class="table-wrap"><table class="t"><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></div>`;
}

const METRICS = [["accuracy", "Accuracy"], ["precision", "Precision"], ["recall", "Recall"], ["f1", "F1"], ["roc_auc", "ROC-AUC"], ["loss", "Loss"]];
export function metricChips(m, before) {
  if (!m) return empty("No metrics saved for this model.");
  return `<div class="metrics">${METRICS.map(([k, label]) => {
    let delta = "";
    if (before && before[k] != null && m[k] != null) {
      const d = Number((m[k] - before[k]).toFixed(3));
      const better = k === "loss" ? d < 0 : d > 0;
      const cls = d === 0 ? "flat" : better ? "up" : "down";
      delta = `<div class="delta ${cls}">${d > 0 ? "+" : ""}${d === 0 ? "0.000" : d.toFixed(3)}</div>`;
    }
    return `<div class="metric"><div class="k">${label}</div><div class="v">${fix(m[k])}</div>${delta}</div>`;
  }).join("")}</div>`;
}

export function toast(title, body = "", kind = "", ms = 5000) {
  let host = $(".toasts");
  if (!host) { host = document.createElement("div"); host.className = "toasts"; host.setAttribute("aria-live", "polite"); document.body.append(host); }
  const t = document.createElement("div");
  t.className = `toast ${kind}`;
  t.innerHTML = `<b>${esc(title)}</b>${body}`;
  host.append(t);
  setTimeout(() => t.remove(), ms);
}

export function toastError(err, what = "Something went wrong") {
  toast(what, `${esc(err.message)}<br><a href="#/logs">Open error logs</a>`, "bad", 8000);
}

export function busy(btn, on, text) {
  if (!btn) return;
  if (on) { btn.dataset.html = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin"></span>${esc(text || "Working…")}`; }
  else { btn.disabled = false; if (btn.dataset.html) btn.innerHTML = btn.dataset.html; }
}

export const COLORS = { eng: "#2563eb", dis: "#ea7a2c", navy: "#0f1b4c", slate: "#94a3b8", violet: "#6366f1", grid: "#eef0f5", text: "#6b7280" };

export function chart(canvas, cfg) {
  if (!window.Chart || !canvas) {
    if (canvas) canvas.parentElement.innerHTML = empty("Charts are unavailable (Chart.js did not load).", "chart");
    return null;
  }
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.color = COLORS.text;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.boxWidth = 8;
  Chart.defaults.scale.grid.color = COLORS.grid;
  Chart.defaults.maintainAspectRatio = false;
  return new Chart(canvas, cfg);
}
