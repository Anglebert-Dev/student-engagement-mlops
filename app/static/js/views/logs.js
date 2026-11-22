import { pageHead, stat, setStat, icon, esc, pill, ago, empty, toast, $ } from "../core/ui.js";
import { getLogs, clearLogs, markSeen, hintFor, asText } from "../core/logger.js";
import { on } from "../core/store.js";

export const title = "Error logs";

const LEVEL = { error: "bad", warn: "warn", info: "muted" };
const SOURCES = { api: "API", network: "Network", outage: "Outage", parse: "Response", model: "Model", retraining: "Retraining", upload: "Upload", browser: "Browser" };

export function render(root) {
  root.innerHTML = `
    ${pageHead("Error logs", "Failed requests, server problems and dashboard errors, newest first. Kept in this browser (last 300).")}
    <div class="grid g-4">
      ${stat({ id: "total", k: "Logged issues", v: "0" })}
      ${stat({ id: "errors", k: "Errors", v: "0", noteCls: "bad" })}
      ${stat({ id: "warns", k: "Warnings", v: "0" })}
      ${stat({ id: "last", k: "Most recent", v: "–", sm: true })}
    </div>
    <div class="card flush section">
      <div style="padding:18px 20px;border-bottom:1px solid var(--line)" class="toolbar">
        <input class="input" type="search" placeholder="Search message, endpoint, status…" data-q aria-label="Search logs">
        <select class="select" data-level aria-label="Level">
          <option value="">All levels</option><option value="error">Errors</option><option value="warn">Warnings</option>
        </select>
        <select class="select" data-source aria-label="Source">
          <option value="">All sources</option>${Object.entries(SOURCES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}
        </select>
        <button class="btn sm" data-dl>${icon("download")}Download</button>
        <button class="btn sm danger" data-clear>${icon("trash")}Clear</button>
      </div>
      <div class="log-list" data-list></div>
    </div>`;

  const q = $("[data-q]", root), lv = $("[data-level]", root), src = $("[data-source]", root), list = $("[data-list]", root);
  const open = new Set();

  function filtered() {
    const term = q.value.trim().toLowerCase();
    return getLogs().filter(e =>
      (!lv.value || e.level === lv.value) && (!src.value || e.source === src.value) &&
      (!term || asText(e).toLowerCase().includes(term)));
  }

  function paint() {
    const all = getLogs();
    setStat(root, "total", String(all.length));
    setStat(root, "errors", String(all.filter(e => e.level === "error").length));
    setStat(root, "warns", String(all.filter(e => e.level === "warn").length));
    setStat(root, "last", all[0] ? ago(all[0].last_ts) : "–", all[0] ? esc(all[0].title) : "Nothing logged");

    const rows = filtered();
    if (!rows.length) {
      list.innerHTML = all.length ? empty("No entries match the filters.", "list")
        : `<div class="empty">${icon("check")}<b style="color:var(--ok)">No errors logged.</b><br>Anything that fails in the dashboard or on the server will appear here.</div>`;
      return;
    }
    list.innerHTML = rows.map(e => {
      const r = e.request, hint = hintFor(e);
      const where = r ? `${r.method} ${r.url} → ${r.status === 0 ? "no response" : r.status}${r.ms != null ? ` · ${r.ms} ms` : ""}` : SOURCES[e.source] || e.source;
      return `
      <details class="log" data-id="${e.id}" ${open.has(e.id) ? "open" : ""}>
        <summary>
          <span class="when" title="${esc(new Date(e.ts).toLocaleString())}">${ago(e.last_ts)}</span>
          <span class="lvl">${pill(e.level === "warn" ? "warning" : e.level, LEVEL[e.level])}</span>
          <span class="msg"><b>${esc(e.title)}${e.message ? ": " + esc(e.message) : ""}</b><span>${esc(where)}</span></span>
          <span class="rep">${e.count > 1 ? `×${e.count}` : ""}</span>
        </summary>
        <div class="body">
          ${hint ? `<div class="hint"><b>${esc(hint[0])}</b>${esc(hint[1]).replace(/`([^`]+)`/g, "<code>$1</code>")}</div>` : ""}
          <pre class="code">${esc(asText(e))}</pre>
          <div class="toolbar" style="margin-top:10px">
            <button class="btn sm" data-copy="${e.id}">${icon("copy")}Copy</button>
            <span class="muted small">First seen ${esc(new Date(e.ts).toLocaleString())}${e.count > 1 ? ` · last ${esc(new Date(e.last_ts).toLocaleString())}` : ""} · on page ${esc(e.page)}</span>
          </div>
        </div>
      </details>`;
    }).join("");
  }

  list.addEventListener("toggle", e => {
    const id = e.target.dataset?.id; if (!id) return;
    if (e.target.open) open.add(id); else open.delete(id);
  }, true);
  list.addEventListener("click", async e => {
    const b = e.target.closest("[data-copy]"); if (!b) return;
    const entry = getLogs().find(x => x.id === b.dataset.copy);
    try { await navigator.clipboard.writeText(asText(entry)); toast("Copied", "", "ok", 2000); }
    catch { toast("Copy failed", "Select the text and copy it by hand.", "warn"); }
  });
  for (const el of [q, lv, src]) el.addEventListener("input", paint);

  $("[data-dl]", root).onclick = () => {
    const blob = new Blob([JSON.stringify(filtered(), null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `error-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, "")}.json` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $("[data-clear]", root).onclick = () => { if (confirm("Clear all logged errors in this browser?")) clearLogs(); };

  markSeen(); paint();
  const off = on("logs", () => { paint(); });
  const tick = setInterval(paint, 30000);
  return () => { off(); clearInterval(tick); markSeen(); };
}
