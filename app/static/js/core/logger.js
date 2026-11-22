import { emit } from "./store.js";

const KEY = "sem.errorlog.v1";
const SEEN_KEY = "sem.errorlog.seen";
const MAX = 300;

let entries = load();
let seenAt = Number(safeGet(SEEN_KEY) || 0);

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
function load() { try { return JSON.parse(safeGet(KEY) || "[]"); } catch { return []; } }
function save() { safeSet(KEY, JSON.stringify(entries.slice(0, MAX))); }

export function hintFor(e) {
  const status = e.request?.status;
  const msg = (e.message || "").toLowerCase();
  if (e.source === "outage" && e.title.startsWith("API back online"))
    return ["The API recovered",
      "Health checks are answered again. If the container restarted, either it was redeployed (`docker compose up -d --build` replaces it, about 10-60 s of downtime is expected) or it crashed and Docker restarted it. To tell which, run `docker inspect student-engagement-mlops-api-1 --format '{{.State.OOMKilled}} {{.RestartCount}}'`: true or a count above 0 means a crash."];
  if (e.source === "outage")
    return ["The API stopped answering",
      "Health checks failed. Expected for a short time during a deploy or while TensorFlow loads after a start. A second entry, \"API back online after …\", will show how long it lasted. If none appears, run `docker compose ps` and `docker compose logs api --tail 200`."];
  if (e.source === "network" || status === 0)
    return ["The API could not be reached",
      "The browser got no answer at all. The API containers may be stopped or restarting, or the server is unreachable. On the server run `docker compose ps` and `docker compose logs api --tail 100`."];
  if (status === 502 || status === 504)
    return ["nginx could not reach an API container",
      "nginx is up but no healthy `api` container answered in time. A container may still be loading TensorFlow (about 30-90 s after a start) or may have crashed, for example by running out of memory (2 GB limit). Check `docker compose ps`, `docker compose logs api --tail 200` and `docker inspect student-engagement-mlops-api-1 --format '{{.State.OOMKilled}}'`."];
  if (status === 413)
    return ["Upload too large",
      "nginx accepts at most 300 MB per request and the API at most 15 MB per image. Upload fewer images at a time or smaller files."];
  if (e.source === "model" || (status === 503 && msg.includes("model")))
    return ["The model is not loaded",
      "The API could not load the Keras model. Check that `models/` on the server contains `engagement_mobilenetv2.h5` and `model_metadata.json`, and that the volume is mounted (docker-compose.yml). The exact Python error is below."];
  if (status === 409)
    return ["A retraining run is already in progress",
      "Only one retraining run can run at a time across all containers. Wait for it to finish (see Retraining). Runs stuck for over an hour are marked failed automatically."];
  if (e.source === "retraining")
    return ["Retraining failed",
      "The run stopped with the Python error below. The model in production was not changed. Check `docker compose logs api` around the run's start time for the full traceback."];
  if (e.source === "upload")
    return ["Some images were rejected",
      "These files could not be used: they are not readable images, are smaller than 64 px, or are corrupted. The other files were saved."];
  if (status === 400)
    return ["The request was refused",
      "The API checked the input and refused it; the reason it gave is shown below."];
  if (status === 404)
    return ["Endpoint not found",
      "The frontend called an API route that does not exist. The frontend and API may be different versions: rebuild with `docker compose up -d --build`."];
  if (status >= 500)
    return ["Server error",
      "The API raised an unexpected exception. Run `docker compose logs api --tail 200` on the server to see the traceback."];
  if (e.source === "parse")
    return ["The response was not JSON",
      "The server answered with something other than JSON, usually an nginx HTML error page. The start of the response body is shown below."];
  if (e.source === "browser")
    return ["Error in the dashboard code",
      "A script in this page failed. The stack trace below shows where. Reloading the page usually recovers; if it repeats, this is a frontend bug."];
  return null;
}

export function log(entry) {
  const now = Date.now();
  const sig = entry.key || [entry.source, entry.title, entry.message, entry.request?.method, entry.request?.url, entry.request?.status].join("|");
  const existing = entries.find(e => e.sig === sig);
  if (existing) {
    if (entry.once) return existing;
    existing.count += 1;
    existing.last_ts = now;
    if (entry.request) existing.request = entry.request;
    if (entry.details !== undefined) existing.details = entry.details;
    entries = [existing, ...entries.filter(e => e !== existing)];
  } else {
    entries.unshift({
      id: now.toString(36) + Math.random().toString(36).slice(2, 6),
      ts: now, last_ts: now, count: 1, sig,
      level: entry.level || "error",
      source: entry.source || "app",
      title: entry.title || "Error",
      message: entry.message || "",
      request: entry.request || null,
      details: entry.details ?? null,
      page: location.hash || "#/overview",
    });
    entries = entries.slice(0, MAX);
  }
  save();
  emit("logs", entries);
  if (entry.level !== "info") console.warn(`[${entry.source}] ${entry.title}: ${entry.message}`, entry.details ?? "");
  return entries[0];
}

export const getLogs = () => entries;
export const unseenCount = () => entries.filter(e => e.level !== "info" && e.last_ts > seenAt).length;
export function markSeen() { seenAt = Date.now(); safeSet(SEEN_KEY, String(seenAt)); emit("logs", entries); }
export function clearLogs() { entries = []; save(); emit("logs", entries); }

export function asText(e) {
  const r = e.request;
  return [
    `[${new Date(e.ts).toISOString()}] ${e.level.toUpperCase()} ${e.source}: ${e.title}`,
    e.message && `Message: ${e.message}`,
    r && `Request: ${r.method || "GET"} ${r.url} -> ${r.status ?? "no response"}${r.ms != null ? ` in ${r.ms} ms` : ""}`,
    e.count > 1 && `Repeated ${e.count} times, last at ${new Date(e.last_ts).toISOString()}`,
    `Page: ${e.page}`,
    e.details != null && `Details:\n${typeof e.details === "string" ? e.details : JSON.stringify(e.details, null, 2)}`,
  ].filter(Boolean).join("\n");
}

window.addEventListener("error", ev => {
  if (ev.target && ev.target !== window && (ev.target.src || ev.target.href)) {
    log({ level: "warn", source: "browser", title: "A resource failed to load", message: ev.target.src || ev.target.href });
    return;
  }
  log({ source: "browser", title: "Script error", message: ev.message,
        details: `${ev.filename || ""}:${ev.lineno || ""}:${ev.colno || ""}\n${ev.error?.stack || ""}` });
}, true);
window.addEventListener("unhandledrejection", ev => {
  const err = ev.reason;
  if (err?.logged) return;
  log({ source: "browser", title: "Unhandled promise rejection", message: String(err?.message || err), details: err?.stack || null });
});
